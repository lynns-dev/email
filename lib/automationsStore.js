// Automation flow definitions, stored in the same KV store as everything
// else. Key: email_automations -> JSON array. Two built-in flows, seeded
// on first read the same way discountsStore.js seeds its default codes.
// Per-subscriber progress through a flow lives on the subscriber record
// (subscribersStore.updateAutomationState), not here — this store only
// holds the editable flow definitions.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'email_automations';

const SEED_AUTOMATIONS = [
  {
    id: 'welcome_series',
    name: 'Welcome series',
    trigger: 'confirmed',
    enabled: true,
    steps: [
      { delayDays: 0, subject: 'Welcome — here\'s 15% off', html: '<p>Welcome! Use code WELCOME10 at checkout.</p>' },
      { delayDays: 2, subject: 'A little about us', html: '<p>Thanks for joining the list — more good stuff on the way.</p>' },
      { delayDays: 5, subject: 'Restocks and new arrivals first', html: '<p>You\'re on the list — new drops land here before anywhere else.</p>' },
    ],
  },
  {
    id: 'sunset_winback',
    name: 'Sunset / win-back',
    trigger: 'inactive',
    enabled: true,
    steps: [
      { delayDays: 90, subject: 'Still want to hear from us?', html: '<p>We haven\'t seen you click in a while — stick around for 15% off, or we\'ll assume you\'d rather not hear from us.</p>' },
      { delayDays: 180, subject: null, html: null },
    ],
  },
  {
    id: 'abandoned_checkout',
    name: 'Abandoned checkout',
    trigger: 'checkout_started',
    enabled: true,
    // Hours, not days — cart abandonment is time-sensitive in a way the
    // other two flows aren't. See DEPLOYMENT.md for why this flow
    // specifically needs an hourly (not daily) cron to be worth running.
    steps: [
      { delayHours: 1, subject: 'Forgot something?', html: '<p>You left something in your cart — it\'s still there whenever you\'re ready.</p>' },
      { delayHours: 24, subject: 'Still thinking it over?', html: '<p>Your cart\'s waiting — here\'s 10% off if that helps: WELCOME10.</p>' },
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
  if (data.result) return JSON.parse(data.result);
  await saveAutomations(SEED_AUTOMATIONS);
  return SEED_AUTOMATIONS;
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
