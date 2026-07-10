# Viper v1 — shared contract (integration glue)

Everything below is FIXED. Auth service, template, and portal all conform to it.
Keep everything minimal — no extra deps beyond what's listed. This is a laptop-as-server v1.

## Ports (local dev)
- Auth service: `http://localhost:4000`
- Viper portal: `http://localhost:3400`
- A generated project (dev): `http://localhost:3000`

## Auth service API (services/auth)
Store = single SQLite file `auth.db` (better-sqlite3). Sessions/OTP are signed JWTs (jsonwebtoken) — this is the swappable "dev" AuthEngine; prod swaps Insforge/Keycloak behind the same routes. Login locked to `@airtribe.live`.

- `GET  /health` → `{ ok: true }`
- `POST /projects` body `{ name, subdomain, ownerEmail }`
   → `{ projectId, clientId, clientSecret }`  (seeds roles `owner`,`member`; owner membership; default perms: owner=`["*"]`, member=`["read"]`)
- `POST /projects/:id/members` (Bearer clientSecret) body `{ email, role }` → `{ ok:true }`
- `POST /session/start` body `{ projectId, email }`
   → validates `@airtribe.live` + membership; "sends" OTP (dev: console.log + returns `{ ok:true, devOtp }` when NODE_ENV!=production)
- `POST /session/verify` body `{ projectId, email, otp }` → `{ token }`  (JWT, 12h)
- `POST /session/check` (Bearer clientSecret) body `{ token }`
   → `{ user:{ email }, role, permissions:[...] }`  or 401

## Template env contract (baked into the zip)
Non-secret (in `.env.local.example` + `viper.json`): `AUTH_SERVICE_URL`, `PROJECT_ID`, `AUTH_CLIENT_ID`, `VIPER_URL`.
Secret (server only; in Coolify env in prod, in `.env.local` for dev): `AUTH_CLIENT_SECRET`, `VIPER_DEPLOY_TOKEN`, and if db module: `INSFORGE_URL`, `INSFORGE_API_KEY`.
Dev switch: `AUTH_DEV_BYPASS=1` → auth helpers return a fake dev user with all perms, no login wall.

> **v1.1 amendment:** `NEXT_PUBLIC_PROJECT_NAME` is removed from the env contract — the
> project name comes from `viper.json` (`.name`, read server-side) instead, since
> `NEXT_PUBLIC_*` is inlined at build time and the deployed build must not depend on
> `.env.local` (excluded from the image). See SPEC §3.9.
>
> **v1.1 amendment — deployed-app env:** at first `npm run deploy`, the portal injects the
> deployed container's env directly via the Coolify API (never in the zip/image): `PROJECT_ID`,
> `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` (from the portal's stored project record),
> `VIPER_URL`, `NODE_ENV=production`, and `AUTH_SERVICE_URL` — which inside a deployed
> container is `http://192.168.5.2:4000` (the colima VM→Mac gateway), **not** `localhost`.
> `AUTH_DEV_BYPASS` is never injected into deployed containers — its absence is what turns the
> login wall on in production. See SPEC §3.6.

Session cookie name: `viper_session` (httpOnly).

## Template auth behavior
- `middleware.ts`: no `viper_session` cookie AND `AUTH_DEV_BYPASS!=1` → redirect to `/login`.
- `lib/auth.ts` (server): `getUser()` → dev bypass OR `POST {AUTH_SERVICE_URL}/session/check` (Bearer AUTH_CLIENT_SECRET, body {token: cookie}). `requireUser()` throws/redirects if none. `hasPermission(perm)` → perms includes `*` or perm.
- `/login` page → email input → `POST /api/auth/start` → OTP input → `POST /api/auth/verify` → sets `viper_session` cookie → redirect `/`.
- Data/API routes MUST filter by `getUser()` server-side. The example page demonstrates this (no fetch-all-then-filter).

## Module manifest — `template/viper.modules.json`
```json
{
  "auth":        { "label": "Auth (company SSO)",     "forced": true,  "files": ["middleware.ts","lib/auth.ts","app/login","app/api/auth"], "guide": "docs/auth.md" },
  "permissions": { "label": "Permissions (RBAC)",     "forced": false, "files": ["lib/permissions.ts","app/(app)/team"],                  "guide": "docs/permissions.md" },
  "db":          { "label": "Database (Insforge)",    "forced": false, "files": ["lib/db.ts","app/(app)/data"],                          "guide": "docs/db.md" }
}
```
Rule for the portal's zip-gen: for each module NOT selected and NOT forced → delete its `files` + `guide`. The dashboard nav in `app/(app)/layout.tsx` reads `viper.json.modules` (written by the portal) and only renders links for present modules — so removing files never leaves a dangling link.

## viper.json (portal writes this into the zip root)
```json
{ "projectId":"...", "name":"...", "subdomain":"...", "modules":["auth","permissions","db"], "authServiceUrl":"http://localhost:4000", "viperUrl":"http://localhost:3400" }
```

## Deploy CLI — `template/scripts/deploy.mjs` (run by `npm run deploy`)
Reads `viper.json` + `VIPER_DEPLOY_TOKEN` from `.env.local` → tar the source (exclude `node_modules`,`.next`,`.git`,`.env.local`,`.env*.local`) → `POST {VIPER_URL}/api/deploy` (Bearer token, multipart tarball + projectId) → prints streamed status + final URL. No git/docker on the user's machine.

> **v1.1 amendment:** the multipart tarball field name is **`file`** (CLI truth). The portal
> accepts `file` or `archive` for robustness.

## Portal provisioning (apps/portal, POST /api/projects)
1. `POST auth/projects` → creds (including `clientSecret`, stored plaintext in the portal's
   project record — laptop-v1 tradeoff, see SPEC §6).
2. zip-gen: copy `template/` → apply module toggles → write `viper.json` + `.env.local.example`
   → produce `<subdomain>.zip` → return as download.
3. `coolify: { configured: <bool> }` is recorded but **no Coolify app is created at this
   step.** App creation is lazy — it happens on the project's first `npm run deploy` (see
   `POST /api/deploy` below). This keeps project creation fast and infra-independent.

> **v1.1 amendment — deploy pipeline (`POST /api/deploy`):** validates the Bearer deploy token
> → extracts the tarball → scrubs any `.env.local`/`.env*.local` that slipped through (defense
> in depth) → verifies a `Dockerfile` is present (400 if not) → if Coolify isn't configured,
> responds with a `{ ok:true, deploy:{ note:"Coolify not wired…" } }` JSON note (unchanged
> behavior) → otherwise builds+pushes an image via `docker --context colima-coolify` to the
> in-VM registry (`localhost:5000`), lazily creates the Coolify dockerimage app on first
> deploy (or PATCHes the image tag on redeploy), triggers a Coolify deploy, and polls it to a
> terminal state. Streams `Content-Type: application/x-ndjson` status lines and ends with
> `{"ok":true,"url":"http://<sub>.127.0.0.1.sslip.io","tag":"<unix-ts>"}` on success or
> `{"ok":false,"error":"..."}` on failure.
