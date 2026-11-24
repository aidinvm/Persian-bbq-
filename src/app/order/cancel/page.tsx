"use client";

import React, { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { XCircle, ArrowLeft } from "lucide-react";
import { t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

function CancelContent() {
  const params = useSearchParams();
  const orderId = params.get("order_id");
  const lang: Lang = params.get("lang") === "fa" ? "fa" : "en";
  const copy = t(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";

    if (orderId) {
      fetch("/api/checkout/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      }).catch(() => {});
    }
  }, [orderId, lang]);

  return (
    <div className="min-h-screen bg-ivory-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white border border-ivory-300 shadow-warm-lg p-7 text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
          <XCircle className="w-9 h-9" />
        </div>
        <h1 className="text-2xl font-extrabold text-charcoal-900">{copy.cancelTitle}</h1>
        <p className="text-sm text-charcoal-600 leading-relaxed">{copy.cancelMsg}</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-charcoal-900 hover:bg-charcoal-800 text-ivory-50 font-bold text-sm transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{copy.backToMenuBtn}</span>
        </Link>
      </div>
    </div>
  );
}

export default function OrderCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-ivory-100 flex items-center justify-center text-charcoal-600 font-semibold">
          Loading...
        </div>
      }
    >
      <CancelContent />
    </Suspense>
  );
}
