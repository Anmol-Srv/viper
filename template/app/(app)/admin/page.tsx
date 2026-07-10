import { requireUser, hasPermission } from '@/lib/auth';
import { EmptyState } from '@/components/ui/empty-state';
import { AdminMembers } from './admin-members';

export default async function AdminPage() {
  await requireUser();
  const canManage = await hasPermission('*');

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <div className="border-b border-border pb-6">
          <h1 className="text-xl font-semibold text-foreground">Admin</h1>
        </div>
        <EmptyState
          title="Owner access required"
          description="Only project owners can manage members. Ask an owner to change your role."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-border pb-6">
        <h1 className="text-xl font-semibold text-foreground">Admin</h1>
        <p className="mt-1 text-sm text-muted">Manage who can sign in and build on this project.</p>
      </div>
      <AdminMembers />
    </div>
  );
}
