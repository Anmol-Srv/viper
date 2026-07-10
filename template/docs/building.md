# Building the Viper way

Three recipes: a page, an API route, and a component. Every data-returning page/route follows the
same shape — `requireUser()` first, scope every query to that user, gate anything sensitive with
`hasPermission()` in the route itself. Copy-paste and adapt; don't reinvent the shape.

## Add a page

Pages live under `app/(app)/<name>/page.tsx` (the `(app)` group already has the sidebar + auth
gate from `app/(app)/layout.tsx`). Call `requireUser()` at the top — it redirects to `/login` if
there's no session, and gives you the user to scope queries with.

```tsx
// app/(app)/projects/page.tsx
import { requireUser } from '@/lib/auth';
import { list } from '@/lib/db';
import { Card } from '@/components/ui/card';

export default async function ProjectsPage() {
  const user = await requireUser();
  // Scoped to the current user server-side — never fetch-all-then-filter.
  const projects = await list('projects', { ownerEmail: user.email });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Projects</h1>
        <p className="text-sm text-muted">Projects owned by {user.email}.</p>
      </div>

      <Card>
        {projects.length === 0 ? (
          <p className="text-sm text-muted">No projects yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project, i) => (
              <li key={i} className="text-sm text-foreground">
                {JSON.stringify(project)}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

Then add a nav entry in `app/(app)/layout.tsx`'s `NAV_ITEMS`:

```tsx
{ href: '/projects', label: 'Projects', module: null },
```

(Use `module: 'db'` instead of `null` if the page should only show when that module is present —
see the existing `/data` entry. `/admin` is a special case: it's always in the nav for owners,
gated separately by role rather than by module — see `app/(app)/layout.tsx`.)

## Add an API route

Routes live under `app/api/<name>/route.ts`. Call `requireUser()` first; if the action is
sensitive (writes, deletes, admin-only reads), also check `hasPermission()` — **in the route**,
not just by hiding the button that calls it. A curious user can hit the endpoint with curl.

```ts
// app/api/projects/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { insert } from '@/lib/db';

export async function POST(request: NextRequest) {
  const user = await requireUser();

  if (!(await hasPermission('*'))) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const row = await insert('projects', { ...body, ownerEmail: user.email });

  return NextResponse.json({ success: true, data: row });
}
```

Notes:
- `ownerEmail: user.email` comes from the server-derived session, never from `body` — don't trust
  a client-supplied owner field.
- Response shape is `{ success: true, data: ... }` on the happy path, matching the rest of
  Airtribe's API convention.
- No `permissions` module in this project? Drop the `hasPermission` check and call
  `requireUser()` alone — every route still needs that.

## Add a component

Reusable primitives (buttons, inputs, cards, anything used on 2+ pages) go in `components/ui/`
and are built from the tokens in `app/globals.css` (`--accent`, `--border`, `--muted`, etc. —
already wired into `tailwind.config.ts` as `bg-accent`, `border-border`, `text-muted`...). One-off
page-specific pieces can live next to the page that uses them instead.

```tsx
// components/ui/badge.tsx
import { HTMLAttributes } from 'react';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'accent';
};

const VARIANTS = {
  default: 'border border-border text-muted',
  accent: 'bg-accent text-accent-foreground',
};

export function Badge({ className = '', variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
```

Use it the same way the existing `Card`/`Button`/`Input` are used — import from `@/components/ui/*`,
pass `className` to extend rather than override. Don't add a new component library or hand-roll
colors that aren't in `app/globals.css`.

## Before you start

Read `CLAUDE.md` (The Rules) if you haven't. In short: don't touch auth files, always scope to
`requireUser()`'s result, gate sensitive routes with `hasPermission()`, build from
`components/ui/*`. When you're ready to ship, read `docs/deploy.md`.
