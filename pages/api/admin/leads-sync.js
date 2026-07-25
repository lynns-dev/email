import { syncStorefrontLeads } from '../../../lib/storefrontLeadsSync';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await syncStorefrontLeads();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
