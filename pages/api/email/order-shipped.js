// Sends the "your order has shipped" transactional notice, triggered
// directly from the storefront admin the moment tracking is entered for an
// order (pages/api/admin/orders/tracking.js in that repo) — unlike
// order-received.js, this actually sends an email itself rather than just
// updating automation state, since there's no flow step this maps onto
// (the content is per-order dynamic tracking info, not a generic templated
// automation step).
//
// Bearer-token protected with the same STOREFRONT_WEBHOOK_SECRET as
// order-received.js — a forged call here would send a real email to a
// real customer, so it's held to the same bar.

import { sendTransactionalEmail } from '../../../lib/resendEmail';
import { renderOrderShippedEmail } from '../../../lib/orderShippedEmail';
import { getSettings } from '../../../lib/settingsStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STOREFRONT_WEBHOOK_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Not authorized.' });
  }

  const { email, orderId, carrier, trackingNumber, trackingUrl } = req.body || {};
  if (!email || !trackingNumber) {
    return res.status(400).json({ error: 'email and trackingNumber are required.' });
  }

  try {
    const settings = await getSettings().catch(() => ({}));
    const html = renderOrderShippedEmail({ orderId, carrier, trackingNumber, trackingUrl, settings });
    await sendTransactionalEmail({
      to: email,
      subject: 'Your order has shipped!',
      html,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
