import { NextRequest, NextResponse } from 'next/server';
import { requireUser, hasPermission } from '@/lib/auth';

async function forbidden() {
  await requireUser();
  if (await hasPermission('*')) return null;
  return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
}

/** PUT /api/admin/roles/:name — replace a role's permission list. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const denied = await forbidden();
  if (denied) return denied;

  const { name } = await params;
  const { permissions } = await request.json();
  if (!Array.isArray(permissions)) {
    return NextResponse.json({ success: false, error: 'permissions must be an array' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${process.env.AUTH_SERVICE_URL}/projects/${process.env.PROJECT_ID}/roles/${encodeURIComponent(name)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.AUTH_CLIENT_SECRET}`,
        },
        body: JSON.stringify({ permissions }),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: data.error || 'Could not update role' }, { status: res.status });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Auth service unavailable' }, { status: 503 });
  }
}

/** DELETE /api/admin/roles/:name — delete a role (auth service rejects seed roles / roles in use). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const denied = await forbidden();
  if (denied) return denied;

  const { name } = await params;

  try {
    const res = await fetch(
      `${process.env.AUTH_SERVICE_URL}/projects/${process.env.PROJECT_ID}/roles/${encodeURIComponent(name)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.AUTH_CLIENT_SECRET}` },
      },
    );
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: data.error || 'Could not delete role' }, { status: res.status });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Auth service unavailable' }, { status: 503 });
  }
}
