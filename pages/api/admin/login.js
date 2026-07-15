import { timingSafeEqual } from 'crypto';
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '../../../lib/adminAuth';

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD is not set.' });
  }

  const { password } = req.body || {};
  if (!password || !safeEqual(String(password), adminPassword)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  try {
    const token = await createSession();
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
