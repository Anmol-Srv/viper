# Database

`lib/db.ts` is a thin, provider-agnostic facade in front of this project's database. Every call
your code makes goes through `list()` / `insert()` — the concrete client (which provider, which
protocol) lives entirely inside that one file, so swapping it later is a single-file change; none
of your pages need to change.

Credentials for the database live on the **Database tab** on this project in Viper, not in code.
Until that's set up (or until you've wired the real values into `.env.local`), `list()` /
`insert()` throw a clear "Database not configured" error — `app/(app)/data/page.tsx` shows how to
catch that and render a pointer back to the Database tab instead of crashing.

## Key files

- `lib/db.ts` — `list(table, filter?)`, `insert(table, row)`.
- `app/(app)/data/page.tsx` — example: fetches rows scoped to the signed-in user, catches the
  not-configured case and renders an empty state.

## Using it

```ts
import { requireUser } from '@/lib/auth';
import { list } from '@/lib/db';

const user = await requireUser();
const rows = await list('items', { ownerEmail: user.email });
```

Wrap calls in `try`/`catch` on pages you want to keep rendering before the database is set up:

```tsx
let items: Record<string, unknown>[] = [];
let notConfigured = false;
try {
  items = await list('items', { ownerEmail: user.email });
} catch {
  notConfigured = true;
}
```

## The one rule

**Always scope queries to the current user.** Never `list('items')` and filter client-side, and
never fetch-all in a route handler that any signed-in user can hit — pass the user's email (or
project id) as a filter in the query itself, server-side, every time. Fetch-then-filter still
sends every user's rows over the wire, even if the UI hides them.
