"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Copy,
  CreditCard,
  Eye,
  Flame,
  Lock,
  MapPin,
  Minus,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  Wrench,
} from "lucide-react";
import { formatCAD, t } from "@/lib/i18n";
import { formatPickupDate, getDateCardParts, sortTimeSlots } from "@/lib/time";
import type { Lang, MenuItem, PublicStorePayload } from "@/lib/types";

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read receipt image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(String(reader.result));
      img.onload = () => {
        const maxDim = 1200;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function StorefrontClient() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [store, setStore] = useState<PublicStorePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [paymentChoice, setPaymentChoice] = useState<"stripe" | "manual">("stripe");
  const [showEtransferEmail, setShowEtransferEmail] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  const copy = t(lang);
  const isRtl = lang === "fa";

  // Sync HTML dir/lang & localStorage
  useEffect(() => {
    const saved = window.localStorage.getItem("wbbq_lang");
    if (saved === "fa" || saved === "en") {
      setLang(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
    window.localStorage.setItem("wbbq_lang", lang);
  }, [lang]);

  const fetchStore = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetch("/api/store", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load menu");
      const data = (await res.json()) as PublicStorePayload;
      setStore(data);

      // Default payment method based on store mode
      if (data.settings.paymentMode === "manual") {
        setPaymentChoice("manual");
      } else {
        setPaymentChoice("stripe");
      }

      // Select first open, non-sold-out date automatically
      setSelectedDate((prev) => {
        if (
          prev &&
          data.dates.some((d) => d.date === prev && d.isAcceptingOrders && !d.isSoldOut)
        ) {
          return prev;
        }
        const firstOpen = data.dates.find((d) => d.isAcceptingOrders && !d.isSoldOut);
        return firstOpen?.date || data.dates[0]?.date || null;
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStore();
  }, [fetchStore]);

  const activeDateObj = useMemo(
    () => store?.dates.find((d) => d.date === selectedDate) || null,
    [store, selectedDate]
  );

  const grillMenu = useMemo(
    () => (store?.menu || []).filter((m) => m.category !== "dessert"),
    [store]
  );
  const dessertMenu = useMemo(
    () => (store?.menu || []).filter((m) => m.category === "dessert"),
    [store]
  );

  const sortedSlots = useMemo(() => {
    if (!activeDateObj) return [];
    return sortTimeSlots(Object.keys(activeDateObj.timeSlotLimits));
  }, [activeDateObj]);

  const cartSummary = useMemo(() => {
    if (!store) return { totalCents: 0, totalItems: 0, byStockKey: {} as Record<string, number> };
    let totalCents = 0;
    let totalItems = 0;
    const byStockKey: Record<string, number> = {};

    for (const item of store.menu) {
      const qty = quantities[item.id] || 0;
      if (qty > 0) {
        totalCents += item.priceCents * qty;
        totalItems += qty;
        byStockKey[item.stockKey] = (byStockKey[item.stockKey] || 0) + qty;
      }
    }
    return { totalCents, totalItems, byStockKey };
  }, [store, quantities]);

  const canItemFitInAnySlot = useCallback(
    (item: MenuItem): boolean => {
      if (!activeDateObj) return false;
      if (!item.countsTowardSlot) return true;
      return sortedSlots.some((slot) => {
        const limit = Number(activeDateObj.timeSlotLimits[slot]?.[item.stockKey]) || 0;
        const used = Number(activeDateObj.timeSlotUsed[slot]?.[item.stockKey]) || 0;
        return limit - used > 0;
      });
    },
    [activeDateObj, sortedSlots]
  );

  const getMaxAddableForItem = useCallback(
    (item: MenuItem): number => {
      if (!activeDateObj || !activeDateObj.isAcceptingOrders) return 0;
      const stock = Number(activeDateObj.inventory[item.stockKey]) || 0;
      const currentKeyQty = cartSummary.byStockKey[item.stockKey] || 0;
      let remaining = Math.max(0, stock - currentKeyQty);

      if (item.countsTowardSlot) {
        if (selectedTime) {
          const limit = Number(activeDateObj.timeSlotLimits[selectedTime]?.[item.stockKey]) || 0;
          const used = Number(activeDateObj.timeSlotUsed[selectedTime]?.[item.stockKey]) || 0;
          remaining = Math.min(remaining, Math.max(0, limit - used - currentKeyQty));
        } else {
          // Max capacity available in the single most open time slot
          const maxSlotAvail = sortedSlots.reduce((best, slot) => {
            const limit = Number(activeDateObj.timeSlotLimits[slot]?.[item.stockKey]) || 0;
            const used = Number(activeDateObj.timeSlotUsed[slot]?.[item.stockKey]) || 0;
            return Math.max(best, Math.max(0, limit - used));
          }, 0);
          remaining = Math.min(remaining, Math.max(0, maxSlotAvail - currentKeyQty));
        }
      }
      return remaining;
    },
    [activeDateObj, cartSummary.byStockKey, selectedTime, sortedSlots]
  );

  const isSlotFullOverall = useCallback(
    (slot: string): boolean => {
      if (!activeDateObj) return true;
      const limits = activeDateObj.timeSlotLimits[slot] || {};
      const used = activeDateObj.timeSlotUsed[slot] || {};
      const totalLimit = Object.values(limits).reduce((s, v) => s + (Number(v) || 0), 0);
      const totalUsed = Object.values(used).reduce((s, v) => s + (Number(v) || 0), 0);
      return totalLimit - totalUsed <= 0;
    },
    [activeDateObj]
  );

  const canCartFitInSlot = useCallback(
    (slot: string): boolean => {
      if (!activeDateObj || !store) return false;
      const limits = activeDateObj.timeSlotLimits[slot] || {};
      const used = activeDateObj.timeSlotUsed[slot] || {};

      // Check every grill item currently in cart
      const cartSlotByKey: Record<string, number> = {};
      for (const item of store.menu) {
        const qty = quantities[item.id] || 0;
        if (qty > 0 && item.countsTowardSlot) {
          cartSlotByKey[item.stockKey] = (cartSlotByKey[item.stockKey] || 0) + qty;
        }
      }

      for (const [stockKey, needed] of Object.entries(cartSlotByKey)) {
        const remaining = (Number(limits[stockKey]) || 0) - (Number(used[stockKey]) || 0);
        if (needed > remaining) return false;
      }
      return true;
    },
    [activeDateObj, quantities, store]
  );

  const handleQtyChange = (item: MenuItem, delta: number) => {
    setFormError(null);
    if (delta > 0) {
      const addable = getMaxAddableForItem(item);
      if (addable <= 0) {
        if (selectedTime && item.countsTowardSlot) {
          setFormError(copy.errItemSlotLimit);
        }
        return;
      }
    }
    setQuantities((prev) => {
      const next = Math.max(0, (prev[item.id] || 0) + delta);
      return { ...prev, [item.id]: next };
    });
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setQuantities({});
    setFormError(null);
  };

  const handleSelectTime = (slot: string) => {
    setFormError(null);
    if (!canCartFitInSlot(slot)) {
      setFormError(copy.errSlotCapacity);
      return;
    }
    setSelectedTime(slot);
  };

  const handleReceiptChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptDataUrl(null);
      setReceiptFileName(null);
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setFormError("Receipt file is too large (max 6 MB).");
      return;
    }
    try {
      const compressed = await compressImageToDataUrl(file);
      setReceiptDataUrl(compressed);
      setReceiptFileName(file.name);
      setFormError(null);
    } catch {
      setFormError("Could not process receipt image. Please try another file.");
    }
  };

  const showError = (msg: string) => {
    setFormError(msg);
    setTimeout(() => {
      errorBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const handleCheckout = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!store || !activeDateObj) return;
    setFormError(null);

    if (cartSummary.totalItems === 0) {
      showError(copy.errItemsRequired);
      return;
    }
    if (!selectedTime) {
      showError(copy.errTimeRequired);
      return;
    }
    if (!customerName.trim()) {
      showError(copy.errNameRequired);
      return;
    }
    if (!/^[A-Za-z\s\-']+$/.test(customerName.trim())) {
      showError(copy.errNameEnglish);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      showError(copy.errEmailInvalid);
      return;
    }
    if (customerPhone.replace(/\D/g, "").length < 10) {
      showError(copy.errPhoneInvalid);
      return;
    }

    const effectiveMethod: "stripe" | "manual" =
      store.settings.paymentMode === "hybrid"
        ? paymentChoice
        : store.settings.paymentMode === "manual"
          ? "manual"
          : "stripe";

    if (effectiveMethod === "manual" && !receiptDataUrl) {
      showError(copy.errReceiptRequired);
      return;
    }

    const itemsPayload = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupDate: activeDateObj.date,
          pickupTime: selectedTime,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerPhone: customerPhone.trim(),
          items: itemsPayload,
          paymentMethod: effectiveMethod,
          receiptImage: effectiveMethod === "manual" ? receiptDataUrl : null,
          notes: notes.trim() || null,
          lang,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        await fetchStore(); // Refresh stock/slots in case someone grabbed the last spot
        throw new Error(data.error || "Unable to process your order");
      }

      if (data.mode === "stripe" && data.url) {
        window.location.href = data.url;
        return;
      }

      if (data.mode === "manual" && data.orderId) {
        router.push(`/order/success?order_id=${encodeURIComponent(data.orderId)}&lang=${lang}`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const effectivePaymentMode: "stripe" | "manual" =
    store?.settings.paymentMode === "hybrid"
      ? paymentChoice
      : store?.settings.paymentMode === "manual"
        ? "manual"
        : "stripe";

  const hasOpenAcceptingDate = Boolean(
    store?.dates.some((d) => d.isAcceptingOrders && !d.isSoldOut)
  );

  const mapsLink = store
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        store.settings.pickupAddress
      )}`
    : "#";

  const announcement =
    lang === "fa" ? store?.settings.announcementFa : store?.settings.announcementEn;

  const renderMenuCard = (item: MenuItem) => {
    const qty = quantities[item.id] || 0;
    const stock = Number(activeDateObj?.inventory[item.stockKey]) || 0;
    const isSoldOut =
      !activeDateObj?.isAcceptingOrders || stock <= 0 || !canItemFitInAnySlot(item);
    const maxAddable = getMaxAddableForItem(item);
    const badge = lang === "fa" ? item.badgeFa : item.badgeEn;

    return (
      <div
        key={item.id}
        className={`group rounded-2xl bg-white border transition-all duration-200 p-4 sm:p-5 flex flex-col justify-between gap-4 ${
          qty > 0
            ? "border-saffron-500 ring-1 ring-saffron-500/30 shadow-warm"
            : "border-ivory-300/80 shadow-sm hover:border-ivory-300"
        } ${isSoldOut ? "opacity-65" : ""}`}
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-[17px] leading-snug text-charcoal-900">
                  {lang === "fa" ? item.nameFa : item.nameEn}
                </h3>
                {isSoldOut ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                    {copy.soldOutBadge}
                  </span>
                ) : badge ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-ivory-200 text-saffron-700 border border-ivory-300">
                    {badge}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 font-extrabold text-lg text-ember-600" dir="ltr">
              {formatCAD(item.priceCents)}
            </div>
          </div>

          <p className="text-sm text-charcoal-600 leading-relaxed">
            {lang === "fa" ? item.descriptionFa : item.descriptionEn}
          </p>
        </div>

        <div className="flex items-center justify-end pt-1">
          {qty === 0 ? (
            <button
              type="button"
              disabled={isSoldOut || maxAddable <= 0}
              onClick={() => handleQtyChange(item, 1)}
              className={`min-h-[44px] px-5 rounded-xl font-bold text-sm flex items-center gap-1.5 transition-all active:scale-95 ${
                isSoldOut || maxAddable <= 0
                  ? "bg-ivory-200 text-charcoal-600/50 cursor-not-allowed"
                  : "bg-charcoal-900 text-ivory-50 hover:bg-charcoal-800 shadow-sm"
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{copy.addBtn}</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 bg-ivory-100 border border-ivory-300 rounded-xl p-1">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => handleQtyChange(item, -1)}
                className="w-10 h-10 rounded-lg bg-white text-charcoal-900 border border-ivory-300 flex items-center justify-center hover:bg-ivory-200 active:scale-95 transition"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span
                className="w-8 text-center font-extrabold text-base text-charcoal-900"
                dir="ltr"
              >
                {qty}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={maxAddable <= 0}
                onClick={() => handleQtyChange(item, 1)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition active:scale-95 ${
                  maxAddable <= 0
                    ? "bg-ivory-200 text-charcoal-600/40 cursor-not-allowed"
                    : "bg-ember-600 text-white hover:bg-ember-700 shadow-sm"
                }`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-ivory-100 text-charcoal-900">
      {/* Sticky Minimal Header */}
      <header className="sticky top-0 z-40 bg-ivory-50/90 backdrop-blur-md border-b border-ivory-300/80">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/logo.png"
              alt="Weekend BBQ"
              className="w-10 h-10 object-contain shrink-0 drop-shadow-sm"
            />
            <div className="min-w-0">
              <div className="font-extrabold text-base sm:text-lg leading-tight tracking-tight text-charcoal-900 truncate">
                {copy.brandTitle}
              </div>
              <div className="text-[11px] font-semibold text-saffron-700 tracking-wide uppercase truncate">
                {copy.brandSubtitle}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {store?.settings.pickupPhone && (
              <a
                href={`tel:${store.settings.pickupPhone.replace(/\D/g, "")}`}
                className="h-9 px-2.5 sm:px-3 rounded-full bg-white border border-ivory-300 text-charcoal-800 hover:border-saffron-500 flex items-center gap-1.5 text-xs font-semibold transition"
                dir="ltr"
              >
                <Phone className="w-3.5 h-3.5 text-ember-600" />
                <span className="hidden sm:inline">{store.settings.pickupPhone}</span>
              </a>
            )}

            {/* Bilingual Toggle */}
            <div
              className="flex items-center bg-ivory-200 p-0.5 rounded-full border border-ivory-300"
              role="group"
              aria-label="Language"
            >
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  lang === "en"
                    ? "bg-charcoal-900 text-ivory-50 shadow-sm"
                    : "text-charcoal-600 hover:text-charcoal-900"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang("fa")}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all font-persian ${
                  lang === "fa"
                    ? "bg-charcoal-900 text-ivory-50 shadow-sm"
                    : "text-charcoal-600 hover:text-charcoal-900"
                }`}
              >
                فارسی
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Band */}
      <section className="relative overflow-hidden bg-charcoal-900 text-ivory-50">
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #C8922A 0%, transparent 45%), radial-gradient(circle at 85% 75%, #B84318 0%, transparent 45%)",
          }}
        />
        <div className="relative max-w-3xl mx-auto px-4 pt-8 pb-7 sm:pt-11 sm:pb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-saffron-400/30 text-saffron-400 text-xs font-semibold mb-4">
            <Flame className="w-3.5 h-3.5" />
            <span>{copy.heroBadge}</span>
          </div>

          <h1
            className={`text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.15] mb-3 ${
              isRtl ? "font-persian" : "font-serif"
            }`}
          >
            {copy.heroTitleTop}{" "}
            <span className="text-saffron-400">{copy.heroTitleAccent}</span>{" "}
            <span className="block sm:inline">{copy.heroTitleBottom}</span>
          </h1>

          <p className="text-ivory-200/85 text-sm sm:text-base max-w-xl leading-relaxed mb-6">
            {copy.heroSubtitle}
          </p>

          {/* Compact Pickup Location Pill */}
          {store && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.07] border border-white/10 px-4 py-3 backdrop-blur-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-saffron-500/20 text-saffron-400 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-ivory-300/80 font-semibold">
                    {copy.pickupLocationLabel}
                  </div>
                  <div className="text-sm font-semibold text-white truncate" dir="ltr">
                    {store.settings.pickupAddress}
                  </div>
                </div>
              </div>
              <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-saffron-500 hover:bg-saffron-400 text-charcoal-950 font-bold text-xs transition shrink-0"
              >
                {copy.directionsBtn}
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 pt-6 pb-36">
        {announcement && (
          <div className="mb-5 rounded-2xl bg-saffron-500/10 border border-saffron-500/30 px-4 py-3 flex items-start gap-2.5 text-sm text-charcoal-900">
            <Sparkles className="w-4 h-4 text-saffron-600 shrink-0 mt-0.5" />
            <p className="font-medium leading-relaxed">{announcement}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-4 py-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-white/70 border border-ivory-300/60 animate-pulse"
              />
            ))}
          </div>
        ) : loadError || !store ? (
          <div className="rounded-3xl bg-white border border-ivory-300 p-8 text-center shadow-warm">
            <AlertCircle className="w-10 h-10 text-ember-600 mx-auto mb-3" />
            <p className="font-bold text-lg mb-2">{loadError || "Unable to load store"}</p>
            <button
              type="button"
              onClick={fetchStore}
              className="mt-2 px-5 py-2.5 rounded-xl bg-charcoal-900 text-white text-sm font-bold"
            >
              Retry
            </button>
          </div>
        ) : store.settings.maintenanceMode ? (
          <div className="rounded-3xl bg-white border border-ivory-300 p-8 sm:p-10 text-center shadow-warm">
            <div className="w-14 h-14 rounded-2xl bg-ivory-200 text-saffron-700 flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-extrabold mb-2">{copy.maintTitle}</h2>
            <p className="text-charcoal-600 text-sm max-w-md mx-auto">{copy.maintMsg}</p>
          </div>
        ) : !store.settings.isStoreOpen ? (
          <div className="rounded-3xl bg-white border border-ivory-300 p-8 sm:p-10 text-center shadow-warm">
            <div className="w-14 h-14 rounded-2xl bg-ivory-200 text-charcoal-800 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-extrabold mb-2">{copy.storeClosedTitle}</h2>
            <p className="text-charcoal-600 text-sm max-w-md mx-auto">{copy.storeClosedMsg}</p>
          </div>
        ) : store.dates.length === 0 || !hasOpenAcceptingDate ? (
          <div className="space-y-5">
            <div className="rounded-3xl bg-white border border-ivory-300 p-8 text-center shadow-warm">
              <div className="w-14 h-14 rounded-2xl bg-ivory-200 text-saffron-700 flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-extrabold mb-2">{copy.noDatesTitle}</h2>
              <p className="text-charcoal-600 text-sm max-w-md mx-auto">{copy.noDatesMsg}</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCheckout} className="space-y-8" noValidate>
            {/* Error Alert */}
            {formError && (
              <div
                ref={errorBannerRef}
                role="alert"
                className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3.5 flex items-start gap-3 text-red-800 text-sm shadow-sm"
              >
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{formError}</span>
              </div>
            )}

            {/* 1. Pickup Date */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 text-charcoal-900">
                  <Calendar className="w-5 h-5 text-saffron-600" />
                  <span>{copy.stepDate}</span>
                </h2>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-1.5 hide-scrollbar snap-x">
                {store.dates.map((d) => {
                  const parts = getDateCardParts(d.date, lang);
                  const disabled = !d.isAcceptingOrders || d.isSoldOut;
                  const active = selectedDate === d.date;

                  return (
                    <button
                      key={d.date}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSelectDate(d.date)}
                      className={`relative snap-start min-w-[106px] px-4 py-3.5 rounded-2xl border flex flex-col items-center justify-center transition-all ${
                        disabled
                          ? "bg-ivory-200/70 border-ivory-300 text-charcoal-600/50 cursor-not-allowed"
                          : active
                            ? "bg-charcoal-900 border-charcoal-900 text-ivory-50 shadow-warm-lg ring-2 ring-saffron-500/50"
                            : "bg-white border-ivory-300 text-charcoal-800 hover:border-saffron-500 shadow-sm"
                      }`}
                    >
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider ${
                          active ? "text-saffron-400" : "text-charcoal-600"
                        }`}
                      >
                        {parts.weekday}
                      </span>
                      <span className="text-3xl font-black leading-none my-1">{parts.day}</span>
                      <span className="text-xs font-semibold opacity-80">{parts.month}</span>

                      {disabled && (
                        <span className="mt-1.5 px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-extrabold uppercase tracking-wide">
                          {d.isSoldOut ? copy.soldOutStamp : copy.closedStamp}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {activeDateObj && (
                <p className="text-xs text-charcoal-600 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-saffron-600 shrink-0" />
                  <span>
                    {formatPickupDate(activeDateObj.date, lang)} — {copy.cutoffNotice}
                  </span>
                </p>
              )}
            </section>

            {/* 2. Special Menu */}
            <section className="space-y-3.5">
              <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 text-charcoal-900">
                <Flame className="w-5 h-5 text-ember-600" />
                <span>{copy.stepMenu}</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {grillMenu.map(renderMenuCard)}
              </div>
            </section>

            {/* Signature Dessert */}
            {dessertMenu.length > 0 && (
              <section className="space-y-3.5">
                <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 text-charcoal-900">
                  <Sparkles className="w-5 h-5 text-saffron-600" />
                  <span>{copy.stepDessert}</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {dessertMenu.map(renderMenuCard)}
                </div>
              </section>
            )}

            {/* 3. Pickup Time Slots */}
            <section className="space-y-3.5">
              <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 text-charcoal-900">
                <Clock className="w-5 h-5 text-saffron-600" />
                <span>{copy.stepTime}</span>
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {sortedSlots.map((slot) => {
                  const full = isSlotFullOverall(slot);
                  const fits = !full && canCartFitInSlot(slot);
                  const selected = selectedTime === slot;

                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={full}
                      onClick={() => handleSelectTime(slot)}
                      className={`min-h-[62px] px-3 py-3 rounded-2xl border text-center transition-all active:scale-[0.98] ${
                        full
                          ? "bg-ivory-200/70 border-ivory-300 text-charcoal-600/50 cursor-not-allowed"
                          : selected
                            ? "bg-charcoal-900 border-charcoal-900 text-white shadow-warm ring-2 ring-saffron-500/40"
                            : !fits
                              ? "bg-white border-amber-300 text-charcoal-700"
                              : "bg-white border-ivory-300 text-charcoal-900 hover:border-saffron-500 shadow-sm"
                      }`}
                    >
                      <div className="font-extrabold text-sm sm:text-base" dir="ltr">
                        {slot}
                      </div>
                      <div
                        className={`text-[11px] font-bold mt-0.5 ${
                          full
                            ? "text-red-500"
                            : selected
                              ? "text-saffron-400"
                              : "text-emerald-700"
                        }`}
                      >
                        {full ? copy.full : copy.available}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 4. Customer Details */}
            <section className="space-y-3.5">
              <h2 className="text-base sm:text-lg font-extrabold text-charcoal-900">
                {copy.stepDetails}
              </h2>

              <div className="rounded-2xl bg-white border border-ivory-300/90 p-4 sm:p-5 space-y-4 shadow-sm">
                <div>
                  <label
                    htmlFor="customer-name"
                    className="block text-sm font-bold text-charcoal-800 mb-1.5"
                  >
                    {copy.nameLabel}
                  </label>
                  <input
                    id="customer-name"
                    type="text"
                    autoComplete="name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={copy.namePlaceholder}
                    dir="ltr"
                    className="w-full px-4 py-3 rounded-xl bg-ivory-50 border border-ivory-300 text-base text-charcoal-900 placeholder:text-charcoal-600/50 focus:bg-white focus:border-saffron-500 focus:ring-2 focus:ring-saffron-500/20 outline-none transition"
                  />
                  <p className="text-xs text-charcoal-600 mt-1">{copy.nameHint}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="customer-email"
                      className="block text-sm font-bold text-charcoal-800 mb-1.5"
                    >
                      {copy.emailLabel}
                    </label>
                    <input
                      id="customer-email"
                      type="email"
                      autoComplete="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder={copy.emailPlaceholder}
                      dir="ltr"
                      className="w-full px-4 py-3 rounded-xl bg-ivory-50 border border-ivory-300 text-base text-charcoal-900 placeholder:text-charcoal-600/50 focus:bg-white focus:border-saffron-500 focus:ring-2 focus:ring-saffron-500/20 outline-none transition"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="customer-phone"
                      className="block text-sm font-bold text-charcoal-800 mb-1.5"
                    >
                      {copy.phoneLabel}
                    </label>
                    <input
                      id="customer-phone"
                      type="tel"
                      autoComplete="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder={copy.phonePlaceholder}
                      dir="ltr"
                      className="w-full px-4 py-3 rounded-xl bg-ivory-50 border border-ivory-300 text-base text-charcoal-900 placeholder:text-charcoal-600/50 focus:bg-white focus:border-saffron-500 focus:ring-2 focus:ring-saffron-500/20 outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="order-notes"
                    className="block text-sm font-bold text-charcoal-800 mb-1.5"
                  >
                    {copy.notesLabel}
                  </label>
                  <textarea
                    id="order-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={copy.notesPlaceholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-ivory-50 border border-ivory-300 text-base text-charcoal-900 placeholder:text-charcoal-600/50 focus:bg-white focus:border-saffron-500 focus:ring-2 focus:ring-saffron-500/20 outline-none transition resize-none"
                  />
                </div>
              </div>
            </section>

            {/* 5. Payment */}
            <section className="space-y-3.5">
              <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 text-charcoal-900">
                <CreditCard className="w-5 h-5 text-saffron-600" />
                <span>{copy.stepPayment}</span>
              </h2>

              <div className="rounded-2xl bg-white border border-ivory-300/90 p-4 sm:p-5 space-y-4 shadow-sm">
                {store.settings.paymentMode === "hybrid" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentChoice("stripe")}
                      className={`p-3.5 rounded-xl border-2 text-start transition-all flex items-start gap-3 ${
                        paymentChoice === "stripe"
                          ? "border-charcoal-900 bg-ivory-100"
                          : "border-ivory-300 hover:border-saffron-400"
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-charcoal-900 text-saffron-400 flex items-center justify-center shrink-0">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-charcoal-900">
                          {copy.payWithCard}
                        </div>
                        <div className="text-xs text-charcoal-600 mt-0.5">
                          {copy.payWithCardSub}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentChoice("manual")}
                      className={`p-3.5 rounded-xl border-2 text-start transition-all flex items-start gap-3 ${
                        paymentChoice === "manual"
                          ? "border-charcoal-900 bg-ivory-100"
                          : "border-ivory-300 hover:border-saffron-400"
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-ivory-200 text-charcoal-800 flex items-center justify-center shrink-0">
                        <Send className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-charcoal-900">
                          {copy.payWithEtransfer}
                        </div>
                        <div className="text-xs text-charcoal-600 mt-0.5">
                          {copy.payWithEtransferSub}
                        </div>
                      </div>
                    </button>
                  </div>
                )}

                {effectivePaymentMode === "stripe" ? (
                  <div className="rounded-xl bg-ivory-100 border border-ivory-300/80 p-4 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="text-sm text-charcoal-700 space-y-1">
                      <p className="font-semibold text-charcoal-900">{copy.payWithCard}</p>
                      <p className="leading-relaxed text-xs sm:text-sm">{copy.stripeReadyNote}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-ivory-100 border border-ivory-300 p-4 space-y-2.5 text-sm">
                      <p className="font-bold text-charcoal-900">
                        {copy.etransferInstructionsTitle}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-charcoal-600">{copy.etransferSendTo}</span>
                        {!showEtransferEmail ? (
                          <button
                            type="button"
                            onClick={() => setShowEtransferEmail(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-ivory-300 text-ember-600 font-bold text-xs hover:border-ember-500"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{copy.etransferShowEmail}</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2" dir="ltr">
                            <code className="px-2.5 py-1 rounded-lg bg-white border border-ivory-300 font-bold text-xs text-charcoal-900">
                              {store.settings.etransferEmail}
                            </code>
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(
                                  store.settings.etransferEmail
                                );
                                setCopiedEmail(true);
                                setTimeout(() => setCopiedEmail(false), 2000);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-charcoal-900 text-white text-xs font-bold"
                            >
                              {copiedEmail ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {copiedEmail ? copy.etransferCopied : copy.etransferCopyEmail}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        {copy.etransferWarning}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-charcoal-800 mb-1.5">
                        {copy.etransferReceiptLabel}
                      </label>
                      <label className="flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed border-ivory-300 hover:border-saffron-500 bg-ivory-50 cursor-pointer transition">
                        <Upload className="w-5 h-5 text-saffron-600" />
                        <span className="text-sm font-semibold text-charcoal-800 text-center">
                          {receiptFileName || copy.etransferReceiptHint}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleReceiptChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </form>
        )}

        {/* Quiet Footer */}
        <footer className="mt-12 pt-6 border-t border-ivory-300/80 flex flex-wrap items-center justify-between gap-2 text-xs text-charcoal-600">
          <span>{copy.footerTagline}</span>
          <Link
            href="/admin"
            className="text-charcoal-600 hover:text-charcoal-900 underline underline-offset-4"
          >
            {copy.adminLink}
          </Link>
        </footer>
      </main>

      {/* Sticky Mobile-First Checkout Bar */}
      {store &&
        store.settings.isStoreOpen &&
        !store.settings.maintenanceMode &&
        hasOpenAcceptingDate && (
          <div className="fixed bottom-0 inset-x-0 z-40 bg-ivory-50/95 backdrop-blur-md border-t border-ivory-300 shadow-[0_-8px_30px_rgba(24,21,19,0.08)] safe-pb">
            <div className="max-w-3xl mx-auto px-4 pt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-charcoal-600">
                  {copy.totalLabel} · {cartSummary.totalItems} {copy.itemsLabel}
                </div>
                <div className="text-2xl font-black text-charcoal-900 leading-tight" dir="ltr">
                  {formatCAD(cartSummary.totalCents)}
                </div>
              </div>

              <button
                type="button"
                disabled={submitting || cartSummary.totalItems === 0}
                onClick={() => handleCheckout()}
                className={`min-h-[52px] px-5 sm:px-7 rounded-2xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] shrink-0 ${
                  submitting || cartSummary.totalItems === 0
                    ? "bg-ivory-300 text-charcoal-600/60 cursor-not-allowed"
                    : "bg-ember-600 hover:bg-ember-700 text-white shadow-gold"
                }`}
              >
                {submitting ? (
                  <span>{copy.processingBtn}</span>
                ) : cartSummary.totalItems === 0 ? (
                  <span>{copy.selectItemsPrompt}</span>
                ) : !selectedTime ? (
                  <span>{copy.selectTimePrompt}</span>
                ) : effectivePaymentMode === "stripe" ? (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>{copy.payNowBtn}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{copy.placeEtransferBtn}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
