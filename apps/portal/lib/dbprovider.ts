// Database provisioning — provider-agnostic (SPEC v1.3 §0.3/B3, revised mid-build). Coolify-
// hosted Postgres-per-project was ruled out (too load-bearing on the server); the DB becomes a
// third-party service (Insforge — management API verified against github.com/InsForge/CLI, see
// SPEC §0.3). This mirrors how lib/coolify.ts degrades gracefully before its token existed:
// every call no-ops with { configured: false } until the org-level management creds are set, so
// project creation/zip/deploy never depend on this being wired up.
// Management API creds (org/project provisioning) — NOT the same as the per-project runtime
// INSFORGE_URL/INSFORGE_API_KEY that end up in a generated app's .env (those come back from
// provisionDatabase() once implemented, see SPEC §0.3's mapping).
const INSFORGE_USER_API_KEY = process.env.INSFORGE_USER_API_KEY || "";
const INSFORGE_ORG_ID = process.env.INSFORGE_ORG_ID || "";
// Shared-project mode (hackathon v1): every db-module project gets the SAME Insforge project's
// URL + API key. ponytail: no per-project data isolation — upgrade path is per-project creation
// via `npx @insforge/cli create --json` once a uak_ user API key exists (see SPEC v1.3 §0.3).
const SHARED_URL = process.env.INSFORGE_SHARED_URL || "";
const SHARED_API_KEY = process.env.INSFORGE_SHARED_API_KEY || "";

export const configured = () => Boolean(SHARED_URL && SHARED_API_KEY) || Boolean(INSFORGE_USER_API_KEY && INSFORGE_ORG_ID);

export type DbRecord = {
  provider: "insforge";
  ref: string; // provider-side id, passed back into deleteDatabase() for teardown ("shared" = do not delete)
  url?: string; // Insforge backend base URL → INSFORGE_URL in the app env (same local + deployed)
  apiKey?: string; // Insforge project API key → INSFORGE_API_KEY (server-only)
  localUrl?: string; // legacy postgres-style field, unused in insforge mode
  internalUrl?: string;
  dashboardUrl?: string;
};

export type ProvisionResult = { configured: boolean; db?: DbRecord; error?: string };

export async function provisionDatabase(_projectName: string): Promise<ProvisionResult> {
  if (SHARED_URL && SHARED_API_KEY) {
    return {
      configured: true,
      db: { provider: "insforge", ref: "shared", url: SHARED_URL, apiKey: SHARED_API_KEY, dashboardUrl: "https://insforge.dev" },
    };
  }
  if (!configured()) return { configured: false };
  return { configured: true, error: "per-project Insforge provisioning needs a uak_ key — shared mode via INSFORGE_SHARED_URL/INSFORGE_SHARED_API_KEY" };
}

export async function deleteDatabase(ref: string): Promise<void> {
  if (ref === "shared") return; // shared project is never deleted by teardown
  // per-project deletion lands with uak_ mode
}
