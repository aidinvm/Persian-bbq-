"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  ExternalLink,
  Flame,
  LayoutDashboard,
  Lock,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Upload,
  UtensilsCrossed,
} from "lucide-react";
import { formatCAD } from "@/lib/i18n";
import { formatPickupDate, sortTimeSlots } from "@/lib/time";
import type {
  MenuItem,
  Order,
  OrderStatus,
  PaymentMode,
  PickupDateSchedule,
  SlotLimitsMap,
  StoreSettings,
} from "@/lib/types";
import AdminOrdersTab from "./AdminOrdersTab";
import AdminInventoryTab from "./AdminInventoryTab";
import AdminMenuTab from "./AdminMenuTab";

type TabId = "overview" | "orders" | "menu" | "inventory" | "settings";

interface BootstrapResponse {
  adminEmail: string;
  settings: StoreSettings;
  menu: MenuItem[];
  dates: PickupDateSchedule[];
  orders: Order[];
  environment: {
    storageMode: "postgres" | "local-dev";
    stripeConfigured: boolean;
    smtpConfigured: boolean;
  };
}

export default function AdminDashboard() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState("weekendbackyardbbq@gmail.com");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [newDateInput, setNewDateInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Settings form state
  const [settingsDraft, setSettingsDraft] = useState<StoreSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3200);
  }, []);

  const loadBootstrap = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/bootstrap", { cache: "no-store" });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load admin data");
      const json = (await res.json()) as BootstrapResponse;
      setData(json);
      setSettingsDraft(json.settings);
      setAuthenticated(true);
      setSelectedDate((prev) => {
        if (prev && json.dates.some((d) => d.date === prev)) return prev;
        return json.dates[0]?.date || new Date().toISOString().slice(0, 10);
      });
    } catch (err) {
      console.error(err);
    } finally {
      setAuthChecked(true);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLoginError(json.error || "Invalid credentials");
        return;
      }
      setLoginPassword("");
      await loadBootstrap();
    } catch {
      setLoginError("Unable to sign in");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthenticated(false);
    setData(null);
  };

  const patchSettings = async (patch: Partial<StoreSettings>, message = "Settings saved") => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Save failed");
      await loadBootstrap();
      showToast(message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddDate = async () => {
    if (!newDateInput) return;
    const res = await fetch("/api/admin/dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newDateInput }),
    });
    if (res.ok) {
      setSelectedDate(newDateInput);
      setNewDateInput("");
      await loadBootstrap();
      showToast(`Added pickup date ${newDateInput}`);
    }
  };

  const handleRemoveDate = async (date: string) => {
    if (!window.confirm(`Remove pickup date ${date} from storefront schedule?`)) return;
    const res = await fetch(`/api/admin/dates?date=${encodeURIComponent(date)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadBootstrap();
      showToast(`Removed ${date}`);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const res = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orderId, status }),
    });
    if (res.ok) {
      await loadBootstrap();
      showToast(`Order marked ${status.replace("_", " ")}`);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    const res = await fetch(`/api/admin/orders?id=${encodeURIComponent(orderId)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadBootstrap();
      showToast("Order deleted & stock restored");
    }
  };

  const handleDeleteAllOrders = async (date: string) => {
    const res = await fetch(
      `/api/admin/orders?date=${encodeURIComponent(date)}&all=true`,
      { method: "DELETE" }
    );
    if (res.ok) {
      await loadBootstrap();
      showToast(`Deleted all orders for ${date} & restored stock`);
    }
  };

  const handleSaveMenuItem = async (item: Partial<MenuItem>) => {
    const res = await fetch("/api/admin/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (res.ok) {
      await loadBootstrap();
      showToast("Menu item saved");
    }
  };

  const handleDeleteMenuItem = async (id: string) => {
    const res = await fetch(`/api/admin/menu?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadBootstrap();
      showToast("Menu item deleted");
    }
  };

  const handleSaveSchedule = async (
    date: string,
    patch: {
      inventory?: Record<string, number>;
      timeSlotLimits?: SlotLimitsMap;
      applyMasterTemplate?: boolean;
    }
  ) => {
    const res = await fetch("/api/admin/dates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, ...patch }),
    });
    if (res.ok) {
      await loadBootstrap();
      showToast(`Updated schedule for ${date}`);
    }
  };

  const handleDownloadBackup = async () => {
    const res = await fetch("/api/admin/backup");
    if (!res.ok) return;
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekend-bbq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Backup downloaded");
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error("Restore failed");
      await loadBootstrap();
      showToast("Backup restored successfully");
    } catch {
      showToast("Invalid backup JSON file");
    }
  };

  const selectedSchedule = useMemo(
    () => data?.dates.find((d) => d.date === selectedDate) || data?.dates[0] || null,
    [data, selectedDate]
  );

  const selectedDateOrders = useMemo(
    () => (data?.orders || []).filter((o) => o.pickupDate === selectedDate),
    [data, selectedDate]
  );

  const stats = useMemo(() => {
    const active = selectedDateOrders.filter((o) => o.status !== "cancelled");
    const revenueCents = active.reduce((s, o) => s + o.totalCents, 0);
    const pending = active.filter(
      (o) => o.status === "pending_payment" || o.status === "pending_confirmation"
    ).length;
    const ready = active.filter((o) => o.status === "ready").length;

    const itemTotals: Record<string, number> = {};
    const slotCounts: Record<string, number> = {};
    for (const o of active) {
      slotCounts[o.pickupTime] = (slotCounts[o.pickupTime] || 0) + 1;
      for (const item of o.items) {
        itemTotals[item.nameEn] = (itemTotals[item.nameEn] || 0) + item.quantity;
      }
    }

    return {
      totalOrders: active.length,
      revenueCents,
      pending,
      ready,
      itemTotals,
      slotCounts,
    };
  }, [selectedDateOrders]);

  const knownStockKeys = useMemo(() => {
    const set = new Set<string>(["koobideh", "joojeh", "tiramisu"]);
    data?.menu.forEach((m) => set.add(m.stockKey));
    Object.keys(data?.settings.masterInventory || {}).forEach((k) => set.add(k));
    Object.keys(selectedSchedule?.inventory || {}).forEach((k) => set.add(k));
    return Array.from(set);
  }, [data, selectedSchedule]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center text-zinc-400 font-semibold">
        Loading Admin Panel...
      </div>
    );
  }

  if (!authenticated || !data) {
    return (
      <div className="min-h-screen bg-charcoal-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl bg-charcoal-900 border border-white/10 p-7 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <img src="/logo.png" alt="Weekend BBQ" className="w-14 h-14 mx-auto object-contain" />
            <h1 className="text-2xl font-extrabold text-white">BBQ Admin Panel</h1>
            <p className="text-xs text-zinc-400">
              Sign in with your server admin credentials (no Firebase needed)
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Admin Email
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-charcoal-950 border border-white/10 text-white text-sm focus:border-saffron-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-charcoal-950 border border-white/10 text-white text-sm focus:border-saffron-500 outline-none"
              />
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold text-center">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3.5 rounded-xl bg-ember-600 hover:bg-ember-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition"
            >
              <Lock className="w-4 h-4" />
              {loggingIn ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <div className="text-center">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 underline">
              ← Back to Storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: TabId; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: "orders",
      label: "Orders",
      icon: <ClipboardList className="w-4 h-4" />,
      badge: stats.pending || undefined,
    },
    { id: "inventory", label: "Stock & Slots", icon: <Package className="w-4 h-4" /> },
    { id: "menu", label: "Menu", icon: <UtensilsCrossed className="w-4 h-4" /> },
    { id: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
  ];

  const availableDates = data.dates.map((d) => d.date);

  return (
    <div className="min-h-screen bg-charcoal-950 text-zinc-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-charcoal-900 border-r border-white/10 no-print">
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <img src="/logo.png" alt="WB" className="w-9 h-9 object-contain" />
          <div>
            <div className="font-extrabold text-white leading-tight">Weekend BBQ</div>
            <div className="text-[11px] text-saffron-400 font-semibold">Admin Console</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
                activeTab === item.id
                  ? "bg-saffron-500/15 text-saffron-400 border border-saffron-500/25"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                {item.icon}
                {item.label}
              </span>
              {item.badge ? (
                <span className="px-2 py-0.5 rounded-full bg-ember-600 text-white text-[10px] font-black">
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <Link
            href="/"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-200"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View Storefront
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-charcoal-900/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 py-3 no-print">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="WB" className="w-8 h-8 object-contain lg:hidden" />
              <div>
                <h1 className="text-lg font-extrabold text-white capitalize">
                  {activeTab === "inventory" ? "Stock & Time Slots" : activeTab}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                  <span className="inline-flex items-center gap-1">
                    <Database className="w-3 h-3 text-saffron-400" />
                    {data.environment.storageMode === "postgres"
                      ? "Postgres Connected"
                      : "Local Dev Store"}
                  </span>
                  <span>·</span>
                  <span
                    className={
                      data.environment.stripeConfigured ? "text-emerald-400" : "text-amber-400"
                    }
                  >
                    {data.environment.stripeConfigured ? "Stripe Ready" : "Stripe Keys Needed"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadBootstrap}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300"
                title="Refresh Data"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <Link
                href="/"
                className="lg:hidden px-3 py-2 rounded-xl bg-white/5 text-xs font-bold text-zinc-200"
              >
                Store
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="lg:hidden p-2 rounded-xl bg-red-500/10 text-red-400"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile Tab Strip */}
          <div className="lg:hidden flex gap-1.5 overflow-x-auto pt-3 pb-0.5 hide-scrollbar">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === item.id
                    ? "bg-saffron-500 text-charcoal-950"
                    : "bg-white/5 text-zinc-400"
                }`}
              >
                {item.icon}
                {item.label}
                {item.badge ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-ember-600 text-white text-[10px]">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </header>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm shadow-2xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{toast}</span>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* KPI Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-4">
                  <div className="text-xs text-zinc-400 font-semibold">Orders ({selectedDate})</div>
                  <div className="text-3xl font-black text-white mt-1">{stats.totalOrders}</div>
                </div>
                <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-4">
                  <div className="text-xs text-zinc-400 font-semibold">Revenue (CAD)</div>
                  <div className="text-3xl font-black text-emerald-400 mt-1">
                    {formatCAD(stats.revenueCents)}
                  </div>
                </div>
                <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-4">
                  <div className="text-xs text-zinc-400 font-semibold">Pending Action</div>
                  <div className="text-3xl font-black text-amber-400 mt-1">{stats.pending}</div>
                </div>
                <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-4">
                  <div className="text-xs text-zinc-400 font-semibold">Ready for Pickup</div>
                  <div className="text-3xl font-black text-sky-400 mt-1">{stats.ready}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Quick Controls */}
                <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-5 space-y-4">
                  <h2 className="font-extrabold text-white text-base flex items-center gap-2">
                    <Flame className="w-4 h-4 text-saffron-400" />
                    Quick Store Controls
                  </h2>

                  <div className="space-y-2.5">
                    <label className="flex items-center justify-between p-3 rounded-xl bg-charcoal-900/70 border border-white/5 cursor-pointer">
                      <div>
                        <div className="text-sm font-bold text-white">Store Open</div>
                        <div className="text-[11px] text-zinc-400">Accepting new pre-orders</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={data.settings.isStoreOpen}
                        onChange={(e) =>
                          patchSettings(
                            { isStoreOpen: e.target.checked },
                            e.target.checked ? "Store opened" : "Store closed"
                          )
                        }
                        className="w-5 h-5 accent-emerald-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 rounded-xl bg-charcoal-900/70 border border-white/5 cursor-pointer">
                      <div>
                        <div className="text-sm font-bold text-white">Maintenance Mode</div>
                        <div className="text-[11px] text-zinc-400">Pause storefront temporarily</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={data.settings.maintenanceMode}
                        onChange={(e) =>
                          patchSettings(
                            { maintenanceMode: e.target.checked },
                            e.target.checked ? "Maintenance ON" : "Maintenance OFF"
                          )
                        }
                        className="w-5 h-5 accent-amber-500"
                      />
                    </label>
                  </div>

                  {/* Pickup Dates Manager */}
                  <div className="pt-2 border-t border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-saffron-400" />
                        Active Pickup Dates
                      </span>
                    </div>

                    <div className="space-y-2">
                      {data.dates.map((d) => (
                        <div
                          key={d.date}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs ${
                            d.date === selectedDate
                              ? "bg-saffron-500/15 border-saffron-500/40 text-white"
                              : "bg-charcoal-900/60 border-white/5 text-zinc-300"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedDate(d.date)}
                            className="font-bold text-left flex-1"
                          >
                            {d.date} · {formatPickupDate(d.date, "en")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDate(d.date)}
                            className="p-1 text-zinc-500 hover:text-red-400"
                            title="Remove date"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newDateInput}
                        onChange={(e) => setNewDateInput(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-charcoal-900 border border-white/10 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddDate}
                        className="px-3 py-2 rounded-xl bg-saffron-500 text-charcoal-950 font-extrabold text-xs flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Kitchen Prep & Time Rush Summary */}
                <div className="lg:col-span-2 rounded-2xl bg-charcoal-800 border border-white/10 p-5 space-y-5">
                  <div>
                    <h2 className="font-extrabold text-white text-base">
                      Kitchen Prep Summary — {formatPickupDate(selectedDate, "en")}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Total non-cancelled portions ordered for the selected pickup date.
                    </p>
                  </div>

                  {Object.keys(stats.itemTotals).length === 0 ? (
                    <div className="p-8 rounded-xl bg-charcoal-900/50 border border-dashed border-white/10 text-center text-sm text-zinc-500">
                      No active orders yet for {selectedDate}.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(stats.itemTotals).map(([name, qty]) => {
                        const maxQty = Math.max(...Object.values(stats.itemTotals), 1);
                        const pct = Math.round((qty / maxQty) * 100);
                        return (
                          <div key={name} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-semibold text-zinc-200">{name}</span>
                              <span className="font-black text-saffron-400">{qty} portions</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-charcoal-900 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-ember-600 to-saffron-400"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Orders by Pickup Window */}
                  {selectedSchedule && (
                    <div className="pt-4 border-t border-white/10 space-y-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        Slot Utilization
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {sortTimeSlots(Object.keys(selectedSchedule.timeSlotLimits)).map((slot) => {
                          const lim = Object.values(selectedSchedule.timeSlotLimits[slot] || {}).reduce(
                            (a, b) => a + (Number(b) || 0),
                            0
                          );
                          const used = Object.values(selectedSchedule.timeSlotUsed[slot] || {}).reduce(
                            (a, b) => a + (Number(b) || 0),
                            0
                          );
                          return (
                            <div
                              key={slot}
                              className="p-3 rounded-xl bg-charcoal-900/70 border border-white/5"
                            >
                              <div className="font-extrabold text-sm text-white">{slot}</div>
                              <div className="text-xs text-zinc-400 mt-0.5">
                                {used} / {lim} spots · {stats.slotCounts[slot] || 0} orders
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ORDERS TAB */}
          {activeTab === "orders" && (
            <AdminOrdersTab
              orders={data.orders}
              selectedDate={selectedDate}
              availableDates={availableDates}
              onSelectDate={setSelectedDate}
              onUpdateStatus={handleUpdateOrderStatus}
              onDeleteOrder={handleDeleteOrder}
              onDeleteAllForDate={handleDeleteAllOrders}
            />
          )}

          {/* INVENTORY & SLOTS TAB */}
          {activeTab === "inventory" && (
            <AdminInventoryTab
              schedule={selectedSchedule}
              availableDates={availableDates}
              menu={data.menu}
              onSelectDate={setSelectedDate}
              onSaveSchedule={handleSaveSchedule}
            />
          )}

          {/* MENU TAB */}
          {activeTab === "menu" && (
            <AdminMenuTab
              menu={data.menu}
              knownStockKeys={knownStockKeys}
              onSaveItem={handleSaveMenuItem}
              onDeleteItem={handleDeleteMenuItem}
            />
          )}

          {/* SETTINGS TAB */}
          {activeTab === "settings" && settingsDraft && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Payment Configuration */}
              <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-5 space-y-4">
                <h3 className="font-extrabold text-white text-base">Payment Gateway</h3>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                    Active Payment Mode
                  </label>
                  <select
                    value={settingsDraft.paymentMode}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        paymentMode: e.target.value as PaymentMode,
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white"
                  >
                    <option value="stripe">Stripe Only (Recommended — Instant Card / Apple Pay)</option>
                    <option value="hybrid">Hybrid (Stripe + Interac e-Transfer)</option>
                    <option value="manual">Manual Only (Interac e-Transfer + Receipt)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1.5">
                    Interac e-Transfer Email (for Hybrid / Manual)
                  </label>
                  <input
                    type="email"
                    value={settingsDraft.etransferEmail}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, etransferEmail: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-charcoal-900/70 border border-white/5 text-xs text-zinc-400 space-y-1">
                  <div className="font-bold text-zinc-200">Server Environment Status</div>
                  <div>
                    Stripe API Key:{" "}
                    <strong
                      className={
                        data.environment.stripeConfigured ? "text-emerald-400" : "text-amber-400"
                      }
                    >
                      {data.environment.stripeConfigured ? "Configured" : "Set STRIPE_SECRET_KEY in Vercel"}
                    </strong>
                  </div>
                  <div>
                    Gmail SMTP:{" "}
                    <strong
                      className={
                        data.environment.smtpConfigured ? "text-emerald-400" : "text-amber-400"
                      }
                    >
                      {data.environment.smtpConfigured ? "Configured" : "Set SMTP_USER & SMTP_PASS in Vercel"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Store Details & Announcements */}
              <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-5 space-y-4">
                <h3 className="font-extrabold text-white text-base">Store Details & Cutoff</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-1">
                      Pickup Address
                    </label>
                    <input
                      type="text"
                      value={settingsDraft.pickupAddress}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, pickupAddress: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="text"
                      value={settingsDraft.pickupPhone}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, pickupPhone: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-charcoal-900/70 border border-white/5">
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsDraft.cutoffEnabled}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, cutoffEnabled: e.target.checked })
                      }
                    />
                    Day-before order cutoff (Calgary time)
                  </label>
                  <select
                    value={settingsDraft.cutoffHour}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, cutoffHour: Number(e.target.value) })
                    }
                    className="px-2.5 py-1 rounded-lg bg-charcoal-800 border border-white/15 text-xs text-white"
                  >
                    {[18, 19, 20, 21, 22, 23].map((h) => (
                      <option key={h} value={h}>
                        {h - 12}:00 PM
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1">
                    Storefront Banner Announcement (English, optional)
                  </label>
                  <input
                    type="text"
                    value={settingsDraft.announcementEn}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, announcementEn: e.target.value })
                    }
                    placeholder="e.g. Fresh baked barbari bread included this weekend!"
                    className="w-full px-3 py-2 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1">
                    Storefront Banner Announcement (Farsi, optional)
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    value={settingsDraft.announcementFa}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, announcementFa: e.target.value })
                    }
                    placeholder="مثلاً: این آخر هفته نان تازه همراه سفارش!"
                    className="w-full px-3 py-2 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white font-persian"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-bold text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsDraft.emailAlertsEnabled}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, emailAlertsEnabled: e.target.checked })
                    }
                  />
                  Email me on every new order
                </label>

                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={() => patchSettings(settingsDraft, "Store settings saved")}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {savingSettings ? "Saving..." : "Save All Settings"}
                </button>
              </div>

              {/* Backup & Restore */}
              <div className="lg:col-span-2 rounded-2xl bg-charcoal-800 border border-white/10 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-extrabold text-white text-base">Backup & Restore</h3>
                  <p className="text-xs text-zinc-400">
                    Export all settings, bilingual menu, pickup schedules, and orders as JSON.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    className="px-4 py-2.5 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Download JSON
                  </button>
                  <label className="px-4 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Restore JSON
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleRestoreBackup}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
