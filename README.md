# Email platform

A standalone email marketing platform — Shopify customer sync, double
opt-in subscriber capture, one-click unsubscribe, bounce/complaint
auto-suppression, list grading, a visual campaign builder with reusable
templates, scheduling, and welcome/sunset/abandoned-checkout/add-to-cart/
order-received automations — sending through Resend. Built to be called
cross-origin from one or more storefronts rather than embedded in any
single one of them.

Originally extracted from the `smells-iconic` storefront repo, where this
logic first shipped bolted directly onto the storefront's own Next.js app.

## Why it's separate

- **Reusable.** Any storefront can point its signup form and admin panel
  at a deployment of this app instead of rebuilding the same subscriber
  store, send wrapper, and automation engine per brand.
- **Independent deploys.** Sending infrastructure, DNS changes, and
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
4. Optionally sync Shopify customers directly (Settings-free — see
   DEPLOYMENT.md Step 4) instead of/alongside the signup form, and paste
   `public/track.js` into the storefront's theme for cart/checkout
   tracking.
5. Manage everything — subscribers, campaigns, templates, automations,
   sender/domain settings — at `<this-app-url>/admin`.

## Structure

- `lib/subscribersStore.js`, `campaignsStore.js`, `automationsStore.js`,
  `templatesStore.js`, `settingsStore.js` — KV-backed data (see file
  headers for the key shapes)
- `lib/resendEmail.js` — Resend send wrapper (List-Unsubscribe headers
  built in)
- `lib/resendIdentity.js` — Resend domain verification (DKIM/SPF) for the
  Settings UI
- `lib/emailBlocks.js` — the visual campaign/automation builder's block
  model + email-safe HTML renderer (logo/footer/font applied from
  Settings automatically)
- `lib/emailEngagement.js` + `lib/listGrading.js` — click-based
  engagement tiering and A–F list grading (not open-based — see the file
  headers for why open tracking isn't trustworthy)
- `lib/emailLinks.js` + `pages/api/email/click.js` — campaign link
  rewriting + click tracking
- `lib/shopify.js` — Shopify Admin API client (OAuth client-credentials)
  + webhook HMAC verification
- `lib/cors.js` — CORS allowlist for the cross-origin routes
  (`/api/email/subscribe`, `/api/track/*`)
- `lib/webhookVerify.js` — verifies Resend's (Standard Webhooks) bounce/
  complaint webhook signatures
- `public/track.js` — on-site cart/checkout tracking pixel
- `pages/api/cron/automations.js` + `send-scheduled-campaigns.js` —
  advance automation steps and send scheduled campaigns, meant to run on
  a schedule (see `vercel.json`)
- `pages/admin/` — subscriber/campaign/template/automation/settings
  management UI

See `DEPLOYMENT.md` for the full setup (Resend, Shopify, tracking pixel,
crons).
