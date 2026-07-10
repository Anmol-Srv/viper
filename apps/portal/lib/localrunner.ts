// docker+traefik deploy mode — the lean alternative to Coolify for hosts where we can't let
// Coolify take over the daemon (e.g. a shared box running other containers). Runs a project's
// locally-built image as a labeled container on a shared `viper` network; a single Traefik
// container (on :8080, fronted by the host nginx) routes <subdomain>.<base-domain> to it.
// No registry, no host mutation, no daemon restart. Selected via DEPLOY_MODE=docker.
import { spawn } from "child_process";

const DOCKER_CONTEXT = process.env.DOCKER_CONTEXT || "default";
const NET = process.env.VIPER_DOCKER_NET || "viper";
const BASE_DOMAIN = process.env.VIPER_BASE_DOMAIN || "127.0.0.1.sslip.io";
const SCHEME = process.env.VIPER_DOMAIN_SCHEME || "http";

function docker(args: string[], onLine?: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", ["--context", DOCKER_CONTEXT, ...args]);
    let tail = "";
    const pipe = (s: NodeJS.ReadableStream) =>
      s.on("data", (c: Buffer) => {
        const t = c.toString();
        tail = (tail + t).slice(-2000);
        t.split("\n").forEach((l) => l.trim() && onLine?.(l));
      });
    pipe(p.stdout);
    pipe(p.stderr);
    p.on("error", (e) => reject(new Error(`docker failed to start: ${e.message}`)));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`docker ${args[0]} exited ${code}:\n${tail}`))));
  });
}

export const liveUrl = (subdomain: string) => `${SCHEME}://${subdomain}.${BASE_DOMAIN}`;

// (Re)start the project's app container. Idempotent: removes any prior one first, so a redeploy
// is just a fresh container on the same Host rule — same URL, new image tag.
export async function runApp(opts: {
  image: string;
  tag: string;
  subdomain: string;
  env: Record<string, string>;
  onLine: (l: string) => void;
}): Promise<{ url: string }> {
  const name = `viper-app-${opts.subdomain}`;
  const host = `${opts.subdomain}.${BASE_DOMAIN}`;
  const r = opts.subdomain.replace(/[^a-z0-9]/g, "") || "app"; // traefik router/service id
  await docker(["rm", "-f", name]).catch(() => {});
  const labels = [
    "--label", "traefik.enable=true",
    "--label", `traefik.http.routers.${r}.rule=Host(\`${host}\`)`,
    "--label", `traefik.http.routers.${r}.entrypoints=web`,
    "--label", `traefik.http.services.${r}.loadbalancer.server.port=3000`,
  ];
  const envArgs = Object.entries(opts.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  await docker(
    ["run", "-d", "--name", name, "--restart", "unless-stopped", "--network", NET, ...labels, ...envArgs, `${opts.image}:${opts.tag}`],
    opts.onLine
  );
  return { url: `${SCHEME}://${host}` };
}

export async function stopApp(subdomain: string): Promise<void> {
  await docker(["rm", "-f", `viper-app-${subdomain}`]).catch(() => {});
}
