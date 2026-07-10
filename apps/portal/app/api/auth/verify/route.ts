export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:4000";
const PROJECT_ID = "prj_viper";

export async function POST(req: NextRequest) {
  const { email, otp } = await req.json().catch(() => ({}));
  if (!email || !otp) return NextResponse.json({ error: "email, otp required" }, { status: 400 });

  const res = await fetch(`${AUTH}/session/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: PROJECT_ID, email, otp }),
  }).catch((e) => ({ ok: false, status: 502, json: async () => ({ error: String(e) }) }) as any);

  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data.error || "invalid code" }, { status: res.status });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("viper_portal_session", data.token, {
    httpOnly: true,
    secure: (process.env.VIPER_DOMAIN_SCHEME || "http") === "https",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // matches the auth service's 12h session JWT
  });
  return response;
}
