# Troubleshooting

Written for someone who has never used a terminal before. If your AI agent set this project up
for you, these are the things it won't think to explain.

## "The terminal must stay open"

When you run `npm run dev` (or `npm run deploy`), the terminal window is now *running* your app —
it's not done, it's working. Don't close the window or press Ctrl+C unless you want to stop it.
You can open a second terminal tab/window to run other commands while it's running.

## "It froze" — it didn't

After `npm run dev`, you'll see a message like `Ready in 900ms` and then... nothing. That's
correct. The terminal isn't frozen, it's sitting there serving your app. Leave it running and open
your browser instead.

## What is `localhost:3000`?

It's your own computer, not the internet. `npm run dev` starts a copy of your app that only your
machine can see, at the address `http://localhost:3000` — open that in your browser to look at
it. Nobody else can visit that link; for that you need `npm run deploy` (see `docs/deploy.md`),
which gives you a real URL anyone can open.

## `npm WARN ...` lines are normal

You'll see yellow `npm WARN` lines during `npm install` — these are advisory, not errors. Only
worry if the command ends with an `npm ERR!` line and a non-zero exit, in which case the install
did not finish. Re-running `npm install` is safe.

## `command not found: npm`

This means Node.js isn't installed on your computer. Go to
[nodejs.org](https://nodejs.org), download the **LTS** version (20 or newer), install it, then
open a **new** terminal window (the old one won't pick up the change) and try again. Confirm it
worked with:

```bash
node --version
```

You want to see `v20` or higher. `npm run doctor` checks this for you too.

## Where does the OTP come from?

When you log in to your deployed app (or the Viper portal), you enter your `@airtribe.live`
email, then a one-time passcode (OTP) — a short code emailed to you. Check your inbox (and spam
folder) for an email from Viper; enter the code within its validity window. If you never receive
one, ask the platform admin — it usually means the mail service is misconfigured, not something
wrong on your end.

## Still stuck?

Run `npm run doctor` — it checks the four things most likely to be wrong (Node version, your
`.env.local` file, `viper.json`, and whether the Viper portal is reachable) and prints exactly
what to fix. If it's all green and you're still stuck, that's when to ask a human.
