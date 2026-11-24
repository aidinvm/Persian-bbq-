import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { exportFullBackup, restoreFullBackup } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const backup = await exportFullBackup();
  return NextResponse.json(backup);
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const payload = await req.json();
    await restoreFullBackup(payload);
    return NextResponse.json({ restored: true });
  } catch (err) {
    console.error("POST /api/admin/backup error:", err);
    return NextResponse.json({ error: "Invalid backup file" }, { status: 400 });
  }
}
