export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateZip } from "@/lib/zipgen";
import * as store from "@/lib/store";
import * as coolify from "@/lib/coolify";
import * as dbprovider from "@/lib/dbprovider";
import { getPortalUser } from "@/lib/session";

const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:4000";
const VIPER_URL = process.env.VIPER_URL || "http://localhost:3400";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// GET /api/projects — projects the caller owns or is a member of. `?all=1` lists every project,
// gated to the prj_viper "owner" role (the platform admin, SPEC §1.2).
export async function GET(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const wantsAll = req.nextUrl.searchParams.get("all") === "1";
  const isPlatformAdmin = user.role === "owner";
  let rows = store.list();
  if (!(wantsAll && isPlatformAdmin)) {
    rows = rows.filter(
      (p) => p.ownerEmail === user.email || (p.members || []).some((m) => m.email === user.email)
    );
  }

  // never leak the deploy token hash or the client secret to the client
  const projects = rows.map(({ deployTokenHash, clientSecret, deployToken, ...p }) => p);
  return NextResponse.json({ projects, coolifyConfigured: coolify.configured(), me: user });
}

export async function POST(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name, subdomain, modules = [] } = await req.json();
  if (!name || !subdomain) return NextResponse.json({ error: "name, subdomain required" }, { status: 400 });
  const ownerEmail = user.email;

  const sub = String(subdomain).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  if (!sub) return NextResponse.json({ error: "invalid subdomain" }, { status: 400 });
  if (store.getBySubdomain(sub)) return NextResponse.json({ error: "subdomain already exists" }, { status: 409 });

  const mods = Array.from(new Set(["auth", ...(Array.isArray(modules) ? modules : [])]));

  // 1. provision identity in the shared auth service
  const authRes = await fetch(`${AUTH}/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, subdomain: sub, ownerEmail }),
  }).catch((e) => ({ ok: false, json: async () => ({ error: String(e) }) }) as any);
  const authBody = await authRes.json();
  if (!authRes.ok) return NextResponse.json({ error: `auth service: ${authBody.error || "unreachable"}` }, { status: 502 });
  const { projectId, clientId, clientSecret } = authBody;

  // 2. scoped, revocable deploy token — plaintext ships in the zip, only its hash is stored here
  const deployToken = "dep_" + crypto.randomBytes(24).toString("hex");

  // 2.5. provision a database if the `db` module was selected (SPEC §0.3/B3, revised mid-build:
  // provider-agnostic, degrades to { configured:false } until a real provider is wired up — see
  // lib/dbprovider.ts). Must happen before zip-gen so .env.local can carry DATABASE_URL.
  let db: store.ProjectRecord["db"];
  let dbError: string | undefined;
  if (mods.includes("db")) {
    const provisioned = await dbprovider
      .provisionDatabase(name)
      .catch((e: any) => ({ configured: true, error: e?.message || String(e) }) as dbprovider.ProvisionResult);
    if (provisioned.db) db = provisioned.db;
    else if (provisioned.configured) dbError = provisioned.error || "database provisioning failed";
    // else: provider not configured — Database tab shows "not configured yet", env omits DATABASE_URL
  }

  // 3. generate the zip. Ships the scoped client secret so the local /admin panel can manage
  // real members (see zipgen's rationale). Coolify app creation happens lazily on first
  // `npm run deploy`, see SPEC §3.3/§3.6.
  const { zipFile } = await generateZip({
    projectId,
    name,
    subdomain: sub,
    modules: mods,
    clientId,
    clientSecret,
    deployToken,
    authServiceUrl: AUTH,
    viperUrl: VIPER_URL,
    databaseUrl: db?.localUrl,
    dbEnv: db?.url && db?.apiKey ? { url: db.url, apiKey: db.apiKey } : undefined,
  });

  // 4. record for the dashboard + deploy validation. Members are NOT seeded here (v1.3 B2) —
  // the auth service (which already seeded the owner as a member, see POST /projects above) is
  // the source of truth; store.ts's backfill() gives readers an owner-only fallback.
  store.add({
    projectId,
    name,
    subdomain: sub,
    ownerEmail,
    modules: mods,
    clientId,
    clientSecret,
    deployTokenHash: sha(deployToken),
    deployToken, // plaintext — powers zip regeneration on download (see download route)
    coolify: { configured: coolify.configured() },
    deploys: [],
    db,
    dbError,
    zipFile,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    projectId,
    subdomain: sub,
    name,
    downloadUrl: `/api/download?sub=${sub}`,
    liveUrl: coolify.liveUrlFor(sub),
  });
}
