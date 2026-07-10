export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import { NextRequest } from "next/server";
import * as store from "@/lib/store";
import { getPortalUser } from "@/lib/session";
import { generateZip } from "@/lib/zipgen";

export async function GET(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const sub = req.nextUrl.searchParams.get("sub") || "";
  const rec = store.getBySubdomain(sub);
  if (!rec) return new Response("not found", { status: 404 });

  const isMember = rec.ownerEmail === user.email || (rec.members || []).some((m) => m.email === user.email);
  if (!isMember && user.role !== "owner") return new Response("forbidden", { status: 403 });

  // Regenerate from the CURRENT template when we can (plaintext deploy token stored, v1.4+),
  // so a re-download always carries the latest scaffold instead of a stale create-time zip.
  // Records created before v1.4 lack the plaintext token → serve the stored zip as before.
  if (rec.deployToken) {
    try {
      const { zipFile } = await generateZip({
        projectId: rec.projectId,
        name: rec.name,
        subdomain: rec.subdomain,
        modules: rec.modules,
        clientId: rec.clientId,
        clientSecret: rec.clientSecret,
        deployToken: rec.deployToken,
        authServiceUrl: process.env.AUTH_SERVICE_URL || "http://localhost:4000",
        viperUrl: process.env.VIPER_URL || "http://localhost:3400",
        dbEnv: rec.db?.url && rec.db?.apiKey ? { url: rec.db.url, apiKey: rec.db.apiKey } : undefined,
      });
      store.update(rec.projectId, { zipFile });
      rec.zipFile = zipFile;
    } catch {
      // regeneration is best-effort — fall through to the stored zip
    }
  }

  if (!fs.existsSync(rec.zipFile)) return new Response("not found", { status: 404 });
  const data = fs.readFileSync(rec.zipFile);
  return new Response(data, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${sub}.zip"`,
    },
  });
}
