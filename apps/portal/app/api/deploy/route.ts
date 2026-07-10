export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/store";
import * as coolify from "@/lib/coolify";
import { buildAndPush } from "@/lib/build";
import { runApp } from "@/lib/localrunner";
import { buildAppEnv } from "@/lib/appenv";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TERMINAL = new Set(["finished", "failed", "cancelled-by-user"]);
const POLL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

// Human-readable deploy failure UX (SPEC §2.4). Two of the three cases are diagnosable here;
// "portal unreachable" is a CLI-side case (the CLI can't even reach this route) — out of scope
// for apps/portal, see template/scripts/deploy.mjs.
const HINTS = {
  build: "Docker build failed — scroll up for the compile/build error lines above, fix them, then redeploy.",
  deploy: "Deploy failed — see the container's log tail below, or run `npm run doctor` locally.",
  other: "Unexpected deploy error — if this persists, ask the platform admin (Viper may be down).",
};

function classify(message: string): keyof typeof HINTS {
  if (/^docker (build|push)/.test(message)) return "build";
  if (/deploy ended with status/.test(message)) return "deploy";
  return "other";
}

function extractTarball(tarPath: string, destDir: string) {
  execFileSync("tar", ["-xzf", tarPath, "-C", destDir]);
}

// Defense-in-depth: the CLI already excludes .env.local from the tarball, but scrub any that
// slip through so secrets never reach the built image.
function scrubEnvLocal(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scrubEnvLocal(full);
    } else if (/^\.env.*\.local$/.test(entry.name)) {
      fs.rmSync(full, { force: true });
    }
  }
}

// Receives the source tarball from a project's `npm run deploy`, validates the scoped deploy
// token, then builds+pushes an image and drives Coolify to run it. See SPEC §3.6.
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const form = await req.formData();
  const projectId = String(form.get("projectId") || "");
  const rec = store.getByProjectId(projectId);
  if (!rec || !token || rec.deployTokenHash !== sha(token))
    return NextResponse.json({ error: "invalid deploy token" }, { status: 401 });

  // CLI sends the tarball under "file"; accept "archive" too for robustness.
  const file = (form.get("file") || form.get("archive")) as File | null;
  if (!file) return NextResponse.json({ error: "archive required" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const tarPath = path.join(os.tmpdir(), `viper-deploy-${rec.subdomain}-${Date.now()}.tar.gz`);
  fs.writeFileSync(tarPath, buf);

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), `viper-build-${rec.subdomain}-`));
  try {
    extractTarball(tarPath, stagingDir);
  } catch (e: any) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.rmSync(tarPath, { force: true });
    return NextResponse.json({ error: `could not extract tarball: ${e.message}` }, { status: 400 });
  }
  fs.rmSync(tarPath, { force: true });
  scrubEnvLocal(stagingDir);

  if (!fs.existsSync(path.join(stagingDir, "Dockerfile"))) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return NextResponse.json({ error: "Dockerfile not found in uploaded project" }, { status: 400 });
  }

  // docker+traefik mode (DEPLOY_MODE=docker): build the image locally and run it as a labeled
  // container behind Traefik — no Coolify, no registry. Used on shared hosts (SPEC v1.3 note).
  if ((process.env.DEPLOY_MODE || "coolify") === "docker") {
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const emit = (o: Record<string, unknown>) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        try {
          emit({ status: "extracted & scrubbed .env.local" });
          const tag = String(Date.now());
          const { image } = await buildAndPush({ srcDir: stagingDir, subdomain: rec.subdomain, tag, onLine: (l) => emit({ status: l }) });
          emit({ status: `built ${image}:${tag}` });
          emit({ status: "starting container…" });
          const { url } = await runApp({
            image,
            tag,
            subdomain: rec.subdomain,
            onLine: (l) => emit({ status: l }),
            env: buildAppEnv(rec),
          });
          store.update(rec.projectId, { coolify: { configured: true, url }, stopped: false });
          store.addDeploy(rec.projectId, tag);
          emit({ ok: true, url, tag });
        } catch (e: any) {
          emit({ ok: false, error: e?.message || String(e), hint: HINTS.build });
        } finally {
          fs.rmSync(stagingDir, { recursive: true, force: true });
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
  }

  // Degrade gracefully when Coolify isn't wired yet — same shape as before this rewrite.
  if (!coolify.configured()) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return NextResponse.json({
      ok: true,
      subdomain: rec.subdomain,
      url: rec.coolify?.url,
      deploy: { note: "Coolify not wired for this project yet — source received. Build pending Coolify setup." },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: Record<string, unknown>) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      // Hoisted so the catch block (and the non-throwing "deploy failed" branch) can still
      // fetch a log tail for an app that was already created before the failure.
      let appUuid: string | undefined = rec.coolify?.appUuid;
      try {
        emit({ status: "extracted & scrubbed .env.local" });

        const tag = String(Date.now());
        const { image } = await buildAndPush({
          srcDir: stagingDir,
          subdomain: rec.subdomain,
          tag,
          onLine: (line) => emit({ status: line }),
        });
        emit({ status: `pushed ${image}:${tag}` });

        let url = rec.coolify?.url;

        if (!appUuid) {
          emit({ status: "creating Coolify app…" });
          const created = await coolify.createImageApp({
            name: rec.name,
            subdomain: rec.subdomain,
            image,
            tag,
            env: buildAppEnv(rec),
          });
          appUuid = created.appUuid;
          url = created.url;
          store.update(rec.projectId, { coolify: { configured: true, appUuid, url } });
          emit({ status: `app created: ${url}` });
        } else {
          emit({ status: "updating image tag…" });
          await coolify.setImageTag(appUuid, tag);
        }

        emit({ status: "triggering deploy…" });
        const trigger = await coolify.triggerDeploy(appUuid!);
        let deploymentUuid = trigger.deploymentUuid;
        if (!deploymentUuid) {
          const recent = await coolify.deploymentsFor(appUuid!);
          deploymentUuid = recent[0]?.deployment_uuid;
        }
        if (!deploymentUuid) throw new Error(trigger.message || "deploy did not return a deployment uuid");

        const startedAt = Date.now();
        let finalStatus = "unknown";
        while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
          await sleep(POLL_MS);
          const dep = await coolify.deploymentStatus(deploymentUuid);
          const status = dep?.status || "unknown";
          emit({ status: `deploy status: ${status}` });
          if (TERMINAL.has(status)) {
            finalStatus = status;
            break;
          }
        }

        if (finalStatus !== "finished") {
          const error = `deploy ended with status "${finalStatus}"`;
          const logTail = appUuid ? await coolify.getLogs(appUuid).catch(() => undefined) : undefined;
          emit({ ok: false, error, hint: HINTS.deploy, logTail });
          return;
        }

        store.addDeploy(rec.projectId, tag);
        store.update(rec.projectId, { stopped: false });
        emit({ ok: true, url, tag });
      } catch (e: any) {
        const message = e?.message || String(e);
        const kind = classify(message);
        // A build failure has no live app to fetch logs from yet; the compile lines are
        // already streamed above, so only fetch a container log tail for the other cases.
        const logTail = kind !== "build" && appUuid ? await coolify.getLogs(appUuid).catch(() => undefined) : undefined;
        emit({ ok: false, error: message, hint: HINTS[kind], logTail });
      } finally {
        fs.rmSync(stagingDir, { recursive: true, force: true });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
