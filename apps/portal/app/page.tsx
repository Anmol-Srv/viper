"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GettingStarted from "@/components/getting-started";
import { apiFetch } from "@/lib/api";

const MODULES = [
  { key: "auth", label: "Auth (company SSO)", desc: "Email-OTP login locked to @airtribe.live. Always on.", forced: true },
  { key: "permissions", label: "Permissions (RBAC)", desc: "Per-project roles + server-side hasPermission gating." },
  { key: "db", label: "Database (Insforge)", desc: "A per-project datastore for your app's own data." },
];

type Result = { ok?: boolean; subdomain?: string; name?: string; downloadUrl?: string; liveUrl?: string; error?: string };

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [selected, setSelected] = useState<string[]>(["permissions"]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [coolifyConfigured, setCoolifyConfigured] = useState(false);
  const [me, setMe] = useState<{ email: string; role: string } | null>(null);

  const load = async () => {
    const res = await fetch("/api/projects");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const r = await res.json();
    setProjects(r.projects || []);
    setCoolifyConfigured(!!r.coolifyConfigured);
    setMe(r.me || null);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");

  const toggle = (k: string) =>
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, subdomain: subdomain || slugify(name), modules: selected }),
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

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const valid = name.trim().length > 0;

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand" style={{ marginBottom: 0 }}>
          <div className="logo">V</div>
          <h1>Viper</h1>
        </div>
        {me && (
          <div className="sub" style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            {me.email}
            {me.role === "owner" && (
              <a className="secondary" href="/admin" style={{ textDecoration: "none" }}>
                Admin
              </a>
            )}
            <button className="secondary" onClick={logout}>
              Log out
            </button>
          </div>
        )}
      </div>
      <p className="sub">
        Create an internal project, pick your modules, get a ready-to-build zip with auth &amp; design wired in.
        {coolifyConfigured ? " · infra: Coolify connected" : " · infra: Coolify not connected yet"}
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

          {result?.error && <div className="err">{result.error}</div>}
          {result?.ok && result.subdomain && (
            <div className="result">
              <h3>
                <span className="ok-mark">✓</span> Project created
              </h3>
              <p className="result-sub">{result.subdomain}</p>
              <a className="dl" href={result.downloadUrl}>
                Download {result.subdomain}.zip
              </a>
              <div style={{ marginTop: 16 }}>
                <GettingStarted name={result.name || result.subdomain} subdomain={result.subdomain} liveUrl={result.liveUrl || ""} />
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Projects ({projects.length})</h2>
          <div className="plist">
            {projects.length === 0 && <div className="empty">No projects yet. Create your first one.</div>}
            {projects.map((p) => (
              <a className="prow" key={p.projectId} href={`/projects/${p.subdomain}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div>
                  <div className="n">{p.name}</div>
                  <div className="m">
                    {p.subdomain} · {p.modules.join(", ")}
                    {p.coolify?.url && (
                      <>
                        {" · "}
                        <span>{p.coolify.url}</span>
                      </>
                    )}
                    {p.lastDeployAt && <> · deployed {new Date(p.lastDeployAt).toLocaleString()}</>}
                  </div>
                </div>
                <span className={`tag ${p.coolify?.url ? "live" : ""}`}>{p.coolify?.url ? "live" : "local"}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      <p className="foot">Viper v1 · laptop-as-server · auth locked to @airtribe.live · secrets never ship in the zip</p>
    </div>
  );
}
