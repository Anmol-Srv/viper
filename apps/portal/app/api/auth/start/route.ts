export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:4000";
// The portal dogfoods its own auth service as the seeded, open-enrollment "viper" project
// (SPEC §1.1) — any @airtribe.live email can self-serve onto the platform.
const PROJECT_ID = "prj_viper";

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const res = await fetch(`${AUTH}/session/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: PROJECT_ID, email }),
  }).catch((e) => ({ ok: false, status: 502, json: async () => ({ error: String(e) }) }) as any);

  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data.error || "could not send code" }, { status: res.status });
  return NextResponse.json({ ok: true, devOtp: data.devOtp });
}
