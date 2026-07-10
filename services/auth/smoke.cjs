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

const { app } = require('./server.js');

const post = async (url, body, headers = {}) => {
  const res = await app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': 'application/json', ...headers } });
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

  console.log('✅ auth smoke passed');
  try { fs.unlinkSync(process.env.AUTH_DB); } catch {}
  process.exit(0);
})().catch((e) => {
  console.error('❌ smoke failed:', e.message);
  process.exit(1);
});
