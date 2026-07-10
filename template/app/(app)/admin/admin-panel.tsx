'use client';

import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { AdminMembers } from './admin-members';
import { AdminRoles } from './admin-roles';

export type Member = { email: string; role: string; status: string };
export type RoleDef = { name: string; permissions: string[] };

const TABS = [
  { id: 'members', label: 'Members' },
  { id: 'roles', label: 'Roles' },
] as const;
type TabId = (typeof TABS)[number]['id'];

async function fetchJSON<T>(url: string): Promise<{ data: T | null; ok: boolean }> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const body = await res.json();
    if (!body.success) return { data: null, ok: false };
    return { data: (body.data as T) ?? null, ok: true };
  } catch {
    return { data: null, ok: false };
  }
}

/** Access manager: Members + Roles tabs over a single shared fetch — see docs/permissions.md. */
export function AdminPanel() {
  const [tab, setTab] = useState<TabId>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [m, r] = await Promise.all([
      fetchJSON<Member[]>('/api/admin/members'),
      fetchJSON<RoleDef[]>('/api/admin/roles'),
    ]);
    if (!m.ok || !r.ok) {
      setUnavailable(true);
    } else {
      setUnavailable(false);
      setMembers(m.data ?? []);
      setRoles(r.data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-white ${
              tab === t.id
                ? 'border-white text-foreground'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="px-1 text-sm text-muted">Loading…</p>
      ) : unavailable ? (
        <EmptyState
          title="Auth service unavailable"
          description="Access management needs the auth service running. Start it locally, or check AUTH_SERVICE_URL — nothing here is broken."
        />
      ) : tab === 'members' ? (
        <AdminMembers members={members} roles={roles} onChange={load} />
      ) : (
        <AdminRoles roles={roles} members={members} onChange={load} />
      )}
    </div>
  );
}
