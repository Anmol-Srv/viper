import { requireUser } from '@/lib/auth';
import { list } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

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
    <div className="flex flex-col gap-6">
      <div className="border-b border-border pb-6">
        <h1 className="text-xl font-semibold text-foreground">Data</h1>
        <p className="mt-1 text-sm text-muted">Rows scoped to {user.email}.</p>
      </div>

      {notConfigured ? (
        <EmptyState
          title="No database connected"
          description={
            <>
              Open the <strong className="text-foreground">Database</strong> tab on this project in
              Viper to get set up. See <code>docs/db.md</code>.
            </>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState title="No rows yet" description={`Nothing scoped to ${user.email} yet.`} />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <ul className="divide-y divide-border">
            {items.map((item, i) => (
              <li key={i} className="px-6 py-3 text-sm text-foreground">
                {JSON.stringify(item)}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
