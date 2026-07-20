# Deployment Guide

## Step 1: Provision a KV store

Vercel Storage → Marketplace → Upstash, or a standalone Upstash Redis
database (same REST API either way). This is this app's own store —
don't reuse a storefront's.

## Step 2: Deploy to Vercel

1. Go to https://vercel.com → **New Project** → import this repo.
   Framework preset: **Next.js** (auto-detected).
2. Add environment variables (Project → Settings → Environment Variables)
   — see `.env.example` for the full list. At minimum to get the app
   running: `KV_REST_API_URL` / `KV_REST_API_TOKEN`, `ADMIN_PASSWORD`,
   `NEXT_PUBLIC_BASE_URL` (your deployed URL, e.g.
   `https://mail.smellsiconic.com`).
3. Redeploy after adding env vars.

## Step 3: Set up Resend

Nothing sends until this is done — the app builds and runs fine without
it, only `/api/email/*` routes error until it's configured. No AWS
account needed — Resend's own dashboard handles domain verification
directly, which is most of why this app uses it instead of SES.

### 3a. Get an API key

[Resend dashboard](https://resend.com/api-keys) → **Create API Key** →
put it in `RESEND_API_KEY`. Also set `RESEND_FROM_EMAIL` (an address on
the domain you'll verify next) and `RESEND_FROM_NAME`.

### 3b. Verify a sending domain

Do this either directly in the Resend dashboard, or from this app's own
**Settings** section (`/admin` → Settings → "Verify a sending domain")
once `RESEND_API_KEY` is set — it creates the domain and shows you the
DNS records to add, the same way the dashboard does, plus a "Check
status" button so you don't need to go back to Resend to confirm
verification landed.

1. Resend dashboard → **Domains → Add Domain**. Use a subdomain, e.g.
   `mail.smellsiconic.com` (keeps email DNS separate from a storefront's
   web/MX records).
2. Resend shows the DNS records to add (SPF + DKIM, sometimes a DMARC
   recommendation) — add them all at your DNS provider, then click
   **Verify** (or use Settings' "Check status" button here).
3. If Resend doesn't recommend a DMARC record for you, add one yourself
   at your DNS root: `_dmarc.yourdomain.com` TXT `v=DMARC1; p=none;
   rua=mailto:you@yourdomain.com`. Start at `p=none` (monitor only), move
   to `p=quarantine` once reports look clean.

### 3c. Bounce/complaint webhook

1. Resend dashboard → **Webhooks → Add Endpoint** →
   `https://<this-app-url>/api/email/resend-webhook`. Subscribe to the
   `email.bounced` and `email.complained` events.
2. Resend shows a signing secret (starts with `whsec_`) when you create
   the endpoint — put it in `RESEND_WEBHOOK_SECRET`. Every request is
   verified against this; without it set, all webhook events are
   rejected.

## Step 4: Sync customers from Shopify

Pulls in Shopify customers as subscribers — consent-gated, so only
customers whose Shopify email marketing consent is currently
`SUBSCRIBED` are imported. This is independent of Step 5 (storefront
signup form) — either or both can be used.

### 4a. Create a Custom App in Shopify

As of January 1, 2026, Shopify no longer supports creating custom apps
with a permanent Admin API token from the store admin — new apps are
created in the **Dev Dashboard** and authenticate via OAuth's
client-credentials grant instead (Client ID/Secret exchanged for a
short-lived access token, refreshed automatically — `lib/shopify.js`
handles the refresh, nothing to do manually here beyond initial setup).

1. Go to Shopify's [Dev Dashboard](https://dev.shopify.com/dashboard) and
   create an app under your organization.
2. Configure Admin API access scopes: enable `read_customers` and
   `read_orders`.
3. Install the app on your store (client-credentials only works for apps
   you own, installed in a store you own — not a public/third-party app
   flow).
4. Copy the app's **Client ID** and **Client secret** into
   `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`. Set `SHOPIFY_STORE_DOMAIN`
   to your `*.myshopify.com` domain.

(If you already have a pre-2026 custom app with a static token, it may
still work for now — Shopify has said existing static tokens continue
functioning even as new-app creation moved to the Dev Dashboard — but
plan to migrate; Shopify's own guidance is to move to OAuth. This app
only supports the client-credentials flow.)

### 4b. Run the first backfill

Once deployed with those env vars set, go to `<this-app-url>/admin` →
**Shopify sync** → **Sync now**. This is a one-time (or re-run-anytime)
pull of every currently-consented customer.

### 4c. Set up webhooks for ongoing sync

So new signups / consent changes / orders show up without re-running the
backfill manually:

1. In the same Custom App, or via **Settings → Notifications → Webhooks**,
   add webhook subscriptions for `customers/create`, `customers/update`,
   and `orders/create`, all pointing at
   `https://<this-app-url>/api/shopify/webhook` (format: JSON, latest API
   version).
2. Shopify signs webhook payloads with a shared secret — find/generate it
   alongside the webhook subscription and put it in
   `SHOPIFY_WEBHOOK_SECRET`. Every request is HMAC-verified against this;
   without it set, all webhook events are rejected.

## Step 5: Connect a storefront (optional — signup form)

1. Set `ALLOWED_ORIGINS` here to the storefront's origin(s), e.g.
   `https://smellsiconic.com,https://smells-iconic.vercel.app`.
2. Set `SITE_REDIRECT_URL` to the storefront's homepage.
3. On the storefront, point its signup form at
   `<this-app-url>/api/email/subscribe`.

## Step 6: Crons (automations + scheduled sends)

`vercel.json` schedules both `/api/cron/automations` and
`/api/cron/send-scheduled-campaigns` once daily — **Vercel's Hobby plan
only allows daily cron**. Daily is fine for the welcome-series/sunset
flows' day granularity, but two things specifically want much finer
timing:

- **Scheduled campaigns** — a campaign scheduled for 9am landing whenever
  the daily cron happens to run defeats the point of scheduling it.
- **The abandoned-checkout automation** — its steps are timed in *hours*
  (1h, 24h), not days; a cart-recovery email arriving a day late is close
  to useless.

If you're on Hobby, strongly consider an external pinger (e.g.
cron-job.org) hitting both routes hourly with header `Authorization:
Bearer <CRON_SECRET>`, in addition to or instead of the daily
`vercel.json` entries.

## Step 7: Cart + abandoned-checkout tracking pixel

Only tracks logged-in Shopify customers (identified by email) — see
`lib/subscribersStore.js`'s `updateCartActivity`/`recordCheckoutStarted`
and `public/track.js` for why anonymous/guest carts aren't tracked in
this pass.

1. In your Shopify theme (**Online Store → Themes → Edit code** →
   `theme.liquid`), add just before `</body>`:
   ```html
   <script src="https://<this-app-url>/track.js" data-email="{{ customer.email }}" async></script>
   ```
2. That's it — no other configuration. The script reads Shopify's own
   `/cart.js` AJAX endpoint (works with any theme) and posts to this
   deployment's `/api/track/cart` and `/api/track/checkout-started`,
   same-origin relative to wherever `track.js` was loaded from.
3. Confirm `ALLOWED_ORIGINS` (Step 5) includes the storefront's origin —
   the tracking endpoints use the same CORS allowlist as the signup form.
4. This pixel feeds two flows — **Add to cart** (cart activity that never
   reached checkout) and **Abandoned checkout** (checkout started, no
   order since). Both, plus **Order received** (fires on every completed
   order via the existing `orders/create` webhook, no extra setup), are
   editable from `/admin` → Automations — subject, pasted-in HTML, and
   delay per step, same HTML textarea + live preview as campaigns.

## Troubleshooting

**Emails send but land in spam, or Gmail/Yahoo bulk-folder or reject them:**
- Confirm the domain shows "Verified" in the Resend dashboard (or the Deliverability checklist here) — can take a while after adding the DNS records
- Confirm both the SPF and DKIM records Resend gave you are actually in place (Step 3b) — a partial setup (DKIM only, no SPF) is a common miss
- Check DMARC reports for alignment failures

**Storefront's signup form fails with a CORS error in the browser console:**
- Confirm `ALLOWED_ORIGINS` includes the storefront's exact origin (scheme + host, no trailing slash)

**"KV_REST_API_URL / KV_REST_API_TOKEN are not set" error:**
- Complete Step 1

**Shopify sync returns 0 synced, or "SHOPIFY_STORE_DOMAIN / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET are not set":**
- Complete Step 4a. A 0-synced result with no error usually means no Shopify customers currently have `SUBSCRIBED` email marketing consent — check Shopify's own Customers list, filtered to "Subscribed", to confirm

**Webhook events aren't updating subscribers (new Shopify signups don't show up without a manual sync):**
- Confirm the webhook subscriptions in Step 4c are pointed at the right URL and `SHOPIFY_WEBHOOK_SECRET` matches — a signature mismatch fails silently with a 401, check Shopify's webhook delivery log (Settings → Notifications → Webhooks → the subscription → recent deliveries) for the actual response code

**"Shopify token exchange failed: 401" or "403":**
- `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` don't match, or the app isn't installed on the store named in `SHOPIFY_STORE_DOMAIN` — re-check Step 4a. The access token this exchange returns is only valid ~24h; that refresh happens automatically in `lib/shopify.js`, so this error means the exchange itself is failing, not an expired token

**Deliverability checklist shows domain verification stuck on "…" / loading:**
- `RESEND_API_KEY` isn't set, or is invalid — the domain-status check fails silently to a loading state rather than erroring the whole page

**Resend webhook returns 403 (bounce/complaint events aren't suppressing subscribers):**
- `RESEND_WEBHOOK_SECRET` doesn't match what's shown for that endpoint in the Resend dashboard, or is unset entirely
- If the secret is definitely correct and it's still failing, Resend's webhook header names may have changed since this was built (see the comment in `lib/webhookVerify.js`) — check the raw request in the dashboard's webhook delivery log and compare against that file

**Cart/checkout events aren't showing up on subscribers:**
- Confirm the `<script>` tag in Step 7 is actually rendering `data-email` with a real address (view page source while logged in) — logged-out visitors are silently skipped by design
- Confirm the email matches an *existing* subscriber — the tracking endpoints intentionally no-op for unknown emails, same as the rest of this app
- Check the browser console on the storefront for a CORS error, same fix as the signup form's CORS troubleshooting entry above
