import { requireUser } from '@/lib/auth';
import { Card, CardTitle } from '@/components/ui/card';

const STATS = [
  { label: 'Active users', value: '128' },
  { label: 'Requests today', value: '4,302' },
  { label: 'Uptime', value: '99.98%' },
];

export default async function DashboardHome() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Welcome back, {user.email}</h1>
        <p className="text-sm text-muted">Here&apos;s what&apos;s happening in your project.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <CardTitle>{stat.label}</CardTitle>
            <p className="mt-2 text-2xl font-semibold text-foreground">{stat.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
