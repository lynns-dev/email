// Shopify Admin API access — a single-store Custom App via the Dev
// Dashboard, using the OAuth client-credentials grant (Shopify retired
// permanent Admin API tokens for new custom apps as of Jan 1, 2026; a
// Client ID/Secret pair now exchanges for a short-lived ~24h access token
// instead — see DEPLOYMENT.md Step 4a). GraphQL is used for the customer
// backfill since it lets the consent filter
// (`email_marketing_consent_state:subscribed`) happen server-side in the
// query instead of paging through every customer and filtering
// client-side.

import { createHmac, timingSafeEqual } from 'crypto';

function assertConfigured() {
  if (!process.env.SHOPIFY_STORE_DOMAIN || !process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) {
    throw new Error('SHOPIFY_STORE_DOMAIN / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET are not set.');
  }
}

// Cached per warm serverless instance — cheap enough to refetch on a cold
// start that persisting it in KV isn't worth the complexity at this call
// volume (a manual sync click, or an occasional webhook).
let cachedToken = null; // { token, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  assertConfigured();
  const res = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Shopify token exchange failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function shopifyGraphQL(query, variables) {
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-10';
  const accessToken = await getAccessToken();
  const res = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(`Shopify GraphQL error: ${JSON.stringify(data.errors)}`);
  return data.data;
}

const CUSTOMERS_QUERY = `
  query ConsentedCustomers($cursor: String) {
    customers(first: 100, after: $cursor, query: "email_marketing_consent_state:subscribed") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        email
        numberOfOrders
        amountSpent { amount }
        lastOrder { processedAt }
        emailMarketingConsent { marketingState consentUpdatedAt }
      }
    }
  }
`;

// Pages through every consented customer. Yields plain objects already
// shaped for subscribersStore.upsertFromShopify — callers don't need to
// know about Shopify's GraphQL node shape.
export async function fetchConsentedCustomers() {
  const customers = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await shopifyGraphQL(CUSTOMERS_QUERY, { cursor });
    for (const node of data.customers.nodes) {
      customers.push({
        shopifyCustomerId: node.id,
        email: node.email,
        ordersCount: node.numberOfOrders || 0,
        totalSpent: Number(node.amountSpent?.amount || 0),
        lastOrderAt: node.lastOrder?.processedAt ? new Date(node.lastOrder.processedAt).getTime() : null,
        marketingState: node.emailMarketingConsent?.marketingState || null,
        consentUpdatedAt: node.emailMarketingConsent?.consentUpdatedAt
          ? new Date(node.emailMarketingConsent.consentUpdatedAt).getTime()
          : null,
      });
    }
    hasNextPage = data.customers.pageInfo.hasNextPage;
    cursor = data.customers.pageInfo.endCursor;
  }

  return customers;
}

// Verifies the X-Shopify-Hmac-Sha256 header on incoming webhooks against
// the raw request body — same role as lib/snsVerify.js plays for the SES
// webhook: without this, anyone who finds the webhook URL could POST fake
// customer/order events.
export function verifyShopifyHmac(rawBody, hmacHeader) {
  if (!hmacHeader || !process.env.SHOPIFY_WEBHOOK_SECRET) return false;
  const digest = createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET).update(rawBody, 'utf8').digest('base64');
  const digestBuf = Buffer.from(digest);
  const headerBuf = Buffer.from(hmacHeader);
  if (digestBuf.length !== headerBuf.length) return false;
  return timingSafeEqual(digestBuf, headerBuf);
}
