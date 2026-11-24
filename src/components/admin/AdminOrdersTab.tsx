"use client";

import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  Mail,
  Phone,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { formatCAD } from "@/lib/i18n";
import { formatPickupDate } from "@/lib/time";
import type { Order, OrderStatus } from "@/lib/types";

interface Props {
  orders: Order[];
  selectedDate: string;
  availableDates: string[];
  onSelectDate: (date: string) => void;
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  onDeleteAllForDate: (date: string) => Promise<void>;
}

const STATUS_META: Record<
  OrderStatus,
  { label: string; badgeClass: string }
> = {
  pending_payment: {
    label: "Awaiting Stripe",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  pending_confirmation: {
    label: "Verify e-Transfer",
    badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  },
  confirmed: {
    label: "Confirmed",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  ready: {
    label: "Ready",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  picked_up: {
    label: "Picked Up",
    badgeClass: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  },
  cancelled: {
    label: "Cancelled",
    badgeClass: "bg-red-500/15 text-red-300 border-red-500/30",
  },
};

export default function AdminOrdersTab({
  orders,
  selectedDate,
  availableDates,
  onSelectDate,
  onUpdateStatus,
  onDeleteOrder,
  onDeleteAllForDate,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [receiptModal, setReceiptModal] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const dateOrders = useMemo(
    () => orders.filter((o) => o.pickupDate === selectedDate),
    [orders, selectedDate]
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dateOrders.filter((o) => {
      if (statusFilter === "pending") {
        if (o.status !== "pending_payment" && o.status !== "pending_confirmation") return false;
      } else if (statusFilter !== "all" && o.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        o.customerName.toLowerCase().includes(q) ||
        o.customerEmail.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.pickupTime.toLowerCase().includes(q)
      );
    });
  }, [dateOrders, search, statusFilter]);

  const exportCsv = () => {
    const header = [
      "Order #",
      "Pickup Date",
      "Pickup Time",
      "Customer",
      "Phone",
      "Email",
      "Items",
      "Total CAD",
      "Payment",
      "Status",
      "Notes",
    ];
    const rows = filteredOrders.map((o) => [
      o.orderNumber,
      o.pickupDate,
      o.pickupTime,
      o.customerName,
      o.customerPhone,
      o.customerEmail,
      o.items.map((i) => `${i.quantity}x ${i.nameEn}`).join(" | "),
      (o.totalCents / 100).toFixed(2),
      `${o.paymentMethod} (${o.paymentStatus})`,
      o.status,
      o.notes || "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekend-bbq-orders-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAction = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Date & Actions Bar */}
      <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-saffron-400">
            Orders for {formatPickupDate(selectedDate, "en")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {availableDates.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onSelectDate(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  d === selectedDate
                    ? "bg-saffron-500 text-charcoal-950"
                    : "bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {d}
              </button>
            ))}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && onSelectDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-charcoal-900 border border-white/15 text-xs text-white"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={exportCsv}
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-200 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-200 flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
          {dateOrders.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (
                  window.confirm(
                    `Delete ALL ${dateOrders.length} orders for ${selectedDate}?\n\nAll stock and time-slot capacities will be restored automatically.`
                  )
                ) {
                  await onDeleteAllForDate(selectedDate);
                }
              }}
              className="px-3 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-bold text-red-300 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete All ({dateOrders.length})
            </button>
          )}
        </div>
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-col sm:flex-row gap-3 no-print">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, email, order #..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-charcoal-800 border border-white/10 text-sm text-white placeholder:text-zinc-500 focus:border-saffron-500 outline-none"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
          {[
            { id: "all", label: `All (${dateOrders.length})` },
            { id: "pending", label: "Pending" },
            { id: "confirmed", label: "Confirmed" },
            { id: "ready", label: "Ready" },
            { id: "picked_up", label: "Picked Up" },
            { id: "cancelled", label: "Cancelled" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                statusFilter === tab.id
                  ? "bg-ember-600 text-white"
                  : "bg-charcoal-800 border border-white/10 text-zinc-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-2xl bg-charcoal-800/60 border border-dashed border-white/15 p-12 text-center">
          <p className="text-zinc-300 font-bold">No orders match this date & filter.</p>
          <p className="text-xs text-zinc-500 mt-1">
            Orders placed by customers will appear here immediately.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredOrders.map((order) => {
            const meta = STATUS_META[order.status];
            const isBusy = busyId === order.id;

            return (
              <div
                key={order.id}
                className="rounded-2xl bg-charcoal-800 border border-white/10 p-4 sm:p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-extrabold text-saffron-400">
                          {order.orderNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-white/10 text-white text-xs font-bold">
                          {order.pickupTime}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <h3 className="text-base font-extrabold text-white mt-1.5">
                        {order.customerName}
                      </h3>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-emerald-400">
                        {formatCAD(order.totalCents)}
                      </div>
                      <div className="text-[11px] font-semibold text-zinc-400 uppercase">
                        {order.paymentMethod === "stripe" ? "Stripe" : "e-Transfer"} ·{" "}
                        {order.paymentStatus}
                      </div>
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                    <a
                      href={`tel:${order.customerPhone}`}
                      className="inline-flex items-center gap-1 hover:text-white"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {order.customerPhone}
                    </a>
                    <a
                      href={`mailto:${order.customerEmail}`}
                      className="inline-flex items-center gap-1 hover:text-white"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {order.customerEmail}
                    </a>
                  </div>

                  {/* Items */}
                  <div className="rounded-xl bg-charcoal-900/80 border border-white/5 p-3 space-y-1.5">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-200">
                          <strong className="text-saffron-400 mr-1.5">{item.quantity}×</strong>
                          {item.nameEn}
                        </span>
                        <span className="text-zinc-400 font-semibold">
                          {formatCAD(item.priceCents * item.quantity)}
                        </span>
                      </div>
                    ))}
                    {order.notes && (
                      <div className="pt-2 mt-2 border-t border-white/10 text-xs text-amber-300">
                        Note: {order.notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 no-print">
                  <div className="flex flex-wrap gap-1.5">
                    {order.receiptImage && (
                      <button
                        type="button"
                        onClick={() => setReceiptModal(order.receiptImage!)}
                        className="px-2.5 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Receipt
                      </button>
                    )}

                    {(order.status === "pending_confirmation" ||
                      order.status === "pending_payment") && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handleAction(order.id, () => onUpdateStatus(order.id, "confirmed"))
                        }
                        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirm
                      </button>
                    )}

                    {order.status === "confirmed" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handleAction(order.id, () => onUpdateStatus(order.id, "ready"))
                        }
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
                      >
                        Mark Ready
                      </button>
                    )}

                    {order.status === "ready" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handleAction(order.id, () => onUpdateStatus(order.id, "picked_up"))
                        }
                        className="px-3 py-1.5 rounded-lg bg-zinc-600 hover:bg-zinc-500 text-white text-xs font-bold disabled:opacity-50"
                      >
                        Picked Up
                      </button>
                    )}

                    {order.status !== "cancelled" && order.status !== "picked_up" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Cancel order ${order.orderNumber} and restore its stock & time-slot capacity?`
                            )
                          ) {
                            handleAction(order.id, () => onUpdateStatus(order.id, "cancelled"));
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 text-zinc-300 hover:text-amber-300 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Permanently delete order ${order.orderNumber}? Stock and time-slot capacity will be restored if not already cancelled.`
                        )
                      ) {
                        handleAction(order.id, () => onDeleteOrder(order.id));
                      }
                    }}
                    className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 transition disabled:opacity-50"
                    title="Delete Order & Restore Stock"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Receipt Preview Modal */}
      {receiptModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setReceiptModal(null)}
        >
          <div
            className="bg-charcoal-800 border border-white/15 rounded-2xl p-4 max-w-lg w-full space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white">e-Transfer Receipt</h4>
              <button
                type="button"
                onClick={() => setReceiptModal(null)}
                className="p-1.5 rounded-lg bg-white/10 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={receiptModal}
              alt="Customer payment receipt"
              className="w-full max-h-[70vh] object-contain rounded-xl bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
}
