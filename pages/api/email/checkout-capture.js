// Captures the checkout page's own email + marketing-consent checkbox —
// the custom storefront's replacement for what the Shopify
// customers/create webhook used to provide before the move off Shopify.
// Consent-gated same as everywhere else in this app: without `consent`
// true, nothing is created and nothing is tracked, since an abandoned-
// checkout email is itself a marketing send. Public, cross-origin (same
// CORS allowlist as /api/email/subscribe and /api/track/*) — this is a
// client-side call from the checkout page, not a signed server-to-server
// webhook, so it's only trusted with the same low-stakes blast radius as
// the other /api/track/* routes (worst case: a spoofed call nudges
// someone's automation state or order count, nothing financial).

import { applyCors } from '../../../lib/cors';
import { addSubscriberManually, recordCheckoutStarted } from '../../../lib/subscribersStore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 25;

// Untrusted client input — cap the array and only keep the fields
// renderCartItemsHtml (lib/emailBlocks.js) actually uses, coerced to the
// right types, so nothing unexpected ends up stored on the subscriber
// record or rendered into an email later.
function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_ITEMS).map((item) => ({
    id: String(item?.id ?? ''),
    name: String(item?.name ?? 'Item').slice(0, 200),
    quantity: Number(item?.quantity) || 1,
    price: item?.price != null ? Number(item.price) || 0 : null,
    image: item?.image ? String(item.image).slice(0, 500) : null,
  }));
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, consent, cartValue, items } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Invalid email.' });
  }
  if (!consent) return res.status(200).json({ ok: true, skipped: 'no consent' });

  try {
    await addSubscriberManually(email, 'checkout').catch(() => {});
    await recordCheckoutStarted(email, Number(cartValue) || 0, sanitizeItems(items));
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
