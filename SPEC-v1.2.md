# SPEC v1.2 — Platform, not zip-downloader

Status: DRAFT for review · 2026-07-10
Prereq reading: `ARCHITECTURE.md`, `CONTRACT.md`, `SPEC.md` (v1.1, shipped & E2E-verified).
Direction locked by Anmol:
1. **Viper is a hosted platform** — builders get a link, log in, configure there.
2. **Zip stays** as the delivery mechanism — but the UI must teach the next steps.
3. **The scaffold ships a starting-context bundle** (.md files) so the builder's AI agent
   knows the rules, the scaffold, and how to deploy — without burning tokens re-teaching.

Persona test for every item: *Priya from sales ops, has a terminal but no git/deploy/auth
knowledge, an AI agent, and a link to Viper.* v1.2 is done when Priya ships and shares a
dashboard without asking a human for help.

---

## Epic 3 first — Agent context bundle (cheapest, highest leverage)

The scaffold currently has `docs/{auth,permissions,db}.md` but NO agent-entry file — the
builder's AI starts blind and reinvents auth / ignores the design system.

**3.1 `CLAUDE.md` at scaffold root** (auto-read by Claude Code). Content contract:
- What this project is (one paragraph, injected per-project: name, subdomain, modules, live URL).
- **The Rules** (hard constraints, imperative voice):
  - NEVER edit `middleware.ts`, `lib/auth.ts`, `app/api/auth/*` — auth is platform-managed.
  - Every data-returning API route/page MUST call `requireUser()` and scope results to that
    user server-side. No fetch-all-then-filter. Gate with `hasPermission()` in the route,
    not just the component.
  - Build UI from `components/ui/*` and the tokens in `globals.css`; don't invent new
    design primitives.
  - Read `docs/building.md` before the first change; `docs/deploy.md` before deploying.
- Map of the scaffold (folders, where new pages/routes/components go).
**3.2 `AGENTS.md`** — identical content (generated from the same source at zipgen time) so
Cursor/Codex/other agents get it; plus `.cursorrules` that says "read AGENTS.md".
**3.3 New docs:**
- `docs/building.md` — how to add a page / API route / component *the Viper way*, each with
  a complete copy-paste example that follows the security grain.
- `docs/deploy.md` — what `npm run deploy` does, what the output means, common failures and
  what to do (portal down / build error / not logged in to nothing — there's no login).
- `docs/troubleshooting.md` — the non-tech landmines: "terminal must stay open", "what
  localhost:3000 is", "npm WARN is normal", "command not found: npm → install Node 20 from
  nodejs.org", "the OTP is emailed to you".
**3.4 zipgen injection** — `CLAUDE.md`/`AGENTS.md` are templates; zipgen fills project name,
subdomain, chosen modules (drop rule-lines for absent modules), and live URL.

## Epic 1 — Multi-user hosted portal

**1.1 Gate Viper itself with its own auth service (dogfood).**
- Seed a special `viper` project in the auth service at startup (idempotent).
- Add `open_enrollment` boolean to the auth service `projects` table (default false, true
  for the `viper` project): when true, any `@airtribe.live` email may OTP-login and is
  auto-enrolled as `member` on first verify. (This is how builders self-serve onto the
  platform without an invite.)
- Portal gets `/login` (same two-step OTP UX as the template) + middleware; session cookie
  `viper_portal_session`, verified server-side via `/session/check`.
**1.2 Ownership from session, not form.** Remove the "Owner email" input; `ownerEmail` =
logged-in user. `GET /api/projects` returns only projects where the user is owner or member.
(Keep an `?all=1` variant gated to a `platform-admin` role for Anmol.)
**1.3 Members UI.** On the project detail page (1.5): list members+roles, invite by email
(role picker: owner/member), remove member. Portal calls the auth service server-side with
`x-viper-admin`; only the project owner sees/uses this panel.
**1.4 Real email OTP (blocks everything multi-user).**
- Auth service: pluggable mailer — `sendOtp(email, otp)`; transport from env
  (`SMTP_URL` or `POSTMARK_TOKEN`; reuse mycohort's Postmark account/creds).
- Behavior: if transport configured → send email, never return `devOtp`; else keep current
  console+devOtp behavior (dev mode). `NODE_ENV=production` + no transport = refuse to
  start (fail loud, not silently broken logins).
**1.5 Project detail page** (`/projects/[subdomain]`): live URL + status, deploy history
(tag + time — extend the store record to keep the last N deploys), re-download zip,
Getting-Started tab (Epic 2 content), Members panel (1.3), Danger zone (1.6).
**1.6 Teardown.** Delete project: Coolify `DELETE /api/v1/applications/{uuid}` → auth
service `DELETE /projects/:id` (new, admin-key-guarded) → remove from store + delete zip.
Confirm-typing-the-subdomain UX. (Registry image GC stays out of scope — note it.)

## Epic 2 — Onboarding UX (the zip learns to explain itself)

**2.1 Post-create panel becomes a real "next steps" walkthrough**, personalized:
- Prereq check line: "You need Node 20+ — check with `node --version`, install from
  nodejs.org" (link).
- Copy-paste block with *their* filenames: `cd ~/Downloads && unzip <sub>.zip -d <sub> && cd <sub> && npm install && npm run dev`.
- **Copyable starter prompt** for their AI agent, e.g.: *"You're working in a Viper scaffold.
  Read CLAUDE.md and docs/building.md first and follow The Rules exactly. Then help me
  build: <describe your dashboard>."*
- "When you're ready: `npm run deploy` — your app goes live at http://<sub>.<domain>,
  teammates you invite can log in with their @airtribe.live email."
**2.2 Same content persists** on the project detail page (Getting Started tab) — the
post-create panel is not the only chance to see it.
**2.3 Template `npm run doctor`** — one script: Node ≥20? `.env.local` present? `viper.json`
intact? portal reachable (`VIPER_URL/api/health` — add that trivial endpoint)? Prints ✓/✗
with a one-line fix per ✗. README/docs point to it as the first move when anything fails.
**2.4 Human-readable deploy failures.** The NDJSON stream already carries build lines; on
failure the portal additionally fetches the app's last ~30 log lines from Coolify
(`GET /applications/{uuid}/logs`) and emits a final
`{"ok":false,"error":...,"hint":...,"logTail":[...]}`. The CLI prints the hint prominently.
Map the 3 common cases: docker build failed (show the compile error lines), deploy failed
(show container log tail), portal unreachable (say "ask the platform admin — Viper may be down").

## Epic 4 — Host Viper itself (ops + small code)

**4.1 Containerize portal + auth service** (Dockerfiles; auth svc data = SQLite file on a
volume; portal store/output on a volume). Deploy both as Coolify apps on the server.
- ⚠ The portal builds Docker images: its container needs the host Docker socket mounted
  (`/var/run/docker.sock`) and env `DOCKER_CONTEXT=default`. Flag this in the Coolify app
  config; it is the one privileged piece — document it.
**4.2 Server + domain (ops, decisions #2/#3 below):** Ubuntu box → official Coolify
installer (all five colima workarounds vanish) → wildcard DNS `*.<domain>` → Coolify/
Traefik + Let's Encrypt → `VIPER_DOMAIN_SCHEME=https` (the `COOKIE_SECURE` path already
handles this).
**4.3 Config flip summary** (one table in the migration runbook): `AUTH_SERVICE_URL`
(public), `VIPER_URL` (public), `VIPER_BASE_DOMAIN`, scheme, mailer creds, admin key,
Coolify token minted on the server instance.
**4.4 Migration runbook** — laptop → server: export nothing (fresh start is fine; test
projects stay on the laptop), reseed, smoke-test with one real project.

## Build order & why

1. **Epic 3** (agent context) — pure content + zipgen wiring; kills the token-burn/context
   problem for every builder from the next zip onward. No dependencies.
2. **Epic 1.4** (email OTP) — the single hardest blocker for anyone-but-Anmol using it.
3. **Epic 1.1–1.3, 1.5–1.6** (multi-user portal) — depends on 1.4 to be meaningful.
4. **Epic 2** (onboarding UX) — depends on 1.5 (detail page) for placement; content can be
   drafted alongside Epic 3.
5. **Epic 4** (hosting) — last, once the platform is worth pointing a domain at. Pure ops
   plus two Dockerfiles.

## Open decisions (need Anmol)

1. **Mailer**: reuse mycohort Postmark (fastest, shared quota) vs separate SMTP account?
2. **Domain**: what's the wildcard base — `*.tools.airtribe.live`? Who controls DNS?
3. **Server**: existing capacity vs new VPS (2 vCPU/4GB is plenty to start)?
4. **Portal enrollment**: auto-enroll any `@airtribe.live` (proposed) vs invite-only platform?
5. **Platform admin**: just Anmol (`platform-admin` role hardcoded seed) — confirm.

## Explicitly out of scope for v1.2

The Brain/Cerebro (company-data MCP + context skills — this spec's Epic 3 is *scaffold*
context, not *company* context), registry GC, clientSecret encryption at rest, scoped
Coolify token, in-browser IDE / chat-to-build, multiple design themes, Insforge real
provisioning (db module stays a stub), Windows-specific onboarding docs.

## Definition of done (Priya test, end to end)

1. Priya gets a link → logs in with her email (real OTP email) → creates "Pipeline Board".
2. Post-create screen tells her exactly what to install and paste; she runs it.
3. Her AI agent reads `CLAUDE.md`, builds a dashboard *within the design system, without
   touching auth*, using `docs/building.md` patterns.
4. `npm run deploy` → live URL; a deliberate syntax error produces a failure message she
   can act on (`npm run doctor` + the hint line).
5. She opens the project page, invites a teammate; the teammate OTP-logs-in via email and
   sees the dashboard. Nobody Slacks Anmol.
