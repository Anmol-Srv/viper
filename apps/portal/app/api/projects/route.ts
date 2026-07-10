export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateZip } from "@/lib/zipgen";
import * as store from "@/lib/store";
import * as coolify from "@/lib/coolify";

const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:4000";
const VIPER_URL = process.env.VIPER_URL || "http://localhost:3400";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function GET() {
  // never leak the deploy token hash or the client secret to the client
  const projects = store.list().map(({ deployTokenHash, clientSecret, ...p }) => p);
  return NextResponse.json({ projects, coolifyConfigured: coolify.configured() });
}

export async function POST(req: NextRequest) {
  const { name, subdomain, ownerEmail, modules = [] } = await req.json();
  if (!name || !subdomain || !ownerEmail)
    return NextResponse.json({ error: "name, subdomain, ownerEmail required" }, { status: 400 });

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

  // 3. generate the zip (no client secret inside — Coolify app creation happens lazily on
  // first `npm run deploy`, see SPEC §3.3/§3.6)
  const { zipFile } = await generateZip({
    projectId,
    name,
    subdomain: sub,
    modules: mods,
    clientId,
    deployToken,
    authServiceUrl: AUTH,
    viperUrl: VIPER_URL,
  });

  // 4. record for the dashboard + deploy validation
  store.add({
    projectId,
    name,
    subdomain: sub,
    ownerEmail,
    modules: mods,
    clientId,
    clientSecret,
    deployTokenHash: sha(deployToken),
    coolify: { configured: coolify.configured() },
    zipFile,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, projectId, subdomain: sub, downloadUrl: `/api/download?sub=${sub}` });
}
