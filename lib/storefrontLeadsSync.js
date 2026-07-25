// Pulls captured checkout leads from the storefront's own /api/leads/export
// (veil-ecommerce's lib/checkoutLeadsStore.js — everyone who typed an email
// or phone into checkout or a popup, whether or not they bought, whether
// or not they checked a marketing-consent box). A lead with an email
// becomes a real subscriber — source: 'lead', full welcome_series/etc.
// automation eligibility, same trust level as any other manually-created
// subscriber (explicit product decision: this storefront treats anyone
// who handed over contact info as fair game for its automations, not just
// people who ticked a checkbox — know that's the tradeoff being made here
// if this list's bounce/complaint rate ever looks off). A phone-only lead
// (no email at all) can't become a subscriber — subscribersStore.js is
// keyed on email — so it lands in lib/leadsStore.js instead, visible but
// not actionable until SMS exists.

import { addSubscriberManually } from './subscribersStore';
import { upsertPhoneOnlyLead } from './leadsStore';

export async function syncStorefrontLeads() {
  const baseUrl = process.env.STOREFRONT_URL;
  const apiKey = process.env.STOREFRONT_LEADS_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('STOREFRONT_URL / STOREFRONT_LEADS_API_KEY are not set.');
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/leads/export`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Storefront leads export failed: ${res.status}`);
  const { leads } = await res.json();

  let subscribersSynced = 0;
  let phoneOnlySynced = 0;

  for (const lead of leads || []) {
    if (lead.email) {
      await addSubscriberManually(lead.email, 'lead', { phone: lead.phone || undefined }).catch(() => {});
      subscribersSynced += 1;
    } else if (lead.phone) {
      await upsertPhoneOnlyLead({
        phone: lead.phone,
        source: lead.source,
        firstSeenAt: lead.firstSeenAt ? new Date(lead.firstSeenAt).getTime() : undefined,
        lastSeenAt: lead.lastSeenAt ? new Date(lead.lastSeenAt).getTime() : undefined,
      });
      phoneOnlySynced += 1;
    }
  }

  return { total: (leads || []).length, subscribersSynced, phoneOnlySynced };
}
