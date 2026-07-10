export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import { NextRequest } from "next/server";
import * as store from "@/lib/store";
import { getPortalUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const sub = req.nextUrl.searchParams.get("sub") || "";
  const rec = store.getBySubdomain(sub);
  if (!rec || !fs.existsSync(rec.zipFile)) return new Response("not found", { status: 404 });

  const isMember = rec.ownerEmail === user.email || (rec.members || []).some((m) => m.email === user.email);
  if (!isMember && user.role !== "owner") return new Response("forbidden", { status: 403 });

  const data = fs.readFileSync(rec.zipFile);
  return new Response(data, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${sub}.zip"`,
    },
  });
}
