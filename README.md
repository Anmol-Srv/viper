# Viper — internal builder platform (v1)

Replit-meets-Vercel for Airtribe's internal builders. Create a project, pick modules,
download a **ready-to-build zip** with company SSO + permissions + design already wired,
build it locally, and `deploy` it to a gated URL. Hosting is **Coolify** on this
laptop-as-server. This is the v1 "Body" — the company-data/context "Brain" (MCP + skills)
is a later phase.

## Layout

```
viper/
  CONTRACT.md          fixed integration contract (ports, auth API, module manifest, env)
  services/auth/       shared auth + permissions service (multi-tenant, per-project RBAC)
  apps/portal/         the Viper portal — create project, list modules, deliver zip, deploy-receive
  template/            the Next.js scaffold that becomes the zip (auth + design pre-wired)
  infra/               setup-coolify.sh — stand up Coolify on this laptop (colima VM)
  scripts/dev.sh       run auth + portal together
```

## Ports

| Service | URL |
|---|---|
| Auth service | http://localhost:4000 |
| Viper portal | http://localhost:3400 |
| Coolify dashboard | http://localhost:8000 |
| A generated project (local dev) | http://localhost:3000 |

(3300 is dr-doom's — Viper's portal uses 3400.)

## Run it

```bash
# 1. auth service
cd services/auth && npm install && npm start        # :4000  (OTP prints to this console in dev)

# 2. portal  (new terminal)
cd apps/portal && cp .env.example .env.local && npm install && npm run dev   # :3400

# or both at once:
bash scripts/dev.sh
```

Open http://localhost:3400 → create a project → download the zip → then in the unzipped folder:

```bash
npm install && npm run dev     # runs with AUTH_DEV_BYPASS=1 — no login wall locally
npm run deploy                 # ships it to Coolify (once infra is set up)
```

## How it fits together

1. **Portal** takes name + subdomain + module toggles.
2. It provisions identity in the **auth service** (`projects`/`members`/`roles`/`permissions`,
   owner seeded), mints a scoped **deploy token**, and — if Coolify is connected — creates the
   Coolify app and injects secrets there.
3. It generates the **zip**: the template minus un-selected modules, plus `viper.json` and a
   ready-to-run `.env.local`. **Secrets never go in the zip** — only a revocable deploy token.
4. The builder builds locally and runs `npm run deploy`, which uploads the source to the portal's
   `/api/deploy`; the portal hands off to Coolify to build + host. No git/Docker on their machine.

## Security invariants (why this beats "Google Sheets + free Vercel")

- Login is **hard-locked to `@airtribe.live`**; non-members are denied, never auto-provisioned.
- Authz is **server-side**: the template's `hasPermission` gates API routes, and example data
  fetches are scoped to the current user — the fetch-all-then-filter grievance-leak pattern is
  off the template's grain.
- A session token is only valid when checked with **its own project's** client secret (proven in
  `services/auth/smoke.cjs`).
- Client secrets live only in Coolify env; the zip carries a scoped, revocable deploy token.

## Infra (Coolify)

Coolify is Linux-native, so on macOS it runs inside a colima VM. `bash infra/setup-coolify.sh`
installs it and prints the dashboard URL. One-time web onboarding creates the root user + an API
token; put `COOLIFY_URL` + `COOLIFY_TOKEN` in `apps/portal/.env.local` and the portal starts
provisioning real infra. No domain needed — Coolify issues free `*.sslip.io` URLs.

## What's intentionally minimal (v1)

- Auth engine = JWT + console OTP (the swappable "dev" engine); prod swaps Insforge/Keycloak
  behind the same routes. `// ponytail` in `services/auth/server.js`.
- Project registry = a JSON file (`apps/portal/data/projects.json`), not a DB.
- `/api/deploy` receives + validates the source and triggers Coolify; committing the exact
  received tree to a per-project git repo is the next wiring step.
- One design theme; no manage/invite UI yet (roles are seeded, API exists).
