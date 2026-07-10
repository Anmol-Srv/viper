'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Member, RoleDef } from './admin-panel';

// ponytail: seed roles always exist server-side; this fallback only covers the split second
// before the first roles fetch resolves so the select never renders with zero options.
const FALLBACK_ROLES = ['owner', 'member'];

export function AdminMembers({
  members,
  roles,
  onChange,
}: {
  members: Member[];
  roles: RoleDef[];
  onChange: () => void;
}) {
  const roleNames = roles.length ? roles.map((r) => r.name) : FALLBACK_ROLES;

  const [rows, setRows] = useState(members);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(roleNames[0]);
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => setRows(members), [members]);
  useEffect(() => {
    if (!roleNames.includes(role)) setRole(roleNames[0]);
  }, [roleNames, role]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInviting(true);
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not invite member');
      setEmail('');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not invite member');
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (memberEmail: string, newRole: string) => {
    setError('');
    const previous = rows;
    setRows((curr) => curr.map((m) => (m.email === memberEmail ? { ...m, role: newRole } : m)));
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: memberEmail, role: newRole }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not change role');
      onChange();
    } catch (err) {
      setRows(previous);
      setError(err instanceof Error ? err.message : 'Could not change role');
    }
  };

  const remove = async (memberEmail: string) => {
    setError('');
    setRemoving(memberEmail);
    try {
      const res = await fetch(`/api/admin/members/${encodeURIComponent(memberEmail)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not remove member');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove member');
    } finally {
      setRemoving(null);
    }
  };

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
              onChange={(e) => setRole(e.target.value)}
              className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:outline focus:outline-1 focus:outline-white"
            >
              {roleNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={inviting}>
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-muted">
                  No members yet — invite one above.
                </td>
              </tr>
            ) : (
              rows.map((member) => (
                <tr
                  key={member.email}
                  className="border-b border-border transition-colors last:border-0 hover:bg-panel2/60"
                >
                  <td className="px-6 py-3 text-foreground">{member.email}</td>
                  <td className="px-6 py-3">
                    <select
                      value={member.role}
                      onChange={(e) => changeRole(member.email, e.target.value)}
                      disabled={removing === member.email}
                      className="rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground transition-colors focus:outline focus:outline-1 focus:outline-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {(roleNames.includes(member.role) ? roleNames : [member.role, ...roleNames]).map(
                        (name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                  <td className="px-6 py-3 capitalize text-muted">{member.status}</td>
                  <td className="px-6 py-3 text-right">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={removing === member.email}
                      onClick={() => remove(member.email)}
                    >
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
