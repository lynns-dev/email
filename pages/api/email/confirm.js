import { confirmSubscriber, updateAutomationState } from '../../../lib/subscribersStore';

// Redirects back to the storefront's own homepage (SITE_REDIRECT_URL) so
// the confirmation lands in-context there rather than on this app's bare
// domain — same idea as before the split, just pointed at an env var
// instead of a hardcoded relative path, so a different deployment of this
// app (a different storefront) can point it at their own site.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const siteUrl = process.env.SITE_REDIRECT_URL || '/';
  const { token } = req.query;
  const subscriber = token ? await confirmSubscriber(String(token)) : null;

  if (!subscriber) {
    return res.redirect(302, `${siteUrl}?confirmed=0`);
  }

  // Kicks off the welcome series — the cron in pages/api/cron/automations.js
  // picks up step 0 on its next run since dueAt (confirmedAt + delayDays)
  // is already in the past for a delayDays: 0 first step.
  await updateAutomationState(subscriber.email, 'welcome_series', { step: 0 });

  return res.redirect(302, `${siteUrl}?confirmed=1`);
}
