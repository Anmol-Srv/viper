import { requireUser, hasPermission } from '@/lib/auth';
import { EmptyState } from '@/components/ui/empty-state';
import { AdminPanel } from './admin-panel';

export default async function AdminPage() {
  await requireUser();
  const canManage = await hasPermission('*');

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <div className="border-b border-border pb-6">
          <h1 className="text-xl font-semibold text-foreground">Access</h1>
        </div>
        <EmptyState
          title="Owner access required"
          description="Only project owners can manage members and roles. Ask an owner to change your role."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-border pb-6">
        <h1 className="text-xl font-semibold text-foreground">Access</h1>
        <p className="mt-1 text-sm text-muted">Manage who can sign in and what they can do on this project.</p>
      </div>
      <AdminPanel />
    </div>
  );
}
