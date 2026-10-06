import { confirmWelcomeAnswer, resolveWelcomeAnswer, welcomeEnabled } from '../../../lib/veilWelcome';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  try {
    if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) throw new Error('Use the answer page');
    const token = String(req.body?.token || '');
    const resolved = await resolveWelcomeAnswer(token);
    if (!resolved.qa && !await welcomeEnabled()) throw new Error('Flow not active');
    const result = await confirmWelcomeAnswer(token);
    if (!result?.ok) throw new Error('Please try again');
    return res.redirect(303, `/welcome-answer?token=${encodeURIComponent(token)}&confirmed=1`);
  } catch (err) {
    if (process.env.VERCEL_ENV !== 'production') return res.status(400).json({ error: err.message, origin: req.headers.origin || null, host: req.headers.host, tokenPresent: Boolean(req.body?.token) });
    return res.status(400).send('Your answer could not be saved. Please reopen your email link and try again.');
  }
}
