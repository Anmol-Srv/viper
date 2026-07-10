#!/usr/bin/env node
// Viper deploy CLI (`npm run deploy`).
// Tars the project and POSTs it to the Viper portal's deploy endpoint.
// No git/docker required on the builder's machine — just `tar` (mac/linux ship it).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function readEnvLocal() {
  const path = join(process.cwd(), '.env.local');
  if (!existsSync(path)) return {};

  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return env;
}

async function deploy(viperUrl, token, projectId, tarPath) {
  const form = new FormData();
  form.append('projectId', projectId);
  form.append('file', new Blob([readFileSync(tarPath)], { type: 'application/gzip' }), 'project.tar.gz');

  const res = await fetch(`${viperUrl}/api/deploy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
  }

  // The portal may stream newline-delimited status updates, or just return final JSON.
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('ndjson') && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalUrl = null;
    let ok = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        console.log(line);
        try {
          const parsed = JSON.parse(line);
          if (parsed.url) finalUrl = parsed.url;
          if (typeof parsed.ok === 'boolean') ok = parsed.ok;
        } catch {
          // plain-text status line, already printed above
        }
      }
    }
    if (finalUrl) console.log(`\nDeployed: ${finalUrl}`);
    if (ok === false) process.exitCode = 1;
  } else {
    const data = await res.json().catch(() => ({}));
    console.log(JSON.stringify(data, null, 2));
    if (data.url) console.log(`\nDeployed: ${data.url}`);
    if (data.ok === false) process.exitCode = 1;
  }
}

async function main() {
  const viperJsonPath = join(process.cwd(), 'viper.json');
  if (!existsSync(viperJsonPath)) {
    console.error('viper.json not found. Run `npm run deploy` from your project root.');
    process.exitCode = 1;
    return;
  }

  const viperConfig = JSON.parse(readFileSync(viperJsonPath, 'utf8'));
  const env = { ...readEnvLocal(), ...process.env };
  const deployToken = env.VIPER_DEPLOY_TOKEN;
  const viperUrl = viperConfig.viperUrl || env.VIPER_URL;

  if (!deployToken) {
    console.error('Missing VIPER_DEPLOY_TOKEN in .env.local. Get one from your Viper project settings.');
    process.exitCode = 1;
    return;
  }
  if (!viperUrl) {
    console.error('Missing viperUrl in viper.json (and no VIPER_URL fallback in .env.local).');
    process.exitCode = 1;
    return;
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'viper-deploy-'));
  const tarPath = join(tmpDir, `${viperConfig.subdomain || 'project'}.tar.gz`);

  console.log('Packing project...');
  try {
    execFileSync(
      'tar',
      [
        '-czf',
        tarPath,
        '--exclude=node_modules',
        '--exclude=.next',
        '--exclude=.git',
        '--exclude=.env.local',
        '--exclude=.env*.local',
        '.',
      ],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
      },
    );
  } catch {
    console.error('Failed to tar the project. Is `tar` installed? (mac/linux ship it by default.)');
    rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }

  console.log(`Deploying ${viperConfig.name || viperConfig.projectId} to ${viperUrl}...`);
  try {
    await deploy(viperUrl, deployToken, viperConfig.projectId, tarPath);
  } catch (err) {
    console.error(`Could not reach Viper at ${viperUrl}: ${err.message}`);
    console.error('Is the Viper portal running? Check VIPER_URL / viperUrl in viper.json.');
    process.exitCode = 1;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
