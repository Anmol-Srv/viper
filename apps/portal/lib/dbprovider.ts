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

export const configured = () => Boolean(INSFORGE_USER_API_KEY && INSFORGE_ORG_ID);

export type DbRecord = {
  provider: "insforge";
  ref: string; // provider-side id, passed back into deleteDatabase() for teardown
  localUrl?: string; // builder's machine
  internalUrl?: string; // deployed container env
  dashboardUrl?: string; // link to the provider's own console for this DB
};

export type ProvisionResult = { configured: boolean; db?: DbRecord; error?: string };

// ponytail: stub until Insforge's real API is confirmed — same return shape every caller
// already expects, so wiring the real HTTP calls in here is the only change needed later.
export async function provisionDatabase(_projectName: string): Promise<ProvisionResult> {
  if (!configured()) return { configured: false };
  return { configured: true, error: "Insforge provisioning not implemented yet" };
}

export async function deleteDatabase(_ref: string): Promise<void> {
  if (!configured()) return;
  // no-op until implemented — teardown stays best-effort either way (see route.ts callers)
}
