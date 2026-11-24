import { NextRequest, NextResponse } from "next/server";
import { getOrderById, updateOrderStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { orderId?: string };
    if (!body.orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const order = await getOrderById(body.orderId);
    if (!order) {
      return NextResponse.json({ released: false });
    }

    // Only release if still unpaid pending Stripe checkout
    if (
      order.paymentMethod === "stripe" &&
      order.status === "pending_payment" &&
      order.paymentStatus === "unpaid"
    ) {
      await updateOrderStatus(order.id, "cancelled", "expired");
      return NextResponse.json({ released: true });
    }

    return NextResponse.json({ released: false });
  } catch (err) {
    console.error("POST /api/checkout/cancel error:", err);
    return NextResponse.json({ error: "Failed to release reservation" }, { status: 500 });
  }
}
