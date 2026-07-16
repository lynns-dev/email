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

## Step 3: Set up Amazon SES

Nothing sends until this is done — the app builds and runs fine without
it, only `/api/email/*` routes error until it's configured.

### 3a. Verify a sending domain in SES

1. SES console → **Verified identities → Create identity → Domain**. Use
   a subdomain, e.g. `mail.smellsiconic.com` (keeps email DNS separate
   from a storefront's web/MX records).
2. SES issues 3 DKIM CNAME records — add all 3 at your DNS provider.
3. Under that identity's **Custom MAIL FROM domain**, set something like
   `bounce.mail.smellsiconic.com` and add the MX + SPF TXT records SES
   shows. This is what makes SPF pass on the *aligned* domain — required
   by Gmail/Yahoo's bulk-sender rules; SES's shared MAIL FROM domain alone
   doesn't align with your From address.
4. At your DNS root, add a DMARC record: `_dmarc.yourdomain.com` TXT
   `v=DMARC1; p=none; rua=mailto:you@yourdomain.com`. Start at `p=none`
   (monitor only), move to `p=quarantine` once reports look clean.

### 3b. Request production access

New SES accounts start in the sandbox: 200 emails/day, only to addresses
you've individually verified. SES console → **Account dashboard → Request
production access** — describe the use case (opt-in marketing emails for
an e-commerce store) and wait for approval (usually under 24h). Test in
sandbox first using your own verified inbox as the recipient.

### 3c. Bounce/complaint webhook

1. **Configuration sets → Create set**.
2. Add an **Event destination** → SNS → create a topic → subscribe it to
   `https://<this-app-url>/api/email/ses-webhook` (HTTPS). Select Bounce
   and Complaint events.
3. The route confirms the SNS subscription automatically on first ping.
4. Copy the topic ARN into `SES_SNS_TOPIC_ARN` so the webhook rejects
   notifications from any other topic.

### 3d. IAM credentials

IAM user/role with `ses:SendEmail` scoped to your verified identity → its
access key goes in `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

## Step 4: Sync customers from Shopify

Pulls in Shopify customers as subscribers — consent-gated, so only
customers whose Shopify email marketing consent is currently
`SUBSCRIBED` are imported. This is independent of Step 5 (storefront
signup form) — either or both can be used.

### 4a. Create a Custom App in Shopify

1. Shopify admin → **Settings → Apps and sales channels → Develop apps**
   → **Create an app**.
2. **Configuration** → Admin API scopes → enable `read_customers` and
   `read_orders`.
3. **API credentials** → Install the app → copy the **Admin API access
   token** into `SHOPIFY_ADMIN_API_TOKEN`. Set `SHOPIFY_STORE_DOMAIN` to
   your `*.myshopify.com` domain.

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

## Step 6: Automations cron

`vercel.json` schedules `/api/cron/automations` once daily — **Vercel's
Hobby plan only allows daily cron**, fine for the welcome series' day
granularity but coarse for anything faster. On Hobby and want finer
timing? Use an external pinger (e.g. cron-job.org) hitting the same URL
hourly with header `Authorization: Bearer <CRON_SECRET>`.

## Troubleshooting

**Emails send but land in spam, or Gmail/Yahoo bulk-folder or reject them:**
- Confirm DKIM shows "Verified" in the SES console (can take hours after adding CNAMEs)
- Confirm the custom MAIL FROM domain's SPF TXT record is in place (Step 3a)
- Confirm the account isn't still in the SES sandbox (Step 3b)
- Check DMARC reports for alignment failures

**Storefront's signup form fails with a CORS error in the browser console:**
- Confirm `ALLOWED_ORIGINS` includes the storefront's exact origin (scheme + host, no trailing slash)

**"KV_REST_API_URL / KV_REST_API_TOKEN are not set" error:**
- Complete Step 1

**Shopify sync returns 0 synced, or "SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN are not set":**
- Complete Step 4a. A 0-synced result with no error usually means no Shopify customers currently have `SUBSCRIBED` email marketing consent — check Shopify's own Customers list, filtered to "Subscribed", to confirm

**Webhook events aren't updating subscribers (new Shopify signups don't show up without a manual sync):**
- Confirm the webhook subscriptions in Step 4c are pointed at the right URL and `SHOPIFY_WEBHOOK_SECRET` matches — a signature mismatch fails silently with a 401, check Shopify's webhook delivery log (Settings → Notifications → Webhooks → the subscription → recent deliveries) for the actual response code
