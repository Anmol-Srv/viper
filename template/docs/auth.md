# Auth

Company SSO via the Viper auth service: email → OTP → session. Login is locked to
`@airtribe.live` addresses.

## Key files

- `middleware.ts` — redirects to `/login` if there's no `viper_session` cookie (unless
  `AUTH_DEV_BYPASS=1`).
- `lib/auth.ts` — `getUser()`, `requireUser()`, `hasPermission(perm)`. Server-only.
- `app/login/page.tsx` — the email/OTP form.
- `app/api/auth/{start,verify,logout}/route.ts` — proxy to the auth service and set/clear the
  `viper_session` cookie.

## Using it

```ts
import { requireUser } from '@/lib/auth';

export default async function Page() {
  const user = await requireUser(); // redirects to /login if not signed in
  return <p>{user.email}</p>;
}
```

## The one rule

**Never trust the client.** The session token lives in an httpOnly cookie you can't read from
client JS — that's deliberate. Always call `getUser()` / `requireUser()` server-side (layout,
page, or route handler) before returning or acting on user data. Don't accept `role` or
`permissions` from a request body and trust them — always re-derive from the cookie on the server.
