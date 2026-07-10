import { NextRequest, NextResponse } from 'next/server';
import { requireUser, hasPermission } from '@/lib/auth';

// Server-side only: talks to the auth service with this project's client secret. The caller
// is verified with requireUser() + hasPermission('*') on every request — never trust a
// client-supplied role/email. See CLAUDE.md: never build your own member CRUD elsewhere.

async function forbidden() {
  await requireUser();
  if (await hasPermission('*')) return null;
  return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
}

/** GET /api/admin/members — list this project's members via the auth service. */
export async function GET() {
  const denied = await forbidden();
  if (denied) return denied;

  try {
    const res = await fetch(
      `${process.env.AUTH_SERVICE_URL}/projects/${process.env.PROJECT_ID}/members`,
      {
        headers: { Authorization: `Bearer ${process.env.AUTH_CLIENT_SECRET}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) throw new Error(`auth service responded ${res.status}`);
    const data = await res.json();
    return NextResponse.json({ success: true, data: data.members });
  } catch {
    // Auth service unreachable or not wired up yet — let the page show its empty state
    // instead of crashing. Not an error status: this is an expected dev-time condition.
    return NextResponse.json({ success: false, error: 'auth-unavailable' });
  }
}

/** POST /api/admin/members — invite a member, or change an existing member's role (upsert). */
export async function POST(request: NextRequest) {
  const denied = await forbidden();
  if (denied) return denied;

  const { email, role } = await request.json();
  if (!email || !role) {
    return NextResponse.json({ success: false, error: 'email and role are required' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${process.env.AUTH_SERVICE_URL}/projects/${process.env.PROJECT_ID}/members`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.AUTH_CLIENT_SECRET}`,
        },
        body: JSON.stringify({ email, role }),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: data.error || 'Could not save member' }, { status: res.status });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Auth service unavailable' }, { status: 503 });
  }
}
