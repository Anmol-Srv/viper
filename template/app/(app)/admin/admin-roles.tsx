'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Member, RoleDef } from './admin-panel';

// Seed roles ship with every project (see the auth service) and can never be deleted.
const SEED_ROLES = ['owner', 'member'];

export function AdminRoles({
  roles,
  members,
  onChange,
}: {
  roles: RoleDef[];
  members: Member[];
  onChange: () => void;
}) {
  const [error, setError] = useState('');
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [newPerm, setNewPerm] = useState<Record<string, string>>({});
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePerms, setNewRolePerms] = useState('');
  const [creating, setCreating] = useState(false);

  const usageCount = (name: string) => members.filter((m) => m.role === name).length;

  const savePermissions = async (name: string, permissions: string[]) => {
    setError('');
    setBusyRole(name);
    try {
      const res = await fetch(`/api/admin/roles/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not update role');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update role');
    } finally {
      setBusyRole(null);
    }
  };

  const addPermission = (role: RoleDef) => {
    const perm = (newPerm[role.name] || '').trim();
    if (!perm || role.permissions.includes(perm)) return;
    setNewPerm((curr) => ({ ...curr, [role.name]: '' }));
    savePermissions(role.name, [...role.permissions, perm]);
  };

  const removePermission = (role: RoleDef, perm: string) => {
    savePermissions(
      role.name,
      role.permissions.filter((p) => p !== perm),
    );
  };

  const deleteRole = async (name: string) => {
    setError('');
    setBusyRole(name);
    try {
      const res = await fetch(`/api/admin/roles/${encodeURIComponent(name)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not delete role');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete role');
    } finally {
      setBusyRole(null);
    }
  };

  const createRole = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const permissions = newRolePerms
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoleName, permissions }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not create role');
      setNewRoleName('');
      setNewRolePerms('');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create role');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>New role</CardTitle>
        <form onSubmit={createRole} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs text-muted">Name</label>
            <Input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="reviewer"
              required
            />
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-xs text-muted">Initial permissions (comma-separated, optional)</label>
            <Input
              value={newRolePerms}
              onChange={(e) => setNewRolePerms(e.target.value)}
              placeholder="reports:view, data:write"
            />
          </div>
          <Button type="submit" loading={creating}>
            Create role
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>

      {roles.length === 0 ? (
        <p className="px-1 text-sm text-muted">No roles yet — create one above.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {roles.map((r) => {
            const seed = SEED_ROLES.includes(r.name);
            const uses = usageCount(r.name);
            const disabledReason = seed
              ? "Seed roles (owner, member) can't be deleted"
              : uses > 0
                ? `In use by ${uses} member${uses === 1 ? '' : 's'}`
                : '';

            return (
              <Card key={r.name}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">{r.name}</h3>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!!disabledReason}
                    title={disabledReason || undefined}
                    loading={busyRole === r.name}
                    onClick={() => deleteRole(r.name)}
                  >
                    Delete
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {r.permissions.length === 0 && (
                    <span className="text-sm text-muted">No permissions yet.</span>
                  )}
                  {r.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-foreground"
                    >
                      {perm}
                      <button
                        type="button"
                        onClick={() => removePermission(r, perm)}
                        disabled={busyRole === r.name}
                        aria-label={`Remove ${perm}`}
                        className="text-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      value={newPerm[r.name] || ''}
                      onChange={(e) => setNewPerm((curr) => ({ ...curr, [r.name]: e.target.value }))}
                      placeholder="permission key"
                      className="h-8 w-40 py-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      loading={busyRole === r.name}
                      onClick={() => addPermission(r)}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
