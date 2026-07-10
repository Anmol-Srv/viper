'use strict';
// Runnable check for the auth security path. Uses fastify.inject (no port/network) and a
// throwaway DB. Covers the happy path + the three failure cases that matter:
//  - foreign email domain rejected
//  - wrong OTP rejected
//  - a valid token checked with the WRONG project's client secret rejected (cross-project theft)
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.AUTH_DB = path.join(os.tmpdir(), `viper-auth-smoke-${process.pid}.db`);
process.env.AUTH_JWT_SECRET = 'test-secret';
process.env.AUTH_ADMIN_KEY = 'test-admin-key';
delete process.env.NODE_ENV; // ensure devOtp is returned

const { app, db } = require('./server.js');

const post = async (url, body, headers = {}) => {
  const res = await app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': 'application/json', ...headers } });
  return { status: res.statusCode, body: res.json() };
};
const del = async (url, headers = {}) => {
  const res = await app.inject({ method: 'DELETE', url, headers });
  return { status: res.statusCode, body: res.json() };
};
const get = async (url, headers = {}) => {
  const res = await app.inject({ method: 'GET', url, headers });
  return { status: res.statusCode, body: res.json() };
};

(async () => {
  await app.ready();
  const email = 'tester@airtribe.live';

  let r = await post('/projects', { name: 'Smoke', subdomain: 'smoke1', ownerEmail: email });
  assert.equal(r.status, 200, 'create project');
  const { projectId, clientSecret } = r.body;
  assert.ok(projectId && clientSecret, 'got creds');

  // a second project, to test cross-project isolation later
  r = await post('/projects', { name: 'Other', subdomain: 'other1', ownerEmail: email });
  const otherSecret = r.body.clientSecret;

  r = await post('/session/start', { projectId, email: 'x@gmail.com' });
  assert.equal(r.status, 403, 'foreign domain rejected');

  r = await post('/session/start', { projectId, email });
  assert.equal(r.status, 200, 'start ok');
  const otp = r.body.devOtp;
  assert.ok(otp, 'devOtp present');

  r = await post('/session/verify', { projectId, email, otp: '000000' });
  assert.equal(r.status, 401, 'wrong otp rejected');

  r = await post('/session/verify', { projectId, email, otp });
  assert.equal(r.status, 200, 'verify ok');
  const token = r.body.token;

  r = await post('/session/check', { token }, { authorization: 'Bearer ' + clientSecret });
  assert.equal(r.status, 200, 'session check ok');
  assert.equal(r.body.user.email, email);
  assert.equal(r.body.role, 'owner');
  assert.ok(r.body.permissions.includes('*'), 'owner has *');

  r = await post('/session/check', { token }, { authorization: 'Bearer ' + otherSecret });
  assert.equal(r.status, 401, 'token rejected under another project\'s client secret');

  // --- rotate-secret ---
  r = await post(`/projects/${projectId}/rotate-secret`, {});
  assert.equal(r.status, 401, 'rotate-secret without admin header rejected');

  r = await post(`/projects/${projectId}/rotate-secret`, {}, { 'x-viper-admin': 'wrong-key' });
  assert.equal(r.status, 401, 'rotate-secret with wrong admin key rejected');

  r = await post('/projects/prj_doesnotexist/rotate-secret', {}, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 404, 'rotate-secret on unknown project rejected');

  r = await post(`/projects/${projectId}/rotate-secret`, {}, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 200, 'rotate-secret with correct admin key ok');
  const newSecret = r.body.clientSecret;
  assert.ok(newSecret && newSecret !== clientSecret, 'got a new, different clientSecret');

  r = await post('/session/check', { token }, { authorization: 'Bearer ' + clientSecret });
  assert.equal(r.status, 401, 'old clientSecret rejected after rotation');

  r = await post('/session/check', { token }, { authorization: 'Bearer ' + newSecret });
  assert.equal(r.status, 200, 'new clientSecret works after rotation');

  // --- members via x-viper-admin ---
  r = await post(`/projects/${projectId}/members`, { email: 'teammate@airtribe.live', role: 'member' }, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 200, 'member insert via x-viper-admin ok');

  r = await post(`/projects/${projectId}/members`, { email: 'nobody@airtribe.live', role: 'member' });
  assert.equal(r.status, 401, 'member insert without auth rejected');

  r = await post('/projects/prj_doesnotexist/members', { email: 'x@airtribe.live', role: 'member' }, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 404, 'member insert on unknown project 404s');

  // --- GET /projects/:id/members (both auth paths + 401/404) ---
  r = await get(`/projects/${projectId}/members`);
  assert.equal(r.status, 401, 'GET members without auth rejected');

  r = await get(`/projects/${projectId}/members`, { 'x-viper-admin': 'wrong-key' });
  assert.equal(r.status, 401, 'GET members with wrong admin key rejected');

  r = await get(`/projects/${projectId}/members`, { authorization: 'Bearer ' + newSecret });
  assert.equal(r.status, 200, 'GET members via Bearer clientSecret ok');
  assert.ok(
    r.body.members.some((m) => m.email === email && m.role === 'owner') &&
      r.body.members.some((m) => m.email === 'teammate@airtribe.live' && m.role === 'member'),
    'GET members lists owner + teammate'
  );

  r = await get(`/projects/${projectId}/members`, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 200, 'GET members via x-viper-admin ok');

  r = await get('/projects/prj_doesnotexist/members', { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 404, 'GET members on unknown project 404s');

  // --- POST upsert doubles as the role-change path ---
  r = await post(`/projects/${projectId}/members`, { email: 'teammate@airtribe.live', role: 'owner' }, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 200, 'role-change via POST upsert ok');

  r = await get(`/projects/${projectId}/members`, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.ok(
    r.body.members.some((m) => m.email === 'teammate@airtribe.live' && m.role === 'owner'),
    'role-change reflected in GET members'
  );

  // --- DELETE /projects/:id/members/:email (both auth paths, 401/404, last-owner protection) ---
  r = await del(`/projects/${projectId}/members/${encodeURIComponent('teammate@airtribe.live')}`);
  assert.equal(r.status, 401, 'DELETE member without auth rejected');

  r = await del('/projects/prj_doesnotexist/members/x@airtribe.live', { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 404, 'DELETE member on unknown project 404s');

  // two owners now (email, teammate) — removing one via Bearer clientSecret must succeed
  r = await del(`/projects/${projectId}/members/${encodeURIComponent('teammate@airtribe.live')}`, { authorization: 'Bearer ' + newSecret });
  assert.equal(r.status, 200, 'DELETE second owner via Bearer clientSecret ok');

  r = await get(`/projects/${projectId}/members`, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.ok(!r.body.members.some((m) => m.email === 'teammate@airtribe.live'), 'teammate removed');

  // only one owner left (email) — deleting it must be refused
  r = await del(`/projects/${projectId}/members/${encodeURIComponent(email)}`, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 400, 'last-owner delete refused');

  r = await get(`/projects/${projectId}/members`, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.ok(r.body.members.some((m) => m.email === email), 'last owner still present after refused delete');

  // --- invite-only prj_viper (SPEC v1.3 A2): open_enrollment=0, special platform-admin message ---
  const newcomer = 'never-invited@airtribe.live';
  assert.ok(!db.prepare('SELECT 1 FROM members WHERE project_id=? AND email=?').get('prj_viper', newcomer), 'newcomer not a member yet');
  r = await post('/session/start', { projectId: 'prj_viper', email: newcomer });
  assert.equal(r.status, 403, 'prj_viper is invite-only: unknown email rejected');
  assert.equal(r.body.error, 'not a member — ask a platform admin to invite you', 'prj_viper 403 uses the platform-admin message');
  assert.ok(
    !db.prepare('SELECT 1 FROM members WHERE project_id=? AND email=?').get('prj_viper', newcomer),
    'no member row created — auto-enroll is off for prj_viper'
  );

  // the generic open_enrollment mechanism stays wired for any project that opts in — only
  // prj_viper's flag was flipped. Flip a test project's flag directly to prove it still fires.
  db.prepare('UPDATE projects SET open_enrollment=1 WHERE id=?').run(projectId);
  r = await post('/session/start', { projectId, email: 'walkin@airtribe.live' });
  assert.equal(r.status, 200, 'generic open-enrollment still auto-enrolls on a project that opts in');
  assert.ok(r.body.devOtp, 'devOtp present (no mail transport configured in smoke)');
  assert.ok(
    db.prepare('SELECT 1 FROM members WHERE project_id=? AND email=? AND role=?').get(projectId, 'walkin@airtribe.live', 'member'),
    'auto-enroll created a member row'
  );
  db.prepare('UPDATE projects SET open_enrollment=0 WHERE id=?').run(projectId);

  // a non-open project must still 403 an unknown email (exact current behavior preserved)
  r = await post('/session/start', { projectId, email: 'stranger@airtribe.live' });
  assert.equal(r.status, 403, 'non-open project still rejects unknown email');

  // --- /session/check via x-viper-admin (alternative to Bearer clientSecret) ---
  r = await post('/session/check', { token }, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 200, 'session/check via x-viper-admin ok');
  assert.equal(r.body.user.email, email);
  r = await post('/session/check', { token: 'garbage' }, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 401, 'session/check via x-viper-admin still rejects a bad token');

  // --- DELETE /projects/:id ---
  r = await del(`/projects/${projectId}`);
  assert.equal(r.status, 401, 'delete without admin key rejected');

  r = await del('/projects/prj_viper', { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 400, 'delete of prj_viper refused');

  r = await del('/projects/prj_doesnotexist', { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 404, 'delete of unknown project 404s');

  r = await del(`/projects/${projectId}`, { 'x-viper-admin': process.env.AUTH_ADMIN_KEY });
  assert.equal(r.status, 200, 'delete with admin key ok');
  assert.ok(!db.prepare('SELECT 1 FROM projects WHERE id=?').get(projectId), 'project row gone');
  assert.ok(!db.prepare('SELECT 1 FROM members WHERE project_id=?').get(projectId), 'member rows gone');
  assert.ok(!db.prepare('SELECT 1 FROM roles WHERE project_id=?').get(projectId), 'role rows gone');

  console.log('✅ auth smoke passed');
  try { fs.unlinkSync(process.env.AUTH_DB); } catch {}
  process.exit(0);
})().catch((e) => {
  console.error('❌ smoke failed:', e.message);
  process.exit(1);
});
