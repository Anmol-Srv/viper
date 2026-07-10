# Viper — High-Level Architecture (the PaaS end-state)

The product in one sentence: **an internal PaaS where a team member clicks "New project",
downloads a ready-to-build Next.js scaffold as a zip, builds locally with their AI, and runs
one `deploy` command to get a live, company-SSO-gated URL — with Coolify as the invisible
infra engine underneath.**

Read together with: `CONTRACT.md` (integration contract) · `SPEC.md` (exact remaining
changes) · `README.md` (run instructions). This doc is the map; SPEC is the work.

---

## 1. The system

```
                                   THE PRODUCT (what users see)
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                     │
│   VIPER PORTAL  :3400                          BUILDER'S LAPTOP                     │
│   ┌──────────────────────────┐                 ┌──────────────────────────┐         │
│   │ • New project (name +    │    zip          │ unzipped scaffold        │         │
│   │   subdomain + modules)   │ ──────────────▶ │ • npm run dev            │         │
│   │ • project list + URLs    │                 │   (AUTH_DEV_BYPASS,      │         │
│   │ • zip generator          │                 │    no login wall)        │         │
│   │ • /api/deploy receiver   │ ◀────────────── │ • npm run deploy         │         │
│   └────────────┬─────────────┘   tarball+token └──────────────────────────┘         │
│                │                                                                    │
└────────────────┼────────────────────────────────────────────────────────────────────┘
                 │ orchestrates (server-side only; users never see below this line)
     ┌───────────┼──────────────────────┬───────────────────────────┐
     ▼           ▼                      ▼                           ▼
┌──────────┐ ┌────────────┐  ┌──────────────────────┐  ┌─────────────────────────┐
│ AUTH SVC │ │ ZIP-GEN    │  │ IMAGE PIPELINE       │  │ COOLIFY (headless PaaS) │
│  :4000   │ │ template − │  │ docker build+push on │  │ • dockerimage apps      │
│ projects │ │ unpicked   │  │ VM dockerd via       │  │ • env/secrets injection │
│ members  │ │ modules +  │  │ context colima-      │  │ • Traefik routing :80   │
│ roles    │ │ viper.json │  │ coolify → registry   │  │ • start/stop/logs       │
│ perms    │ │ + guides   │  │ localhost:5000 (VM)  │  │ • one container per app │
│ OTP+JWT  │ └────────────┘  └──────────────────────┘  └────────────┬────────────┘
└────┬─────┘                                                        │ runs
     │  session/check (server-side, every request)                  ▼
     │                                              ┌───────────────────────────────┐
     └───────────────◀──────────────────────────────│ project-a  project-b  proj-c  │
        deployed apps validate sessions             │  containers, each:            │
        against the central auth service            │  auth middleware ON, secrets  │
        (http://192.168.5.2:4000 from VM)           │  from env, own subdomain      │
                                                    │  http://<sub>.127.0.0.1       │
                                                    │        .sslip.io              │
                                                    └───────────────────────────────┘
```

**The line that matters:** everything below the portal is invisible to users. Coolify's
dashboard exists but is operator-only and rarely needed; Viper drives it 100% via REST API.

## 2. The golden path (end-state UX)

```
 CREATE                          BUILD                         DEPLOY
 ──────                          ─────                         ──────
 1. open viper portal            4. unzip, open in editor      7. npm run deploy
 2. name + subdomain +           5. npm install && npm run dev  8. CLI tars source → POST
    toggle modules                  (dev bypass = no login)        to portal with token
 3. download <sub>.zip           6. build with AI against       9. portal: scrub → docker
    (auth+design+modules            docs/*.md guides               build on VM → push →
     pre-wired, token inside)                                      Coolify create/patch app
                                                               10. Coolify pulls image, runs
                                                                   container, Traefik routes
                                                               11. CLI prints live URL
 ACCESS
 ──────
 12. teammate opens http://<sub>.127.0.0.1.sslip.io
 13. middleware → /login → email OTP (@airtribe.live, must be an invited member)
 14. session cookie → every request re-validated server-side → role-scoped data only
```

Time budget for the whole loop (create → live): **under 15 minutes**, most of it npm install.

## 3. Component responsibilities (one line each)

| Component | Owns | Never does |
|---|---|---|
| **Portal** (`apps/portal`) | create/list projects, zip-gen, deploy pipeline, Coolify API calls | store plaintext tokens in responses; expose Coolify to users |
| **Auth service** (`services/auth`) | identity, membership, roles/perms, OTP, session verification | per-app business logic; storing app data |
| **Template** (`template/`) | secure-by-default scaffold: middleware, `lib/auth`, design system, module docs, deploy CLI | its own auth implementation; secrets in code |
| **Coolify** (colima VM) | build-image pull, container lifecycle, env injection, Traefik routing, logs | user-facing anything |
| **Registry** (`viper-registry` in VM) | holds Viper-built images for Coolify to pull | external exposure |

## 4. Project lifecycle (state machine)

```
                    create (portal)
                         │
                         ▼
   ┌────────── PROVISIONED ─────────────┐   auth project + roles seeded,
   │  zip downloadable · no infra yet   │   deploy token minted, record stored
   └────────────────┬───────────────────┘
                    │ first `npm run deploy`
                    ▼
   ┌────────── DEPLOYED ────────────────┐   image built+pushed, Coolify app created
   │  live URL · env injected · gated   │   with env (incl. AUTH_CLIENT_SECRET),
   └────────────────┬───────────────────┘   appUuid+url saved to record
                    │ subsequent deploys
                    ▼
   ┌────────── UPDATED ─────────────────┐   new immutable tag → PATCH app tag →
   │  same URL, new image tag           │   POST /deploy → poll to terminal state
   └────────────────────────────────────┘
   (future: STOPPED / ARCHIVED via portal → Coolify stop/delete APIs — not in v1.1)
```

## 5. Security model (the invariants, unchanged from day one)

1. **Login locked to `@airtribe.live`** + explicit membership. Never auto-provisioned.
2. **Server-side enforcement only**: deployed apps validate every request via
   `POST /session/check`; `hasPermission` gates API routes, not just UI. The
   fetch-all-then-filter pattern (the HRMS grievance leak) is off the template's grain.
3. **Secrets never in the zip or image**: zip carries only a scoped revocable deploy token;
   `AUTH_CLIENT_SECRET` and friends exist solely in Coolify-injected container env.
   `.env.local` is excluded from tarball AND image (`.dockerignore` + CLI exclude + server scrub).
4. **Token scoping**: a session token only validates against its own project's client
   secret (cross-project theft rejected — covered in `smoke.cjs`).
5. **Isolation**: one container per project; per-project env; blast radius = that project.

## 6. Where we are → what remains (gap to the golden path)

| # | Milestone | State |
|---|---|---|
| 1 | Portal: create → provision → module-stripped zip → download | ✅ DONE, e2e-verified |
| 2 | Auth service (multi-tenant RBAC + OTP + session/check) | ✅ DONE, smoke-tested |
| 3 | Template (secure scaffold, builds clean incl. stripped variants) | ✅ DONE |
| 4 | Deploy CLI → portal receive + token validation | ✅ DONE (field-name fix in) |
| 5 | Coolify engine installed, server validated, Traefik live | ✅ DONE (4 macOS bugs fixed) |
| 6 | **Viper ⇄ Coolify link (API token)** | ⏳ user runs `infra/connect-coolify.sh` |
| 7 | **Registry + image pipeline + dockerimage app create/patch/deploy** | 📋 SPEC §3.4-3.6, 3.11 |
| 8 | **Template packaging fixes** (HOSTNAME, tar excludes, viper.json name) | 📋 SPEC §3.7-3.9 |
| 9 | **Secret rotation + lazy app creation** (heals existing projects) | 📋 SPEC §3.1-3.3 |
| 10 | E2E verification (create→deploy→login→redeploy + security checks) | 📋 SPEC §5 |

**Definition of "final product v1.1" = rows 6-10 green.** Every item in 7-9 is specced
file-by-file in `SPEC.md`; there are no unresolved design decisions on this path.

## 7. Scale-out path (after the laptop, unchanged design)

The laptop is a stand-in for a real server. Moving to production infra changes **zero
product code** — only operator config:

1. **Linux box/VPS** → Coolify's normal installer (all 4 macOS workarounds disappear).
2. **Real domain** (`*.tools.airtribe.live`) → Traefik + Let's Encrypt replace sslip/http.
3. **Auth engine swap** → Insforge/Keycloak behind the same `services/auth` routes; real
   email OTP replaces console OTP.
4. **Portal gets gated** by its own auth service (dogfood) before leaving the laptop.
5. Registry gains GC; Coolify projects per department if wanted.

v2 ("the Brain": scoped company-data MCP + context skills — Cerebro) stacks on top without
touching this layer; per-project scoped tokens are already the shape it needs.
