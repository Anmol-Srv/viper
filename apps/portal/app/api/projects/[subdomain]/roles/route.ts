export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import { getPortalUser } from "@/lib/session";

const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:4000";
const ADMIN_KEY = process.env.AUTH_ADMIN_KEY || "";

// Hardcoded fallback until the auth service's roles CRUD ships + restarts (SPEC-v1.3 §0.1
// follow-up) — matches the two seed roles every project already has today.
const FALLBACK_ROLES = [{ name: "owner", permissions: ["*"] }, { name: "member", permissions: ["read"] }];

// Read-only proxy for the role picker (invite + per-member role change) on the project detail
// page's Members tab. Degrades to FALLBACK_ROLES on any non-2xx (404 while the auth service
// hasn't been restarted with the new roles routes yet, or any other failure) instead of erroring.
export async function GET(req: NextRequest, { params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rec = store.getBySubdomain(subdomain);
  if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });

  const authRes = await fetch(`${AUTH}/projects/${rec.projectId}/roles`, {
    headers: { "x-viper-admin": ADMIN_KEY },
  }).catch(() => null);
  if (!authRes || !authRes.ok) return NextResponse.json({ roles: FALLBACK_ROLES, source: "fallback" });

  const authBody = await authRes.json().catch(() => null);
  if (!authBody?.roles?.length) return NextResponse.json({ roles: FALLBACK_ROLES, source: "fallback" });
  return NextResponse.json({ roles: authBody.roles, source: "live" });
}
