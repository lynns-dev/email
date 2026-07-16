import { fetchConsentedCustomers } from '../../../../lib/shopify';
import { upsertFromShopify } from '../../../../lib/subscribersStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const customers = await fetchConsentedCustomers();
    let synced = 0;
    for (const customer of customers) {
      await upsertFromShopify(customer);
      synced += 1;
    }
    return res.status(200).json({ ok: true, synced, total: customers.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
