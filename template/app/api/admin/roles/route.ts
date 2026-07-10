import { NextRequest, NextResponse } from 'next/server';
import { requireUser, hasPermission } from '@/lib/auth';

// Server-side only: talks to the auth service with this project's client secret. The caller
// is verified with requireUser() + hasPermission('*') on every request — never trust a
// client-supplied role/permission list. See CLAUDE.md: never build your own member/role CRUD
// elsewhere.

async function forbidden() {
  await requireUser();
  if (await hasPermission('*')) return null;
  return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
}

/** GET /api/admin/roles — list this project's roles via the auth service. */
export async function GET() {
  const denied = await forbidden();
  if (denied) return denied;

  try {
    const res = await fetch(`${process.env.AUTH_SERVICE_URL}/projects/${process.env.PROJECT_ID}/roles`, {
      headers: { Authorization: `Bearer ${process.env.AUTH_CLIENT_SECRET}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`auth service responded ${res.status}`);
    const data = await res.json();
    return NextResponse.json({ success: true, data: data.roles });
  } catch {
    // Auth service unreachable or not wired up yet — let the page show its empty state
    // instead of crashing. Not an error status: this is an expected dev-time condition.
    return NextResponse.json({ success: false, error: 'auth-unavailable' });
  }
}

/** POST /api/admin/roles — create a new role. */
export async function POST(request: NextRequest) {
  const denied = await forbidden();
  if (denied) return denied;

  const { name, permissions } = await request.json();
  if (!name) {
    return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${process.env.AUTH_SERVICE_URL}/projects/${process.env.PROJECT_ID}/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AUTH_CLIENT_SECRET}`,
      },
      body: JSON.stringify({ name, permissions: permissions ?? [] }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: data.error || 'Could not create role' }, { status: res.status });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Auth service unavailable' }, { status: 503 });
  }
}
