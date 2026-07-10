# {{PROJECT_NAME}}

This is a **Viper** scaffold: a Next.js 15 (App Router) + TypeScript + Tailwind app with auth
(and, if selected, permissions and a database client) pre-wired by the Viper platform. Subdomain
`{{SUBDOMAIN}}`, modules: `{{MODULES_LIST}}`. Once deployed (`npm run deploy`), it's live at
{{LIVE_URL}}. You are an AI agent working in this repo — read this file fully before making any
change.

## The Rules

These are hard constraints, not suggestions. Breaking them breaks auth for every user of this app.

1. **Never edit `middleware.ts`, `lib/auth.ts`, `app/api/auth/*`, or `app/api/admin/*`.** Auth and
   member management are platform-managed — the Viper portal and auth service own this contract.
   If something here seems wrong, work around it in your own code; don't patch it.
2. **Member management lives at `/admin`.** Never build your own member CRUD elsewhere in the
   app — it's owner-only, already wired to the auth service, and shipped with every project. Need
   more than email/role/status? Extend the admin panel, don't duplicate it.
3. **Every data-returning API route or page MUST call `requireUser()`** (from `lib/auth.ts`) and
   scope its results to that user **server-side**. Never fetch all rows and filter in the
   component — query with the user's identity as a filter from the start.
<!-- IF:permissions -->
4. **Gate with `hasPermission()` in the route handler, not just the component.** Hiding a button
   stops a casual user, not someone hitting the endpoint directly. Every route that reads or
   writes sensitive data checks permissions itself — see `lib/permissions.ts`.
<!-- /IF:permissions -->
5. **Build UI from `components/ui/*` and the tokens in `app/globals.css`.** Don't invent new
   buttons, cards, or color values — extend what's there. If you need a variant, add it to the
   existing component.
6. **Read `docs/building.md` before your first change.** Read `docs/deploy.md` before running
   `npm run deploy`.

## Scaffold map

```
app/
  (app)/            signed-in area — layout.tsx renders the sidebar nav from viper.json.modules
    page.tsx         dashboard home (example: requireUser() + stat cards)
    admin/page.tsx   member management — owner-only, backed by app/api/admin/*; never touch
                     either, see docs/permissions.md for how it uses hasPermission()
<!-- IF:db -->
    data/page.tsx    example: rows scoped to the signed-in user via lib/db.ts
<!-- /IF:db -->
  api/auth/          login/OTP/logout routes — platform-managed, do not touch
  api/admin/         member list/invite/remove routes — calls the auth service, do not touch
  login/             the login page — platform-managed, do not touch
lib/
  auth.ts            getUser() / requireUser() / hasPermission() — do not touch
<!-- IF:permissions -->
  permissions.ts     hasPermission() re-export + assertPermission() for route handlers
<!-- /IF:permissions -->
<!-- IF:db -->
  db.ts              minimal Insforge REST wrapper — list() / insert()
<!-- /IF:db -->
components/ui/       Button, Card, Input — your design system, build new pages from these
middleware.ts        redirects unauthenticated requests to /login — do not touch
docs/                building.md, deploy.md, troubleshooting.md, plus one guide per module
scripts/
  deploy.mjs         npm run deploy — tars the project and ships it to the Viper portal
  doctor.mjs         npm run doctor — environment sanity check, run this first when stuck
viper.json           project config written by the Viper portal (name, subdomain, modules) —
                     read from, don't hand-edit; the portal regenerates it
```

**New page**: add a folder under `app/(app)/`, add its nav entry to `NAV_ITEMS` in
`app/(app)/layout.tsx` (gate it on a module name if it should only show when that module is
present). **New API route**: add `route.ts` under `app/api/`. **New component**: add it to
`components/ui/` if it's a reusable primitive, otherwise colocate it with the page that uses it.
Full examples of all three: `docs/building.md`.

## Where to look next

- `docs/building.md` — how to add a page, API route, or component the Viper way, with working
  examples.
- `docs/deploy.md` — what `npm run deploy` does and how to read its output.
- `docs/troubleshooting.md` — terminal/Node basics if you're new to this.
<!-- IF:permissions -->
- `docs/permissions.md` — RBAC model and `hasPermission()` / `assertPermission()`.
<!-- /IF:permissions -->
<!-- IF:db -->
- `docs/db.md` — the Insforge client and scoped-query pattern.
<!-- /IF:db -->
- `docs/auth.md` — how sessions and `getUser()` work (read-only context; you can't change this).
