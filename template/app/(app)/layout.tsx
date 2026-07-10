import { getUser } from '@/lib/auth';
import viperConfig from '@/viper.json';
import { AppShell } from './app-shell';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', module: null as string | null },
  { href: '/data', label: 'Data', module: 'db' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const nav = NAV_ITEMS.filter((item) => !item.module || viperConfig.modules.includes(item.module)).map(
    ({ href, label }) => ({ href, label }),
  );
  // Admin (member management) always ships — see viper.modules.json's "auth" module — but the
  // link itself only shows to owners; the page re-checks with hasPermission('*') regardless.
  if (user?.role === 'owner') {
    nav.push({ href: '/admin', label: 'Admin' });
  }

  return (
    <AppShell projectName={viperConfig.name} nav={nav} user={user}>
      {children}
    </AppShell>
  );
}
