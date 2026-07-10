# Deploy

```bash
npm run deploy
```

## What it does

`scripts/deploy.mjs` runs entirely on your machine — no git, no Docker, no login step:

1. Reads `viper.json` (project id, subdomain, Viper portal URL) and `VIPER_DEPLOY_TOKEN` from
   `.env.local`.
2. Tars the project (`tar -czf`), excluding `node_modules`, `.next`, `.git`, and any
   `.env*.local` file — secrets never leave your machine in the archive.
3. POSTs the tarball to `{VIPER_URL}/api/deploy` with your deploy token.
4. The portal builds a Docker image from your code, pushes it, and deploys it. It streams status
   lines back as they happen; the CLI prints each one as it arrives.
5. On success, the last line is the live URL — your app is now at `http://<subdomain>.<domain>`.

If this is the project's first-ever deploy, the portal also provisions the hosting app behind the
scenes — expect the first deploy to take longer than later ones.

## Reading the streamed output

Each printed line is a status update (packing, building, deploying, health-checking). This is
normal — deploys take a minute or two. The terminal must stay open until you see either the final
`Deployed: <url>` line or an error. If you close the terminal mid-deploy, the deploy itself may
still finish server-side, but you won't see the result — just re-run `npm run deploy` if unsure.

## When it fails

Run `npm run doctor` first — it catches the most common causes (wrong Node version, missing
`.env.local`, unreachable portal) before you dig further. Then match the failure to one of these:

**Build error in your code.** The stream includes the Docker build log. Look for the compiler
lines — TypeScript errors and failed `npm install`/`next build` steps show up here with a file and
line number. Fix that file locally, confirm `npm run build` succeeds on your machine, then
redeploy.

**Deploy failed (build succeeded, container didn't come up).** The final line includes a
`logTail` — the last ~30 lines from the running container. Look for a stack trace or a crash on
startup (commonly: a missing env var, or code that only breaks in production, e.g. relying on
`AUTH_DEV_BYPASS` which is never set in deployed containers). Fix and redeploy.

**Portal unreachable.** You'll see a network error (`Could not reach Viper at ...`) instead of any
status lines at all. This isn't something you can fix from your code — Viper itself may be down.
Tell the platform admin.

In every case, the CLI exits with a non-zero status on failure, so you can tell success from
failure even if you didn't read the whole log.
