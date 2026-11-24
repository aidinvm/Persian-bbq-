import { NextRequest, NextResponse } from "next/server";
import {
  clearAdminSessionCookie,
  getAdminSession,
  setAdminSessionCookie,
  verifyAdminPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
  return NextResponse.json({ authenticated: true, email: session.email });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email || "").trim();
    const password = body.password || "";

    if (!verifyAdminPassword(email, password)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await setAdminSessionCookie(email.toLowerCase());
    return NextResponse.json({ authenticated: true, email: email.toLowerCase() });
  } catch {
    return NextResponse.json({ error: "Authentication failed" }, { status: 400 });
  }
}

export async function DELETE() {
  await clearAdminSessionCookie();
  return NextResponse.json({ authenticated: false });
}
