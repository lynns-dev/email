import { applyCors } from '../../../lib/cors';
import { recordCheckoutStarted } from '../../../lib/subscribersStore';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).end();
  }

  const { email, cartValue } = req.body || {};
  if (!email) return res.status(400).end();

  try {
    await recordCheckoutStarted(email, Number(cartValue) || 0);
    return res.status(204).end();
  } catch {
    return res.status(204).end();
  }
}
