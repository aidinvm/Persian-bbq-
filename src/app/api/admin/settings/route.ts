import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { updateStoreSettings } from "@/lib/db";
import type { StoreSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const patch = (await req.json()) as Partial<StoreSettings>;
    const updated = await updateStoreSettings(patch);
    return NextResponse.json({ settings: updated });
  } catch (err) {
    console.error("PATCH /api/admin/settings error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
