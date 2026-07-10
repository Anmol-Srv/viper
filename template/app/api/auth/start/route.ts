import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { email } = await request.json();

  const res = await fetch(`${process.env.AUTH_SERVICE_URL}/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: process.env.PROJECT_ID, email }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
