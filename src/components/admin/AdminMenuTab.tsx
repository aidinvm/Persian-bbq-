"use client";

import React, { useState } from "react";
import { Edit3, Plus, Save, Trash2, X } from "lucide-react";
import { formatCAD } from "@/lib/i18n";
import type { MenuCategory, MenuItem } from "@/lib/types";

interface Props {
  menu: MenuItem[];
  knownStockKeys: string[];
  onSaveItem: (item: Partial<MenuItem>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}

const EMPTY_FORM = {
  id: "",
  nameEn: "",
  nameFa: "",
  descriptionEn: "",
  descriptionFa: "",
  badgeEn: "Serves 2",
  badgeFa: "مناسب ۲ نفر",
  priceDollars: "31.00",
  stockKey: "koobideh",
  category: "grill" as MenuCategory,
  countsTowardSlot: true,
  isActive: true,
  sortOrder: 1,
};

export default function AdminMenuTab({
  menu,
  knownStockKeys,
  onSaveItem,
  onDeleteItem,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setForm({
      ...EMPTY_FORM,
      stockKey: knownStockKeys[0] || "koobideh",
      sortOrder: menu.length + 1,
    });
    setEditing(true);
  };

  const openEdit = (item: MenuItem) => {
    setForm({
      id: item.id,
      nameEn: item.nameEn,
      nameFa: item.nameFa,
      descriptionEn: item.descriptionEn,
      descriptionFa: item.descriptionFa,
      badgeEn: item.badgeEn,
      badgeFa: item.badgeFa,
      priceDollars: (item.priceCents / 100).toFixed(2),
      stockKey: item.stockKey,
      category: item.category,
      countsTowardSlot: item.countsTowardSlot,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    });
    setEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveItem({
        id: form.id || undefined,
        nameEn: form.nameEn,
        nameFa: form.nameFa,
        descriptionEn: form.descriptionEn,
        descriptionFa: form.descriptionFa,
        badgeEn: form.badgeEn,
        badgeFa: form.badgeFa,
        priceCents: Math.round(parseFloat(form.priceDollars || "0") * 100),
        stockKey: form.stockKey.trim(),
        category: form.category,
        countsTowardSlot: form.countsTowardSlot,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-extrabold text-white">Bilingual Menu</h3>
          <p className="text-xs text-zinc-400">
            Update English & Farsi names, descriptions, prices (CAD), and inventory links.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="px-4 py-2.5 rounded-xl bg-ember-600 hover:bg-ember-500 text-white text-xs font-extrabold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Add Menu Item
        </button>
      </div>

      {editing && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-charcoal-800 border border-saffron-500/40 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white">
              {form.id ? "Edit Menu Item" : "New Menu Item"}
            </h4>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Name (English) *</label>
              <input
                type="text"
                required
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Name (Farsi) *</label>
              <input
                type="text"
                required
                dir="rtl"
                value={form.nameFa}
                onChange={(e) => setForm({ ...form, nameFa: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white font-persian"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">
                Description (English)
              </label>
              <textarea
                rows={2}
                value={form.descriptionEn}
                onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">
                Description (Farsi)
              </label>
              <textarea
                rows={2}
                dir="rtl"
                value={form.descriptionFa}
                onChange={(e) => setForm({ ...form, descriptionFa: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white font-persian"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">
                Badge (EN, optional)
              </label>
              <input
                type="text"
                value={form.badgeEn}
                onChange={(e) => setForm({ ...form, badgeEn: e.target.value })}
                placeholder="e.g. Serves 2"
                className="w-full px-3.5 py-2 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">
                Badge (FA, optional)
              </label>
              <input
                type="text"
                dir="rtl"
                value={form.badgeFa}
                onChange={(e) => setForm({ ...form, badgeFa: e.target.value })}
                placeholder="مناسب ۲ نفر"
                className="w-full px-3.5 py-2 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white font-persian"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Price (CAD $) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.priceDollars}
                onChange={(e) => setForm({ ...form, priceDollars: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => {
                  const cat = e.target.value as MenuCategory;
                  setForm({
                    ...form,
                    category: cat,
                    countsTowardSlot: cat !== "dessert",
                  });
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white"
              >
                <option value="grill">Grill / Main Menu</option>
                <option value="dessert">Signature Dessert</option>
                <option value="side">Side</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">
                Inventory Stock Key *
              </label>
              <input
                type="text"
                list="stock-keys-list"
                required
                value={form.stockKey}
                onChange={(e) => setForm({ ...form, stockKey: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-charcoal-900 border border-white/10 text-sm text-white"
              />
              <datalist id="stock-keys-list">
                {knownStockKeys.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.countsTowardSlot}
                onChange={(e) => setForm({ ...form, countsTowardSlot: e.target.checked })}
                className="rounded"
              />
              Counts toward pickup time-slot capacity (uncheck for desserts)
            </label>

            <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="rounded"
              />
              Visible on storefront
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 rounded-xl bg-white/5 text-zinc-300 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving..." : "Save Menu Item"}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {menu.map((item) => (
          <div
            key={item.id}
            className={`rounded-2xl bg-charcoal-800 border p-4 space-y-3 ${
              item.isActive ? "border-white/10" : "border-white/5 opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white">{item.nameEn}</span>
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-bold uppercase text-saffron-400">
                    {item.category}
                  </span>
                  {!item.isActive && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-700 text-[10px] font-bold text-zinc-300">
                      Hidden
                    </span>
                  )}
                </div>
                <div className="text-sm text-zinc-300 font-persian mt-0.5" dir="rtl">
                  {item.nameFa}
                </div>
              </div>
              <div className="font-black text-lg text-saffron-400">
                {formatCAD(item.priceCents)}
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">{item.descriptionEn}</p>

            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
              <span className="text-zinc-400">
                Stock key: <code className="text-zinc-200">{item.stockKey}</code> ·{" "}
                {item.countsTowardSlot ? "Uses slot cap" : "No slot cap"}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 font-bold flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete "${item.nameEn}" from menu?`)) {
                      onDeleteItem(item.id);
                    }
                  }}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
