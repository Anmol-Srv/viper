import { requireUser, hasPermission } from '@/lib/auth';
import { AdminMembers } from './admin-members';

export default async function AdminPage() {
  await requireUser();
  const canManage = await hasPermission('*');

  if (!canManage) {
    return (
      <div>
        <h1 className="mb-2 text-xl font-semibold text-foreground">Admin</h1>
        <p className="text-sm text-muted">You don&apos;t have access to manage this project.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Admin</h1>
        <p className="text-sm text-muted">Manage who can sign in and build on this project.</p>
      </div>
      <AdminMembers />
    </div>
  );
}
