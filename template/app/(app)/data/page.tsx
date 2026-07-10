import { requireUser } from '@/lib/auth';
import { list } from '@/lib/db';
import { Card } from '@/components/ui/card';

export default async function DataPage() {
  const user = await requireUser();

  // Scoped to the current user — never fetch-all-then-filter. See docs/db.md.
  let items: Record<string, unknown>[] = [];
  let notConfigured = false;
  try {
    items = await list('items', { ownerEmail: user.email });
  } catch {
    notConfigured = true;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Data</h1>
        <p className="text-sm text-muted">Rows scoped to {user.email}.</p>
      </div>

      <Card>
        {notConfigured ? (
          <p className="text-sm text-muted">
            No database connected yet — open the <strong className="text-foreground">Database</strong>{' '}
            tab on this project in Viper to get set up. See <code>docs/db.md</code>.
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">No rows yet for {user.email}.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item, i) => (
              <li key={i} className="text-sm text-foreground">
                {JSON.stringify(item)}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
