// Core zip generator: stage a copy of the template, strip un-selected modules, inject
// per-project config, and produce a downloadable zip. No git/network — pure fs + archiver.
import fs from "fs";
import os from "os";
import path from "path";
import archiver from "archiver";
import { liveUrlFor } from "./coolify";

const TEMPLATE_DIR =
  process.env.VIPER_TEMPLATE_DIR || path.resolve(process.cwd(), "../../template");
const OUTPUT_DIR = path.join(process.cwd(), "output");

type Manifest = Record<string, { label: string; forced: boolean; files: string[]; guide?: string }>;

export type GenInput = {
  projectId: string;
  name: string;
  subdomain: string;
  modules: string[]; // selected module keys (portal always includes forced ones too)
  clientId: string;
  deployToken: string; // plaintext — shipped in the zip's .env.local (scoped, revocable)
  clientSecret: string; // plaintext — shipped in the zip's .env.local so the local /admin panel works (scoped, rotatable)
  authServiceUrl: string;
  viperUrl: string;
  databaseUrl?: string; // legacy postgres-style URL (unused in insforge mode)
  dbEnv?: { url: string; apiKey: string }; // Insforge creds → INSFORGE_URL/INSFORGE_API_KEY lines
};

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, "viper.modules.json"), "utf8"));
}

// Only names that can appear in the TEMPLATE dir. Do NOT add app dir names like "data"/"output"
// here — basename matching would wrongly skip legit module dirs (e.g. app/(app)/data).
const SKIP = new Set(["node_modules", ".next", ".git", ".env.local"]);

// Fills {{PLACEHOLDER}} tokens and resolves <!-- IF:mod -->...<!-- /IF:mod --> conditional
// blocks (kept verbatim minus the marker lines when `mod` is present, dropped entirely
// otherwise) in template/CLAUDE.md and template/AGENTS.md — see CONTRACT.md for the exact
// placeholder contract both docs must use.
function renderAgentDoc(content: string, vars: Record<string, string>, presentModules: string[]): string {
  let out = content;
  for (const [key, value] of Object.entries(vars)) out = out.split(`{{${key}}}`).join(value);
  out = out.replace(/<!-- IF:(\w+) -->\n?([\s\S]*?)<!-- \/IF:\1 -->\n?/g, (_match, mod: string, body: string) =>
    presentModules.includes(mod) ? body : ""
  );
  return out;
}

function injectAgentDocs(staging: string, vars: Record<string, string>, presentModules: string[]) {
  for (const doc of ["CLAUDE.md", "AGENTS.md"]) {
    const file = path.join(staging, doc);
    if (!fs.existsSync(file)) continue; // not authored yet by the parallel template workstream
    fs.writeFileSync(file, renderAgentDoc(fs.readFileSync(file, "utf8"), vars, presentModules));
  }
}

export async function generateZip(input: GenInput): Promise<{ zipFile: string }> {
  if (!fs.existsSync(TEMPLATE_DIR)) throw new Error(`template dir not found at ${TEMPLATE_DIR}`);
  const manifest = readManifest();

  // 1. stage a clean copy of the template
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), `viper-${input.subdomain}-`));
  fs.cpSync(TEMPLATE_DIR, staging, {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)),
  });

  // 2. strip files for modules not selected (forced modules always stay)
  for (const [key, m] of Object.entries(manifest)) {
    const selected = m.forced || input.modules.includes(key);
    if (selected) continue;
    for (const rel of [...m.files, ...(m.guide ? [m.guide] : [])]) {
      fs.rmSync(path.join(staging, rel), { recursive: true, force: true });
    }
  }

  // 2.5. fill CLAUDE.md / AGENTS.md placeholders (SPEC §3.4). Defensive: these are templates
  // owned by a parallel workstream — if they don't exist yet, skip injection quietly.
  const presentModules = Object.keys(manifest).filter((k) => manifest[k].forced || input.modules.includes(k));
  injectAgentDocs(staging, {
    PROJECT_NAME: input.name,
    SUBDOMAIN: input.subdomain,
    LIVE_URL: liveUrlFor(input.subdomain),
    MODULES_LIST: presentModules.join(", "),
  }, presentModules);

  // 3. inject per-project config
  const viperJson = {
    projectId: input.projectId,
    name: input.name,
    subdomain: input.subdomain,
    modules: presentModules,
    authServiceUrl: input.authServiceUrl,
    viperUrl: input.viperUrl,
  };
  fs.writeFileSync(path.join(staging, "viper.json"), JSON.stringify(viperJson, null, 2));

  // .env.local — ready to run locally. Dev bypass ON so there's no login wall on localhost.
  // Ships the deploy token AND the project's client secret — both scoped to this one project,
  // both revocable (rotate-secret), and the zip is only downloadable by the project's own
  // members. The client secret is what makes the local /admin panel able to manage real
  // members against the auth service. Never committed (.gitignore) / never in the image
  // (.dockerignore + tar exclude + server scrub).
  // DATABASE_URL (SPEC §0.3) is only written when provisioning actually succeeded — omitted
  // entirely otherwise, so lib/db.ts's clear "unset" error is what a builder sees, not a blank.
  const envLocal = [
    `# Ready-to-run local config for "${input.name}". Do NOT commit this file (see .gitignore).`,
    `# Tip: set AUTH_DEV_BYPASS=0 to test the real login flow locally.`,
    `AUTH_DEV_BYPASS=1`,
    `AUTH_SERVICE_URL=${input.authServiceUrl}`,
    `PROJECT_ID=${input.projectId}`,
    `AUTH_CLIENT_ID=${input.clientId}`,
    `AUTH_CLIENT_SECRET=${input.clientSecret}`,
    `VIPER_URL=${input.viperUrl}`,
    `VIPER_DEPLOY_TOKEN=${input.deployToken}`,
    ...(presentModules.includes("db") && input.dbEnv
      ? [`INSFORGE_URL=${input.dbEnv.url}`, `INSFORGE_API_KEY=${input.dbEnv.apiKey}`]
      : presentModules.includes("db") && input.databaseUrl
        ? [`DATABASE_URL=${input.databaseUrl}`]
        : []),
    ``,
  ].join("\n");
  fs.writeFileSync(path.join(staging, ".env.local"), envLocal);

  // 4. zip the staging dir
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const zipFile = path.join(OUTPUT_DIR, `${input.subdomain}.zip`);
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(zipFile);
    const archive = archiver("zip", { zlib: { level: 9 } });
    out.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(out);
    archive.directory(staging, false);
    archive.finalize();
  });

  fs.rmSync(staging, { recursive: true, force: true });
  return { zipFile };
}
