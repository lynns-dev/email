import { createDomainIdentity, getIdentityStatus, getAccountStatus } from '../../../lib/sesIdentity';
import { getSettings, updateSettings } from '../../../lib/settingsStore';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { domain } = req.body || {};
    if (!domain || !domain.trim()) return res.status(400).json({ error: 'Domain is required.' });
    try {
      const result = await createDomainIdentity(domain.trim());
      await updateSettings({ sendingDomain: domain.trim() });
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'GET') {
    try {
      const settings = await getSettings();
      const account = await getAccountStatus().catch(() => null);
      const envConfigured = {
        configurationSet: Boolean(process.env.SES_CONFIGURATION_SET),
        snsTopic: Boolean(process.env.SES_SNS_TOPIC_ARN),
      };
      if (!settings.sendingDomain) return res.status(200).json({ domain: null, account, envConfigured });
      const result = await getIdentityStatus(settings.sendingDomain).catch((err) => ({ domain: settings.sendingDomain, error: err.message }));
      return res.status(200).json({ ...result, account, envConfigured });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
