export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/session";

// Platform admin dashboard (SPEC B1) — manages membership of `prj_viper` itself, the gate that
// decides who can log into the portal at all. Scoped to that one project; not the generic
// per-project members route (see app/api/projects/[subdomain]/members).
const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:4000";
const ADMIN_KEY = process.env.AUTH_ADMIN_KEY || "";
const EMAIL_DOMAIN = "@airtribe.live";
const VIPER_PROJECT_ID = "prj_viper";

async function requirePlatformAdmin() {
  const user = await getPortalUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  if (user.role !== "owner") return { error: NextResponse.json({ error: "platform admin only" }, { status: 403 }) } as const;
  return { user } as const;
}

export async function GET() {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return gate.error;

  const authRes = await fetch(`${AUTH}/projects/${VIPER_PROJECT_ID}/members`, {
    headers: { "x-viper-admin": ADMIN_KEY },
  }).catch((e) => ({ ok: false, json: async () => ({ error: String(e) }) }) as any);
  const authBody = await authRes.json();
  if (!authRes.ok) return NextResponse.json({ error: `auth service: ${authBody.error || "unreachable"}` }, { status: 502 });
  return NextResponse.json({ members: authBody.members || [] });
}

// Invite, or change role of, a platform member (upsert per SPEC §0.1).
export async function POST(req: NextRequest) {
  const gate = await requirePlatformAdmin();
  if ("error" in gate) return gate.error;

  const { email, role } = await req.json().catch(() => ({}) as any);
  if (!email || !role) return NextResponse.json({ error: "email, role required" }, { status: 400 });
  if (!String(email).endsWith(EMAIL_DOMAIN)) return NextResponse.json({ error: `member must be ${EMAIL_DOMAIN}` }, { status: 400 });
  if (!["owner", "member"].includes(role)) return NextResponse.json({ error: "role must be owner or member" }, { status: 400 });

  const authRes = await fetch(`${AUTH}/projects/${VIPER_PROJECT_ID}/members`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-viper-admin": ADMIN_KEY },
    body: JSON.stringify({ email, role }),
  }).catch((e) => ({ ok: false, json: async () => ({ error: String(e) }) }) as any);
  const authBody = await authRes.json();
  if (!authRes.ok) return NextResponse.json({ error: `auth service: ${authBody.error || "unreachable"}` }, { status: 502 });
  return NextResponse.json({ ok: true });
}
