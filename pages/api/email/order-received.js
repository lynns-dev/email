// Server-to-server order-completed signal for a non-Shopify custom
// storefront (the Shopify orders/create webhook — pages/api/shopify/
// webhook.js — covers this same job for Shopify stores). Called directly
// from the storefront's own order-fulfillment code right after a charge
// captures, so touchLastOrder() clears the in-progress abandoned_checkout
// automation state the same way it does for Shopify orders — otherwise a
// customer who already paid keeps getting cart-recovery emails.
//
// Bearer-token protected (STOREFRONT_WEBHOOK_SECRET, matching the
// storefront's own EMAIL_APP_WEBHOOK_SECRET), not CORS/public like
// /api/email/checkout-capture — a forged call here could suppress a real
// abandoned-checkout send, so it's held to the same bar as the cron
// routes rather than the low-stakes tracking endpoints.
//
// Creates the subscriber if they don't already exist — an order is at
// least as strong a signal as a manual admin add or a checkout-capture
// consent checkbox, so this shouldn't silently drop someone who paid
// just because they checked out via an express payment method that
// skipped the email field's blur handler (touchLastOrder alone would
// no-op for someone not already a subscriber).

import { findSubscriber, touchLastOrder } from '../../../lib/subscribersStore';

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
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  try {
    // A purchase is not fresh marketing consent. Update existing records only.
    const existing = await findSubscriber(email);
    if (!existing) return res.status(200).json({ ok: true, noSubscriber: true });
    const ms = timestamp ? new Date(timestamp).getTime() : Date.now();
    if (!Number.isFinite(ms)) return res.status(400).json({ error: 'Invalid timestamp' });
    await touchLastOrder(email, ms);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
