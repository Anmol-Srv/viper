'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

type NavItem = { href: string; label: string };
type ShellUser = { email: string; role: string } | null;

export function AppShell({
  projectName,
  nav,
  user,
  children,
}: {
  projectName: string;
  nav: NavItem[];
  user: ShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white text-xs font-bold text-black">
            {projectName.charAt(0).toUpperCase() || 'V'}
          </span>
          <span className="truncate text-sm font-semibold text-foreground">{projectName}</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-white ${
                  active
                    ? 'bg-white/10 font-medium text-foreground'
                    : 'text-muted hover:bg-white/5 hover:text-foreground'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-border px-6">
          {user && (
            <>
              <span className="text-sm text-foreground">{user.email}</span>
              <span className="rounded border border-border px-2 py-0.5 text-xs capitalize text-muted">
                {user.role}
              </span>
              <span className="h-4 w-px bg-border" />
              <button
                onClick={logout}
                disabled={loggingOut}
                className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-foreground hover:text-foreground focus:outline focus:outline-1 focus:outline-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loggingOut ? 'Logging out…' : 'Log out'}
              </button>
            </>
          )}
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
