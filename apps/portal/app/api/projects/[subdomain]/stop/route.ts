export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import * as coolify from "@/lib/coolify";
import * as localrunner from "@/lib/localrunner";
import { getPortalUser } from "@/lib/session";

// Resource controls (project-level): stop the running app to reclaim memory/CPU without
// touching code, data, deploy history, or the assigned URL — Start (../start/route.ts) brings
// it back from the same image. Owner-only, same guard shape as DELETE (route.ts sibling).
export async function POST(req: NextRequest, { params }: { params: Promise<{ subdomain: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { subdomain } = await params;
  const rec = store.getBySubdomain(subdomain);
  if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rec.ownerEmail !== user.email && user.role !== "owner")
    return NextResponse.json({ error: "only the project owner can stop this project" }, { status: 403 });

  if (!rec.coolify?.appUuid && !rec.lastImageTag)
    return NextResponse.json({ error: "this project has never been deployed" }, { status: 400 });

  if ((process.env.DEPLOY_MODE || "coolify") === "docker") {
    await localrunner.stopApp(rec.subdomain);
  } else {
    if (!rec.coolify?.appUuid)
      return NextResponse.json({ error: "this project has never been deployed" }, { status: 400 });
    try {
      await coolify.stopApp(rec.coolify.appUuid);
    } catch (e: any) {
      return NextResponse.json({ error: `coolify: ${e.message}` }, { status: 502 });
    }
  }

  store.update(rec.projectId, { stopped: true });
  return NextResponse.json({ ok: true });
}
