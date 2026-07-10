// Core zip generator: stage a copy of the template, strip un-selected modules, inject
// per-project config, and produce a downloadable zip. No git/network — pure fs + archiver.
import fs from "fs";
import os from "os";
import path from "path";
import archiver from "archiver";

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
  authServiceUrl: string;
  viperUrl: string;
};

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, "viper.modules.json"), "utf8"));
}

// Only names that can appear in the TEMPLATE dir. Do NOT add app dir names like "data"/"output"
// here — basename matching would wrongly skip legit module dirs (e.g. app/(app)/data).
const SKIP = new Set(["node_modules", ".next", ".git", ".env.local"]);

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

  // 3. inject per-project config
  const presentModules = Object.keys(manifest).filter((k) => manifest[k].forced || input.modules.includes(k));
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
  // Ships the deploy token (scoped/revocable). Does NOT ship AUTH_CLIENT_SECRET (Coolify-only).
  const envLocal = [
    `# Ready-to-run local config for "${input.name}". Do NOT commit this file (see .gitignore).`,
    `AUTH_DEV_BYPASS=1`,
    `AUTH_SERVICE_URL=${input.authServiceUrl}`,
    `PROJECT_ID=${input.projectId}`,
    `AUTH_CLIENT_ID=${input.clientId}`,
    `NEXT_PUBLIC_PROJECT_NAME=${input.name}`,
    `VIPER_URL=${input.viperUrl}`,
    `VIPER_DEPLOY_TOKEN=${input.deployToken}`,
    ...(presentModules.includes("db") ? [`INSFORGE_URL=`, `INSFORGE_API_KEY=`] : []),
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
