import { requireUser } from '@/lib/auth';
import { Card, CardTitle } from '@/components/ui/card';

const STATS = [
  { label: 'Active users', value: '128' },
  { label: 'Requests today', value: '4,302' },
  { label: 'Uptime', value: '99.98%' },
];

const NEXT_STEPS = [
  { label: 'Add a page or API route', doc: 'docs/building.md' },
  { label: 'Manage who can sign in', doc: '/admin' },
  { label: 'Connect a database', doc: 'docs/db.md' },
];

export default async function DashboardHome() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-xl font-semibold text-foreground">Welcome back, {user.email}</h1>
        <p className="mt-1 text-sm text-muted">Here&apos;s what&apos;s happening in your project.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <CardTitle>{stat.label}</CardTitle>
            <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {stat.value}
            </p>
          </Card>
        ))}
      </div>

      <Card className="max-w-2xl">
        <CardTitle>Next steps</CardTitle>
        <ul className="mt-3 flex flex-col gap-2.5">
          {NEXT_STEPS.map((step) => (
            <li key={step.label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-foreground">{step.label}</span>
              <code className="text-xs text-muted">{step.doc}</code>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
