import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  confirmStripeOrder,
  getOrderByStripeSession,
  getStoreSettings,
  updateOrderStatus,
} from "@/lib/db";
import { sendOrderEmails } from "@/lib/email";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");

  if (!webhookSecret || !sig) {
    return NextResponse.json(
      { error: "Missing Stripe webhook secret or signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id || null;

        const { order, newlyConfirmed } = await confirmStripeOrder(
          {
            orderId: session.metadata?.orderId || undefined,
            stripeSessionId: session.id,
          },
          paymentIntentId
        );

        if (order && newlyConfirmed) {
          const settings = await getStoreSettings();
          await sendOrderEmails(order, settings, "confirmed");
        }
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId =
        session.metadata?.orderId ||
        (await getOrderByStripeSession(session.id))?.id;

      if (orderId) {
        await updateOrderStatus(orderId, "cancelled", "expired");
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook processing error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
