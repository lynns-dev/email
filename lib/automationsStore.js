// Automation flow definitions, stored in the same KV store as everything
// else. Key: email_automations -> JSON array. Seeded on first read the
// same way discountsStore.js seeds its default codes. Per-subscriber
// progress through a flow lives on the subscriber record
// (subscribersStore.updateAutomationState), not here — this store only
// holds the editable flow definitions.
//
// Step content is stored as `html` — raw HTML pasted directly, same as
// campaigns (lib/emailBlocks.js's renderEmailHtml) — so every automation
// email still gets the account's logo, footer, and font from
// lib/settingsStore.js applied automatically at send time
// (pages/api/cron/automations.js), and each step is editable from /admin
// as a plain HTML textarea, same as the campaign composer. Button/image
// URLs are left blank ("") in the seed content — fill them in before
// enabling a flow.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'email_automations';

// Small helpers so the seed HTML below reads as plain content instead of
// markup boilerplate — styled to Veil's actual brand system (lib/theme.js
// in the veil-ecommerce repo: near-black ink, warm taupe secondary text,
// Hanken Grotesk, sharp corners, uppercase letter-spaced buttons/labels —
// "minimal black & white" per that file's own comment), not generic
// placeholder styling.
const INK = '#16140F';
const SOFT = '#8B8678';
const eyebrow = (text) => `<p style="margin:0 0 10px;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:${SOFT};">${text}</p>`;
const heading = (text) => `<p style="margin:0 0 16px;font-size:22px;line-height:1.35;color:${INK};font-weight:400;">${text}</p>`;
const p = (text) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${INK};">${text}</p>`;
const button = (label, url = '') => `<div style="text-align:center;margin:28px 0;"><a href="${url}" style="background:${INK};color:#FCFBF7;font-size:12px;font-weight:500;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;padding:16px 36px;display:inline-block;">${label}</a></div>`;
const image = (alt, url = '') => `<img src="${url}" alt="${alt}" style="width:100%;display:block;border:0;margin:0 0 20px;" />`;
const code = (text) => `<div style="text-align:center;margin:20px 0;"><span style="display:inline-block;border:1px solid ${INK};padding:10px 24px;font-size:13px;letter-spacing:0.15em;text-transform:uppercase;color:${INK};">${text}</span></div>`;

const SEED_AUTOMATIONS = [
  {
    id: 'welcome_series',
    name: 'Welcome series',
    trigger: 'confirmed',
    enabled: true,
    steps: [
      {
        delayDays: 0,
        subject: 'Welcome to Veil — here\'s 10% off',
        html: eyebrow('Welcome to Veil')
          + heading("You're in.")
          + image('Veil Original', 'https://veilpuff.com/images/veil-original-scent.png')
          + p("A soft veil of jasmine, vanilla, and warm woods — swept on, not sprayed on. As a thank-you for joining, here's 10% off your first order, already applied below.")
          + code('WELCOME10')
          + button('Shop now — 10% off applied', 'https://veilpuff.com/offer3?scent=original&discount=WELCOME10'),
      },
      {
        delayDays: 2,
        subject: 'The story behind Veil',
        html: eyebrow('Our story')
          + heading('A veil, not a spray.')
          + image('Veil, worn', 'https://veilpuff.com/images/veil-puff-model-white-robe.png')
          + p('Talc-free and finely milled to glide across skin without weight — sun-warmed hinoki, blooming jasmine, and a creamy vanilla base. The finishing touch that makes you feel polished before you\'ve even left the room.')
          + button('Explore the collection', 'https://veilpuff.com/shop'),
      },
      {
        delayDays: 5,
        subject: 'Restocks and new arrivals, first',
        html: eyebrow('VIP access')
          + heading("You're on the list.")
          + image('Veil scent sampler', 'https://veilpuff.com/images/scent-sampler.png')
          + p("Which means new drops and restocks land in your inbox before anywhere else.")
          + button('Browse the shop', 'https://veilpuff.com/shop'),
      },
    ],
  },
  {
    id: 'sunset_winback',
    name: 'Sunset / win-back',
    trigger: 'inactive',
    enabled: true,
    steps: [
      {
        delayDays: 90,
        subject: 'Still want to hear from us?',
        html: eyebrow('Checking in')
          + heading("We noticed it's been a while.")
          + image('Veil', 'https://veilpuff.com/images/veil-model-one.png')
          + p("No hard feelings — we just want to make sure we're only in inboxes that want us there.")
          + p("Stick around and we'll send 10% off your next order. Otherwise, we'll take the hint and stop emailing.")
          + code('WELCOME10')
          + button('Yes, keep me updated', 'https://veilpuff.com/shop?discount=WELCOME10'),
      },
      // Suppress step, not a send — pages/api/cron/automations.js treats
      // a falsy subject as "suppress this subscriber" instead of sending.
      { delayDays: 180, subject: null, html: null },
    ],
  },
  {
    id: 'abandoned_checkout',
    name: 'Abandoned checkout',
    trigger: 'checkout_started',
    enabled: true,
    // Hours, not days — cart abandonment is time-sensitive in a way the
    // other flows aren't. See DEPLOYMENT.md for why this flow specifically
    // needs an hourly (not daily) cron to be worth running.
    steps: [
      {
        delayHours: 1,
        subject: 'Forgot something?',
        html: eyebrow('Your cart')
          + heading('Still here, waiting for you.')
          + image('Veil', 'https://veilpuff.com/images/large-puff.png')
          + p("Your cart's exactly how you left it — pick up right where you stopped.")
          + '{{CART_ITEMS}}'
          + button('Finish checking out', 'https://veilpuff.com/checkout'),
      },
      {
        delayHours: 24,
        subject: 'Still thinking it over?',
        html: eyebrow('10% off, on us')
          + heading('One more reason to say yes.')
          + image('Veil', 'https://veilpuff.com/images/veil-grand-jar.png')
          + p("Still on the fence? Here's 10% off to help you decide.")
          + '{{CART_ITEMS}}'
          + code('WELCOME10')
          + button('Complete my order — 10% off applied', 'https://veilpuff.com/checkout?discount=WELCOME10'),
      },
    ],
  },
  {
    id: 'add_to_cart',
    name: 'Add to cart',
    trigger: 'cart_updated',
    enabled: true,
    // Lighter touch than abandoned_checkout — this fires for carts that
    // never even reached checkout, a softer signal than a started-and-
    // dropped checkout, so the first nudge waits a bit longer and skips
    // the discount code the checkout-abandonment flow leads with.
    steps: [
      {
        delayHours: 3,
        subject: 'Still thinking about it?',
        html: eyebrow('Your cart')
          + heading("It's still there.")
          + image('Veil', 'https://veilpuff.com/images/veil-model-7.9.png')
          + p("You added something to your cart but haven't checked out yet — everything's exactly how you left it whenever you're ready.")
          + button('View my cart', 'https://veilpuff.com/checkout'),
      },
      {
        delayHours: 72,
        subject: 'Don\'t miss out',
        html: eyebrow('Last call')
          + heading("Don't miss out.")
          + image('Veil', 'https://veilpuff.com/images/veil-scented-tassel.png')
          + p("Just a heads up — items in your cart aren't reserved forever. If you're still interested, now's a good time.")
          + button('Shop now', 'https://veilpuff.com/checkout'),
      },
    ],
  },
  {
    id: 'order_received',
    name: 'Order received',
    trigger: 'order_placed',
    enabled: true,
    // Not a transactional receipt — Shopify already sends that. This is
    // the marketing-toned thank-you + a later review/repeat-purchase
    // nudge, timed off the same order.
    steps: [
      {
        delayHours: 0,
        subject: 'Thank you for your order!',
        html: eyebrow('Order confirmed')
          + heading('Thank you.')
          + image('Veil', 'https://veilpuff.com/images/veil-original-scent-2.png')
          + p("Your order's confirmed and being prepared — we'll let you know the moment it ships.")
          + button('Continue shopping', 'https://veilpuff.com/shop'),
      },
      {
        delayHours: 120,
        subject: 'How\'s everything going?',
        // Links to a specific product page since that's the only place
        // the review form actually lives (pages/product/[id].jsx) — not
        // personalized to what they actually ordered, since this step's
        // content is the same for every subscriber; revisit if per-order
        // personalization ever gets built.
        html: eyebrow("We'd love to know")
          + heading("How's everything going?")
          + image('Veil', 'https://veilpuff.com/images/veil-ugc-1.webp')
          + p("Your order should have arrived by now — we'd love to hear what you think.")
          + button('Leave a review', 'https://veilpuff.com/product/original')
          + p("Ready for round two? Here's a little something for your next order.")
          + code('VEIL5'),
      },
    ],
  },
];

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  }
}

async function saveAutomations(automations) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(automations),
  });
  if (!res.ok) throw new Error('Failed to save automations.');
}

export async function getAutomations() {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/${KEY}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  if (!data.result) {
    await saveAutomations(SEED_AUTOMATIONS);
    return SEED_AUTOMATIONS;
  }

  // Backfills any flow introduced after this account's automations were
  // first seeded (e.g. add_to_cart/order_received added later) — an
  // existing deployment picks up new flow types without losing any
  // edits made to the ones it already has.
  const existing = JSON.parse(data.result);
  const missing = SEED_AUTOMATIONS.filter((seed) => !existing.some((a) => a.id === seed.id));
  if (missing.length === 0) return existing;
  const merged = [...existing, ...missing];
  await saveAutomations(merged);
  return merged;
}

export async function getAutomation(id) {
  const automations = await getAutomations();
  return automations.find((a) => a.id === id) || null;
}

export async function updateAutomation(id, patch) {
  const automations = await getAutomations();
  const idx = automations.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('Automation not found.');
  automations[idx] = { ...automations[idx], ...patch };
  await saveAutomations(automations);
  return automations[idx];
}

// getAutomations() only ever writes SEED_AUTOMATIONS content to KV once
// (an empty store, or a brand-new flow id added after this account was
// first set up) — a content/design edit to an *existing* flow's steps in
// this file never reaches an already-provisioned live store on its own.
// This is the explicit action that pushes it: overwrites each step's
// subject/html with the current seed content, matched by index, while
// leaving enabled, trigger, linkTargets, and stats untouched.
export async function syncAutomationDesign() {
  const automations = await getAutomations();
  const updated = automations.map((flow) => {
    const seed = SEED_AUTOMATIONS.find((s) => s.id === flow.id);
    if (!seed) return flow;
    const steps = flow.steps.map((step, i) => {
      const seedStep = seed.steps[i];
      if (!seedStep) return step;
      return { ...step, subject: seedStep.subject, html: seedStep.html };
    });
    return { ...flow, steps };
  });
  await saveAutomations(updated);
  return updated;
}

// Send/click tracking for automation steps — mirrors campaignsStore.js's
// linkTargets/stats/send-log/click-log pattern so automation emails get
// the same click-tracking and conversion-analysis treatment campaigns
// already have (lib/automationSend.js, pages/api/email/click.js). Keyed
// by flowId + stepIndex rather than a single id, since a flow has
// multiple steps that each need their own independent link targets and
// stats — a click on step 0 shouldn't count toward step 1's numbers.

export async function updateStepLinkTargets(flowId, stepIndex, linkTargets) {
  const automations = await getAutomations();
  const idx = automations.findIndex((a) => a.id === flowId);
  if (idx === -1) return null;
  const steps = automations[idx].steps.map((s, i) => (i === stepIndex ? { ...s, linkTargets } : s));
  automations[idx] = { ...automations[idx], steps };
  await saveAutomations(automations);
  return automations[idx];
}

export async function incrementStepStat(flowId, stepIndex, statKey, by = 1) {
  const automations = await getAutomations();
  const idx = automations.findIndex((a) => a.id === flowId);
  if (idx === -1) return null;
  const steps = automations[idx].steps.map((s, i) => {
    if (i !== stepIndex) return s;
    const stats = { sent: 0, clicked: 0, ...s.stats, [statKey]: ((s.stats?.[statKey]) || 0) + by };
    return { ...s, stats };
  });
  automations[idx] = { ...automations[idx], steps };
  await saveAutomations(automations);
  return automations[idx];
}

export async function logAutomationSend(flowId, stepIndex, entries) {
  assertConfigured();
  const key = `automation_sends:${flowId}:${stepIndex}`;
  const existing = await getAutomationSendLog(flowId, stepIndex);
  const updated = [...existing, ...entries];
  const res = await fetch(`${KV_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error('Failed to log automation send.');
}

export async function getAutomationSendLog(flowId, stepIndex) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/automation_sends:${flowId}:${stepIndex}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

export async function findAutomationSend(flowId, stepIndex, sendId) {
  const log = await getAutomationSendLog(flowId, stepIndex);
  return log.find((s) => s.sendId === sendId) || null;
}

export async function logAutomationClick(flowId, stepIndex, entry) {
  assertConfigured();
  const key = `automation_clicks:${flowId}:${stepIndex}`;
  const existing = await getAutomationClickLog(flowId, stepIndex);
  const updated = [...existing, entry];
  const res = await fetch(`${KV_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error('Failed to log automation click.');
}

export async function getAutomationClickLog(flowId, stepIndex) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/automation_clicks:${flowId}:${stepIndex}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}
