# Permissions (RBAC)

Every user has a `role` (`owner`, `member`, or any custom role created in the Access manager)
and a `permissions` array resolved from that role — `owner` always gets `["*"]`. Both are
returned by the auth service and available via `getUser()`.

## Key files

- `lib/permissions.ts` — re-exports `hasPermission(perm)` from `lib/auth.ts`, plus
  `assertPermission(perm)` for route handlers.
- `app/(app)/admin/page.tsx` (nav label **Access**) — the live example: gated server-side on
  `hasPermission('*')`, with two tabs:
  - **Members** — who can sign in, and which role they hold.
  - **Roles** — the roles themselves: create or delete a role, add or remove the permission
    keys it grants.
  Every API route behind it (`app/api/admin/members/*`, `app/api/admin/roles/*`) is gated the
  same way. Read it before writing your own gated page — don't build a second member/role
  management page, extend this one.

## Using it

```tsx
import { hasPermission } from '@/lib/permissions';

if (!(await hasPermission('reports:view'))) {
  return <p>You don&apos;t have access to reports.</p>;
}
```

The two sides of that check are wired together in **Access**: open the **Roles** tab, add
`reports:view` as a permission chip on whichever role should see reports (or create a new role
for it), then assign that role to a member in the **Members** tab. The string you check with
`hasPermission()` must match the chip exactly — permission keys are free text, so pick a
convention (`resource:action`) and stick to it.

In an API route, throw instead of rendering a message:

```ts
import { assertPermission } from '@/lib/permissions';

export async function POST(req: Request) {
  await assertPermission('reports:view'); // throws if missing — catch it and return 403
  // ...
}
```

## The one rule

**Gate in the API route, not just the component.** Hiding a button or a nav link stops a casual
user, not a curious one hitting the endpoint directly with curl. Every route handler that reads or
writes sensitive data must check `hasPermission()` itself — never rely on the fact that the page
linking to it already checked.
