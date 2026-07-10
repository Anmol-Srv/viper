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
- `POST /projects/:id/members` (Bearer clientSecret OR `x-viper-admin`) body `{ email, role }` → `{ ok:true }` (upsert — also the role-change path)
- `GET /projects/:id/members` / `DELETE /projects/:id/members/:email` — v1.3 additions, see "§0.1 Auth-service member endpoints" further down for the full contract (401/404 rules, last-owner guard).
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
>
> **v1.2 amendment — deploy history + failure hints (SPEC §1.5, §2.4):** every successful
> terminal deploy appends `{tag, at}` to the project record's `deploys` array (capped at the
> last 10, newest last) via `lib/store.ts`'s `addDeploy()`; `lastImageTag`/`lastDeployAt` are
> kept in sync for backward compat. On failure the final NDJSON line additionally carries
> `hint` (a human-readable next step) and, where an app already exists, `logTail` (last ~30
> lines from `GET /api/v1/applications/{uuid}/logs`, verified response shape `{ "logs": "<\n-
> joined string>" }`): `{"ok":false,"error":"...","hint":"...","logTail":["...", ...]}`. Two
> of the three SPEC §2.4 cases are diagnosed by the portal itself (docker build failed → hint
> points at the compile lines already streamed above, no logTail; Coolify deploy status !=
> "finished" → hint + logTail from the running/failed container). The third case — portal
> unreachable — can only be detected by the CLI, since the portal can't diagnose its own
> unreachability; that hint lives in `template/scripts/deploy.mjs`, not here.

## Portal (apps/portal) — v1.2 additions (SPEC Epic 1)

**Dogfooding note:** the portal gates *itself* through the same auth service every generated
project uses, via a seeded, `open_enrollment` project `prj_viper` (subdomain `viper`). Any
`@airtribe.live` email can self-serve: `POST /session/start {projectId:"prj_viper", email}` →
OTP (`devOtp` in the response when the auth service isn't in `NODE_ENV=production`) →
`POST /session/verify` → `{token}`. Unlike a generated project, the portal has no `clientId`/
`clientSecret` of its own — it authenticates to the auth service as an *operator*, via the
`x-viper-admin: <AUTH_ADMIN_KEY>` header, not a Bearer client secret.

**Portal session cookie:** `viper_portal_session` (httpOnly, `Secure` iff
`VIPER_DOMAIN_SCHEME==="https"`, `SameSite=Lax`, 12h maxAge matching the auth JWT). Verified
server-side on every request via `lib/session.ts`'s `getPortalUser()` → `POST
{AUTH_SERVICE_URL}/session/check` with header `x-viper-admin` + body `{token}` →
`{email, role}` or `null`. `PORTAL_DEV_BYPASS=1` skips this entirely (never set on a gated
instance — see `.env.example`).

**Route protection** (`middleware.ts` checks cookie *presence* only — the real check is
`getPortalUser()` re-verifying against the auth service on every request, same model as
`template/lib/auth.ts`):

| Route | Auth |
|---|---|
| `/login`, `/api/auth/*` | public |
| `/api/health` | public (`{ok:true}`, used by `npm run doctor`) |
| `/api/deploy` | deploy-token Bearer ONLY — no session; the builder CLI has no browser session |
| `/admin`, `/api/admin/*` | `viper_portal_session` required AND `role === "owner"` on `prj_viper` (checked in the page/route itself, not middleware — SPEC B1) |
| everything else (pages, `/api/projects*`, `/api/download`) | `viper_portal_session` required |

**Ownership from session (SPEC §1.2):** `POST /api/projects` takes `ownerEmail` from
`getPortalUser()`, not the request body — the "Owner email" form field is gone. `GET
/api/projects` returns only projects where the caller is `ownerEmail` or listed in `members`;
`?all=1` additionally requires the caller's **prj_viper role** to be `owner` (i.e. the
platform admin, `AUTH_PLATFORM_ADMIN` in the auth service — today `enggv2@airtribe.live`).
Note this is the portal-wide role, distinct from a given generated project's own
owner/member list.

**`ProjectRecord` new fields** (`apps/portal/lib/store.ts`):
```ts
members?: { email: string; role: "owner" | "member" }[]; // lazy-backfill fallback only, see below
deploys?: { tag: string; at: string }[];                  // capped at 10, newest last
db?: { provider: "insforge"; ref: string; localUrl?: string; internalUrl?: string; dashboardUrl?: string };
dbError?: string;                                         // set when `db` module selected but provisioning failed
```
Records on disk from before a given field existed simply lack it — `lib/store.ts` backfills
`members`/`deploys` on every read (never on write), so an old record never crashes a reader; `db`
and `dbError` are tolerated as absent everywhere (no backfill needed, `undefined` is a valid
"no database" state).

> **v1.3 update (SPEC B2 — supersedes the v1.2 behavior described above):** members are now read
> live from the auth service (§0.1 `GET /projects/:id/members`) — the portal **no longer writes**
> to `ProjectRecord.members` on invite or remove. `POST /api/projects/:subdomain/members` calls
> the auth service and returns; nothing is mirrored locally. `DELETE .../members` calls the auth
> service's real `DELETE /projects/:id/members/:email` — removal now actually revokes access,
> unlike the v1.2 portal-list-only behavor. The `members` field on a record is purely the lazy-
> backfill owner fallback described above (used by the portal's own "which projects can I see"
> checks) — see the §0.1 section further up for the resulting scope cut this implies for invited
> non-owner members.

**Teardown (SPEC §1.6):** `DELETE /api/projects/:subdomain` (owner-only, body
`{confirm: "<subdomain>"}`, rejected if it doesn't match) → best-effort Coolify `DELETE
/api/v1/applications/{uuid}` → best-effort auth service `DELETE /projects/:id` (admin-key-
guarded, 400 on `prj_viper`) → removes the store record + the zip file. Coolify/auth failures
are logged and swallowed (best-effort) so a partially-torn-down project doesn't get stuck
undeletable in the portal.

## v1.3 additions (SPEC-v1.3.md — admin everywhere, real databases, grown-up UI)

### §0.1 Auth-service member endpoints (agent A implements; portal + template consume)

```
GET    /projects/:id/members            → { members: [{ email, role, status }] }
DELETE /projects/:id/members/:email     → { ok: true }   (400 if it would remove the last owner)
POST   /projects/:id/members            (existing; upsert = also the "change role" path)
```
Auth for all three: `Authorization: Bearer <that project's clientSecret>` OR
`x-viper-admin: <AUTH_ADMIN_KEY>`. 401 on bad/missing creds; 404 on an unknown project (checked
before creds, so callers can distinguish "no such project" from "wrong secret").

Membership is now the **source of truth in the auth service, not the portal**. The portal's own
`ProjectRecord.members` (`apps/portal/lib/store.ts`) is written once at create-time indirectly —
actually it is **not written by the portal at all anymore** (see below) — and exists purely as a
lazy-backfill fallback (`{ email: ownerEmail, role: "owner" }`) for reads, e.g. the portal's
"which projects can I see" filter in `GET /api/projects`. A member invited after project-create
via the Members tab is real (can log into the generated app) but — by design, per this
revision — does not gain portal-dashboard visibility of that project unless they're also its
`ownerEmail`; only the platform admin (`?all=1`) or the original owner sees it listed. This is a
deliberate scope cut (SPEC B2's "drop the portal-side members array writes") over building live
membership checks into every portal access-control path.

### §0.2 Design tokens — canonical (portal `app/globals.css` AND template `globals.css` must
stay byte-identical on this block)

```css
--bg: #0a0a0a;  --panel: #111214;  --panel-2: #161719;  --border: #26262a;
--text: #ededed;  --muted: #8f8f92;  --ok: #22c55e;  --danger: #ef4444;
```
Radius 2px everywhere (0 is fine on tables/inputs). 1px solid borders. Primary button: **white**
background, **black** text, radius 2px, font-weight 600. Secondary: transparent bg, 1px border,
`--text`. Danger: `--danger` border/text by default, filled (`--danger` bg, white text) on
hover. Focus: `1px solid #fff` outline via `:focus-visible`. No purple/indigo/violet anywhere
(including the logo — plain white "V" tile, 2px radius, on the dark page background, no
gradient). No gradients, no soft shadows, no rounded corners > 2px, no emoji in UI chrome
(arrows/checkmarks used as functional glyphs are fine; decorative emoji are not). Density:
13–14px body text, generous table row padding. Status colors (`--ok`/`--danger`) are used only
for actual status (live/danger), never as decoration.

### §0.3 Database plumbing — provider-agnostic stub (REVISED mid-build, 2026-07-10)

Original plan was Coolify-hosted Postgres-per-project; Anmol's call mid-build: self-hosting a DB
per project is too load-bearing on the server, so the provider is a third-party service
(Insforge) instead — API integration is a follow-up once org/API-key credentials exist. What
shipped in v1.3 is a **stub behind a stable interface**, so the follow-up is additive:

- `apps/portal/lib/dbprovider.ts`: `provisionDatabase(projectName) → { configured, db?, error? }`
  and `deleteDatabase(ref)`. Gated on `INSFORGE_USER_API_KEY` + `INSFORGE_ORG_ID` (management-API
  creds, distinct from the per-project runtime `INSFORGE_URL`/`INSFORGE_API_KEY` a generated
  app's own `.env` gets). Mirrors how `lib/coolify.ts` degrades before its token exists: every
  call no-ops with `{ configured: false }` so project creation/zip/deploy never depend on this
  being wired up. Currently always returns `{ configured: false }` (no key set) — filling in the
  real Insforge HTTP calls is the only change needed later; every caller already expects this
  shape.
- `ProjectRecord.db?: { provider: "insforge"; ref: string; localUrl?: string; internalUrl?:
  string; dashboardUrl?: string }` and `ProjectRecord.dbError?: string` (set when the `db`
  module was selected but provisioning failed/degraded). Both are optional — 6+ pre-v1.3 records
  on disk have neither field; every reader tolerates their absence.
- Env name everywhere once wired up: **`DATABASE_URL`**. Zip's `.env.local` gets `localUrl` at
  create-time (omitted entirely if provisioning didn't produce one — never a blank placeholder);
  deployed app env gets `internalUrl` injected at first `npm run deploy` (`app/api/deploy/route.ts`,
  same "only if `rec.db` exists" pattern as the auth env vars).
- Portal UI: the project detail page's **Database tab** (only shown when the `db` module is
  selected) renders one of three states — credentials + copy-able URLs (provisioning succeeded),
  an error card (provisioning was attempted and failed), or "not configured yet" (no provider
  wired up). Credentials are plaintext in the portal's local JSON record — same laptop-v1
  tradeoff as `clientSecret` (SPEC §6) — and shown to the project's members by design, that's
  the point of the tab.
- Teardown (`DELETE /api/projects/:subdomain`) best-effort calls `dbprovider.deleteDatabase(rec.db.ref)`
  alongside the existing Coolify-app and auth-service teardown steps.
- **Verified Insforge facts** (from `github.com/InsForge/CLI` source, for whoever wires this up):
  management API `api.insforge.dev`, Bearer `uak_...` user API key; `GET /organizations/v1` →
  org list; `POST /organizations/v1/{orgId}/projects` `{name, region?}` → create, poll
  `GET /projects/v1/{id}` until `status==='active'`; `GET /projects/v1/{id}/access-api-key` →
  `{access_api_key}`. Per-project runtime base `https://<slug>.<region>.insforge.app`
  (PostgREST-style `/api/database/records/<table>`, `/api/database/advance/rawsql`, etc.); SDK
  `@insforge/sdk`. Mapping: one Airtribe org, one Insforge project per Viper project (name =
  subdomain).

### Invite-only (SPEC A2/B1)

`prj_viper`'s `open_enrollment` is `0` (was `1` in v1.2) — the auth service flips this on every
boot, including for pre-existing DBs. `POST /session/start` on `prj_viper` for a non-member
returns a platform-admin-specific message. The portal's own login page copy no longer claims
"any @airtribe.live email works" — it says the platform is invite-only.

### Platform admin dashboard — `/admin` (SPEC B1)

Server-gated (not just a hidden nav link): `app/admin/page.tsx` calls `getPortalUser()`, redirects
non-members to `/login` and non-owners (of `prj_viper`, i.e. not the platform admin) to `/`. Backed
by `app/api/admin/members/route.ts` (GET list / POST invite-or-change-role) and
`app/api/admin/members/[email]/route.ts` (DELETE, real revoke) — both scoped hardcoded to
`prj_viper` and gated on `getPortalUser().role === "owner"` server-side, calling the auth service
with `x-viper-admin` per §0.1. This table **is** the invite list — membership here is what lets
someone log into the portal at all. The home page shows an "Admin" link next to the logout button
only when `me.role === "owner"`.

**CLAUDE.md / AGENTS.md placeholder contract (SPEC §3.4)** — canonical reference, both docs
must use exactly these tokens:
- `{{PROJECT_NAME}}`, `{{SUBDOMAIN}}`, `{{LIVE_URL}}` (= `lib/coolify.ts`'s `liveUrlFor()`:
  `<scheme>://<subdomain>.<VIPER_BASE_DOMAIN>`), `{{MODULES_LIST}}` (comma-joined present
  module keys, e.g. `auth, permissions`).
- Conditional blocks `<!-- IF:permissions -->...<!-- /IF:permissions -->` and
  `<!-- IF:db -->...<!-- /IF:db -->` — content kept verbatim (marker lines stripped) when that
  module is selected, dropped entirely otherwise. No `IF:auth` block — auth is always forced.
- Zip-gen (`lib/zipgen.ts`'s `injectAgentDocs()`) applies this after module-file stripping,
  before `viper.json` is written. If `CLAUDE.md`/`AGENTS.md` don't exist in `template/` yet,
  injection is skipped silently (defensive — these are authored by a separate workstream).
