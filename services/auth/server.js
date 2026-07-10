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
const PLATFORM_ADMIN = process.env.AUTH_PLATFORM_ADMIN || 'enggv2@airtribe.live';
const VIPER_PROJECT_ID = 'prj_viper';

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
// ponytail: better-sqlite3 has no ADD COLUMN IF NOT EXISTS — try/catch the duplicate-column error.
try {
  db.exec('ALTER TABLE projects ADD COLUMN open_enrollment INTEGER DEFAULT 0');
} catch {}

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

// Idempotent seed: the Viper portal dogfoods its own auth service as an open-enrollment project.
// No clientId/clientSecret — the portal talks to this service directly (server-side), not as a
// tenant backend, so nothing needs a client credential (see /session/check x-viper-admin path).
// SPEC v1.3 A2: the portal is invite-only — open_enrollment=0, and the ON CONFLICT branch
// re-asserts that on every boot so existing DBs (seeded under v1.2 with open_enrollment=1)
// get flipped too.
function seedPortalProject() {
  db.prepare(
    `INSERT INTO projects (id,name,subdomain,owner_email,client_id,client_secret_hash,created_at,open_enrollment)
     VALUES (?,?,?,?,NULL,NULL,?,0)
     ON CONFLICT(id) DO UPDATE SET open_enrollment=0`
  ).run(VIPER_PROJECT_ID, 'Viper Portal', 'viper', PLATFORM_ADMIN, new Date().toISOString());
  seedProject(VIPER_PROJECT_ID);
  db.prepare('INSERT OR IGNORE INTO members (project_id,email,role,status) VALUES (?,?,?,?)').run(
    VIPER_PROJECT_ID,
    PLATFORM_ADMIN,
    'owner',
    'active'
  );
}
seedPortalProject();

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

// Shared auth guard for the /projects/:id/members* routes (SPEC 0.1): project must exist first
// (404, regardless of credentials), then either x-viper-admin or that project's Bearer
// clientSecret (401 otherwise). Replies and returns null on failure; returns the project row on
// success.
function requireProjectMemberAuth(req, reply, projectId) {
  const proj = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  if (!proj) {
    reply.code(404).send({ error: 'unknown project' });
    return null;
  }
  if (isAdmin(req)) return proj;
  const secret = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || proj.client_secret_hash !== sha(secret)) {
    reply.code(401).send({ error: 'bad client credentials' });
    return null;
  }
  return proj;
}

// --- Mailer (SPEC 1.4) ---------------------------------------------------
// Transport resolution: Postmark HTTP API > SMTP (nodemailer) > dev console fallback.
// When a real transport is configured, callers must NOT surface devOtp in responses.
const POSTMARK_TOKEN = process.env.POSTMARK_TOKEN || '';
const SMTP_URL = process.env.SMTP_URL || '';
const MAIL_FROM = process.env.MAIL_FROM || 'viper@airtribe.live';
const HAS_MAIL_TRANSPORT = Boolean(POSTMARK_TOKEN || SMTP_URL);

// Fail loud: production with no real transport would silently break every login.
if (PROD && !HAS_MAIL_TRANSPORT) {
  console.error('[viper-auth] NODE_ENV=production but no mail transport configured (POSTMARK_TOKEN or SMTP_URL) — refusing to start.');
  process.exit(1);
}

let smtpTransport = null;
function getSmtpTransport() {
  if (!smtpTransport) smtpTransport = require('nodemailer').createTransport(SMTP_URL);
  return smtpTransport;
}

function otpEmailBody(otp, projectName) {
  return `Your ${projectName} sign-in code is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request this, ignore this email.`;
}

// Sends the OTP by whatever transport is configured; dev fallback just logs it (caller decides
// whether to also return devOtp in the HTTP response).
async function sendOtp(email, otp, projectName) {
  const subject = `${projectName} sign-in code: ${otp}`;
  const text = otpEmailBody(otp, projectName);
  if (POSTMARK_TOKEN) {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': POSTMARK_TOKEN,
      },
      body: JSON.stringify({ From: MAIL_FROM, To: email, Subject: subject, TextBody: text }),
    });
    if (!res.ok) throw new Error(`postmark send failed: ${res.status} ${await res.text()}`);
    return;
  }
  if (SMTP_URL) {
    await getSmtpTransport().sendMail({ from: MAIL_FROM, to: email, subject, text });
    return;
  }
  console.log(`[viper-auth] OTP for ${email} @ ${projectName}: ${otp}`);
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

// Owner (or the project's own backend) invites/sets a member. Also the role-change path: an
// upsert on an existing (project_id, email) row just overwrites role/status. x-viper-admin is
// an alternative to the Bearer clientSecret (portal manage UI won't hold every project's secret).
app.post('/projects/:id/members', async (req, reply) => {
  const projectId = req.params.id;
  if (!requireProjectMemberAuth(req, reply, projectId)) return;
  const { email, role } = req.body || {};
  if (!email || !role) return reply.code(400).send({ error: 'email, role required' });
  if (!String(email).endsWith(EMAIL_DOMAIN)) return reply.code(400).send({ error: `member must be ${EMAIL_DOMAIN}` });
  if (!db.prepare('SELECT 1 FROM roles WHERE project_id=? AND name=?').get(projectId, role))
    return reply.code(400).send({ error: 'unknown role for this project' });
  db.prepare('INSERT OR REPLACE INTO members (project_id,email,role,status) VALUES (?,?,?,?)').run(projectId, email, role, 'active');
  return { ok: true };
});

// List a project's members (SPEC 0.1).
app.get('/projects/:id/members', async (req, reply) => {
  const projectId = req.params.id;
  if (!requireProjectMemberAuth(req, reply, projectId)) return;
  const members = db.prepare('SELECT email, role, status FROM members WHERE project_id=?').all(projectId);
  return { members };
});

// Remove a member (SPEC 0.1). Refuses to remove the last owner — a project must always keep at
// least one owner able to manage it. Removing a non-member (or a project with none) is a no-op.
app.delete('/projects/:id/members/:email', async (req, reply) => {
  const projectId = req.params.id;
  if (!requireProjectMemberAuth(req, reply, projectId)) return;
  const email = req.params.email;
  const member = db.prepare('SELECT * FROM members WHERE project_id=? AND email=?').get(projectId, email);
  if (member && member.role === 'owner') {
    const { c } = db.prepare("SELECT COUNT(*) as c FROM members WHERE project_id=? AND role='owner'").get(projectId);
    if (c <= 1) return reply.code(400).send({ error: 'cannot remove the last owner' });
  }
  db.prepare('DELETE FROM members WHERE project_id=? AND email=?').run(projectId, email);
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

// Start login: email -> OTP. Locked to the company domain + project membership (or
// auto-enrolled as `member` when the project has open_enrollment — see SPEC 1.1).
app.post('/session/start', async (req, reply) => {
  const { projectId, email } = req.body || {};
  if (!projectId || !email) return reply.code(400).send({ error: 'projectId, email required' });
  if (!String(email).endsWith(EMAIL_DOMAIN)) return reply.code(403).send({ error: `login is locked to ${EMAIL_DOMAIN}` });
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  let isMember = db.prepare('SELECT 1 FROM members WHERE project_id=? AND email=?').get(projectId, email);
  if (!isMember && project && project.open_enrollment) {
    db.prepare('INSERT OR IGNORE INTO members (project_id,email,role,status) VALUES (?,?,?,?)').run(projectId, email, 'member', 'active');
    isMember = true;
  }
  if (!isMember) {
    // SPEC v1.3 A2: the portal itself is invite-only — point rejected logins at a platform admin
    // instead of "the owner" (which reads as though self-serve project ownership applies here).
    const message =
      projectId === VIPER_PROJECT_ID
        ? 'not a member — ask a platform admin to invite you'
        : 'not a member of this project — ask the owner to invite you';
    return reply.code(403).send({ error: message });
  }
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  otps.set(`${projectId}:${email}`, { otp, exp: Date.now() + 10 * 60 * 1000 });
  await sendOtp(email, otp, project.name);
  return HAS_MAIL_TRANSPORT || PROD ? { ok: true } : { ok: true, devOtp: otp };
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
// x-viper-admin is an alternative to the Bearer clientSecret — the operator can check any
// project's token without holding every tenant's secret.
app.post('/session/check', async (req, reply) => {
  const { token } = req.body || {};
  if (!token) return reply.code(400).send({ error: 'token required' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return reply.code(401).send({ error: 'invalid or expired token' });
  }
  if (!isAdmin(req) && !verifyClient(req, reply, payload.projectId)) return; // token must be checked by its own project's creds
  const member = db.prepare('SELECT * FROM members WHERE project_id=? AND email=?').get(payload.projectId, payload.email);
  if (!member || member.status !== 'active') return reply.code(401).send({ error: 'not an active member' });
  return { user: { email: payload.email }, role: member.role, permissions: permsFor(payload.projectId, member.role) };
});

// Operator-only teardown (SPEC 1.6): deletes a project and all its policy rows. The portal
// project (prj_viper) is not deletable — it's how everyone including the operator logs in.
app.delete('/projects/:id', async (req, reply) => {
  if (!isAdmin(req)) return reply.code(401).send({ error: 'bad admin credentials' });
  const projectId = req.params.id;
  if (projectId === VIPER_PROJECT_ID) return reply.code(400).send({ error: 'cannot delete the Viper portal project' });
  const proj = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  if (!proj) return reply.code(404).send({ error: 'unknown project' });
  db.prepare('DELETE FROM members WHERE project_id=?').run(projectId);
  db.prepare('DELETE FROM roles WHERE project_id=?').run(projectId);
  db.prepare('DELETE FROM permissions WHERE project_id=?').run(projectId);
  db.prepare('DELETE FROM projects WHERE id=?').run(projectId);
  return { ok: true };
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
