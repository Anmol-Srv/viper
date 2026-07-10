# SPEC — Viper v1.1: wire real deploys through Coolify (image-based)

Status: READY TO BUILD · 2026-07-10
Audience: the implementing model/engineer. Everything in "Verified facts" was tested on this
machine today — treat as ground truth. Everything in "Changes" is exact and file-scoped.
Read `CONTRACT.md` first; this spec amends it where noted.

---

## 0. Product framing (do not violate)

**Viper is the product. Coolify is a headless engine.** No builder, and ideally no operator,
ever opens the Coolify dashboard after initial setup. Viper's portal + the template's
`npm run deploy` are the only user-facing surfaces. All Coolify interaction goes through its
REST API using the token in `apps/portal/.env.local`.

## 1. Current state (all verified working today)

- **Auth service** `services/auth` on :4000 — multi-tenant projects/members/roles/permissions,
  `@airtribe.live`-locked OTP (dev engine = console OTP + JWT), `POST /session/check`.
  Security smoke test passes (`npm run smoke`).
- **Portal** `apps/portal` on :3400 (3300 is dr-doom's — never use it) — create project →
  provisions identity in auth service → generates module-stripped zip → `/api/download`.
  `/api/deploy` receives tarballs, validates the scoped deploy token (sha256 vs
  `data/projects.json`). 3 test projects exist in `data/projects.json`.
- **Template** `template/` — Next.js 15.5.20 App Router standalone; auth middleware +
  `lib/auth.ts` + login OTP flow + permissions + Insforge db stub; module manifest
  `viper.modules.json`; per-module docs; `scripts/deploy.mjs` CLI. Builds clean, including
  after module stripping.
- **Coolify 4.1.2** in colima VM (profile `coolify`, Apple vz, 4cpu/4gb/40gb):
  - Dashboard http://localhost:8000 (operator-only). Root user exists
    (`anmol.srivastava@airtribe.live`, users.id=0).
  - Server `localhost` **validated**: uuid `c8umkbl6vis6ybsitqxpjqlq`, ip `10.0.1.1`, user
    root — proxy (Traefik) + sentinel deployed and healthy.
  - Project exists: name "My first project", uuid `ajvqk4xfpb854p3vinviray3`.
  - Traefik publishes **80/443**, and colima forwards them to the Mac: `curl localhost:80`
    → Traefik 404 (no routes yet). **Host-header routing is live.**
  - API routes confirmed present (from `artisan route:list`):
    `POST /api/v1/applications/dockerimage`, `PATCH /api/v1/applications/{uuid}`,
    `POST /api/v1/applications/{uuid}/envs` + `PATCH .../envs/bulk`,
    `GET|POST /api/v1/deploy` (by `uuid` query), `GET /api/v1/deployments/applications/{uuid}`,
    `GET /api/v1/deployments/{uuid}`, `GET /api/v1/applications/{uuid}/logs`.
- **Mac → VM docker control**: docker context `colima-coolify`
  (`unix:///Users/anmol/.colima/coolify/docker.sock`) exists and is the active context.
  `docker --context colima-coolify …` drives the VM's dockerd (v29.5.2) from the Mac.
- **VM containers → Mac**: `http://192.168.5.2:4000/health` from inside a VM container returns
  `{"ok":true}`. **192.168.5.2 is the stable colima gateway to the Mac.** Deployed apps CAN
  reach the Mac-hosted auth service.
- Fixed and stable (do not re-break): Coolify `servers.ip=10.0.1.1` (NOT
  `host.docker.internal` — colima maps that to the Mac); `.env` has
  `APP_URL=http://localhost:8000`, `PUSHER_HOST=localhost`, `PUSHER_PORT=6001`;
  `base.blade.php:184` patched `encrypted: false` (**in-container patch — reverts on
  `docker compose down/up` or Coolify upgrade**, see §7); VM PAM has `pam_systemd` disabled
  in `/etc/pam.d/common-session` (logind-wedge immunity; backup at `common-session.viperbak`).

## 2. Architecture decision: image-based deploys (no git host)

**Chosen flow:** builder runs `npm run deploy` → CLI tars source → POST to portal
`/api/deploy` → portal **builds the Docker image on the VM's dockerd** (via the
`colima-coolify` context) → pushes to a **local registry in the VM** (`localhost:5000`) →
creates/updates a Coolify **dockerimage application** → Coolify pulls (localhost registry =
no TLS needed) and runs it behind Traefik at `http://<subdomain>.127.0.0.1.sslip.io`.

**Why (vs git-based):** kills the git-host decision entirely (no GitHub org, no Gitea to run);
no webhooks; Viper owns the build UX (can stream `docker build` output straight to the
builder's terminal); Coolify does what it's best at — run, route, restart, envs. All
enabling facts verified (§1). Git-based (Gitea + deploy-key + webhook) remains the documented
upgrade path when this moves to a real Linux server, but is NOT part of this build.

**Image naming:** `localhost:5000/viper-<subdomain>:<unix-ts>` — immutable tag per deploy.
Redeploy = build new tag → `PATCH` app's `docker_registry_image_tag` → `POST /deploy`.

## 3. Changes — exact, file by file

### 3.1 `services/auth/server.js` — add secret rotation (needed to heal existing projects)

Add one route. Guard: header `x-viper-admin` must equal env `AUTH_ADMIN_KEY` (set the same
value in both services' `.env.local`; generate once: `openssl rand -hex 24`).

```
POST /projects/:id/rotate-secret   (header x-viper-admin: <AUTH_ADMIN_KEY>)
→ regenerates clientSecret for the project, stores sha256, returns { clientSecret }
→ 401 if header missing/wrong; 404 if project unknown
```

Also add the same `x-viper-admin` guard as an ALTERNATIVE auth on `POST /projects/:id/members`
(portal will need it later for a manage UI; keep Bearer clientSecret working).
Extend `smoke.cjs`: rotation changes the secret (old one 401s on `/session/check`, new one 200s).

### 3.2 `apps/portal/lib/store.ts` — store the client secret + updates

- Add fields to `ProjectRecord`: `clientSecret: string` (plaintext, laptop-v1 — see §6
  hardening note), `lastImageTag?: string`, `lastDeployAt?: string`.
- Add `update(projectId, patch: Partial<ProjectRecord>)` (read-modify-write the JSON file).
- `GET /api/projects` response must strip `clientSecret` AND `deployTokenHash` (it already
  strips the hash — keep both out of any HTTP response).

### 3.3 `apps/portal/app/api/projects/route.ts` — simplify create (lazy Coolify)

- **Remove the `coolify.createApp(...)` call from create-time entirely.** At create-time the
  portal only: provisions auth project → mints deploy token → generates zip → stores record
  (now including `clientSecret` from the auth service response).
- Record's `coolify` field becomes `{ configured: coolify.configured() }` — appUuid/url are
  set at first deploy.
- Everything else (subdomain slug/uniqueness, module forcing, zip, download) stays as-is.

### 3.4 `apps/portal/lib/coolify.ts` — rewrite for dockerimage apps

Replace `createApp` with these (keep `configured()`, `health()`, `api()` helper):

```ts
createImageApp({ name, subdomain, image, tag, env }): Promise<{appUuid, url}>
  // POST /api/v1/applications/dockerimage
  // body: { server_uuid: COOLIFY_SERVER_UUID, project_uuid: COOLIFY_PROJECT_UUID,
  //         environment_name: "production",
  //         docker_registry_image_name: image,      // "localhost:5000/viper-<sub>"
  //         docker_registry_image_tag: tag,
  //         ports_exposes: "3000",
  //         name: `viper-${subdomain}`,
  //         domains: `http://${subdomain}.${BASE_DOMAIN}`,   // NOTE: http, not https
  //         instant_deploy: false }
  // then PATCH /api/v1/applications/{uuid}/envs/bulk  { data: [{key,value,is_preview:false}, ...] }
  // ⚠ verify exact field names before coding against them:
  //   colima ssh -p coolify -- sudo docker exec coolify sh -c \
  //     'grep -rn "docker_registry_image_name\|environment_name" /var/www/html/app/Http/Controllers/Api/ApplicationsController.php | head'

setImageTag(appUuid, tag)        // PATCH /api/v1/applications/{appUuid} { docker_registry_image_tag: tag }
triggerDeploy(appUuid)           // POST /api/v1/deploy?uuid=<appUuid>  → returns deployment info
deploymentsFor(appUuid)          // GET /api/v1/deployments/applications/{appUuid}
deploymentStatus(deploymentUuid) // GET /api/v1/deployments/{deploymentUuid}
```

Env defaults change: `BASE_DOMAIN` default `127.0.0.1.sslip.io` (was `viper.localhost`).
Domains are `http://` — the laptop has no TLS; scheme comes from `VIPER_DOMAIN_SCHEME`
env, default `http`.

### 3.5 `apps/portal/lib/build.ts` — NEW: image build/push via docker context

```ts
buildAndPush({ srcDir, subdomain, tag, onLine }): Promise<{ image, tag }>
  // spawn("docker", ["--context", DOCKER_CONTEXT, "build", "-t", `${REGISTRY}/viper-${subdomain}:${tag}`, srcDir])
  // stream stdout+stderr lines → onLine(line)
  // then spawn docker push the same way
  // DOCKER_CONTEXT env, default "colima-coolify"; REGISTRY env, default "localhost:5000"
  // throw with the tail of output on non-zero exit
```

### 3.6 `apps/portal/app/api/deploy/route.ts` — the real deploy pipeline

Rewrite the handler to stream **NDJSON** (the template CLI already parses ndjson — keep
`Content-Type: application/x-ndjson`). Steps, each emitting `{"status": "..."}` lines:

1. Validate Bearer deploy token (unchanged). Look up record.
2. Save tarball; extract to a fresh staging dir (`tar -xzf` via `child_process`, or keep it
   in-process — either is fine).
3. **Security scrub:** delete `.env.local` from the staging tree if present (the CLI also
   stops shipping it — §3.8 — this is defense-in-depth), and verify `Dockerfile` exists
   (400 if not).
4. `tag = String(Date.now())` … acceptable here (portal runtime, not a workflow script).
5. `buildAndPush({ srcDir, subdomain, tag, onLine })` — forward each line as
   `{"status": line}`.
6. If record has no `coolify.appUuid`: `createImageApp` with env:
   `AUTH_SERVICE_URL=http://192.168.5.2:4000` (VM-reachable Mac address — from env
   `VIPER_AUTH_URL_FROM_VM`, default that value), `PROJECT_ID`, `AUTH_CLIENT_ID`,
   `AUTH_CLIENT_SECRET` (from the stored record), `VIPER_URL=http://192.168.5.2:3400`,
   `NODE_ENV=production`.
   **Never inject `AUTH_DEV_BYPASS`** — its absence is what turns the login wall on.
   Save `{appUuid, url}` via `store.update`.
   Else: `setImageTag(appUuid, tag)`.
7. `triggerDeploy(appUuid)` → poll `deploymentsFor`/`deploymentStatus` every 3s until status
   is terminal (`finished` / `failed`; also verify actual status strings from the first real
   response and handle unknowns by logging them) — timeout 5 min. Emit poll updates.
8. Final line: `{"ok": true, "url": "http://<sub>.127.0.0.1.sslip.io", "tag": ...}` and
   `store.update` with `lastImageTag`, `lastDeployAt`. On any failure: `{"ok": false, "error": ...}`.

### 3.7 `template/Dockerfile` — one-line fix

Add `ENV HOSTNAME=0.0.0.0` in the runner stage (next to `ENV PORT=3000`). Next standalone
otherwise risks binding localhost-only inside the container → Traefik 502s.

### 3.8 `template/scripts/deploy.mjs` — two fixes

- **Exclude `.env.local` from the tarball** (it currently ships `VIPER_DEPLOY_TOKEN` to the
  server): add `--exclude=.env.local` (and `--exclude=.env*.local` for safety) to the tar args.
- The NDJSON path already exists; make sure non-JSON lines print raw (it does) and that the
  final `{"ok":false,...}` sets a non-zero exit code (currently only network errors do).

### 3.9 `template/` — stop relying on `NEXT_PUBLIC_PROJECT_NAME`

`NEXT_PUBLIC_*` is inlined at build time; the deployed build must not depend on `.env.local`
(excluded from image). The project name already exists in `viper.json` (shipped in the
tarball). Change any usage of `process.env.NEXT_PUBLIC_PROJECT_NAME` (layout/topnav) to
import `viper.json` and use `.name` (server components — zero client-bundle issues). Remove
the var from zipgen's `.env.local` emission and from `.env.local.example`.

### 3.10 `apps/portal/app/page.tsx` — surface deploy state (small)

Project rows: when `coolify.url` exists show it as a link; show `lastDeployAt` if present.
The create-result panel: drop the per-create Coolify status line (creation no longer touches
Coolify); keep the "deploy activates on first `npm run deploy`" hint. No other UI work.

### 3.11 `infra/setup-registry.sh` — NEW (one-time, idempotent)

```bash
#!/usr/bin/env bash
# Local Docker registry inside the colima VM — Coolify pulls Viper-built images from it.
set -euo pipefail
CTX="${DOCKER_CONTEXT:-colima-coolify}"
if docker --context "$CTX" ps --format '{{.Names}}' | grep -q '^viper-registry$'; then
  echo "viper-registry already running"
else
  docker --context "$CTX" run -d --restart always -p 5000:5000 --name viper-registry registry:2
fi
docker --context "$CTX" ps --filter name=viper-registry --format '{{.Names}}  {{.Status}}'
```
(Note: macOS AirPlay squats Mac:5000; irrelevant — only the VM needs :5000. If colima logs a
forward warning, ignore it.)

### 3.12 `infra/repatch-coolify-ws.sh` — NEW (recovery for the blade patch)

```bash
#!/usr/bin/env bash
# Re-apply the websocket fix after a Coolify container recreate/upgrade (see SPEC §7).
set -euo pipefail
PROFILE="${COOLIFY_VM_PROFILE:-coolify}"
colima ssh -p "$PROFILE" -- sudo docker exec coolify sh -c '
  sed -i "s/encrypted: true,/encrypted: false,/" /var/www/html/resources/views/layouts/base.blade.php
  php /var/www/html/artisan view:clear'
echo "re-patched (encrypted:false) + view cache cleared"
```

### 3.13 `CONTRACT.md` — amendments

- Deploy multipart field name is **`file`** (CLI truth); portal accepts `file` or `archive`.
- Portal provisioning section: Coolify app creation moved from create-time to first deploy.
- Add: deployed-app env is injected by the portal at first deploy; `AUTH_SERVICE_URL` inside
  deployed containers is `http://192.168.5.2:4000` (VM→Mac), NOT localhost.
- Remove `NEXT_PUBLIC_PROJECT_NAME` from the env contract (name comes from `viper.json`).

## 4. Blockers / prerequisites (in order — none are code)

1. **Coolify API token not yet wired.** User must run
   `bash infra/connect-coolify.sh` (already fixed to use `tinker --execute`; last user
   attempt predates the fix). It mints the token headlessly and writes
   `COOLIFY_URL/COOLIFY_TOKEN/COOLIFY_SERVER_UUID/COOLIFY_PROJECT_UUID` into
   `apps/portal/.env.local` without printing the token. **Everything in §3.4-3.6 is dead
   until this runs.** Restart the portal after.
2. **Registry:** run `infra/setup-registry.sh` once (after writing it).
3. **Both Viper services must be running** for deployed apps to function: auth (:4000) and
   portal (:3400) — `bash scripts/dev.sh`. A deployed app's login calls the auth service at
   deploy-injected `192.168.5.2:4000`; if auth is down, deployed logins fail.
4. **Internet required at request time** for `*.127.0.0.1.sslip.io` DNS (resolves to
   127.0.0.1 via public DNS). Offline fallback: `/etc/hosts` entries per subdomain.
5. **`.env.local` additions** (user/builder action, values in §3): `AUTH_ADMIN_KEY` in both
   `services/auth/.env` (or env) and `apps/portal/.env.local`.

## 5. Verification plan (run all; this is the definition of done)

1. `services/auth`: `npm run smoke` — extended with rotate-secret cases, all pass.
2. Registry: `docker --context colima-coolify ps` shows `viper-registry` Up.
3. Coolify link: portal boot log or `GET /api/projects` → `coolifyConfigured: true`;
   `curl -H "Authorization: Bearer $COOLIFY_TOKEN" http://localhost:8000/api/v1/version`
   returns a version (token from `.env.local`, don't print it into logs).
4. **E2E**: create a fresh project in the portal (e.g. `e2e-check`, modules: permissions) →
   download zip → unzip → `npm install` → `npm run deploy`.
   Expect streamed: scrub → build lines → push → app create → deploy poll → final
   `{"ok":true,"url":"http://e2e-check.127.0.0.1.sslip.io"}`.
5. `curl -I http://e2e-check.127.0.0.1.sslip.io` → **302 to /login** (auth wall on: proves
   the image runs, Traefik routes, and `AUTH_DEV_BYPASS` is absent in prod).
6. Browser: complete the OTP login (OTP prints on the auth-service console; owner email) →
   dashboard renders; `/team` gated by role. This proves deployed-app → Mac auth path.
7. **Redeploy**: edit any visible string in the unzipped project → `npm run deploy` again →
   new tag PATCHed, URL serves the change.
8. **Security checks**:
   a. `tar -tzf` the CLI's tarball → contains NO `.env.local`.
   b. `docker --context colima-coolify run --rm localhost:5000/viper-e2e-check:<tag> sh -c 'ls -la; env' `
      → no `.env.local` in the image fs, no `VIPER_DEPLOY_TOKEN`/`AUTH_CLIENT_SECRET` in
      image env (secrets exist only in the Coolify-run container's env).
   c. `curl http://e2e-check.127.0.0.1.sslip.io/api/…` any data route without a session →
      401/redirect, never data.
9. Portal list shows the live URL + lastDeployAt for `e2e-check`.

## 6. Known ceilings accepted in this build (do not "fix" without asking)

- `clientSecret` plaintext in `apps/portal/data/projects.json` — laptop-v1 tradeoff;
  prod hardening = encrypt at rest or fetch-on-demand via rotate. (`// ponytail` it.)
- Registry has no GC — images accumulate; prod adds a cleanup cron.
- One Coolify "project" for all Viper apps; per-builder Coolify projects are a later nicety.
- OTP is console-printed (dev auth engine). Prod = swap engine behind the same routes
  (Insforge/Keycloak) + real email. Interface already isolated in `services/auth`.
- No portal auth on Viper itself yet (it's a laptop admin tool); before exposing the portal
  beyond the laptop, gate it with the same auth service (dogfood).
- HTTP only (no TLS) on the laptop; real server gets Coolify-managed Let's Encrypt.

## 7. Fragility register (operator notes)

| Thing | Breaks when | Recovery |
|---|---|---|
| Blade ws patch (`encrypted:false`) | Coolify container recreate/upgrade | `infra/repatch-coolify-ws.sh` |
| Coolify `servers.ip=10.0.1.1` | Coolify re-onboarding/reinstall | re-run the DB update (README-infra) |
| PAM `pam_systemd` disabled | colima VM recreate (`colima delete`) | re-run setup + re-comment; backup `.viperbak` |
| VM→Mac IP `192.168.5.2` | colima networking change (unlikely) | re-check `getent hosts host.docker.internal` in VM |
| sslip.io DNS | no internet | `/etc/hosts` fallback |

## 8. Explicitly out of scope (v2+, do not build now)

Company-data MCP + context skills ("the Brain" / Cerebro), git-based deploys (Gitea),
multi-theme design system, portal member-management UI, Insforge provisioning automation
(db module ships the stub only), microVM isolation, real email OTP.
