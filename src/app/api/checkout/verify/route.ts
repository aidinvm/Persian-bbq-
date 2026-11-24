import { NextRequest, NextResponse } from "next/server";
import {
  confirmStripeOrder,
  getOrderById,
  getOrderByStripeSession,
  getStoreSettings,
} from "@/lib/db";
import { sendOrderEmails } from "@/lib/email";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("session_id");
    const orderId = req.nextUrl.searchParams.get("order_id");

    const settings = await getStoreSettings();
    let order = null;

    if (sessionId) {
      if (isStripeConfigured()) {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === "paid") {
          const paymentIntent =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id || null;
          const result = await confirmStripeOrder(
            {
              orderId: session.metadata?.orderId || undefined,
              stripeSessionId: session.id,
            },
            paymentIntent
          );
          order = result.order;
          if (order && result.newlyConfirmed) {
            await sendOrderEmails(order, settings, "confirmed");
          }
        }
      }
      if (!order) {
        order = await getOrderByStripeSession(sessionId);
      }
    } else if (orderId) {
      order = await getOrderById(orderId);
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        pickupDate: order.pickupDate,
        pickupTime: order.pickupTime,
        customerName: order.customerName,
        items: order.items,
        totalCents: order.totalCents,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
      },
      pickupAddress: settings.pickupAddress,
      pickupPhone: settings.pickupPhone,
      etransferEmail: settings.etransferEmail,
    });
  } catch (err) {
    console.error("GET /api/checkout/verify error:", err);
    return NextResponse.json({ error: "Unable to verify order status" }, { status: 500 });
  }
}
