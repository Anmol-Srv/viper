import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { email, otp } = await request.json();

  const res = await fetch(`${process.env.AUTH_SERVICE_URL}/session/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: process.env.PROJECT_ID, email, otp }),
  });

  const data = await res.json();
  if (!res.ok || !data.token) {
    return NextResponse.json({ ok: false, error: data.error || 'Invalid code' }, { status: res.status || 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('viper_session', data.token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure must follow the actual serving scheme, not NODE_ENV — the laptop PaaS serves
    // plain http. The portal injects COOKIE_SECURE=1 only for https deployments.
    secure: process.env.COOKIE_SECURE === '1',
    path: '/',
    maxAge: 60 * 60 * 12, // 12h — matches the auth service's session token TTL
  });
  return response;
}
