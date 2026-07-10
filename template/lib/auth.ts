import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export type ViperUser = {
  email: string;
  role: string;
  permissions: string[];
};

const DEV_USER: ViperUser = {
  email: 'dev@airtribe.live',
  role: 'owner',
  permissions: ['*'],
};

/**
 * Returns the signed-in user, or null. Server-only (reads cookies + calls the auth service).
 * Never trust a client-supplied user object — this is the only source of truth.
 */
export async function getUser(): Promise<ViperUser | null> {
  if (process.env.AUTH_DEV_BYPASS === '1') {
    return DEV_USER;
  }

  const token = (await cookies()).get('viper_session')?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${process.env.AUTH_SERVICE_URL}/session/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AUTH_CLIENT_SECRET}`,
      },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const data = await res.json();
    return { email: data.user.email, role: data.role, permissions: data.permissions };
  } catch {
    // Auth service unreachable — fail closed.
    return null;
  }
}

/** Same as getUser(), but redirects to /login when there's no session. */
export async function requireUser(): Promise<ViperUser> {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

/** True if the signed-in user has `perm` (or the wildcard `*`). */
export async function hasPermission(perm: string): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  return user.permissions.includes('*') || user.permissions.includes(perm);
}
