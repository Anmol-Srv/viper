"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GettingStarted, { CopyButton } from "@/components/getting-started";
import { apiFetch } from "@/lib/api";

type Member = { email: string; role: string };
type Deploy = { tag: string; at: string };
type Db = { provider: "insforge"; ref: string; localUrl?: string; internalUrl?: string; dashboardUrl?: string };
type Project = {
  projectId: string;
  name: string;
  subdomain: string;
  ownerEmail: string;
  modules: string[];
  coolify: { configured: boolean; appUuid?: string; url?: string };
  members?: Member[];
  deploys?: Deploy[];
  db?: Db;
  dbError?: string;
  createdAt: string;
};

type Tab = "overview" | "getting-started" | "database" | "members" | "danger";

export default function ProjectDetailClient({ project, myRole, liveUrl }: { project: Project; myRole: string; liveUrl: string }) {
  const router = useRouter();
  const isOwner = myRole === "owner";
  const hasDb = project.modules.includes("db");
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "getting-started", label: "Getting Started" },
    ...(hasDb ? [{ key: "database" as Tab, label: "Database" }] : []),
    ...(isOwner ? [{ key: "members" as Tab, label: "Members" }, { key: "danger" as Tab, label: "Danger zone" }] : []),
  ];
  const [tab, setTab] = useState<Tab>("overview");

  const deploys = [...(project.deploys || [])].reverse();
  const isLive = Boolean(project.coolify?.url);

  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <a className="backlink" href="/">
            ← Projects
          </a>
          <div className="brand" style={{ marginTop: 6 }}>
            <div className="logo">{project.name[0]?.toUpperCase() || "V"}</div>
            <h1>{project.name}</h1>
          </div>
        </div>
        <span className={`tag ${isLive ? "live" : ""}`}>{isLive ? "live" : "local"}</span>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid">
          <div className="card">
            <h2>Live URL</h2>
            <p className="sub" style={{ margin: "0 0 12px" }}>
              <a href={liveUrl} target="_blank" rel="noreferrer">
                {liveUrl}
              </a>
            </p>
            <p className="sub" style={{ margin: "0 0 12px" }}>
              {project.subdomain} · modules: {project.modules.join(", ")}
            </p>
            <a className="dl" href={`/api/download?sub=${project.subdomain}`}>
              Re-download {project.subdomain}.zip
            </a>
          </div>

          <div className="card">
            <h2>Deploy history</h2>
            {deploys.length === 0 && <div className="empty">No deploys yet — run `npm run deploy` from the project.</div>}
            {deploys.map((d) => (
              <div className="deploy-row" key={d.tag}>
                <span>tag {d.tag}</span>
                <span>{new Date(d.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "getting-started" && (
        <div className="card">
          <GettingStarted name={project.name} subdomain={project.subdomain} liveUrl={liveUrl} />
        </div>
      )}

      {tab === "database" && hasDb && <DatabasePanel project={project} />}

      {tab === "members" && isOwner && <MembersPanel project={project} />}

      {tab === "danger" && isOwner && <DangerZone project={project} />}
    </div>
  );
}

// v1.3 B2: reads/writes live via the auth service (SPEC §0.1) — no more portal-side member
// array, so this fetches on mount and after every mutation instead of taking `project.members`
// as a prop (that field now only ever has the owner, a lazy-read fallback for old records).
// Falls back to the hardcoded owner/member pair until the auth service's roles CRUD ships +
// restarts (SPEC-v1.3 §0.1 follow-up) — /api/projects/:subdomain/roles already degrades the
// same way server-side, this is just the pre-load default so the picker never renders empty.
const FALLBACK_ROLE_NAMES = ["owner", "member"];

function MembersPanel({ project }: { project: Project }) {
  const [members, setMembers] = useState<{ email: string; role: string; status: string }[] | null>(null);
  const [roleNames, setRoleNames] = useState<string[]>(FALLBACK_ROLE_NAMES);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadRoles = async () => {
    try {
      const res = await apiFetch(`/api/projects/${project.subdomain}/roles`);
      const data = await res.json();
      if (res.ok && data.roles?.length) setRoleNames(data.roles.map((r: { name: string }) => r.name));
    } catch {
      // keep FALLBACK_ROLE_NAMES
    }
  };

  const load = async () => {
    setError("");
    try {
      const res = await apiFetch(`/api/projects/${project.subdomain}/members`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "could not load members");
      setMembers(data.members || []);
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
    loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invite = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/projects/${project.subdomain}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "could not invite member");
      setEmail("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (memberEmail: string, newRole: string) => {
    setRoleBusy(memberEmail);
    setError("");
    try {
      const res = await apiFetch(`/api/projects/${project.subdomain}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: memberEmail, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "could not change role");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRoleBusy(null);
    }
  };

  const remove = async (memberEmail: string) => {
    setRemoving(memberEmail);
    setError("");
    try {
      const res = await apiFetch(`/api/projects/${project.subdomain}/members`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: memberEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "could not remove member");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="card">
      <h2>Members</h2>
      {members === null && <div className="empty">Loading…</div>}
      {members?.map((m) => (
        <div className="member-row" key={m.email}>
          <span>{m.email}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <select
              value={m.role}
              disabled={roleBusy === m.email}
              onChange={(e) => changeRole(m.email, e.target.value)}
            >
              {roleNames.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button className="link-btn" disabled={removing === m.email} onClick={() => remove(m.email)}>
              {removing === m.email ? "removing…" : "remove"}
            </button>
          </span>
        </div>
      ))}

      <label>Invite by email (@airtribe.live)</label>
      <input type="email" value={email} placeholder="teammate@airtribe.live" onChange={(e) => setEmail(e.target.value)} />
      <label>Role</label>
      <select value={role} onChange={(e) => setRole(e.target.value)}>
        {roleNames.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && <div className="err">{error}</div>}
      <button className="primary" disabled={!email.trim() || busy} onClick={invite} style={{ marginTop: 14 }}>
        {busy ? "Inviting…" : "Invite"}
      </button>
    </div>
  );
}

// SPEC B4/§0.3: credentials are stored plaintext in the portal's local project record — same
// laptop-v1 tradeoff as clientSecret (see lib/store.ts) — that's *why* the builder needs to see
// them here rather than somewhere the portal proxies for them.
function DatabasePanel({ project }: { project: Project }) {
  const { db, dbError } = project;

  if (!db && !dbError) {
    return (
      <div className="card">
        <h2>Database</h2>
        <p className="sub" style={{ margin: 0 }}>
          Database provisioning isn&apos;t configured on this Viper instance yet. Once it is, re-run
          project creation (or ask a platform admin) — the <code>DATABASE_URL</code> env var will show up here.
        </p>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="card danger-card">
        <h2>Database</h2>
        <p className="sub" style={{ margin: 0 }}>
          Provisioning failed: {dbError}. The project was still created — <code>DATABASE_URL</code> is
          omitted from its env until this is fixed.
        </p>
      </div>
    );
  }

  const rows: { label: string; value: string }[] = [];
  try {
    const u = new URL(db!.localUrl || db!.internalUrl || "");
    rows.push(
      { label: "Host", value: u.hostname },
      { label: "Port", value: u.port },
      { label: "User", value: decodeURIComponent(u.username) },
      { label: "Password", value: decodeURIComponent(u.password) },
      { label: "Database", value: u.pathname.replace(/^\//, "") }
    );
  } catch {
    // no parseable URL yet — just show whatever we have below
  }

  return (
    <div className="card">
      <h2>Database</h2>
      <p className="sub" style={{ margin: "0 0 12px" }}>
        Provider: {db!.provider}. Stored in plaintext in the portal&apos;s local project record — laptop-v1
        tradeoff, same as your deploy credentials. See <code>docs/db.md</code> in your project for how to
        use this from code.
      </p>
      {rows.length > 0 && (
        <table className="table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="muted-cell">{r.label}</td>
                <td>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {db!.localUrl && (
        <>
          <label>Local URL (for `npm run dev`)</label>
          <div className="gs-code">
            <code>{db!.localUrl}</code>
            <CopyButton text={db!.localUrl} />
          </div>
        </>
      )}
      {db!.internalUrl && (
        <>
          <label>Deployed URL (injected at first `npm run deploy`)</label>
          <div className="gs-code">
            <code>{db!.internalUrl}</code>
            <CopyButton text={db!.internalUrl} />
          </div>
        </>
      )}
      {db!.dashboardUrl && (
        <p className="sub" style={{ marginTop: 12 }}>
          <a href={db!.dashboardUrl} target="_blank" rel="noreferrer">
            Open provider dashboard →
          </a>
        </p>
      )}
    </div>
  );
}

function DangerZone({ project }: { project: Project }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const del = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/projects/${project.subdomain}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "could not delete project");
      router.push("/");
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="card danger-card">
      <h2>Delete this project</h2>
      <p className="sub" style={{ margin: "0 0 12px" }}>
        Tears down the live app, removes it from the auth service, and deletes the local zip. This cannot be undone.
      </p>
      <label>Type &ldquo;{project.subdomain}&rdquo; to confirm</label>
      <input type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error && <div className="err">{error}</div>}
      <button className="danger-btn" disabled={confirm !== project.subdomain || busy} onClick={del} style={{ marginTop: 14 }}>
        {busy ? "Deleting…" : `Delete ${project.subdomain}`}
      </button>
    </div>
  );
}
