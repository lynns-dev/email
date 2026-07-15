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

## Step 4: Connect a storefront

1. Set `ALLOWED_ORIGINS` here to the storefront's origin(s), e.g.
   `https://smellsiconic.com,https://smells-iconic.vercel.app`.
2. Set `SITE_REDIRECT_URL` to the storefront's homepage.
3. On the storefront, point its signup form at
   `<this-app-url>/api/email/subscribe`.

## Step 5: Automations cron

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
