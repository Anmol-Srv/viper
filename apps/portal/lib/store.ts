// Tiny JSON project registry for the portal's own dashboard + deploy-token validation.
// ponytail: JSON file, not a DB — this is a single-admin laptop portal. Swap for SQLite if it grows.
import fs from "fs";
import path from "path";

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
  zipFile: string;
  createdAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "projects.json");

function readAll(): ProjectRecord[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
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
