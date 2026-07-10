import { requireUser, hasPermission } from '@/lib/auth';
import { Card } from '@/components/ui/card';

// Hardcoded for the template — wire this up to real membership data (e.g. via lib/db.ts)
// once the project needs it.
const MEMBERS = [
  { email: 'dev@airtribe.live', role: 'owner' },
  { email: 'teammate1@airtribe.live', role: 'member' },
  { email: 'teammate2@airtribe.live', role: 'member' },
];

export default async function TeamPage() {
  await requireUser();
  const canManage = await hasPermission('*');

  if (!canManage) {
    return (
      <div>
        <h1 className="mb-2 text-xl font-semibold text-foreground">Team</h1>
        <p className="text-sm text-muted">You don&apos;t have access to manage the team.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">Team</h1>
      <Card>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="py-2 font-medium">Email</th>
              <th className="py-2 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {MEMBERS.map((member) => (
              <tr key={member.email} className="border-b border-border last:border-0">
                <td className="py-2 text-foreground">{member.email}</td>
                <td className="py-2 capitalize text-muted">{member.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
