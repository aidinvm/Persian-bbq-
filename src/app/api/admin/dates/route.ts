import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  createOrEnsurePickupDate,
  deletePickupDate,
  getStoreSettings,
  updatePickupDate,
} from "@/lib/db";
import type { SlotLimitsMap, SlotUsageMap } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { date?: string };
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: "Valid YYYY-MM-DD date required" }, { status: 400 });
    }
    const schedule = await createOrEnsurePickupDate(body.date);
    return NextResponse.json({ schedule });
  } catch (err) {
    console.error("POST /api/admin/dates error:", err);
    return NextResponse.json({ error: "Failed to add pickup date" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      date?: string;
      isActive?: boolean;
      inventory?: Record<string, number>;
      timeSlotLimits?: SlotLimitsMap;
      timeSlotUsed?: SlotUsageMap;
      applyMasterTemplate?: boolean;
    };

    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: "Valid YYYY-MM-DD date required" }, { status: 400 });
    }

    if (body.applyMasterTemplate) {
      const settings = await getStoreSettings();
      const schedule = await updatePickupDate(body.date, {
        inventory: { ...settings.masterInventory },
        timeSlotLimits: structuredClone(settings.masterTimeSlots),
      });
      return NextResponse.json({ schedule });
    }

    const patch: {
      isActive?: boolean;
      inventory?: Record<string, number>;
      timeSlotLimits?: SlotLimitsMap;
      timeSlotUsed?: SlotUsageMap;
    } = {};

    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    if (body.inventory) patch.inventory = body.inventory;
    if (body.timeSlotLimits) patch.timeSlotLimits = body.timeSlotLimits;
    if (body.timeSlotUsed) patch.timeSlotUsed = body.timeSlotUsed;

    const schedule = await updatePickupDate(body.date, patch);
    return NextResponse.json({ schedule });
  } catch (err) {
    console.error("PATCH /api/admin/dates error:", err);
    return NextResponse.json({ error: "Failed to update pickup date" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "Missing date parameter" }, { status: 400 });
  }

  await deletePickupDate(date);
  return NextResponse.json({ deleted: true });
}
