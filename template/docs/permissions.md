# Permissions (RBAC)

Every user has a `role` (`owner` / `member`) and a `permissions` array (`owner` gets `["*"]`,
`member` gets `["read"]`) — both returned by the auth service and available via `getUser()`.

## Key files

- `lib/permissions.ts` — re-exports `hasPermission(perm)` from `lib/auth.ts`, plus
  `assertPermission(perm)` for route handlers.
- `app/(app)/admin/page.tsx` — the live example: gated server-side on `hasPermission('*')`, with
  the API routes it calls (`app/api/admin/members/*`) gated the same way. Read it before writing
  your own gated page — don't build a second member-management page, extend this one.

## Using it

```tsx
import { hasPermission } from '@/lib/permissions';

if (!(await hasPermission('*'))) {
  return <p>You don&apos;t have access to manage this project.</p>;
}
```

In an API route, throw instead of rendering a message:

```ts
import { assertPermission } from '@/lib/permissions';

export async function POST(req: Request) {
  await assertPermission('*'); // throws if missing — catch it and return 403
  // ...
}
```

## The one rule

**Gate in the API route, not just the component.** Hiding a button or a nav link stops a casual
user, not a curious one hitting the endpoint directly with curl. Every route handler that reads or
writes sensitive data must check `hasPermission()` itself — never rely on the fact that the page
linking to it already checked.
