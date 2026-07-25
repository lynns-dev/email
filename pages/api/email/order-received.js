// Server-to-server order-completed signal for a non-Shopify custom
// storefront (the Shopify orders/create webhook — pages/api/shopify/
// webhook.js — covers this same job for Shopify stores). Called directly
// from the storefront's own order-fulfillment code right after a charge
// captures, so touchLastOrder() clears the in-progress abandoned_checkout
// automation state the same way it does for Shopify orders — otherwise a
// customer who already paid keeps getting cart-recovery emails.
//
// Bearer-token protected (STOREFRONT_WEBHOOK_SECRET), not CORS/public like
// /api/email/checkout-capture — this carries no consent implications on
// its own (touchLastOrder never creates a subscriber, only updates one
// that already exists), but a forged call could still suppress a real
// abandoned-checkout send, so it's held to the same bar as the cron
// routes rather than the low-stakes tracking endpoints.

import { touchLastOrder } from '../../../lib/subscribersStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STOREFRONT_WEBHOOK_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Not authorized.' });
  }

  const { email, timestamp } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required.' });

  try {
    const ms = timestamp ? new Date(timestamp).getTime() : Date.now();
    const updated = await touchLastOrder(email, ms);
    return res.status(200).json({ ok: true, updated: Boolean(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
