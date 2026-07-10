"use client";
import { useEffect, useState } from "react";

const MODULES = [
  { key: "auth", label: "Auth (company SSO)", desc: "Email-OTP login locked to @airtribe.live. Always on.", forced: true },
  { key: "permissions", label: "Permissions (RBAC)", desc: "Per-project roles + server-side hasPermission gating." },
  { key: "db", label: "Database (Insforge)", desc: "A per-project datastore for your app's own data." },
];

type Result = { ok?: boolean; subdomain?: string; downloadUrl?: string; error?: string };

export default function Home() {
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [selected, setSelected] = useState<string[]>(["permissions"]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [coolifyConfigured, setCoolifyConfigured] = useState(false);

  const load = async () => {
    const r = await fetch("/api/projects").then((x) => x.json());
    setProjects(r.projects || []);
    setCoolifyConfigured(!!r.coolifyConfigured);
  };
  useEffect(() => {
    load();
  }, []);

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");

  const toggle = (k: string) =>
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, subdomain: subdomain || slugify(name), ownerEmail, modules: selected }),
      }).then((x) => x.json());
      setResult(r);
      if (r.ok) {
        setName("");
        setSubdomain("");
        load();
      }
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const valid = name.trim() && ownerEmail.trim().endsWith("@airtribe.live");

  return (
    <div className="wrap">
      <div className="brand">
        <div className="logo">V</div>
        <h1>Viper</h1>
      </div>
      <p className="sub">
        Create an internal project, pick your modules, get a ready-to-build zip with auth &amp; design wired in.
        {coolifyConfigured ? " · infra: Coolify connected ✓" : " · infra: Coolify not connected yet"}
      </p>

      <div className="grid">
        <div className="card">
          <h2>New project</h2>
          <label>Project name</label>
          <input
            type="text"
            value={name}
            placeholder="Sales Cockpit"
            onChange={(e) => {
              setName(e.target.value);
              if (!subdomain) setSubdomain(slugify(e.target.value));
            }}
          />
          <label>Subdomain</label>
          <input type="text" value={subdomain} placeholder="sales-cockpit" onChange={(e) => setSubdomain(slugify(e.target.value))} />
          <label>Owner email (must be @airtribe.live)</label>
          <input type="email" value={ownerEmail} placeholder="you@airtribe.live" onChange={(e) => setOwnerEmail(e.target.value)} />

          <label>Modules</label>
          <div className="mods">
            {MODULES.map((m) => {
              const on = m.forced || selected.includes(m.key);
              return (
                <div
                  key={m.key}
                  className={`mod ${on ? "on" : ""} ${m.forced ? "forced" : ""}`}
                  onClick={() => !m.forced && toggle(m.key)}
                >
                  <input type="checkbox" checked={on} disabled={m.forced} readOnly />
                  <div>
                    <div className="t">{m.label}</div>
                    <div className="d">{m.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <button className="primary" disabled={!valid || busy} onClick={submit}>
            {busy ? "Creating…" : "Create project & generate zip"}
          </button>

          {result?.error && <div className="err">✗ {result.error}</div>}
          {result?.ok && (
            <div className="result">
              <h3>✓ {result.subdomain} created</h3>
              <a className="dl" href={result.downloadUrl}>
                ↓ Download {result.subdomain}.zip
              </a>
              <ol className="steps">
                <li>Unzip, then <code>npm install &amp;&amp; npm run dev</code> (runs with dev bypass, no login wall).</li>
                <li>Build your dashboard. Read <code>docs/*.md</code> for each module.</li>
                <li><code>npm run deploy</code> to ship it live — deploy activates on your first run.</li>
              </ol>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Projects ({projects.length})</h2>
          <div className="plist">
            {projects.length === 0 && <div className="empty">No projects yet. Create your first one →</div>}
            {projects.map((p) => (
              <div className="prow" key={p.projectId}>
                <div>
                  <div className="n">{p.name}</div>
                  <div className="m">
                    {p.subdomain} · {p.modules.join(", ")}
                    {p.coolify?.url && (
                      <>
                        {" · "}
                        <a href={p.coolify.url} target="_blank" rel="noreferrer">
                          {p.coolify.url}
                        </a>
                      </>
                    )}
                    {p.lastDeployAt && <> · deployed {new Date(p.lastDeployAt).toLocaleString()}</>}
                  </div>
                </div>
                <span className={`tag ${p.coolify?.url ? "live" : ""}`}>{p.coolify?.url ? "live" : "local"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="foot">Viper v1 · laptop-as-server · auth locked to @airtribe.live · secrets never ship in the zip</p>
    </div>
  );
}
