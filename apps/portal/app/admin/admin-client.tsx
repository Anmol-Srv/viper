"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type PlatformMember = { email: string; role: string; status: string };

export default function AdminClient({ me }: { me: { email: string; role: string } }) {
  const [members, setMembers] = useState<PlatformMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/members");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "could not load members");
      setMembers(data.members || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invite = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "could not invite");
      setEmail("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (memberEmail: string, newRole: string) => {
    setError("");
    try {
      const res = await apiFetch("/api/admin/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: memberEmail, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "could not change role");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (memberEmail: string) => {
    setError("");
    try {
      const res = await apiFetch(`/api/admin/members/${encodeURIComponent(memberEmail)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "could not remove member");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <a className="backlink" href="/">
            ← Projects
          </a>
          <div className="brand" style={{ marginTop: 6 }}>
            <div className="logo">V</div>
            <h1>Platform admin</h1>
          </div>
        </div>
      </div>
      <p className="sub">
        Members here can log into Viper at all — invite-only (SPEC A2). Signed in as {me.email}.
      </p>

      <div className="card">
        <h2>Members ({members.length})</h2>
        {loading && <div className="empty">Loading…</div>}
        {!loading && members.length === 0 && <div className="empty">No members yet.</div>}
        {!loading && (
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.email}>
                  <td>{m.email}</td>
                  <td>
                    <select value={m.role} onChange={(e) => changeRole(m.email, e.target.value)}>
                      <option value="member">member</option>
                      <option value="owner">owner</option>
                    </select>
                  </td>
                  <td>
                    <span className={`tag ${m.status === "active" ? "live" : ""}`}>{m.status}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="link-btn" onClick={() => remove(m.email)}>
                      remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <label>Invite by email (@airtribe.live)</label>
        <input type="email" value={email} placeholder="teammate@airtribe.live" onChange={(e) => setEmail(e.target.value)} />
        <label>Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="member">member</option>
          <option value="owner">owner</option>
        </select>
        {error && <div className="err">{error}</div>}
        <button className="primary" disabled={!email.trim() || busy} onClick={invite} style={{ marginTop: 14 }}>
          {busy ? "Inviting…" : "Invite"}
        </button>
      </div>
    </div>
  );
}
