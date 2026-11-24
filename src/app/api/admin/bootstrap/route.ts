import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  cleanupExpiredReservations,
  getMenuItems,
  getOrders,
  getPickupDates,
  getStoreSettings,
  isPostgresConfigured,
} from "@/lib/db";
import { isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await cleanupExpiredReservations();
    const [settings, menu, dates, orders] = await Promise.all([
      getStoreSettings(),
      getMenuItems(false),
      getPickupDates(false),
      getOrders(),
    ]);

    return NextResponse.json({
      adminEmail: session.email,
      settings,
      menu,
      dates,
      orders,
      environment: {
        storageMode: isPostgresConfigured() ? "postgres" : "local-dev",
        stripeConfigured: isStripeConfigured(),
        smtpConfigured: Boolean(
          process.env.SMTP_USER &&
            process.env.SMTP_PASS &&
            !process.env.SMTP_PASS.includes("your-16-char")
        ),
      },
    });
  } catch (err) {
    console.error("GET /api/admin/bootstrap error:", err);
    return NextResponse.json({ error: "Failed to load admin data" }, { status: 500 });
  }
}
