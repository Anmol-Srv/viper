import Link from 'next/link';
import { getUser } from '@/lib/auth';
import viperConfig from '@/viper.json';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', module: null as string | null },
  { href: '/team', label: 'Team', module: 'permissions' },
  { href: '/data', label: 'Data', module: 'db' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const nav = NAV_ITEMS.filter((item) => !item.module || viperConfig.modules.includes(item.module));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface p-4">
        <div className="mb-6 px-2 text-sm font-semibold text-foreground">{viperConfig.name}</div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 text-sm text-muted transition-colors hover:bg-white hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-border px-6 py-3">
          {user && (
            <>
              <span className="text-sm text-foreground">{user.email}</span>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted">
                {user.role}
              </span>
            </>
          )}
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
