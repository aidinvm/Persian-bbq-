"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { format24hTo12h, formatPickupDate, sortTimeSlots } from "@/lib/time";
import type { MenuItem, PickupDateSchedule, SlotLimitsMap } from "@/lib/types";

interface Props {
  schedule: PickupDateSchedule | null;
  availableDates: string[];
  menu: MenuItem[];
  onSelectDate: (date: string) => void;
  onSaveSchedule: (
    date: string,
    patch: { inventory?: Record<string, number>; timeSlotLimits?: SlotLimitsMap; applyMasterTemplate?: boolean }
  ) => Promise<void>;
}

export default function AdminInventoryTab({
  schedule,
  availableDates,
  menu,
  onSelectDate,
  onSaveSchedule,
}: Props) {
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [slotLimits, setSlotLimits] = useState<SlotLimitsMap>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newKey, setNewKey] = useState("");
  const [newKeyQty, setNewKeyQty] = useState(15);

  const [newSlotTime, setNewSlotTime] = useState("18:00");

  useEffect(() => {
    if (schedule) {
      setInventory({ ...schedule.inventory });
      setSlotLimits(structuredClone(schedule.timeSlotLimits));
      setDirty(false);
    }
  }, [schedule]);

  const grillStockKeys = useMemo(() => {
    const set = new Set<string>();
    menu.filter((m) => m.countsTowardSlot).forEach((m) => set.add(m.stockKey));
    Object.values(slotLimits).forEach((obj) => Object.keys(obj).forEach((k) => set.add(k)));
    if (set.size === 0) Object.keys(inventory).forEach((k) => set.add(k));
    return Array.from(set);
  }, [menu, slotLimits, inventory]);

  const sortedSlots = useMemo(() => sortTimeSlots(Object.keys(slotLimits)), [slotLimits]);

  // Capacity validation comparing total remaining/configured slot capacity vs stock per grill item
  const capacityChecks = useMemo(() => {
    if (!schedule) return [];
    return grillStockKeys.map((key) => {
      const stockRemaining = Number(inventory[key]) || 0;
      let totalSlotLimit = 0;
      let totalSlotUsed = 0;
      for (const slot of sortedSlots) {
        totalSlotLimit += Number(slotLimits[slot]?.[key]) || 0;
        totalSlotUsed += Number(schedule.timeSlotUsed[slot]?.[key]) || 0;
      }
      const totalSlotRemaining = Math.max(0, totalSlotLimit - totalSlotUsed);
      const diff = totalSlotRemaining - stockRemaining;
      return { key, stockRemaining, totalSlotLimit, totalSlotUsed, totalSlotRemaining, diff };
    });
  }, [grillStockKeys, inventory, schedule, slotLimits, sortedSlots]);

  if (!schedule) {
    return (
      <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-8 text-center text-zinc-400">
        Add a pickup date in Overview first to manage its inventory and time slots.
      </div>
    );
  }

  const updateStock = (key: string, val: number) => {
    setInventory((prev) => ({ ...prev, [key]: Math.max(0, val) }));
    setDirty(true);
  };

  const updateSlotKeyLimit = (slot: string, key: string, val: number) => {
    setSlotLimits((prev) => ({
      ...prev,
      [slot]: {
        ...(prev[slot] || {}),
        [key]: Math.max(0, val),
      },
    }));
    setDirty(true);
  };

  const handleAddKey = () => {
    const clean = newKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!clean) return;
    setInventory((prev) => ({ ...prev, [clean]: Math.max(0, newKeyQty) }));
    setNewKey("");
    setNewKeyQty(15);
    setDirty(true);
  };

  const handleAddSlot = () => {
    if (!newSlotTime) return;
    const label = format24hTo12h(newSlotTime);
    if (slotLimits[label]) return;
    const defaults: Record<string, number> = {};
    grillStockKeys.forEach((k) => {
      defaults[k] = 4;
    });
    setSlotLimits((prev) => ({ ...prev, [label]: defaults }));
    setDirty(true);
  };

  const handleRemoveSlot = (slot: string) => {
    setSlotLimits((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveSchedule(schedule.date, { inventory, timeSlotLimits: slotLimits });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Date Picker & Save Bar */}
      <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-saffron-400">
            Managing {formatPickupDate(schedule.date, "en")}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableDates.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onSelectDate(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  d === schedule.date
                    ? "bg-saffron-500 text-charcoal-950"
                    : "bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              if (window.confirm("Reset this date's stock & slot limits to the Master Template?")) {
                await onSaveSchedule(schedule.date, { applyMasterTemplate: true });
              }
            }}
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-200 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Template
          </button>

          <button
            type="button"
            disabled={!dirty || saving}
            onClick={handleSave}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
              dirty
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
                : "bg-white/5 text-zinc-500 cursor-not-allowed"
            }`}
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : dirty ? "Save Changes" : "Saved"}
          </button>
        </div>
      </div>

      {/* Capacity Validation Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {capacityChecks.map((c) => {
          const balanced = c.diff === 0;
          return (
            <div
              key={c.key}
              className={`rounded-xl border px-4 py-3 flex items-start gap-3 text-xs ${
                balanced
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-200"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-200"
              }`}
            >
              {balanced ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold uppercase tracking-wide">{c.key} Capacity Check</div>
                <div className="mt-0.5 opacity-90">
                  Stock remaining: <strong>{c.stockRemaining}</strong> · Slot spots remaining:{" "}
                  <strong>{c.totalSlotRemaining}</strong> ({c.totalSlotUsed}/{c.totalSlotLimit} used)
                  {!balanced && (
                    <span className="block mt-0.5 font-semibold">
                      {c.diff > 0
                        ? `Slots have ${c.diff} more spots than stock.`
                        : `Stock has ${Math.abs(c.diff)} more portions than available slot spots.`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Stock Levels */}
        <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-5 space-y-4">
          <h3 className="font-bold text-white text-base">Remaining Stock Levels</h3>

          <div className="space-y-3">
            {Object.entries(inventory).map(([key, qty]) => (
              <div
                key={key}
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-charcoal-900/70 border border-white/5"
              >
                <span className="font-bold text-sm text-zinc-100 capitalize">{key}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateStock(key, qty - 5)}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300"
                  >
                    -5
                  </button>
                  <button
                    type="button"
                    onClick={() => updateStock(key, qty - 1)}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300"
                  >
                    -1
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={qty}
                    onChange={(e) => updateStock(key, parseInt(e.target.value, 10) || 0)}
                    className="w-16 text-center py-1.5 rounded-lg bg-charcoal-800 border border-white/15 text-sm font-extrabold text-white"
                  />
                  <button
                    type="button"
                    onClick={() => updateStock(key, qty + 1)}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() => updateStock(key, qty + 5)}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300"
                  >
                    +5
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-white/10 flex gap-2">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="New stock key (e.g. barg)"
              className="flex-1 px-3 py-2 rounded-xl bg-charcoal-900 border border-white/10 text-xs text-white"
            />
            <input
              type="number"
              min={0}
              value={newKeyQty}
              onChange={(e) => setNewKeyQty(parseInt(e.target.value, 10) || 0)}
              className="w-20 px-3 py-2 rounded-xl bg-charcoal-900 border border-white/10 text-xs text-white"
            />
            <button
              type="button"
              onClick={handleAddKey}
              className="px-3 py-2 rounded-xl bg-saffron-500 text-charcoal-950 font-bold text-xs flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>

        {/* Time Slots */}
        <div className="rounded-2xl bg-charcoal-800 border border-white/10 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-white text-base">Pickup Time Slots</h3>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={newSlotTime}
                onChange={(e) => setNewSlotTime(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-charcoal-900 border border-white/15 text-xs text-white"
              />
              <button
                type="button"
                onClick={handleAddSlot}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Slot
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {sortedSlots.map((slot) => {
              const limits = slotLimits[slot] || {};
              const usedObj = schedule.timeSlotUsed[slot] || {};
              const totalLimit = Object.values(limits).reduce((s, v) => s + (Number(v) || 0), 0);
              const totalUsed = Object.values(usedObj).reduce((s, v) => s + (Number(v) || 0), 0);
              const pct = totalLimit > 0 ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0;

              return (
                <div
                  key={slot}
                  className="rounded-xl bg-charcoal-900/70 border border-white/5 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-white">{slot}</span>
                      <span className="text-xs text-zinc-400">
                        {totalUsed} / {totalLimit} used ({Math.max(0, totalLimit - totalUsed)} left)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSlot(slot)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                      title="Remove time slot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-amber-400" : "bg-emerald-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {grillStockKeys.map((key) => {
                      const u = Number(usedObj[key]) || 0;
                      const l = Number(limits[key]) || 0;
                      return (
                        <label
                          key={key}
                          className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-charcoal-800 border border-white/5 text-xs"
                        >
                          <span className="text-zinc-400 truncate capitalize">
                            {key} ({u}/)
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={l}
                            onChange={(e) =>
                              updateSlotKeyLimit(slot, key, parseInt(e.target.value, 10) || 0)
                            }
                            className="w-12 text-center py-0.5 rounded bg-charcoal-900 border border-white/15 font-bold text-white"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
