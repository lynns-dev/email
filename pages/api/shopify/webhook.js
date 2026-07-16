// Keeps the synced subscriber list current between manual backfills.
// Subscribed to customers/create, customers/update (consent changes +
// Shopify's own rolling orders_count/total_spent), and orders/create
// (precise purchase timestamp, independent of when Shopify re-syncs the
// customer object). HMAC-verified — see lib/shopify.js's
// verifyShopifyHmac for why (this is a public URL).

import { verifyShopifyHmac } from '../../../lib/shopify';
import { upsertFromShopify, touchLastOrder } from '../../../lib/subscribersStore';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function customerFromPayload(payload) {
  const consentState = payload.email_marketing_consent?.state;
  return {
    shopifyCustomerId: payload.admin_graphql_api_id || `gid://shopify/Customer/${payload.id}`,
    email: payload.email,
    ordersCount: payload.orders_count || 0,
    totalSpent: Number(payload.total_spent || 0),
    lastOrderAt: payload.last_order_id ? Date.now() : null,
    marketingState: consentState ? consentState.toUpperCase() : 'NOT_SUBSCRIBED',
    consentUpdatedAt: payload.email_marketing_consent?.consent_updated_at
      ? new Date(payload.email_marketing_consent.consent_updated_at).getTime()
      : null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const rawBody = await readRawBody(req);
  const verified = verifyShopifyHmac(rawBody, req.headers['x-shopify-hmac-sha256']);
  if (!verified) return res.status(401).end();

  const topic = req.headers['x-shopify-topic'];
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).end();
  }

  if (topic === 'customers/create' || topic === 'customers/update') {
    await upsertFromShopify(customerFromPayload(payload));
  } else if (topic === 'orders/create') {
    const email = payload.email || payload.customer?.email;
    const timestamp = payload.processed_at || payload.created_at;
    if (email && timestamp) {
      await touchLastOrder(email, new Date(timestamp).getTime());
    }
  }

  return res.status(200).end();
}
