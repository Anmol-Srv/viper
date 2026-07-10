export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import * as coolify from "@/lib/coolify";
import * as dbprovider from "@/lib/dbprovider";
import { getPortalUser } from "@/lib/session";

const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:4000";
const ADMIN_KEY = process.env.AUTH_ADMIN_KEY || "";

function isOwner(rec: store.ProjectRecord, email: string) {
  return rec.ownerEmail === email || (rec.members || []).some((m) => m.email === email && m.role === "owner");
}

// Danger zone teardown (SPEC §1.6): Coolify app → auth service project → local record + zip.
// Confirm-by-typing-the-subdomain UX enforced server-side, not just in the UI.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ subdomain: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { subdomain } = await params;
  const rec = store.getBySubdomain(subdomain);
  if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isOwner(rec, user.email) && user.role !== "owner")
    return NextResponse.json({ error: "only the project owner can delete this project" }, { status: 403 });

  const { confirm } = await req.json().catch(() => ({}) as any);
  if (confirm !== rec.subdomain)
    return NextResponse.json({ error: "type the subdomain to confirm" }, { status: 400 });

  if (rec.coolify?.appUuid) {
    try {
      await coolify.deleteApp(rec.coolify.appUuid);
    } catch (e: any) {
      // best-effort — an already-gone Coolify app shouldn't block teardown of the rest
      console.error(`[viper] coolify deleteApp(${rec.coolify.appUuid}) failed: ${e.message}`);
    }
  }

  if (rec.db) {
    try {
      await dbprovider.deleteDatabase(rec.db.ref);
    } catch (e: any) {
      console.error(`[viper] dbprovider deleteDatabase(${rec.db.ref}) failed: ${e.message}`);
    }
  }

  try {
    await fetch(`${AUTH}/projects/${rec.projectId}`, { method: "DELETE", headers: { "x-viper-admin": ADMIN_KEY } });
  } catch (e: any) {
    console.error(`[viper] auth service delete(${rec.projectId}) failed: ${e.message}`);
  }

  if (fs.existsSync(rec.zipFile)) fs.rmSync(rec.zipFile, { force: true });
  store.remove(rec.projectId);

  return NextResponse.json({ ok: true });
}
