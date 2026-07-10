# Database (Insforge)

`lib/db.ts` is a minimal REST wrapper around Insforge. It's a stub: swap in the real SDK/queries
once you know your schema. With no `INSFORGE_URL` / `INSFORGE_API_KEY` set, `list()` returns `[]`
so the app still runs in dev.

## Key files

- `lib/db.ts` — `list(table, filter?)`, `insert(table, row)`.
- `app/(app)/data/page.tsx` — example: fetches rows scoped to the signed-in user.

## Using it

```ts
import { requireUser } from '@/lib/auth';
import { list } from '@/lib/db';

const user = await requireUser();
const rows = await list('items', { ownerEmail: user.email });
```

## The one rule

**Always scope queries to the current user.** Never `list('items')` and filter client-side, and
never fetch-all in a route handler that any signed-in user can hit — pass the user's email (or
project id) as a filter in the query itself, server-side, every time. Fetch-then-filter still
sends every user's rows over the wire, even if the UI hides them.
