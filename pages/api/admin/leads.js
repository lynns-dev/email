import { getPhoneOnlyLeads } from '../../../lib/leadsStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const leads = await getPhoneOnlyLeads();
    return res.status(200).json({ leads });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
