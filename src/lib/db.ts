import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Pool, type PoolClient } from "pg";
import type {
  Lang,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  PickupDateSchedule,
  SlotLimitsMap,
  SlotUsageMap,
  StoreSettings,
} from "./types";
import {
  createDefaultPickupDates,
  DEFAULT_MENU_ITEMS,
  DEFAULT_STORE_SETTINGS,
} from "./defaults";
import { isDateAcceptingOrders } from "./time";

const STRIPE_RESERVATION_TTL_MS = 35 * 60 * 1000; // 35 minutes (Stripe checkout min expiry is 30 min)

function getDatabaseUrl(): string | null {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    "";
  return url.trim() ? url.trim() : null;
}

export function isPostgresConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

// ============================================================================
// PostgreSQL Pool & Auto-Migration (Neon / Supabase / Vercel Postgres)
// ============================================================================

const globalForPg = globalThis as unknown as {
  __wbbqPool?: Pool;
  __wbbqInitPromise?: Promise<void>;
  __wbbqDevLock?: Promise<void>;
};

function getPool(): Pool {
  if (!globalForPg.__wbbqPool) {
    const connectionString = getDatabaseUrl();
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured");
    }
    const isLocal =
      connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
    globalForPg.__wbbqPool = new Pool({
      connectionString,
      max: 5,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalForPg.__wbbqPool;
}

async function ensurePgInitialized(): Promise<void> {
  if (!globalForPg.__wbbqInitPromise) {
    globalForPg.__wbbqInitPromise = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS store_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS menu_items (
          id TEXT PRIMARY KEY,
          stock_key TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'grill',
          counts_toward_slot BOOLEAN NOT NULL DEFAULT TRUE,
          name_en TEXT NOT NULL,
          name_fa TEXT NOT NULL,
          description_en TEXT NOT NULL DEFAULT '',
          description_fa TEXT NOT NULL DEFAULT '',
          badge_en TEXT NOT NULL DEFAULT '',
          badge_fa TEXT NOT NULL DEFAULT '',
          price_cents INTEGER NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS pickup_dates (
          date TEXT PRIMARY KEY,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          inventory JSONB NOT NULL DEFAULT '{}'::jsonb,
          time_slot_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
          time_slot_used JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          order_number TEXT NOT NULL UNIQUE,
          pickup_date TEXT NOT NULL,
          pickup_time TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          customer_email TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          items JSONB NOT NULL,
          total_cents INTEGER NOT NULL,
          status TEXT NOT NULL,
          payment_method TEXT NOT NULL,
          payment_status TEXT NOT NULL,
          stripe_session_id TEXT,
          stripe_payment_intent_id TEXT,
          receipt_image TEXT,
          notes TEXT,
          lang TEXT NOT NULL DEFAULT 'en',
          stock_restored BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          paid_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_orders_pickup_date ON orders (pickup_date);
        CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders (stripe_session_id);
      `);

      // Seed defaults if empty
      const settingsRes = await pool.query("SELECT id FROM store_settings WHERE id = 1");
      if (settingsRes.rowCount === 0) {
        await pool.query("INSERT INTO store_settings (id, data) VALUES (1, $1::jsonb)", [
          JSON.stringify(DEFAULT_STORE_SETTINGS),
        ]);
      }

      const menuRes = await pool.query("SELECT COUNT(*)::int AS cnt FROM menu_items");
      if ((menuRes.rows[0]?.cnt ?? 0) === 0) {
        for (const item of DEFAULT_MENU_ITEMS) {
          await pool.query(
            `INSERT INTO menu_items
              (id, stock_key, category, counts_toward_slot, name_en, name_fa, description_en, description_fa, badge_en, badge_fa, price_cents, sort_order, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (id) DO NOTHING`,
            [
              item.id,
              item.stockKey,
              item.category,
              item.countsTowardSlot,
              item.nameEn,
              item.nameFa,
              item.descriptionEn,
              item.descriptionFa,
              item.badgeEn,
              item.badgeFa,
              item.priceCents,
              item.sortOrder,
              item.isActive,
            ]
          );
        }
      }

      const datesRes = await pool.query("SELECT COUNT(*)::int AS cnt FROM pickup_dates");
      if ((datesRes.rows[0]?.cnt ?? 0) === 0) {
        for (const schedule of createDefaultPickupDates()) {
          await pool.query(
            `INSERT INTO pickup_dates (date, is_active, inventory, time_slot_limits, time_slot_used)
             VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)
             ON CONFLICT (date) DO NOTHING`,
            [
              schedule.date,
              schedule.isActive,
              JSON.stringify(schedule.inventory),
              JSON.stringify(schedule.timeSlotLimits),
              JSON.stringify(schedule.timeSlotUsed),
            ]
          );
        }
      }
    })().catch((err) => {
      globalForPg.__wbbqInitPromise = undefined;
      throw err;
    });
  }
  await globalForPg.__wbbqInitPromise;
}

// ============================================================================
// Local File Dev Store (used ONLY when DATABASE_URL is not configured locally)
// ============================================================================

interface DevStoreData {
  settings: StoreSettings;
  menu: MenuItem[];
  dates: PickupDateSchedule[];
  orders: Order[];
}

const DEV_STORE_PATH = path.join(process.cwd(), ".data", "dev-store.json");

async function withDevLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalForPg.__wbbqDevLock || Promise.resolve();
  let release!: () => void;
  globalForPg.__wbbqDevLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function readDevStore(): Promise<DevStoreData> {
  try {
    const raw = await fs.readFile(DEV_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<DevStoreData>;
    return {
      settings: { ...DEFAULT_STORE_SETTINGS, ...(parsed.settings || {}) },
      menu: parsed.menu && parsed.menu.length > 0 ? parsed.menu : structuredClone(DEFAULT_MENU_ITEMS),
      dates: parsed.dates || createDefaultPickupDates(),
      orders: parsed.orders || [],
    };
  } catch {
    const initial: DevStoreData = {
      settings: structuredClone(DEFAULT_STORE_SETTINGS),
      menu: structuredClone(DEFAULT_MENU_ITEMS),
      dates: createDefaultPickupDates(),
      orders: [],
    };
    await writeDevStore(initial);
    return initial;
  }
}

async function writeDevStore(data: DevStoreData): Promise<void> {
  await fs.mkdir(path.dirname(DEV_STORE_PATH), { recursive: true });
  await fs.writeFile(DEV_STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

// ============================================================================
// Shared Domain Helpers
// ============================================================================

function mapMenuRow(r: Record<string, unknown>): MenuItem {
  return {
    id: String(r.id),
    stockKey: String(r.stock_key),
    category: (r.category as MenuItem["category"]) || "grill",
    countsTowardSlot: Boolean(r.counts_toward_slot),
    nameEn: String(r.name_en),
    nameFa: String(r.name_fa),
    descriptionEn: String(r.description_en || ""),
    descriptionFa: String(r.description_fa || ""),
    badgeEn: String(r.badge_en || ""),
    badgeFa: String(r.badge_fa || ""),
    priceCents: Number(r.price_cents),
    sortOrder: Number(r.sort_order ?? 0),
    isActive: Boolean(r.is_active),
  };
}

function mapDateRow(r: Record<string, unknown>): PickupDateSchedule {
  return {
    date: String(r.date),
    isActive: Boolean(r.is_active),
    inventory: (r.inventory as Record<string, number>) || {},
    timeSlotLimits: (r.time_slot_limits as SlotLimitsMap) || {},
    timeSlotUsed: (r.time_slot_used as SlotUsageMap) || {},
  };
}

function mapOrderRow(r: Record<string, unknown>): Order {
  return {
    id: String(r.id),
    orderNumber: String(r.order_number),
    pickupDate: String(r.pickup_date),
    pickupTime: String(r.pickup_time),
    customerName: String(r.customer_name),
    customerEmail: String(r.customer_email),
    customerPhone: String(r.customer_phone),
    items: (r.items as OrderItem[]) || [],
    totalCents: Number(r.total_cents),
    status: r.status as OrderStatus,
    paymentMethod: r.payment_method as "stripe" | "manual",
    paymentStatus: r.payment_status as PaymentStatus,
    stripeSessionId: r.stripe_session_id ? String(r.stripe_session_id) : null,
    stripePaymentIntentId: r.stripe_payment_intent_id ? String(r.stripe_payment_intent_id) : null,
    receiptImage: r.receipt_image ? String(r.receipt_image) : null,
    notes: r.notes ? String(r.notes) : null,
    lang: (r.lang as Lang) || "en",
    stockRestored: Boolean(r.stock_restored),
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    paidAt:
      r.paid_at instanceof Date
        ? r.paid_at.toISOString()
        : r.paid_at
          ? String(r.paid_at)
          : null,
  };
}

function generateOrderNumber(): string {
  const num = crypto.randomInt(1000, 9999);
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const prefix = letters[crypto.randomInt(0, letters.length)] + letters[crypto.randomInt(0, letters.length)];
  return `WB-${prefix}${num}`;
}

function applyRestoreToSchedule(schedule: PickupDateSchedule, order: Order): PickupDateSchedule {
  const inventory = { ...schedule.inventory };
  const timeSlotUsed: SlotUsageMap = structuredClone(schedule.timeSlotUsed);
  const slotObj = { ...(timeSlotUsed[order.pickupTime] || {}) };

  for (const item of order.items) {
    inventory[item.stockKey] = (Number(inventory[item.stockKey]) || 0) + item.quantity;
    if (item.countsTowardSlot && order.pickupTime) {
      slotObj[item.stockKey] = Math.max(0, (Number(slotObj[item.stockKey]) || 0) - item.quantity);
    }
  }
  if (order.pickupTime) {
    timeSlotUsed[order.pickupTime] = slotObj;
  }

  return {
    ...schedule,
    inventory,
    timeSlotUsed,
  };
}

function validateAndReserveOnSchedule(
  schedule: PickupDateSchedule,
  pickupTime: string,
  orderItems: OrderItem[],
  lang: Lang
): PickupDateSchedule {
  const inventory = { ...schedule.inventory };
  const timeSlotUsed: SlotUsageMap = structuredClone(schedule.timeSlotUsed);

  // Aggregate quantities by stockKey
  const totalByKey: Record<string, number> = {};
  const slotByKey: Record<string, number> = {};

  for (const item of orderItems) {
    totalByKey[item.stockKey] = (totalByKey[item.stockKey] || 0) + item.quantity;
    if (item.countsTowardSlot) {
      slotByKey[item.stockKey] = (slotByKey[item.stockKey] || 0) + item.quantity;
    }
  }

  // 1. Check inventory
  for (const [stockKey, needed] of Object.entries(totalByKey)) {
    const avail = Number(inventory[stockKey]) || 0;
    if (avail < needed) {
      const sample = orderItems.find((i) => i.stockKey === stockKey);
      const itemName = lang === "fa" ? sample?.nameFa || stockKey : sample?.nameEn || stockKey;
      throw new Error(
        lang === "fa"
          ? `موجودی «${itemName}» کافی نیست (باقی‌مانده: ${avail}).`
          : `Sorry, "${itemName}" only has ${avail} left in stock.`
      );
    }
  }

  // 2. Check per-stockKey time slot limits (only for items where countsTowardSlot === true)
  const slotLimits = schedule.timeSlotLimits[pickupTime];
  if (!slotLimits) {
    throw new Error(
      lang === "fa"
        ? `زمان تحویل ${pickupTime} در دسترس نیست.`
        : `Pickup time ${pickupTime} is not available.`
    );
  }

  const currentUsed = { ...(timeSlotUsed[pickupTime] || {}) };
  for (const [stockKey, needed] of Object.entries(slotByKey)) {
    const limit = Number(slotLimits[stockKey]) || 0;
    const used = Number(currentUsed[stockKey]) || 0;
    const remaining = limit - used;
    if (needed > remaining) {
      throw new Error(
        lang === "fa"
          ? `ظرفیت زمان تحویل ${pickupTime} برای سفارش شما کافی نیست. لطفاً زمان دیگری انتخاب کنید.`
          : `Pickup time ${pickupTime} does not have enough capacity left. Please choose another time.`
      );
    }
  }

  // 3. Apply deductions
  for (const [stockKey, needed] of Object.entries(totalByKey)) {
    inventory[stockKey] = (Number(inventory[stockKey]) || 0) - needed;
  }
  for (const [stockKey, needed] of Object.entries(slotByKey)) {
    currentUsed[stockKey] = (Number(currentUsed[stockKey]) || 0) + needed;
  }
  timeSlotUsed[pickupTime] = currentUsed;

  return {
    ...schedule,
    inventory,
    timeSlotUsed,
  };
}

// ============================================================================
// Public Repository Operations
// ============================================================================

export async function cleanupExpiredReservations(): Promise<void> {
  const cutoffIso = new Date(Date.now() - STRIPE_RESERVATION_TTL_MS).toISOString();

  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const expired = await client.query(
        `SELECT * FROM orders
         WHERE payment_method = 'stripe'
           AND status = 'pending_payment'
           AND payment_status = 'unpaid'
           AND stock_restored = FALSE
           AND created_at < $1::timestamptz
         FOR UPDATE`,
        [cutoffIso]
      );

      for (const row of expired.rows) {
        const order = mapOrderRow(row);
        const dateRes = await client.query(
          "SELECT * FROM pickup_dates WHERE date = $1 FOR UPDATE",
          [order.pickupDate]
        );
        if (dateRes.rows[0]) {
          const updated = applyRestoreToSchedule(mapDateRow(dateRes.rows[0]), order);
          await client.query(
            "UPDATE pickup_dates SET inventory = $1::jsonb, time_slot_used = $2::jsonb, updated_at = NOW() WHERE date = $3",
            [JSON.stringify(updated.inventory), JSON.stringify(updated.timeSlotUsed), order.pickupDate]
          );
        }
        await client.query(
          `UPDATE orders
           SET status = 'cancelled', payment_status = 'expired', stock_restored = TRUE
           WHERE id = $1`,
          [order.id]
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("Expired reservation cleanup failed:", e);
    } finally {
      client.release();
    }
    return;
  }

  await withDevLock(async () => {
    const store = await readDevStore();
    let changed = false;
    const cutoffMs = Date.now() - STRIPE_RESERVATION_TTL_MS;

    for (const order of store.orders) {
      if (
        order.paymentMethod === "stripe" &&
        order.status === "pending_payment" &&
        order.paymentStatus === "unpaid" &&
        !order.stockRestored &&
        new Date(order.createdAt).getTime() < cutoffMs
      ) {
        const schedIdx = store.dates.findIndex((d) => d.date === order.pickupDate);
        if (schedIdx >= 0) {
          store.dates[schedIdx] = applyRestoreToSchedule(store.dates[schedIdx], order);
        }
        order.status = "cancelled";
        order.paymentStatus = "expired";
        order.stockRestored = true;
        changed = true;
      }
    }
    if (changed) {
      await writeDevStore(store);
    }
  });
}

export async function getStoreSettings(): Promise<StoreSettings> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const res = await getPool().query("SELECT data FROM store_settings WHERE id = 1");
    return { ...DEFAULT_STORE_SETTINGS, ...(res.rows[0]?.data || {}) };
  }
  const store = await readDevStore();
  return store.settings;
}

export async function updateStoreSettings(patch: Partial<StoreSettings>): Promise<StoreSettings> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const current = await getStoreSettings();
    const next: StoreSettings = { ...current, ...patch };
    await getPool().query(
      "UPDATE store_settings SET data = $1::jsonb, updated_at = NOW() WHERE id = 1",
      [JSON.stringify(next)]
    );
    return next;
  }
  return withDevLock(async () => {
    const store = await readDevStore();
    store.settings = { ...store.settings, ...patch };
    await writeDevStore(store);
    return store.settings;
  });
}

export async function getMenuItems(activeOnly = false): Promise<MenuItem[]> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const sql = activeOnly
      ? "SELECT * FROM menu_items WHERE is_active = TRUE ORDER BY sort_order ASC, name_en ASC"
      : "SELECT * FROM menu_items ORDER BY sort_order ASC, name_en ASC";
    const res = await getPool().query(sql);
    return res.rows.map(mapMenuRow);
  }
  const store = await readDevStore();
  const list = activeOnly ? store.menu.filter((m) => m.isActive) : store.menu;
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn));
}

export async function upsertMenuItem(item: MenuItem): Promise<MenuItem> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    await getPool().query(
      `INSERT INTO menu_items
        (id, stock_key, category, counts_toward_slot, name_en, name_fa, description_en, description_fa, badge_en, badge_fa, price_cents, sort_order, is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (id) DO UPDATE SET
         stock_key = EXCLUDED.stock_key,
         category = EXCLUDED.category,
         counts_toward_slot = EXCLUDED.counts_toward_slot,
         name_en = EXCLUDED.name_en,
         name_fa = EXCLUDED.name_fa,
         description_en = EXCLUDED.description_en,
         description_fa = EXCLUDED.description_fa,
         badge_en = EXCLUDED.badge_en,
         badge_fa = EXCLUDED.badge_fa,
         price_cents = EXCLUDED.price_cents,
         sort_order = EXCLUDED.sort_order,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()`,
      [
        item.id,
        item.stockKey,
        item.category,
        item.countsTowardSlot,
        item.nameEn,
        item.nameFa,
        item.descriptionEn,
        item.descriptionFa,
        item.badgeEn,
        item.badgeFa,
        item.priceCents,
        item.sortOrder,
        item.isActive,
      ]
    );
    return item;
  }
  return withDevLock(async () => {
    const store = await readDevStore();
    const idx = store.menu.findIndex((m) => m.id === item.id);
    if (idx >= 0) store.menu[idx] = item;
    else store.menu.push(item);
    await writeDevStore(store);
    return item;
  });
}

export async function deleteMenuItem(id: string): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    await getPool().query("DELETE FROM menu_items WHERE id = $1", [id]);
    return;
  }
  await withDevLock(async () => {
    const store = await readDevStore();
    store.menu = store.menu.filter((m) => m.id !== id);
    await writeDevStore(store);
  });
}

export async function getPickupDates(activeOnly = false): Promise<PickupDateSchedule[]> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const sql = activeOnly
      ? "SELECT * FROM pickup_dates WHERE is_active = TRUE ORDER BY date ASC"
      : "SELECT * FROM pickup_dates ORDER BY date ASC";
    const res = await getPool().query(sql);
    return res.rows.map(mapDateRow);
  }
  const store = await readDevStore();
  const list = activeOnly ? store.dates.filter((d) => d.isActive) : store.dates;
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getPickupDate(date: string): Promise<PickupDateSchedule | null> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const res = await getPool().query("SELECT * FROM pickup_dates WHERE date = $1", [date]);
    return res.rows[0] ? mapDateRow(res.rows[0]) : null;
  }
  const store = await readDevStore();
  return store.dates.find((d) => d.date === date) || null;
}

export async function createOrEnsurePickupDate(date: string): Promise<PickupDateSchedule> {
  const settings = await getStoreSettings();
  const schedule: PickupDateSchedule = {
    date,
    isActive: true,
    inventory: { ...settings.masterInventory },
    timeSlotLimits: structuredClone(settings.masterTimeSlots),
    timeSlotUsed: {},
  };

  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const existing = await getPickupDate(date);
    if (existing) {
      if (!existing.isActive) {
        await getPool().query("UPDATE pickup_dates SET is_active = TRUE, updated_at = NOW() WHERE date = $1", [
          date,
        ]);
        return { ...existing, isActive: true };
      }
      return existing;
    }
    await getPool().query(
      `INSERT INTO pickup_dates (date, is_active, inventory, time_slot_limits, time_slot_used)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)`,
      [
        schedule.date,
        schedule.isActive,
        JSON.stringify(schedule.inventory),
        JSON.stringify(schedule.timeSlotLimits),
        JSON.stringify(schedule.timeSlotUsed),
      ]
    );
    return schedule;
  }

  return withDevLock(async () => {
    const store = await readDevStore();
    const existing = store.dates.find((d) => d.date === date);
    if (existing) {
      existing.isActive = true;
      await writeDevStore(store);
      return existing;
    }
    store.dates.push(schedule);
    store.dates.sort((a, b) => a.date.localeCompare(b.date));
    await writeDevStore(store);
    return schedule;
  });
}

export async function updatePickupDate(
  date: string,
  patch: Partial<Pick<PickupDateSchedule, "isActive" | "inventory" | "timeSlotLimits" | "timeSlotUsed">>
): Promise<PickupDateSchedule> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const existing = (await getPickupDate(date)) || (await createOrEnsurePickupDate(date));
    const next: PickupDateSchedule = {
      ...existing,
      ...patch,
    };
    await getPool().query(
      `UPDATE pickup_dates
       SET is_active = $1, inventory = $2::jsonb, time_slot_limits = $3::jsonb, time_slot_used = $4::jsonb, updated_at = NOW()
       WHERE date = $5`,
      [
        next.isActive,
        JSON.stringify(next.inventory),
        JSON.stringify(next.timeSlotLimits),
        JSON.stringify(next.timeSlotUsed),
        date,
      ]
    );
    return next;
  }

  return withDevLock(async () => {
    const store = await readDevStore();
    let sched = store.dates.find((d) => d.date === date);
    if (!sched) {
      sched = {
        date,
        isActive: true,
        inventory: { ...store.settings.masterInventory },
        timeSlotLimits: structuredClone(store.settings.masterTimeSlots),
        timeSlotUsed: {},
      };
      store.dates.push(sched);
    }
    Object.assign(sched, patch);
    await writeDevStore(store);
    return sched;
  });
}

export async function deletePickupDate(date: string): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    await getPool().query("DELETE FROM pickup_dates WHERE date = $1", [date]);
    return;
  }
  await withDevLock(async () => {
    const store = await readDevStore();
    store.dates = store.dates.filter((d) => d.date !== date);
    await writeDevStore(store);
  });
}

// ============================================================================
// Orders & Atomic Reservations
// ============================================================================

export interface CreateOrderInput {
  pickupDate: string;
  pickupTime: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: Array<{ menuItemId: string; quantity: number }>;
  paymentMethod: "stripe" | "manual";
  receiptImage?: string | null;
  notes?: string | null;
  lang: Lang;
}

export async function createAtomicOrder(input: CreateOrderInput): Promise<Order> {
  await cleanupExpiredReservations();

  const settings = await getStoreSettings();
  if (settings.maintenanceMode) {
    throw new Error(
      input.lang === "fa"
        ? "سایت در حال به‌روزرسانی است. لطفاً دقایقی دیگر تلاش کنید."
        : "Store is currently undergoing maintenance."
    );
  }
  if (!settings.isStoreOpen) {
    throw new Error(
      input.lang === "fa"
        ? "فروشگاه در حال حاضر بسته است."
        : "Pre-orders are currently closed."
    );
  }
  if (!isDateAcceptingOrders(input.pickupDate, settings.cutoffEnabled, settings.cutoffHour)) {
    throw new Error(
      input.lang === "fa"
        ? "مهلت ثبت سفارش برای این تاریخ به پایان رسیده است (ساعت ۹ شب روز قبل)."
        : "Orders for this date have closed (9:00 PM cutoff the evening before)."
    );
  }

  // Validate payment method allowed by settings
  if (settings.paymentMode === "stripe" && input.paymentMethod !== "stripe") {
    throw new Error("Only Stripe card payments are currently accepted.");
  }
  if (settings.paymentMode === "manual" && input.paymentMethod !== "manual") {
    throw new Error("Only Interac e-Transfer payments are currently accepted.");
  }

  const menu = await getMenuItems(true);
  const menuById = new Map(menu.map((m) => [m.id, m]));

  const orderItems: OrderItem[] = [];
  for (const reqItem of input.items) {
    if (reqItem.quantity <= 0) continue;
    const dbItem = menuById.get(reqItem.menuItemId);
    if (!dbItem) {
      throw new Error("One or more selected menu items are no longer available.");
    }
    orderItems.push({
      menuItemId: dbItem.id,
      stockKey: dbItem.stockKey,
      nameEn: dbItem.nameEn,
      nameFa: dbItem.nameFa,
      priceCents: dbItem.priceCents,
      quantity: reqItem.quantity,
      countsTowardSlot: dbItem.countsTowardSlot,
    });
  }

  if (orderItems.length === 0) {
    throw new Error("Your order must contain at least one item.");
  }

  const totalCents = orderItems.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
  const orderId = crypto.randomUUID();
  const orderNumber = generateOrderNumber();
  const createdAt = new Date().toISOString();

  const newOrder: Order = {
    id: orderId,
    orderNumber,
    pickupDate: input.pickupDate,
    pickupTime: input.pickupTime,
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.trim().toLowerCase(),
    customerPhone: input.customerPhone.trim(),
    items: orderItems,
    totalCents,
    status: input.paymentMethod === "stripe" ? "pending_payment" : "pending_confirmation",
    paymentMethod: input.paymentMethod,
    paymentStatus: "unpaid",
    stripeSessionId: null,
    stripePaymentIntentId: null,
    receiptImage: input.receiptImage || null,
    notes: input.notes?.trim() || null,
    lang: input.lang,
    stockRestored: false,
    createdAt,
    paidAt: null,
  };

  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const client: PoolClient = await getPool().connect();
    try {
      await client.query("BEGIN");
      const dateRes = await client.query(
        "SELECT * FROM pickup_dates WHERE date = $1 AND is_active = TRUE FOR UPDATE",
        [input.pickupDate]
      );
      if (!dateRes.rows[0]) {
        throw new Error("Selected pickup date is not available.");
      }

      const schedule = mapDateRow(dateRes.rows[0]);
      const updatedSchedule = validateAndReserveOnSchedule(
        schedule,
        input.pickupTime,
        orderItems,
        input.lang
      );

      await client.query(
        `UPDATE pickup_dates
         SET inventory = $1::jsonb, time_slot_used = $2::jsonb, updated_at = NOW()
         WHERE date = $3`,
        [
          JSON.stringify(updatedSchedule.inventory),
          JSON.stringify(updatedSchedule.timeSlotUsed),
          input.pickupDate,
        ]
      );

      await client.query(
        `INSERT INTO orders
          (id, order_number, pickup_date, pickup_time, customer_name, customer_email, customer_phone,
           items, total_cents, status, payment_method, payment_status, receipt_image, notes, lang, stock_restored, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17::timestamptz)`,
        [
          newOrder.id,
          newOrder.orderNumber,
          newOrder.pickupDate,
          newOrder.pickupTime,
          newOrder.customerName,
          newOrder.customerEmail,
          newOrder.customerPhone,
          JSON.stringify(newOrder.items),
          newOrder.totalCents,
          newOrder.status,
          newOrder.paymentMethod,
          newOrder.paymentStatus,
          newOrder.receiptImage,
          newOrder.notes,
          newOrder.lang,
          newOrder.stockRestored,
          newOrder.createdAt,
        ]
      );

      await client.query("COMMIT");
      return newOrder;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return withDevLock(async () => {
    const store = await readDevStore();
    const schedIdx = store.dates.findIndex((d) => d.date === input.pickupDate && d.isActive);
    if (schedIdx < 0) {
      throw new Error("Selected pickup date is not available.");
    }
    const updated = validateAndReserveOnSchedule(
      store.dates[schedIdx],
      input.pickupTime,
      orderItems,
      input.lang
    );
    store.dates[schedIdx] = updated;
    store.orders.unshift(newOrder);
    await writeDevStore(store);
    return newOrder;
  });
}

export async function attachStripeSessionToOrder(
  orderId: string,
  stripeSessionId: string
): Promise<void> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    await getPool().query("UPDATE orders SET stripe_session_id = $1 WHERE id = $2", [
      stripeSessionId,
      orderId,
    ]);
    return;
  }
  await withDevLock(async () => {
    const store = await readDevStore();
    const order = store.orders.find((o) => o.id === orderId);
    if (order) {
      order.stripeSessionId = stripeSessionId;
      await writeDevStore(store);
    }
  });
}

/**
 * Marks a Stripe order as paid & confirmed idempotently.
 * Returns { order, newlyConfirmed } so emails are sent exactly once!
 */
export async function confirmStripeOrder(
  orderIdOrSessionId: { orderId?: string; stripeSessionId?: string },
  paymentIntentId?: string | null
): Promise<{ order: Order | null; newlyConfirmed: boolean }> {
  const paidAt = new Date().toISOString();

  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const query = orderIdOrSessionId.orderId
        ? { text: "SELECT * FROM orders WHERE id = $1 FOR UPDATE", vals: [orderIdOrSessionId.orderId] }
        : {
            text: "SELECT * FROM orders WHERE stripe_session_id = $1 FOR UPDATE",
            vals: [orderIdOrSessionId.stripeSessionId],
          };
      const res = await client.query(query.text, query.vals);
      if (!res.rows[0]) {
        await client.query("COMMIT");
        return { order: null, newlyConfirmed: false };
      }
      const order = mapOrderRow(res.rows[0]);
      if (order.paymentStatus === "paid") {
        await client.query("COMMIT");
        return { order, newlyConfirmed: false };
      }

      // Edge case: if reservation expired right as webhook arrived and stock had been restored, re-deduct silently
      if (order.stockRestored) {
        const dateRes = await client.query(
          "SELECT * FROM pickup_dates WHERE date = $1 FOR UPDATE",
          [order.pickupDate]
        );
        if (dateRes.rows[0]) {
          const sched = mapDateRow(dateRes.rows[0]);
          const inv = { ...sched.inventory };
          const used = structuredClone(sched.timeSlotUsed);
          const slotObj = { ...(used[order.pickupTime] || {}) };
          for (const item of order.items) {
            inv[item.stockKey] = Math.max(0, (Number(inv[item.stockKey]) || 0) - item.quantity);
            if (item.countsTowardSlot && order.pickupTime) {
              slotObj[item.stockKey] = (Number(slotObj[item.stockKey]) || 0) + item.quantity;
            }
          }
          if (order.pickupTime) used[order.pickupTime] = slotObj;
          await client.query(
            "UPDATE pickup_dates SET inventory = $1::jsonb, time_slot_used = $2::jsonb, updated_at = NOW() WHERE date = $3",
            [JSON.stringify(inv), JSON.stringify(used), order.pickupDate]
          );
        }
      }

      const upd = await client.query(
        `UPDATE orders
         SET status = 'confirmed',
             payment_status = 'paid',
             stripe_payment_intent_id = COALESCE($1, stripe_payment_intent_id),
             stock_restored = FALSE,
             paid_at = $2::timestamptz
         WHERE id = $3
         RETURNING *`,
        [paymentIntentId || null, paidAt, order.id]
      );
      await client.query("COMMIT");
      return { order: mapOrderRow(upd.rows[0]), newlyConfirmed: true };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return withDevLock(async () => {
    const store = await readDevStore();
    const order = store.orders.find((o) =>
      orderIdOrSessionId.orderId
        ? o.id === orderIdOrSessionId.orderId
        : o.stripeSessionId === orderIdOrSessionId.stripeSessionId
    );
    if (!order) return { order: null, newlyConfirmed: false };
    if (order.paymentStatus === "paid") return { order, newlyConfirmed: false };

    order.status = "confirmed";
    order.paymentStatus = "paid";
    order.stripePaymentIntentId = paymentIntentId || order.stripePaymentIntentId || null;
    order.stockRestored = false;
    order.paidAt = paidAt;
    await writeDevStore(store);
    return { order, newlyConfirmed: true };
  });
}

export async function getOrders(pickupDate?: string): Promise<Order[]> {
  await cleanupExpiredReservations();

  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const res = pickupDate
      ? await getPool().query(
          "SELECT * FROM orders WHERE pickup_date = $1 ORDER BY created_at DESC",
          [pickupDate]
        )
      : await getPool().query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 300");
    return res.rows.map(mapOrderRow);
  }
  const store = await readDevStore();
  const filtered = pickupDate
    ? store.orders.filter((o) => o.pickupDate === pickupDate)
    : store.orders;
  return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOrderById(id: string): Promise<Order | null> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const res = await getPool().query("SELECT * FROM orders WHERE id = $1", [id]);
    return res.rows[0] ? mapOrderRow(res.rows[0]) : null;
  }
  const store = await readDevStore();
  return store.orders.find((o) => o.id === id) || null;
}

export async function getOrderByStripeSession(sessionId: string): Promise<Order | null> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const res = await getPool().query("SELECT * FROM orders WHERE stripe_session_id = $1", [
      sessionId,
    ]);
    return res.rows[0] ? mapOrderRow(res.rows[0]) : null;
  }
  const store = await readDevStore();
  return store.orders.find((o) => o.stripeSessionId === sessionId) || null;
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  paymentStatusOverride?: PaymentStatus
): Promise<Order | null> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const res = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
      if (!res.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const order = mapOrderRow(res.rows[0]);
      let stockRestored = order.stockRestored;

      // Cancelling an active order restores inventory + time-slot usage automatically!
      if (newStatus === "cancelled" && !order.stockRestored) {
        const dateRes = await client.query(
          "SELECT * FROM pickup_dates WHERE date = $1 FOR UPDATE",
          [order.pickupDate]
        );
        if (dateRes.rows[0]) {
          const updated = applyRestoreToSchedule(mapDateRow(dateRes.rows[0]), order);
          await client.query(
            "UPDATE pickup_dates SET inventory = $1::jsonb, time_slot_used = $2::jsonb, updated_at = NOW() WHERE date = $3",
            [JSON.stringify(updated.inventory), JSON.stringify(updated.timeSlotUsed), order.pickupDate]
          );
        }
        stockRestored = true;
      }

      const nextPaymentStatus: PaymentStatus =
        paymentStatusOverride ??
        (newStatus === "confirmed" && order.paymentMethod === "manual"
          ? "paid"
          : order.paymentStatus);

      const paidAt =
        nextPaymentStatus === "paid" && !order.paidAt ? new Date().toISOString() : order.paidAt;

      const upd = await client.query(
        `UPDATE orders
         SET status = $1, payment_status = $2, stock_restored = $3, paid_at = $4::timestamptz
         WHERE id = $5
         RETURNING *`,
        [newStatus, nextPaymentStatus, stockRestored, paidAt, orderId]
      );
      await client.query("COMMIT");
      return mapOrderRow(upd.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return withDevLock(async () => {
    const store = await readDevStore();
    const order = store.orders.find((o) => o.id === orderId);
    if (!order) return null;

    if (newStatus === "cancelled" && !order.stockRestored) {
      const idx = store.dates.findIndex((d) => d.date === order.pickupDate);
      if (idx >= 0) {
        store.dates[idx] = applyRestoreToSchedule(store.dates[idx], order);
      }
      order.stockRestored = true;
    }

    order.status = newStatus;
    if (paymentStatusOverride) {
      order.paymentStatus = paymentStatusOverride;
    } else if (newStatus === "confirmed" && order.paymentMethod === "manual") {
      order.paymentStatus = "paid";
    }
    if (order.paymentStatus === "paid" && !order.paidAt) {
      order.paidAt = new Date().toISOString();
    }

    await writeDevStore(store);
    return order;
  });
}

/**
 * Deletes a single order and atomically restores both inventory stock AND time-slot usage
 * (unless stock was already restored on cancellation).
 */
export async function deleteOrderAndRestore(orderId: string): Promise<boolean> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const res = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
      if (!res.rows[0]) {
        await client.query("COMMIT");
        return false;
      }
      const order = mapOrderRow(res.rows[0]);
      if (!order.stockRestored) {
        const dateRes = await client.query(
          "SELECT * FROM pickup_dates WHERE date = $1 FOR UPDATE",
          [order.pickupDate]
        );
        if (dateRes.rows[0]) {
          const updated = applyRestoreToSchedule(mapDateRow(dateRes.rows[0]), order);
          await client.query(
            "UPDATE pickup_dates SET inventory = $1::jsonb, time_slot_used = $2::jsonb, updated_at = NOW() WHERE date = $3",
            [JSON.stringify(updated.inventory), JSON.stringify(updated.timeSlotUsed), order.pickupDate]
          );
        }
      }
      await client.query("DELETE FROM orders WHERE id = $1", [orderId]);
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return withDevLock(async () => {
    const store = await readDevStore();
    const idx = store.orders.findIndex((o) => o.id === orderId);
    if (idx < 0) return false;
    const order = store.orders[idx];
    if (!order.stockRestored) {
      const schedIdx = store.dates.findIndex((d) => d.date === order.pickupDate);
      if (schedIdx >= 0) {
        store.dates[schedIdx] = applyRestoreToSchedule(store.dates[schedIdx], order);
      }
    }
    store.orders.splice(idx, 1);
    await writeDevStore(store);
    return true;
  });
}

/**
 * Deletes ALL orders for a given pickup date and atomically restores inventory + time-slot counts.
 */
export async function deleteAllOrdersForDate(pickupDate: string): Promise<number> {
  if (isPostgresConfigured()) {
    await ensurePgInitialized();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const ordersRes = await client.query(
        "SELECT * FROM orders WHERE pickup_date = $1 FOR UPDATE",
        [pickupDate]
      );
      const orders = ordersRes.rows.map(mapOrderRow);
      if (orders.length > 0) {
        const dateRes = await client.query(
          "SELECT * FROM pickup_dates WHERE date = $1 FOR UPDATE",
          [pickupDate]
        );
        if (dateRes.rows[0]) {
          let sched = mapDateRow(dateRes.rows[0]);
          for (const order of orders) {
            if (!order.stockRestored) {
              sched = applyRestoreToSchedule(sched, order);
            }
          }
          await client.query(
            "UPDATE pickup_dates SET inventory = $1::jsonb, time_slot_used = $2::jsonb, updated_at = NOW() WHERE date = $3",
            [JSON.stringify(sched.inventory), JSON.stringify(sched.timeSlotUsed), pickupDate]
          );
        }
        await client.query("DELETE FROM orders WHERE pickup_date = $1", [pickupDate]);
      }
      await client.query("COMMIT");
      return orders.length;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return withDevLock(async () => {
    const store = await readDevStore();
    const toDelete = store.orders.filter((o) => o.pickupDate === pickupDate);
    if (toDelete.length === 0) return 0;

    const schedIdx = store.dates.findIndex((d) => d.date === pickupDate);
    if (schedIdx >= 0) {
      let sched = store.dates[schedIdx];
      for (const order of toDelete) {
        if (!order.stockRestored) {
          sched = applyRestoreToSchedule(sched, order);
        }
      }
      store.dates[schedIdx] = sched;
    }
    store.orders = store.orders.filter((o) => o.pickupDate !== pickupDate);
    await writeDevStore(store);
    return toDelete.length;
  });
}

export async function exportFullBackup() {
  const [settings, menu, dates, orders] = await Promise.all([
    getStoreSettings(),
    getMenuItems(false),
    getPickupDates(false),
    getOrders(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    version: 2,
    settings,
    menu,
    dates,
    orders,
  };
}

export async function restoreFullBackup(payload: {
  settings?: Partial<StoreSettings>;
  menu?: MenuItem[];
  dates?: PickupDateSchedule[];
}) {
  if (payload.settings) {
    await updateStoreSettings(payload.settings);
  }
  if (Array.isArray(payload.menu) && payload.menu.length > 0) {
    for (const item of payload.menu) {
      await upsertMenuItem(item);
    }
  }
  if (Array.isArray(payload.dates)) {
    for (const d of payload.dates) {
      await updatePickupDate(d.date, {
        isActive: d.isActive,
        inventory: d.inventory,
        timeSlotLimits: d.timeSlotLimits,
        timeSlotUsed: d.timeSlotUsed,
      });
    }
  }
}
