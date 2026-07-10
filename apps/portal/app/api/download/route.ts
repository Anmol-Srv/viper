export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import { NextRequest } from "next/server";
import * as store from "@/lib/store";

export async function GET(req: NextRequest) {
  const sub = req.nextUrl.searchParams.get("sub") || "";
  const rec = store.getBySubdomain(sub);
  if (!rec || !fs.existsSync(rec.zipFile)) return new Response("not found", { status: 404 });
  const data = fs.readFileSync(rec.zipFile);
  return new Response(data, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${sub}.zip"`,
    },
  });
}
