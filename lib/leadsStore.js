// Phone-only leads pulled from the storefront (lib/storefrontLeadsSync.js)
// — anyone captured with a phone number but no email (e.g. veil-ecommerce's
// scratch-card popup). Kept separate from subscribersStore.js, which is
// keyed entirely by email — there's no key to upsert a phone-only entry
// against there, and no way to email someone with no address anyway. This
// is a record for visibility/future use (SMS isn't built here yet), not
// something automations can act on. A lead that later provides an email
// (e.g. filling out a form on a subsequent visit) shows up as a normal
// subscriber via storefrontLeadsSync.js instead — this list only ever
// holds the ones still missing one.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'phone_only_leads';

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  }
}

export async function getPhoneOnlyLeads() {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/${KEY}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

async function saveLeads(leads) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(leads),
  });
  if (!res.ok) throw new Error('Failed to save phone-only leads.');
}

export async function upsertPhoneOnlyLead({ phone, source, firstSeenAt, lastSeenAt }) {
  const trimmed = (phone || '').trim();
  if (!trimmed) return null;

  const leads = await getPhoneOnlyLeads();
  const idx = leads.findIndex((l) => l.phone === trimmed);
  const now = Date.now();

  if (idx === -1) {
    const lead = { phone: trimmed, source: source || null, firstSeenAt: firstSeenAt || now, lastSeenAt: lastSeenAt || now };
    await saveLeads([...leads, lead]);
    return lead;
  }

  leads[idx] = { ...leads[idx], source: source || leads[idx].source, lastSeenAt: lastSeenAt || now };
  await saveLeads(leads);
  return leads[idx];
}
