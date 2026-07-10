# Viper Project Template

A Next.js 15 (App Router) + TypeScript + Tailwind starter with auth, permissions, and a database
client pre-wired. Fork it, build your internal dashboard on top.

> **AI agent working here?** Read [`CLAUDE.md`](CLAUDE.md) (or `AGENTS.md`) first — it has The
> Rules and a map of this scaffold. **Something broken?** Run `npm run doctor` first — see
> [`docs/troubleshooting.md`](docs/troubleshooting.md).

## Quick start

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. With `AUTH_DEV_BYPASS=1` (the default in `.env.local.example`) there's
no login wall — you're signed in as `dev@airtribe.live` (role `owner`, all permissions).

## How modules work

`viper.json` lists which modules this project has (`auth` is always on). `app/(app)/layout.tsx`
reads that list and only shows nav links for modules that are present. The Viper portal deletes a
module's files at zip time if it wasn't selected — see `viper.modules.json` for exactly what
belongs to each module, and the guide for how to use what's left:

- [`docs/auth.md`](docs/auth.md) — sessions, `getUser()` / `requireUser()`
- [`docs/permissions.md`](docs/permissions.md) — RBAC, `hasPermission()`
- [`docs/db.md`](docs/db.md) — Insforge client, scoped queries

## Deploy

```bash
npm run deploy
```

Tars the project (minus `node_modules` / `.next` / `.git`) and POSTs it to your Viper portal.
Needs `VIPER_DEPLOY_TOKEN` set in `.env.local`.
