import { applyCors } from '../../../lib/cors';
import { updateCartActivity } from '../../../lib/subscribersStore';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).end();
  }

  const { email, cartValue, itemCount } = req.body || {};
  if (!email) return res.status(400).end();

  try {
    await updateCartActivity(email, Number(cartValue) || 0, Number(itemCount) || 0);
    return res.status(204).end();
  } catch {
    // Fire-and-forget tracking endpoint — never surface a 500 to the
    // pixel, it has nothing useful to do with one.
    return res.status(204).end();
  }
}
