import { getCampaigns } from '../../../../lib/campaignsStore';
import { getSubscribers } from '../../../../lib/subscribersStore';
import { computeCampaignConversion } from '../../../../lib/campaignAnalytics';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [campaigns, subscribers] = await Promise.all([getCampaigns(), getSubscribers()]);
    const subscribersByEmail = new Map(subscribers.map((s) => [s.email, s]));
    const sent = campaigns.filter((c) => c.status === 'sent');

    const perCampaign = {};
    let totalConverted = 0;
    let totalUniqueClickers = 0;

    for (const campaign of sent) {
      const result = await computeCampaignConversion(campaign.id, subscribersByEmail);
      perCampaign[campaign.id] = result;
      totalConverted += result.converted;
      totalUniqueClickers += result.uniqueClickers;
    }

    const aggregate = {
      converted: totalConverted,
      uniqueClickers: totalUniqueClickers,
      conversionRate: totalUniqueClickers > 0 ? Math.round((totalConverted / totalUniqueClickers) * 1000) / 10 : 0,
    };

    return res.status(200).json({ campaigns: perCampaign, aggregate });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
