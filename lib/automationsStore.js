// Automation flow definitions, stored in the same KV store as everything
// else. Key: email_automations -> JSON array. Seeded on first read the
// same way discountsStore.js seeds its default codes. Per-subscriber
// progress through a flow lives on the subscriber record
// (subscribersStore.updateAutomationState), not here — this store only
// holds the editable flow definitions.
//
// Step content is stored as `blocks` (same shape as lib/emailBlocks.js's
// campaign blocks: text/image/button) rather than raw HTML, so every
// automation email gets the same designed treatment as a campaign — the
// account's logo, footer, and font from lib/settingsStore.js are applied
// automatically at send time (pages/api/cron/automations.js), and each
// step is editable from /admin using the same block editor as campaigns.
// Button/image URLs are left blank in the seed content — fill them in
// from Settings before enabling a flow.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'email_automations';

// Small helper so the seed data below reads as plain content instead of
// object boilerplate — ids only need to be unique within one step.
function blocks(flowId, stepIdx, specs) {
  return specs.map((spec, i) => ({ id: `${flowId}-${stepIdx}-${i}`, ...spec }));
}
const text = (content, linkText = '', linkUrl = '') => ({ type: 'text', content, linkText, linkUrl });
const image = (alt) => ({ type: 'image', src: '', alt, linkUrl: '' });
const button = (label) => ({ type: 'button', label, url: '' });

const SEED_AUTOMATIONS = [
  {
    id: 'welcome_series',
    name: 'Welcome series',
    trigger: 'confirmed',
    enabled: true,
    steps: [
      {
        delayDays: 0,
        subject: 'Welcome — here\'s 15% off',
        blocks: blocks('welcome_series', 0, [
          text('You\'re in.\n\nAs a thank-you for joining, here\'s 15% off your first order — just use the code below at checkout.'),
          text('WELCOME10'),
          button('Shop now'),
        ]),
      },
      {
        delayDays: 2,
        subject: 'A little about us',
        blocks: blocks('welcome_series', 1, [
          image('Behind the scenes'),
          text('We started this because we wanted better — better ingredients, better service, better everything. Every order is a chance to prove that.'),
          button('See what\'s new'),
        ]),
      },
      {
        delayDays: 5,
        subject: 'Restocks and new arrivals first',
        blocks: blocks('welcome_series', 2, [
          text('You\'re on the list — which means new drops and restocks land in your inbox before anywhere else.'),
          button('Browse the shop'),
        ]),
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
        blocks: blocks('sunset_winback', 0, [
          text('We noticed it\'s been a while.\n\nNo hard feelings — we just want to make sure we\'re only in inboxes that want us there.'),
          text('Stick around and we\'ll send 15% off your next order. Otherwise, we\'ll take the hint and stop emailing.'),
          button('Yes, keep me updated (+15% off)'),
        ]),
      },
      // Suppress step, not a send — pages/api/cron/automations.js treats
      // a falsy subject as "suppress this subscriber" instead of sending.
      { delayDays: 180, subject: null, blocks: null },
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
        blocks: blocks('abandoned_checkout', 0, [
          text('Looks like you left something behind.\n\nYour cart\'s exactly how you left it — pick up right where you stopped.'),
          button('Finish checking out'),
        ]),
      },
      {
        delayHours: 24,
        subject: 'Still thinking it over?',
        blocks: blocks('abandoned_checkout', 1, [
          text('Still on the fence? Here\'s 10% off to help you decide.'),
          text('WELCOME10'),
          button('Complete my order'),
        ]),
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
        blocks: blocks('add_to_cart', 0, [
          text('You added something to your cart but haven\'t checked out yet — it\'s still there whenever you\'re ready.'),
          button('View my cart'),
        ]),
      },
      {
        delayHours: 72,
        subject: 'Don\'t miss out',
        blocks: blocks('add_to_cart', 1, [
          text('Just a heads up — items in your cart aren\'t reserved forever. If you\'re still interested, now\'s a good time.'),
          button('Shop now'),
        ]),
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
        blocks: blocks('order_received', 0, [
          text('Thank you!\n\nYour order\'s confirmed and being prepared. We\'ll let you know the moment it ships.'),
          button('View order status'),
        ]),
      },
      {
        delayHours: 120,
        subject: 'How\'s everything going?',
        blocks: blocks('order_received', 1, [
          text('Your order should have arrived by now — we\'d love to know what you think.'),
          button('Leave a review'),
          text('Ready for round two? Here\'s 10% off your next order.'),
          text('WELCOME10'),
        ]),
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
