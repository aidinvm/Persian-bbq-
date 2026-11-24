import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  attachStripeSessionToOrder,
  createAtomicOrder,
  deleteOrderAndRestore,
  getStoreSettings,
} from "@/lib/db";
import { sendOrderEmails } from "@/lib/email";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const CheckoutSchema = z.object({
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid pickup date"),
  pickupTime: z.string().min(1, "Pickup time is required").max(40),
  customerName: z
    .string()
    .trim()
    .min(2, "Full name is required")
    .max(100)
    .regex(/^[A-Za-z\s\-']+$/, "Please use English letters only (A-Z)"),
  customerEmail: z.string().trim().email("Valid email is required").max(150),
  customerPhone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Valid 10-digit phone number is required"),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
      })
    )
    .min(1, "Please select at least one item"),
  paymentMethod: z.enum(["stripe", "manual"]),
  receiptImage: z.string().max(6_000_000).nullable().optional(),
  notes: z.string().max(400).nullable().optional(),
  lang: z.enum(["en", "fa"]).default("en"),
});

function getAppOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && configured.startsWith("http")) {
    return configured.replace(/\/$/, "");
  }
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CheckoutSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || "Invalid order details";
      return NextResponse.json({ error: firstIssue }, { status: 400 });
    }

    const data = parsed.data;

    if (data.paymentMethod === "manual" && !data.receiptImage) {
      return NextResponse.json(
        { error: "Please upload your e-Transfer receipt screenshot." },
        { status: 400 }
      );
    }

    if (data.paymentMethod === "stripe" && !isStripeConfigured()) {
      return NextResponse.json(
        {
          error:
            "Stripe keys are not configured yet on this server. Add STRIPE_SECRET_KEY in environment variables or switch Payment Mode in Admin.",
        },
        { status: 503 }
      );
    }

    // 1. Atomically reserve inventory + time-slot capacity & create order record
    const order = await createAtomicOrder(data);

    // 2. Manual e-Transfer path
    if (data.paymentMethod === "manual") {
      const settings = await getStoreSettings();
      await sendOrderEmails(order, settings, "manual_received");
      return NextResponse.json({
        mode: "manual",
        orderId: order.id,
        orderNumber: order.orderNumber,
      });
    }

    // 3. Stripe Checkout path
    try {
      const stripe = getStripe();
      const origin = getAppOrigin(req);

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: order.customerEmail,
        client_reference_id: order.id,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
        line_items: order.items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: "cad",
            unit_amount: item.priceCents,
            product_data: {
              name: item.nameEn,
              description: `Pickup: ${order.pickupDate} at ${order.pickupTime}`,
            },
          },
        })),
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          pickupDate: order.pickupDate,
          pickupTime: order.pickupTime,
        },
        success_url: `${origin}/order/success?session_id={CHECKOUT_SESSION_ID}&lang=${data.lang}`,
        cancel_url: `${origin}/order/cancel?order_id=${order.id}&lang=${data.lang}`,
      });

      await attachStripeSessionToOrder(order.id, session.id);

      return NextResponse.json({
        mode: "stripe",
        url: session.url,
        orderId: order.id,
        orderNumber: order.orderNumber,
      });
    } catch (stripeErr) {
      // Release reserved inventory immediately if Stripe session creation failed
      await deleteOrderAndRestore(order.id).catch((e) =>
        console.error("Failed to rollback order after Stripe error:", e)
      );
      const message =
        stripeErr instanceof Error ? stripeErr.message : "Failed to initialize Stripe checkout";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to place order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
