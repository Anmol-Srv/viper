// Deployed-app env builder — factored out of app/api/deploy/route.ts (SPEC-v1.3 resource
// controls) so the same env shape is used both when an image is first deployed and when a
// stopped project's last image is restarted (app/api/projects/[subdomain]/start/route.ts).
import type { ProjectRecord } from "@/lib/store";

// VM-reachable Mac address (colima gateway) — deployed containers cannot reach "localhost".
const AUTH_URL_FROM_VM = process.env.VIPER_AUTH_URL_FROM_VM || "http://192.168.5.2:4000";
const VIPER_URL_FROM_VM = "http://192.168.5.2:3400";

// docker+traefik mode (DEPLOY_MODE=docker) runs a container directly and needs HOSTNAME/PORT
// bound explicitly; Coolify's dockerimage app already binds these via ports_exposes.
export function buildAppEnv(rec: ProjectRecord): Record<string, string> {
  const docker = (process.env.DEPLOY_MODE || "coolify") === "docker";
  return {
    AUTH_SERVICE_URL: AUTH_URL_FROM_VM,
    PROJECT_ID: rec.projectId,
    AUTH_CLIENT_ID: rec.clientId,
    AUTH_CLIENT_SECRET: rec.clientSecret,
    VIPER_URL: VIPER_URL_FROM_VM,
    NODE_ENV: "production",
    ...(docker ? { HOSTNAME: "0.0.0.0", PORT: "3000" } : {}),
    // session cookie Secure flag follows the serving scheme (http on the laptop)
    COOKIE_SECURE: (process.env.VIPER_DOMAIN_SCHEME || "http") === "https" ? "1" : "0",
    // Never inject AUTH_DEV_BYPASS here — its absence is what turns the login wall on.
    ...(rec.db?.url && rec.db?.apiKey ? { INSFORGE_URL: rec.db.url, INSFORGE_API_KEY: rec.db.apiKey } : {}),
    ...(rec.db?.internalUrl ? { DATABASE_URL: rec.db.internalUrl } : {}),
  };
}
