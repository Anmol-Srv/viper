import { requireUser } from '@/lib/auth';
import { list } from '@/lib/db';
import { Card } from '@/components/ui/card';

export default async function DataPage() {
  const user = await requireUser();
  // Scoped to the current user — never fetch-all-then-filter. See docs/db.md.
  const items = await list('items', { ownerEmail: user.email });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Data</h1>
        <p className="text-sm text-muted">Rows scoped to {user.email}.</p>
      </div>

      <Card>
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            No rows yet. Set INSFORGE_URL / INSFORGE_API_KEY, or insert a row for this user.
          </p>
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
