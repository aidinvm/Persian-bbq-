import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminSession } from "@/lib/auth";
import { deleteMenuItem, getMenuItems, upsertMenuItem } from "@/lib/db";
import type { MenuItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Partial<MenuItem>;
    if (!body.nameEn?.trim() || !body.nameFa?.trim() || !body.stockKey?.trim()) {
      return NextResponse.json(
        { error: "English name, Farsi name, and inventory key are required." },
        { status: 400 }
      );
    }

    const existing = await getMenuItems(false);
    const id =
      body.id?.trim() ||
      `${body.stockKey.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomBytes(2).toString("hex")}`;

    const item: MenuItem = {
      id,
      stockKey: body.stockKey.trim(),
      category: body.category || "grill",
      countsTowardSlot:
        typeof body.countsTowardSlot === "boolean"
          ? body.countsTowardSlot
          : body.category !== "dessert",
      nameEn: body.nameEn.trim(),
      nameFa: body.nameFa.trim(),
      descriptionEn: (body.descriptionEn || "").trim(),
      descriptionFa: (body.descriptionFa || "").trim(),
      badgeEn: (body.badgeEn || "").trim(),
      badgeFa: (body.badgeFa || "").trim(),
      priceCents: Math.max(0, Math.round(Number(body.priceCents) || 0)),
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : existing.length + 1,
      isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    };

    const saved = await upsertMenuItem(item);
    return NextResponse.json({ item: saved });
  } catch (err) {
    console.error("POST /api/admin/menu error:", err);
    return NextResponse.json({ error: "Failed to save menu item" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing menu item id" }, { status: 400 });
  }

  await deleteMenuItem(id);
  return NextResponse.json({ deleted: true });
}
