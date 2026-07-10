# SPEC v1.3 — Admin everywhere, real databases, grown-up UI

Status: READY TO BUILD · 2026-07-10
Prereq reading: `SPEC-v1.2.md` (shipped, Priya-test green), `CONTRACT.md`, `ARCHITECTURE.md`.
Decisions locked (Anmol's asks + defaults he was offered):
1. **Platform is invite-only.** Auto-enroll dies; a platform **admin dashboard** invites
   members; only members can log in / build.
2. **Every generated project ships an admin panel** (owner-only) managing that project's
   members — a scoped subset of the central auth service.
3. **UI overhaul, portal + template**: proper dashboard, dark, **sharp-edged, no purple**,
   monochrome + white-primary (Vercel/Linear register), no gradients, no glow.
4. **Databases = Coolify-provisioned Postgres per project.** Insforge is OUT (was never
   wired — the stub ships empty envs). No third-party account. Builders see their DB
   credentials in a **Database tab** on the project page.

---

## 0. Shared contracts (every agent conforms; portal agent owns CONTRACT.md updates)

### 0.1 New auth-service member endpoints (agent A implements; B & C consume)
```
GET    /projects/:id/members            → { members: [{ email, role, status }] }
DELETE /projects/:id/members/:email     → { ok: true }   (400 if it would remove the last owner)
POST   /projects/:id/members            (exists; upsert = also the "change role" path)
```
Auth for all three: `Authorization: Bearer <that project's clientSecret>` OR
`x-viper-admin: <AUTH_ADMIN_KEY>`. 401 otherwise; 404 unknown project.

### 0.2 Design tokens (identical values in portal AND template globals.css)
```
--bg: #0a0a0a;  --panel: #111214;  --panel-2: #161719;  --border: #26262a;
--text: #ededed;  --muted: #8f8f92;  --ok: #22c55e;  --danger: #ef4444;
radius: 2px everywhere (0 on tables/inputs is fine). 1px solid borders.
Primary button: WHITE background, BLACK text, radius 2px, font-weight 600.
Secondary: transparent bg, 1px border, --text. Danger: --danger border/text, filled on hover.
Focus: 1px white outline. NO purple/indigo/violet anywhere. No gradients, no soft shadows,
no rounded cards > 2px, no emoji in UI chrome. Density: 13-14px body, generous tables.
Status colors used ONLY for status (live=--ok, danger=--danger), never decoration.
```

### 0.3 Database plumbing — REVISED mid-build (2026-07-10): Insforge, not self-hosted Postgres

Anmol's call: per-project Postgres on our box is too load-bearing → third-party (Insforge).
Agents B/C were redirected mid-flight: v1.3 ships a provider-agnostic STUB
(`apps/portal/lib/dbprovider.ts` gated on `INSFORGE_USER_API_KEY`; template `lib/db.ts`
facade). Filling it is a small follow-up once creds exist.

**Verified Insforge facts (from the CLI source, github.com/InsForge/CLI):**
- Management API `api.insforge.dev`; auth = Bearer `uak_...` user API key (non-interactive;
  `login --user-api-key` proves direct-key auth is first-class).
- `GET /organizations/v1` → org list · `POST /organizations/v1/{orgId}/projects` {name,
  region?} → create · poll `GET /projects/v1/{id}` until `status==='active'` (CLI polls 3s /
  120s timeout) · `GET /projects/v1/{id}/access-api-key` → `{access_api_key}`.
- Per-project runtime base `https://<slug>.<region>.insforge.app`: PostgREST-style
  `/api/database/records/<table>`, `/api/database/advance/rawsql`, tables/policies/
  migrations endpoints, `POST /api/auth/tokens/anon` → anon key. SDK: `@insforge/sdk`.
- Mapping: ONE Airtribe org; one Insforge project per Viper project (name = subdomain);
  template envs stay `INSFORGE_URL` + `INSFORGE_API_KEY` (v1.1 stub's names).
- Needs from Anmol: insforge.dev account → org → `uak_` key → `INSFORGE_USER_API_KEY` +
  `INSFORGE_ORG_ID` in portal `.env.local`. Pricing: unreviewed (insforge.dev/pricing.md).
- Builder dashboard access to insforge.dev itself = manual org invite (their account model);
  Viper's Database tab is the primary surface.

### 0.3-legacy (SUPERSEDED — kept for the record; do not build)
- `ProjectRecord.db = { uuid, name, internalUrl, localUrl } | undefined`
  - `localUrl`  = `postgres://user:pass@localhost:<publicPort>/<db>` (builder's machine; colima
    forwards the published port)
  - `internalUrl` = `postgres://user:pass@10.0.1.1:<publicPort>/<db>` (deployed containers →
    VM host)
- Env name everywhere: **`DATABASE_URL`**. Zip's `.env.local` gets `localUrl` at create-time;
  deployed app env gets `internalUrl` injected at first deploy.
- Template helper: `lib/db.ts` uses the `pg` package (the ONLY new template dep), reads
  `DATABASE_URL`, exports `query(text, params)` + a tiny `getPool()`. Dev fallback: if
  `DATABASE_URL` unset → throw a clear error pointing at the Database tab.

---

## Agent A — auth service (`services/auth/`)

A1. Implement §0.1 endpoints (match existing style; extend `smoke.cjs`: list members,
    role-change via POST upsert, delete member, last-owner 400, both auth paths, 401s).
A2. **Invite-only flip**: seed `prj_viper` with `open_enrollment=0` AND run an idempotent
    `UPDATE projects SET open_enrollment=0 WHERE id='prj_viper'` (existing DBs have 1).
    Auto-enroll code stays (generic feature) — it's just off for the portal project.
    Non-member `/session/start` on `prj_viper` should read: `not a member — ask a platform
    admin to invite you` (special-case the message when project id is prj_viper).
A3. Keep everything else untouched; run full smoke.

## Agent B — portal (`apps/portal/` + `CONTRACT.md`)

B1. **/admin — platform admin dashboard** (visible/routable only when the session user's
    prj_viper role is `owner`): members table of `prj_viper` via §0.1 GET (x-viper-admin,
    server-side); invite (email + role owner|member); remove (auth DELETE — real revoke);
    promote/demote via POST upsert. This is THE gate: only people in this table can log in.
B2. **Project members become live**: detail-page Members tab now reads via §0.1 GET
    (source of truth = auth service; drop the portal-side `members` array writes, keep
    lazy-read tolerance). Remove-member now actually revokes. Stop seeding `members` on create.
B3. **Postgres provisioning**: when the `db` module is selected at create time —
    ⚠ FIRST verify Coolify's database API live (`artisan route:list --path=api/v1 | grep -i
    database` + grep the DatabasesController for the create-postgres payload; you have
    COOLIFY_TOKEN in .env.local — never print it). Create a postgresql database on our
    server/project with a **public port** so it's reachable per §0.3; capture creds; store
    `ProjectRecord.db`; pass `localUrl` into zipgen (`.env.local` gets `DATABASE_URL=`);
    deploy route injects `DATABASE_URL=internalUrl` into app env when `rec.db` exists.
    Teardown (danger zone) also deletes the database via the API.
    If the DB API create fails, degrade: project still created, Database tab shows the error,
    `viper.json`/env omit DATABASE_URL.
B4. **Database tab** on project detail (only when db module): host/port/user/password/dbname,
    the two URLs (local + deployed) with copy buttons, and a one-line "how to use" pointing at
    `docs/db.md`. Plaintext-on-laptop caveat comment, consistent with clientSecret.
B5. **UI overhaul** per §0.2: rewrite `globals.css` tokens/components; adjust all pages
    (login, home, detail, admin) — sharp, dense, monochrome; white primary buttons; kill the
    purple logo gradient (plain white "V" tile on black, 2px radius). Keep layout structure,
    change the skin + polish tables/tabs/forms into a proper dashboard register.
B6. CONTRACT.md: add §0.1 endpoint table, §0.2 tokens (canonical), §0.3 db plumbing,
    invite-only note. Verify `npm run build` + the auth-required flows still pass with the
    RUNNING services (portal :3400 dev hot-reloads; auth :4000 needs no restart for B's work —
    but note A's changes DO need a restart, don't do it yourself, integration will).

## Agent C — template (`template/`)

C1. **Project admin panel (always shipped — part of the forced auth module)**:
    `app/(app)/admin/page.tsx` (owner-only server-gated: `hasPermission('*')` else the
    no-access message) + client component: members table (email/role/status), invite by
    email+role, remove, change role. Backed by NEW routes `app/api/admin/members/route.ts`
    (GET list, POST invite/change-role) and `app/api/admin/members/[email]/route.ts` (DELETE)
    — each calls the auth service (§0.1) server-side with `AUTH_CLIENT_SECRET`, after
    verifying the CALLER via `requireUser()` + `hasPermission('*')`. Update the sidebar nav
    (Admin link, owner-only — nav already reads viper.json modules; admin shows for all
    modules but page itself gates). Retire the hardcoded `/team` example: `app/(app)/team` is
    REMOVED from the tree and from `viper.modules.json`'s permissions files (permissions
    module keeps `lib/permissions.ts`; its guide gets a pointer to the admin panel as the
    live example of gating).
C2. **`lib/db.ts` rewrite** per §0.3 (add `pg` + `@types/pg` deps): `query()`/`getPool()`,
    clear no-DATABASE_URL error. Update `app/(app)/data/page.tsx` example to `pg` (a simple
    `items` table example with user-scoped WHERE, per the security grain; handle
    relation-does-not-exist by showing "create your first table — see docs/db.md").
    Rewrite `docs/db.md`: where credentials live (Viper → project → Database tab), local vs
    deployed URLs, the pg helper, a create-table snippet, the always-scope-by-user rule.
C3. **UI overhaul** per §0.2 across template `globals.css` + `components/ui/*` +
    layout/login/dashboard pages. Sharp, monochrome, white-primary. No purple.
C4. Update `CLAUDE.md`/`AGENTS.md` (both, identically): admin-panel rule line ("member
    management lives at /admin — never build your own member CRUD; never edit
    app/api/admin/*"), db lines now describe DATABASE_URL + `lib/db.ts` `query()` (keep
    inside `<!-- IF:db -->`). Keep placeholders/IF markers intact (they render at zip time).
    Update `docs/building.md` examples if they referenced /team.
C5. Verify: `npm run build` clean; with `AUTH_DEV_BYPASS=1` the admin page renders (dev user
    is owner); `npm run doctor` still green.

## Integration (main session, after all three)

1. Restart auth service → verify invite-only (fresh email 403s with the admin-invite message).
2. Portal /admin: invite a builder; builder logs in; non-invited rejected.
3. Full E2E with `db` module: create → Postgres provisioned → zip has DATABASE_URL →
   local `psql`/query works → deploy → deployed app queries the same DB → project admin
   panel invites a member end-to-end (auth-service-backed) → remove revokes for real.
4. Teardown deletes the database too.
5. Screenshot-level UI sanity on portal + a generated app (dark/sharp/no purple).
6. Commit + push (user pre-authorized pattern; confirm first if unclear).

## Out of scope (unchanged)

The Brain/Cerebro, hosting Epic 4 execution (still blocked on domain/server), mailer creds,
registry GC, secret encryption at rest.
