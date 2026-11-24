import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  deleteAllOrdersForDate,
  deleteOrderAndRestore,
  getOrderById,
  getOrders,
  getStoreSettings,
  updateOrderStatus,
} from "@/lib/db";
import { sendOrderEmails } from "@/lib/email";
import type { OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get("date") || undefined;
  const orders = await getOrders(date);
  return NextResponse.json({ orders });
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      id?: string;
      status?: OrderStatus;
      sendConfirmationEmail?: boolean;
    };

    if (!body.id || !body.status) {
      return NextResponse.json({ error: "Order id and status are required" }, { status: 400 });
    }

    const previous = await getOrderById(body.id);
    const updated = await updateOrderStatus(body.id, body.status);
    if (!updated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let emailSent = false;
    if (
      body.sendConfirmationEmail ||
      (body.status === "confirmed" && previous?.status !== "confirmed")
    ) {
      const settings = await getStoreSettings();
      const res = await sendOrderEmails(updated, settings, "confirmed");
      emailSent = res.sent;
    }

    return NextResponse.json({ order: updated, emailSent });
  } catch (err) {
    console.error("PATCH /api/admin/orders error:", err);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  const date = req.nextUrl.searchParams.get("date");
  const all = req.nextUrl.searchParams.get("all");

  if (all === "true" && date) {
    const count = await deleteAllOrdersForDate(date);
    return NextResponse.json({ deletedCount: count });
  }

  if (id) {
    const deleted = await deleteOrderAndRestore(id);
    return NextResponse.json({ deleted });
  }

  return NextResponse.json({ error: "Specify order id or date&all=true" }, { status: 400 });
}
