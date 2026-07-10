export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { getPortalUser } from "@/lib/session";

const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:4000";
const ADMIN_KEY = process.env.AUTH_ADMIN_KEY || "";
const EMAIL_DOMAIN = "@airtribe.live";

function isOwner(rec: store.ProjectRecord, email: string) {
  return rec.ownerEmail === email || (rec.members || []).some((m) => m.email === email && m.role === "owner");
}

async function loadOwned(subdomain: string) {
  const user = await getPortalUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  const rec = store.getBySubdomain(subdomain);
  if (!rec) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) } as const;
  if (!isOwner(rec, user.email) && user.role !== "owner")
    return { error: NextResponse.json({ error: "only the project owner can manage members" }, { status: 403 }) } as const;
  return { user, rec } as const;
}

// v1.3 B2: the auth service (SPEC §0.1) is the source of truth for project membership — GET
// lists live, POST/DELETE write through and nothing is mirrored into the portal's own record
// anymore (compare pre-v1.3, which kept a portal-side `members` array in sync by hand).

// List members live (SPEC §0.1 GET).
export async function GET(req: NextRequest, { params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const loaded = await loadOwned(subdomain);
  if ("error" in loaded) return loaded.error;
  const { rec } = loaded;

  const authRes = await fetch(`${AUTH}/projects/${rec.projectId}/members`, {
    headers: { "x-viper-admin": ADMIN_KEY },
  }).catch((e) => ({ ok: false, json: async () => ({ error: String(e) }) }) as any);
  const authBody = await authRes.json();
  if (!authRes.ok) return NextResponse.json({ error: `auth service: ${authBody.error || "unreachable"}` }, { status: 502 });
  return NextResponse.json({ members: authBody.members || [] });
}

// Invite a member, or change an existing member's role (POST is an upsert per SPEC §0.1).
export async function POST(req: NextRequest, { params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const loaded = await loadOwned(subdomain);
  if ("error" in loaded) return loaded.error;
  const { rec } = loaded;

  const { email, role } = await req.json().catch(() => ({}) as any);
  if (!email || !role) return NextResponse.json({ error: "email, role required" }, { status: 400 });
  if (!String(email).endsWith(EMAIL_DOMAIN)) return NextResponse.json({ error: `member must be ${EMAIL_DOMAIN}` }, { status: 400 });
  if (!["owner", "member"].includes(role)) return NextResponse.json({ error: "role must be owner or member" }, { status: 400 });

  const authRes = await fetch(`${AUTH}/projects/${rec.projectId}/members`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-viper-admin": ADMIN_KEY },
    body: JSON.stringify({ email, role }),
  }).catch((e) => ({ ok: false, json: async () => ({ error: String(e) }) }) as any);
  const authBody = await authRes.json();
  if (!authRes.ok) return NextResponse.json({ error: `auth service: ${authBody.error || "unreachable"}` }, { status: 502 });
  return NextResponse.json({ ok: true });
}

// Remove a member — actually revokes now (SPEC §0.1 DELETE). The auth service itself guards
// against removing the last owner (400), so no local ownerEmail special-case is needed here.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const loaded = await loadOwned(subdomain);
  if ("error" in loaded) return loaded.error;
  const { rec } = loaded;

  const { email } = await req.json().catch(() => ({}) as any);
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const authRes = await fetch(`${AUTH}/projects/${rec.projectId}/members/${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: { "x-viper-admin": ADMIN_KEY },
  }).catch((e) => ({ ok: false, status: 502, json: async () => ({ error: String(e) }) }) as any);
  const authBody = await authRes.json().catch(() => ({}) as any);
  if (!authRes.ok) return NextResponse.json({ error: authBody.error || "auth service unreachable" }, { status: authRes.status || 502 });
  return NextResponse.json({ ok: true });
}
