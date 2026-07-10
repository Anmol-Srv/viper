export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import * as coolify from "@/lib/coolify";
import { runApp } from "@/lib/localrunner";
import { buildAppEnv } from "@/lib/appenv";
import { getPortalUser } from "@/lib/session";

// Matches lib/build.ts's own REGISTRY resolution — the image `start` re-runs is the same one
// `npm run deploy` built and pushed, so the naming must stay in lockstep.
const REGISTRY = process.env.REGISTRY || "localhost:5000";

const MISSING_IMAGE = /no such image|not found|manifest unknown|pull access denied|repository does not exist/i;

// Resource controls (project-level): bring a stopped project back online from its last deployed
// image. Owner-only, same guard shape as stop/route.ts and DELETE (route.ts sibling).
export async function POST(req: NextRequest, { params }: { params: Promise<{ subdomain: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { subdomain } = await params;
  const rec = store.getBySubdomain(subdomain);
  if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rec.ownerEmail !== user.email && user.role !== "owner")
    return NextResponse.json({ error: "only the project owner can start this project" }, { status: 403 });

  if (!rec.coolify?.appUuid && !rec.lastImageTag)
    return NextResponse.json({ error: "this project has never been deployed" }, { status: 400 });

  if ((process.env.DEPLOY_MODE || "coolify") === "docker") {
    if (!rec.lastImageTag)
      return NextResponse.json({ error: "this project has never been deployed" }, { status: 400 });
    try {
      await runApp({
        image: `${REGISTRY}/viper-${rec.subdomain}`,
        tag: rec.lastImageTag,
        subdomain: rec.subdomain,
        env: buildAppEnv(rec),
        onLine: () => {},
      });
    } catch (e: any) {
      const message = MISSING_IMAGE.test(e.message)
        ? "image no longer on the server — redeploy with npm run deploy"
        : e.message;
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } else {
    if (!rec.coolify?.appUuid)
      return NextResponse.json({ error: "this project has never been deployed" }, { status: 400 });
    try {
      await coolify.startApp(rec.coolify.appUuid);
    } catch (e: any) {
      return NextResponse.json({ error: `coolify: ${e.message}` }, { status: 502 });
    }
  }

  store.update(rec.projectId, { stopped: false });
  return NextResponse.json({ ok: true });
}
