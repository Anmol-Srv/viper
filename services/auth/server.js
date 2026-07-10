'use strict';
// Viper common auth + permissions service.
// Multi-tenant: one login for every Viper project; each project extends with its own roles/perms.
// ponytail: the OTP+session engine here is the DEV AuthEngine (JWT + console OTP). Prod swaps
// Insforge/Keycloak behind these same routes — the policy layer (projects/members/roles) stays.
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const Fastify = require('fastify');

const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-insecure-secret-change-me';
const EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || '@airtribe.live';
const PORT = Number(process.env.PORT || 4000);
const PROD = process.env.NODE_ENV === 'production';
const ADMIN_KEY = process.env.AUTH_ADMIN_KEY || '';

const db = new Database(process.env.AUTH_DB || path.join(__dirname, 'auth.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT, subdomain TEXT UNIQUE, owner_email TEXT,
    client_id TEXT, client_secret_hash TEXT, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS members (
    project_id TEXT, email TEXT, role TEXT, status TEXT,
    PRIMARY KEY (project_id, email)
  );
  CREATE TABLE IF NOT EXISTS roles (
    project_id TEXT, name TEXT, PRIMARY KEY (project_id, name)
  );
  CREATE TABLE IF NOT EXISTS permissions (
    project_id TEXT, role TEXT, perm TEXT
  );
`);

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const otps = new Map(); // `${projectId}:${email}` -> { otp, exp }

function seedProject(projectId) {
  const r = db.prepare('INSERT OR IGNORE INTO roles (project_id, name) VALUES (?,?)');
  r.run(projectId, 'owner');
  r.run(projectId, 'member');
  const p = db.prepare('INSERT OR IGNORE INTO permissions (project_id, role, perm) VALUES (?,?,?)');
  p.run(projectId, 'owner', '*');
  p.run(projectId, 'member', 'read');
}
const permsFor = (projectId, role) =>
  db.prepare('SELECT perm FROM permissions WHERE project_id=? AND role=?').all(projectId, role).map((x) => x.perm);

// Verifies the Bearer clientSecret belongs to `projectId`. Replies 401 + returns null on failure.
function verifyClient(req, reply, projectId) {
  const secret = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const proj = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  if (!proj || !secret || proj.client_secret_hash !== sha(secret)) {
    reply.code(401).send({ error: 'bad client credentials' });
    return null;
  }
  return proj;
}

// True if the request carries the operator admin key (x-viper-admin header). Never true if
// AUTH_ADMIN_KEY is unset — an empty env var must not act as a wildcard credential.
function isAdmin(req) {
  return Boolean(ADMIN_KEY) && req.headers['x-viper-admin'] === ADMIN_KEY;
}

const app = Fastify({ logger: false });

app.get('/health', async () => ({ ok: true }));

// Create a project (called by the Viper portal at project-create time).
app.post('/projects', async (req, reply) => {
  const { name, subdomain, ownerEmail } = req.body || {};
  if (!name || !subdomain || !ownerEmail) return reply.code(400).send({ error: 'name, subdomain, ownerEmail required' });
  if (!String(ownerEmail).endsWith(EMAIL_DOMAIN)) return reply.code(400).send({ error: `owner must be ${EMAIL_DOMAIN}` });
  const projectId = 'prj_' + crypto.randomBytes(8).toString('hex');
  const clientId = 'cid_' + crypto.randomBytes(6).toString('hex');
  const clientSecret = 'csec_' + crypto.randomBytes(24).toString('hex');
  try {
    db.prepare(
      'INSERT INTO projects (id,name,subdomain,owner_email,client_id,client_secret_hash,created_at) VALUES (?,?,?,?,?,?,?)'
    ).run(projectId, name, subdomain, ownerEmail, clientId, sha(clientSecret), new Date().toISOString());
  } catch (e) {
    return reply.code(409).send({ error: 'subdomain already taken' });
  }
  seedProject(projectId);
  db.prepare('INSERT OR IGNORE INTO members (project_id,email,role,status) VALUES (?,?,?,?)').run(projectId, ownerEmail, 'owner', 'active');
  return { projectId, clientId, clientSecret };
});

// Owner (or the project's own backend) invites/sets a member. x-viper-admin is an alternative
// to the Bearer clientSecret (portal manage UI won't hold every project's secret).
app.post('/projects/:id/members', async (req, reply) => {
  const projectId = req.params.id;
  if (!isAdmin(req) && !verifyClient(req, reply, projectId)) return;
  const { email, role } = req.body || {};
  if (!email || !role) return reply.code(400).send({ error: 'email, role required' });
  if (!String(email).endsWith(EMAIL_DOMAIN)) return reply.code(400).send({ error: `member must be ${EMAIL_DOMAIN}` });
  if (!db.prepare('SELECT 1 FROM roles WHERE project_id=? AND name=?').get(projectId, role))
    return reply.code(400).send({ error: 'unknown role for this project' });
  db.prepare('INSERT OR REPLACE INTO members (project_id,email,role,status) VALUES (?,?,?,?)').run(projectId, email, role, 'active');
  return { ok: true };
});

// Operator-only: regenerate a project's clientSecret (e.g. after a suspected leak).
app.post('/projects/:id/rotate-secret', async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: 'bad admin credentials' });
  const projectId = req.params.id;
  const proj = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  if (!proj) return reply.code(404).send({ error: 'unknown project' });
  const clientSecret = 'csec_' + crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE projects SET client_secret_hash=? WHERE id=?').run(sha(clientSecret), projectId);
  return { clientSecret };
});

// Start login: email -> OTP. Locked to the company domain + project membership.
app.post('/session/start', async (req, reply) => {
  const { projectId, email } = req.body || {};
  if (!projectId || !email) return reply.code(400).send({ error: 'projectId, email required' });
  if (!String(email).endsWith(EMAIL_DOMAIN)) return reply.code(403).send({ error: `login is locked to ${EMAIL_DOMAIN}` });
  if (!db.prepare('SELECT 1 FROM members WHERE project_id=? AND email=?').get(projectId, email))
    return reply.code(403).send({ error: 'not a member of this project — ask the owner to invite you' });
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  otps.set(`${projectId}:${email}`, { otp, exp: Date.now() + 10 * 60 * 1000 });
  console.log(`[viper-auth] OTP for ${email} @ ${projectId}: ${otp}`);
  return PROD ? { ok: true } : { ok: true, devOtp: otp };
});

// Verify OTP -> issue a 12h session JWT.
app.post('/session/verify', async (req, reply) => {
  const { projectId, email, otp } = req.body || {};
  const rec = otps.get(`${projectId}:${email}`);
  if (!rec || rec.exp < Date.now() || rec.otp !== otp) return reply.code(401).send({ error: 'invalid or expired OTP' });
  otps.delete(`${projectId}:${email}`);
  const member = db.prepare('SELECT * FROM members WHERE project_id=? AND email=?').get(projectId, email);
  if (!member) return reply.code(403).send({ error: 'not a member' });
  const token = jwt.sign({ projectId, email, role: member.role }, JWT_SECRET, { expiresIn: '12h' });
  return { token };
});

// A project's backend validates a session token here on every request (server-side enforcement).
app.post('/session/check', async (req, reply) => {
  const { token } = req.body || {};
  if (!token) return reply.code(400).send({ error: 'token required' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return reply.code(401).send({ error: 'invalid or expired token' });
  }
  if (!verifyClient(req, reply, payload.projectId)) return; // token must be checked by its own project's creds
  const member = db.prepare('SELECT * FROM members WHERE project_id=? AND email=?').get(payload.projectId, payload.email);
  if (!member || member.status !== 'active') return reply.code(401).send({ error: 'not an active member' });
  return { user: { email: payload.email }, role: member.role, permissions: permsFor(payload.projectId, member.role) };
});

if (require.main === module) {
  app
    .listen({ port: PORT, host: '0.0.0.0' })
    .then(() => console.log(`[viper-auth] listening on http://localhost:${PORT}  (login locked to ${EMAIL_DOMAIN})`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { app, db };
