"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, MapPin, ArrowLeft } from "lucide-react";
import { formatCAD, t } from "@/lib/i18n";
import { formatPickupDate } from "@/lib/time";
import type { Lang, OrderItem } from "@/lib/types";

interface VerifiedOrderPayload {
  order: {
    id: string;
    orderNumber: string;
    pickupDate: string;
    pickupTime: string;
    customerName: string;
    items: OrderItem[];
    totalCents: number;
    status: string;
    paymentMethod: "stripe" | "manual";
    paymentStatus: string;
  };
  pickupAddress: string;
  pickupPhone: string;
  etransferEmail: string;
}

function SuccessContent() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const orderId = params.get("order_id");
  const langParam = params.get("lang");
  const lang: Lang = langParam === "fa" ? "fa" : "en";
  const copy = t(lang);

  const [data, setData] = useState<VerifiedOrderPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";

    async function verify() {
      try {
        const qs = sessionId
          ? `session_id=${encodeURIComponent(sessionId)}`
          : orderId
            ? `order_id=${encodeURIComponent(orderId)}`
            : "";
        if (!qs) {
          setError("Missing order reference.");
          return;
        }
        const res = await fetch(`/api/checkout/verify?${qs}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not verify order");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verification error");
      } finally {
        setLoading(false);
      }
    }
    verify();
  }, [sessionId, orderId, lang]);

  return (
    <div className="min-h-screen bg-ivory-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl bg-white border border-ivory-300 shadow-warm-lg p-6 sm:p-8 space-y-6">
        {loading ? (
          <div className="py-12 text-center text-charcoal-600 font-semibold">
            {lang === "fa" ? "در حال بررسی سفارش..." : "Confirming your order..."}
          </div>
        ) : error || !data ? (
          <div className="text-center space-y-4 py-6">
            <p className="text-red-600 font-bold">{error || "Order not found"}</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-charcoal-900 text-white font-bold text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{copy.backToMenuBtn}</span>
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h1 className="text-2xl font-extrabold text-charcoal-900">
                {data.order.paymentMethod === "stripe"
                  ? copy.successTitle
                  : copy.successEtransferTitle}
              </h1>
              <p className="text-sm text-charcoal-600 leading-relaxed">
                {data.order.paymentMethod === "stripe"
                  ? copy.successPaidMsg
                  : copy.successEtransferMsg}
              </p>
            </div>

            <div className="rounded-2xl bg-ivory-100 border border-ivory-300 p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-charcoal-600">{copy.orderNumberLabel}</span>
                <span className="font-mono font-extrabold text-charcoal-900" dir="ltr">
                  {data.order.orderNumber}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-charcoal-600 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-saffron-600" />
                  {copy.pickupScheduleLabel}
                </span>
                <span className="font-bold text-charcoal-900 text-end">
                  {formatPickupDate(data.order.pickupDate, lang)} ·{" "}
                  <span dir="ltr">{data.order.pickupTime}</span>
                </span>
              </div>
              <div className="pt-2 border-t border-ivory-300 flex items-center justify-between gap-2">
                <span className="text-charcoal-600 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-ember-600" />
                  <span dir="ltr">{data.pickupAddress}</span>
                </span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    data.pickupAddress
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-ember-600 hover:underline shrink-0"
                >
                  {copy.directionsBtn}
                </a>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-charcoal-600">
                {copy.summaryLabel}
              </div>
              <div className="rounded-2xl border border-ivory-300 divide-y divide-ivory-200">
                {data.order.items.map((item, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-center justify-between text-sm">
                    <span>
                      <strong className="me-1.5" dir="ltr">
                        {item.quantity}×
                      </strong>
                      {lang === "fa" ? item.nameFa : item.nameEn}
                    </span>
                    <span className="font-bold" dir="ltr">
                      {formatCAD(item.priceCents * item.quantity)}
                    </span>
                  </div>
                ))}
                <div className="px-4 py-3 flex items-center justify-between bg-ivory-50 font-extrabold rounded-b-2xl">
                  <span>{copy.totalLabel}</span>
                  <span className="text-ember-600" dir="ltr">
                    {formatCAD(data.order.totalCents)}
                  </span>
                </div>
              </div>
            </div>

            <Link
              href="/"
              className="block w-full text-center py-3.5 rounded-2xl bg-charcoal-900 hover:bg-charcoal-800 text-ivory-50 font-bold text-sm transition"
            >
              {copy.newOrderBtn}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-ivory-100 flex items-center justify-center text-charcoal-600 font-semibold">
          Loading...
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
