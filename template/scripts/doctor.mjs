#!/usr/bin/env node
// Viper environment doctor (`npm run doctor`).
// Four checks, ✓/✗ each with a one-line fix. First move when anything's wrong —
// see docs/troubleshooting.md and docs/deploy.md.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;

function report(ok, label, fixHint) {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}`);
    console.log(`  fix: ${fixHint}`);
  }
}

function readEnvLocal(path) {
  if (!existsSync(path)) return null;
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

// 1. Node version
const nodeMajor = Number(process.versions.node.split('.')[0]);
report(
  nodeMajor >= 20,
  `Node.js ${process.versions.node} (need >= 20)`,
  'install Node 20 LTS from nodejs.org, then open a new terminal',
);

// 2. .env.local present
const envLocalPath = join(process.cwd(), '.env.local');
const envLocal = readEnvLocal(envLocalPath);
report(
  envLocal !== null,
  '.env.local present',
  'run: cp .env.local.example .env.local',
);

// 3. viper.json parses
const viperJsonPath = join(process.cwd(), 'viper.json');
let viperConfig = null;
try {
  viperConfig = JSON.parse(readFileSync(viperJsonPath, 'utf8'));
  report(true, 'viper.json parses', '');
} catch {
  report(
    false,
    'viper.json parses',
    'viper.json is missing or corrupt — re-download the project zip from Viper',
  );
}

// 4. Viper portal reachable
const viperUrl = envLocal?.VIPER_URL || viperConfig?.viperUrl;
if (!viperUrl) {
  report(false, 'Viper portal reachable', 'no VIPER_URL in .env.local or viper.json — fix checks 2/3 first');
} else {
  try {
    const res = await fetch(`${viperUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
    report(
      res.ok,
      `Viper portal reachable (${viperUrl})`,
      'Viper portal unreachable — it may be down, ask the platform admin',
    );
  } catch {
    report(
      false,
      `Viper portal reachable (${viperUrl})`,
      'Viper portal unreachable — it may be down, ask the platform admin',
    );
  }
}

console.log('');
if (failures > 0) {
  console.log(`${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exitCode = 1;
} else {
  console.log('All checks passed.');
}
