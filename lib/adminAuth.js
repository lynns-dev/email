// Admin session handling, backed by the same Upstash KV store used
// elsewhere. A session is just a random token stored as
// admin_session:<token> -> "1", set to expire in a year so a login stays
// valid indefinitely in practice — the only way to end a session sooner is
// the explicit logout button (see pages/api/admin/logout.js).

import { randomUUID } from 'crypto';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;
export const SESSION_COOKIE = 'admin_session';

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  }
}

export async function createSession() {
  assertConfigured();
  const token = randomUUID().replace(/-/g, '');
  const res = await fetch(`${KV_URL}/set/admin_session:${token}?EX=${SESSION_TTL_SECONDS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: '1',
  });
  if (!res.ok) throw new Error('Failed to create admin session.');
  return token;
}

export async function verifySession(token) {
  if (!token) return false;
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/admin_session:${token}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await res.json();
  return Boolean(data.result);
}

export async function deleteSession(token) {
  if (!token) return;
  assertConfigured();
  await fetch(`${KV_URL}/del/admin_session:${token}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
}
