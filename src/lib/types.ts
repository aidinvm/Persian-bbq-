export type Lang = "en" | "fa";

export type PaymentMode = "stripe" | "hybrid" | "manual";

export type MenuCategory = "grill" | "dessert" | "side";

export type OrderStatus =
  | "pending_payment"
  | "pending_confirmation"
  | "confirmed"
  | "ready"
  | "picked_up"
  | "cancelled";

export type PaymentStatus = "unpaid" | "paid" | "refunded" | "expired";

export interface MenuItem {
  id: string;
  stockKey: string;
  category: MenuCategory;
  countsTowardSlot: boolean;
  nameEn: string;
  nameFa: string;
  descriptionEn: string;
  descriptionFa: string;
  badgeEn: string;
  badgeFa: string;
  priceCents: number;
  sortOrder: number;
  isActive: boolean;
}

export type SlotLimitsMap = Record<string, Record<string, number>>;
export type SlotUsageMap = Record<string, Record<string, number>>;

export interface StoreSettings {
  isStoreOpen: boolean;
  maintenanceMode: boolean;
  paymentMode: PaymentMode;
  etransferEmail: string;
  pickupAddress: string;
  pickupPhone: string;
  cutoffEnabled: boolean;
  cutoffHour: number;
  emailAlertsEnabled: boolean;
  announcementEn: string;
  announcementFa: string;
  masterInventory: Record<string, number>;
  masterTimeSlots: SlotLimitsMap;
}

export interface PickupDateSchedule {
  date: string; // YYYY-MM-DD
  isActive: boolean;
  inventory: Record<string, number>;
  timeSlotLimits: SlotLimitsMap;
  timeSlotUsed: SlotUsageMap;
}

export interface OrderItem {
  menuItemId: string;
  stockKey: string;
  nameEn: string;
  nameFa: string;
  priceCents: number;
  quantity: number;
  countsTowardSlot: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  pickupDate: string;
  pickupTime: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderItem[];
  totalCents: number;
  status: OrderStatus;
  paymentMethod: "stripe" | "manual";
  paymentStatus: PaymentStatus;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  receiptImage?: string | null;
  notes?: string | null;
  lang: Lang;
  stockRestored: boolean;
  createdAt: string;
  paidAt?: string | null;
}

export interface PublicStorePayload {
  settings: {
    isStoreOpen: boolean;
    maintenanceMode: boolean;
    paymentMode: PaymentMode;
    etransferEmail: string;
    pickupAddress: string;
    pickupPhone: string;
    cutoffEnabled: boolean;
    cutoffHour: number;
    announcementEn: string;
    announcementFa: string;
    stripeConfigured: boolean;
  };
  menu: MenuItem[];
  dates: Array<{
    date: string;
    isAcceptingOrders: boolean;
    isSoldOut: boolean;
    inventory: Record<string, number>;
    timeSlotLimits: SlotLimitsMap;
    timeSlotUsed: SlotUsageMap;
  }>;
}
