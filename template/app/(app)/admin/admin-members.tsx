'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';

type Member = { email: string; role: string; status: string };
type Role = 'owner' | 'member';

async function fetchMembers(): Promise<{ members: Member[] | null; unavailable: boolean }> {
  try {
    const res = await fetch('/api/admin/members', { cache: 'no-store' });
    const data = await res.json();
    if (!data.success) return { members: null, unavailable: true };
    return { members: data.data ?? [], unavailable: false };
  } catch {
    return { members: null, unavailable: true };
  }
}

export function AdminMembers() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const result = await fetchMembers();
    setMembers(result.members);
    setUnavailable(result.unavailable);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not invite member');
      setEmail('');
      setRole('member');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not invite member');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (memberEmail: string, newRole: Role) => {
    setError('');
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: memberEmail, role: newRole }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not change role');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change role');
    }
  };

  const remove = async (memberEmail: string) => {
    setError('');
    try {
      const res = await fetch(`/api/admin/members/${encodeURIComponent(memberEmail)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not remove member');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove member');
    }
  };

  if (loading) {
    return <p className="px-1 text-sm text-muted">Loading members…</p>;
  }

  if (unavailable) {
    return (
      <EmptyState
        title="Auth service unavailable"
        description="Member management needs the auth service running. Start it locally, or check AUTH_SERVICE_URL — nothing here is broken."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Invite a member</CardTitle>
        <form onSubmit={invite} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs text-muted">Email</label>
            <Input
              type="email"
              placeholder="teammate@airtribe.live"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:outline focus:outline-1 focus:outline-white"
            >
              <option value="member">member</option>
              <option value="owner">owner</option>
            </select>
          </div>
          <Button type="submit" loading={busy}>
            Invite
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>

      <Card padded={false} className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-panel2 text-muted">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide">Email</th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide">Role</th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {(members ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-muted">
                  No members yet — invite one above.
                </td>
              </tr>
            ) : (
              (members ?? []).map((member) => (
                <tr
                  key={member.email}
                  className="border-b border-border transition-colors last:border-0 hover:bg-panel2/60"
                >
                  <td className="px-6 py-3 text-foreground">{member.email}</td>
                  <td className="px-6 py-3">
                    <select
                      value={member.role}
                      onChange={(e) => changeRole(member.email, e.target.value as Role)}
                      className="rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground transition-colors focus:outline focus:outline-1 focus:outline-white"
                    >
                      <option value="member">member</option>
                      <option value="owner">owner</option>
                    </select>
                  </td>
                  <td className="px-6 py-3 capitalize text-muted">{member.status}</td>
                  <td className="px-6 py-3 text-right">
                    <Button variant="danger" size="sm" onClick={() => remove(member.email)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
