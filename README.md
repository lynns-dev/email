# Email platform

A standalone email marketing platform — double opt-in subscriber capture,
one-click unsubscribe, bounce/complaint auto-suppression, a campaign
composer, and welcome/win-back automations — sending through Amazon SES.
Built to be called cross-origin from one or more storefronts rather than
embedded in any single one of them.

Originally extracted from the `smells-iconic` storefront repo, where this
logic first shipped bolted directly onto the storefront's own Next.js app.

## Why it's separate

- **Reusable.** Any storefront can point its signup form and admin panel
  at a deployment of this app instead of rebuilding the same subscriber
  store, SES wrapper, and automation engine per brand.
- **Independent deploys.** Sending infrastructure, SES/DNS changes, and
  automation logic can ship without touching (or redeploying) the
  storefront, and vice versa.
- **Own admin, own auth, own data.** Subscriber data and campaign content
  live in their own KV store behind their own login — not mixed into a
  storefront's order/review/discount data.

## How a storefront integrates

1. Deploy this app (see `DEPLOYMENT.md`) and note its URL.
2. On the storefront, point the newsletter signup form's fetch at
   `<this-app-url>/api/email/subscribe` and set `ALLOWED_ORIGINS` here to
   include the storefront's origin (CORS).
3. Set `SITE_REDIRECT_URL` here to the storefront's homepage, so
   `/api/email/confirm` redirects back in-context after a subscriber
   confirms.
4. Manage subscribers/campaigns/automations at `<this-app-url>/admin`.

## Structure

- `lib/subscribersStore.js`, `campaignsStore.js`, `automationsStore.js` —
  KV-backed data (see file headers for the key shapes)
- `lib/sesEmail.js` — SES send wrapper (List-Unsubscribe headers built in)
- `lib/emailEngagement.js` — click-based engagement tiering (not open-based
  — see the file header for why open tracking isn't trustworthy)
- `lib/emailLinks.js` + `pages/api/email/click.js` — campaign link
  rewriting + click tracking
- `lib/cors.js` — CORS allowlist for the one cross-origin route
  (`/api/email/subscribe`)
- `lib/snsVerify.js` — verifies SNS message signatures on the SES
  bounce/complaint webhook
- `pages/api/cron/automations.js` — advances welcome-series/sunset-winback
  steps, meant to run on a schedule (see `vercel.json`)
- `pages/admin/` — subscriber/campaign/automation management UI

See `DEPLOYMENT.md` for the full AWS SES + DNS setup.
