// Tiny JSON project registry for the portal's own dashboard + deploy-token validation.
// ponytail: JSON file, not a DB — this is a single-admin laptop portal. Swap for SQLite if it grows.
import fs from "fs";
import path from "path";

export type Member = { email: string; role: string };
export type Deploy = { tag: string; at: string };
// Provider-agnostic (SPEC §0.3, revised mid-build — Coolify-hosted Postgres is out, a
// third-party provider is in, API TBD). Credentials here are plaintext on disk, same laptop-v1
// tradeoff as clientSecret — shown to the project owner in the Database tab by design.
export type Db = { provider: "insforge"; ref: string; url?: string; apiKey?: string; localUrl?: string; internalUrl?: string; dashboardUrl?: string };

export type ProjectRecord = {
  projectId: string;
  name: string;
  subdomain: string;
  ownerEmail: string;
  modules: string[];
  clientId: string;
  clientSecret: string; // plaintext, laptop-v1 — see SPEC §6 hardening note. Never in HTTP responses.
  deployTokenHash: string;
  coolify: { configured: boolean; appUuid?: string; url?: string };
  lastImageTag?: string;
  lastDeployAt?: string;
  // v1.3: members are read live from the auth service (SPEC §0.1 GET) — this array is no longer
  // written to on invite/remove (B2), it only exists so `backfill()` gives pre-v1.3 readers (and
  // the portal's own owner-visibility checks) a same-shape fallback of `[{ownerEmail, "owner"}]`.
  members?: Member[];
  deploys?: Deploy[]; // capped at DEPLOY_HISTORY_CAP, newest last
  db?: Db; // present only once a database provider is actually configured + provisioning succeeds
  dbError?: string; // set when the `db` module was selected but provisioning failed/degraded
  zipFile: string;
  createdAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "projects.json");
const DEPLOY_HISTORY_CAP = 10;

// Older records on disk predate `members`/`deploys` — backfill on every read instead of
// migrating the file, so a record written before this change never crashes a reader.
function backfill(rec: ProjectRecord): ProjectRecord {
  if (!rec.members) rec.members = [{ email: rec.ownerEmail, role: "owner" }];
  if (!rec.deploys) {
    rec.deploys = rec.lastImageTag && rec.lastDeployAt ? [{ tag: rec.lastImageTag, at: rec.lastDeployAt }] : [];
  }
  return rec;
}

function readAll(): ProjectRecord[] {
  try {
    const rows = JSON.parse(fs.readFileSync(FILE, "utf8")) as ProjectRecord[];
    return rows.map(backfill);
  } catch {
    return [];
  }
}
function writeAll(rows: ProjectRecord[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
}

export const list = (): ProjectRecord[] => readAll();
export const getBySubdomain = (subdomain: string) => readAll().find((p) => p.subdomain === subdomain);
export const getByProjectId = (projectId: string) => readAll().find((p) => p.projectId === projectId);

export function add(rec: ProjectRecord) {
  const rows = readAll();
  rows.push(rec);
  writeAll(rows);
}

export function update(projectId: string, patch: Partial<ProjectRecord>) {
  const rows = readAll();
  const rec = rows.find((p) => p.projectId === projectId);
  if (!rec) throw new Error(`no project ${projectId}`);
  Object.assign(rec, patch);
  writeAll(rows);
  return rec;
}

export function remove(projectId: string) {
  writeAll(readAll().filter((p) => p.projectId !== projectId));
}

// Pushes a deploy record (capped) and keeps lastImageTag/lastDeployAt in sync for compat.
export function addDeploy(projectId: string, tag: string) {
  const rows = readAll();
  const rec = rows.find((p) => p.projectId === projectId);
  if (!rec) throw new Error(`no project ${projectId}`);
  const at = new Date().toISOString();
  rec.deploys = [...(rec.deploys || []), { tag, at }].slice(-DEPLOY_HISTORY_CAP);
  rec.lastImageTag = tag;
  rec.lastDeployAt = at;
  writeAll(rows);
  return rec;
}

// ponytail: no addMember/removeMember here anymore (v1.3 B2) — the auth service (SPEC §0.1) is
// the source of truth for project membership now; the portal never writes to `members` after
// create. `members` on a record is purely the lazy-backfilled owner fallback (see `backfill()`
// above), used only for the portal's own "can this person see this project" checks.
