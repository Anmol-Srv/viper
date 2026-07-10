import { NextRequest, NextResponse } from 'next/server';
import { requireUser, hasPermission } from '@/lib/auth';

/** DELETE /api/admin/members/:email — revoke a member via the auth service. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  await requireUser();
  if (!(await hasPermission('*'))) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const { email } = await params;

  try {
    const res = await fetch(
      `${process.env.AUTH_SERVICE_URL}/projects/${process.env.PROJECT_ID}/members/${encodeURIComponent(email)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${process.env.AUTH_CLIENT_SECRET}` },
      },
    );
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: data.error || 'Could not remove member' }, { status: res.status });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Auth service unavailable' }, { status: 503 });
  }
}
