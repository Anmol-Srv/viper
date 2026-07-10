export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/session";

const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:4000";
const ADMIN_KEY = process.env.AUTH_ADMIN_KEY || "";
const VIPER_PROJECT_ID = "prj_viper";

// Revoke a platform member — the auth service itself 400s if it would remove the last owner
// (SPEC §0.1), so no local guard is needed here.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "platform admin only" }, { status: 403 });

  const { email } = await params;
  const authRes = await fetch(`${AUTH}/projects/${VIPER_PROJECT_ID}/members/${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: { "x-viper-admin": ADMIN_KEY },
  }).catch((e) => ({ ok: false, status: 502, json: async () => ({ error: String(e) }) }) as any);
  const authBody = await authRes.json().catch(() => ({}) as any);
  if (!authRes.ok) return NextResponse.json({ error: authBody.error || "auth service unreachable" }, { status: authRes.status || 502 });
  return NextResponse.json({ ok: true });
}
