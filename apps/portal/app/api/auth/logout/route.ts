export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("viper_portal_session", "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
