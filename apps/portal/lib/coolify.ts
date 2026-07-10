// Coolify API client — image-based apps (see SPEC §2-3.4). When COOLIFY_URL + COOLIFY_TOKEN
// are set, the portal creates/updates a Coolify "dockerimage" app and drives deploys through
// it. When unset, every call no-ops with { configured:false } so the zip still ships and local
// dev still works.
// Field names verified 2026-07-10 against the live Coolify 4.1.2 container's
// ApplicationsController/DeployController (see SPEC §3.4).

const URL_ = process.env.COOLIFY_URL || "";
const TOKEN = process.env.COOLIFY_TOKEN || "";
const SERVER_UUID = process.env.COOLIFY_SERVER_UUID || "";
const PROJECT_UUID = process.env.COOLIFY_PROJECT_UUID || "";
const BASE_DOMAIN = process.env.VIPER_BASE_DOMAIN || "127.0.0.1.sslip.io";
const SCHEME = process.env.VIPER_DOMAIN_SCHEME || "http";

export const configured = () => Boolean(URL_ && TOKEN && SERVER_UUID && PROJECT_UUID);

// Shared with zipgen (SPEC §3.4 CLAUDE.md injection) so the live-URL formula lives in one place.
export const liveUrlFor = (subdomain: string) => `${SCHEME}://${subdomain}.${BASE_DOMAIN}`;

async function api(pathname: string, method = "GET", body?: unknown) {
  const res = await fetch(`${URL_}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`coolify ${method} ${pathname} → ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

export async function health(): Promise<{ ok: boolean; version?: string; error?: string }> {
  if (!configured()) return { ok: false, error: "not configured" };
  try {
    const v = await api("/api/v1/version");
    return { ok: true, version: typeof v === "string" ? v : v?.version || "unknown" };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export type CreateImageAppResult = { appUuid: string; url: string };

// Creates a dockerimage application for a project's first deploy, then bulk-injects its env.
export async function createImageApp(opts: {
  name: string;
  subdomain: string;
  image: string;
  tag: string;
  env: Record<string, string>;
}): Promise<CreateImageAppResult> {
  const domain = `${opts.subdomain}.${BASE_DOMAIN}`;
  const url = `${SCHEME}://${domain}`;
  const app = await api("/api/v1/applications/dockerimage", "POST", {
    server_uuid: SERVER_UUID,
    project_uuid: PROJECT_UUID,
    environment_name: "production",
    docker_registry_image_name: opts.image,
    docker_registry_image_tag: opts.tag,
    ports_exposes: "3000",
    name: `viper-${opts.subdomain}`,
    description: opts.name,
    domains: url,
    instant_deploy: false,
  });
  const appUuid = app?.uuid;
  if (!appUuid) throw new Error(`coolify create app: no uuid in response ${JSON.stringify(app).slice(0, 200)}`);

  const data = Object.entries(opts.env).map(([key, value]) => ({ key, value, is_preview: false }));
  await api(`/api/v1/applications/${appUuid}/envs/bulk`, "PATCH", { data });

  return { appUuid, url };
}

export async function setImageTag(appUuid: string, tag: string): Promise<void> {
  await api(`/api/v1/applications/${appUuid}`, "PATCH", { docker_registry_image_tag: tag });
}

export async function deleteApp(appUuid: string): Promise<void> {
  await api(`/api/v1/applications/${appUuid}`, "DELETE");
}

// Resource controls (project-level stop/start, portal SPEC follow-up): GET|POST both exist on
// these endpoints per the live Coolify container — POST is the one that actually drives the app
// lifecycle (GET is a dry-run/status style variant we don't need here).
export async function stopApp(appUuid: string): Promise<void> {
  await api(`/api/v1/applications/${appUuid}/stop`, "POST");
}

export async function startApp(appUuid: string): Promise<void> {
  await api(`/api/v1/applications/${appUuid}/start`, "POST");
}

// Verified 2026-07-10 against the live Coolify container: GET /api/v1/applications/{uuid}/logs
// → { logs: "<newline-joined string>" }. Returns the last `lines` non-empty lines.
export async function getLogs(appUuid: string, lines = 30): Promise<string[]> {
  const res = await api(`/api/v1/applications/${appUuid}/logs`);
  const raw = typeof res?.logs === "string" ? res.logs : "";
  return raw.split("\n").filter(Boolean).slice(-lines);
}

export type TriggerDeployResult = { deploymentUuid?: string; message?: string };

export async function triggerDeploy(appUuid: string): Promise<TriggerDeployResult> {
  const res = await api(`/api/v1/deploy?uuid=${appUuid}`, "POST");
  const dep = res?.deployments?.[0];
  return { deploymentUuid: dep?.deployment_uuid, message: dep?.message };
}

export async function deploymentsFor(appUuid: string): Promise<any[]> {
  const res = await api(`/api/v1/deployments/applications/${appUuid}`);
  return Array.isArray(res) ? res : [];
}

// Terminal statuses per Coolify's ApplicationDeploymentStatus enum: finished, failed,
// cancelled-by-user. Anything else (queued, in_progress) is still running.
export async function deploymentStatus(deploymentUuid: string): Promise<{ status?: string; [k: string]: any }> {
  return api(`/api/v1/deployments/${deploymentUuid}`);
}
