import { findSubscriber, addSubscriberManually, updateAutomationState } from '../../../lib/subscribersStore';
import { getAutomation } from '../../../lib/automationsStore';
import { getSettings } from '../../../lib/settingsStore';
import { prepareStepTemplate, sendStepToSubscriber } from '../../../lib/automationSend';
import { applyCors } from '../../../lib/cors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  let subscriber = null;
  try {
    const existing = await findSubscriber(email);
    if (existing?.status === 'suppressed') {
      return res.status(400).json({ error: 'This address cannot receive emails. Please use another email address.' });
    }
    if (existing?.status === 'subscribed') {
      return res.status(200).json({ ok: true, alreadySubscribed: true });
    }
    const flow = await getAutomation('welcome_series');
    if (!flow?.enabled || !flow.steps?.[0]?.subject) {
      return res.status(503).json({ error: 'Newsletter signup is temporarily unavailable. Please try again later.' });
    }
    const settings = await getSettings();
    const step = flow.steps[0];
    const template = await prepareStepTemplate(flow.id, step, 0, settings);
    // Reserve step zero at creation, keeping it out of the scheduled sender.
    subscriber = await addSubscriberManually(email, 'newsletter', { reserveWelcome: true });
    await sendStepToSubscriber(flow.id, 0, template, step.subject, subscriber);
    return res.status(200).json({ ok: true, welcomeSent: true });
  } catch (err) {
    // If delivery failed, leave the welcome queued for the normal sender.
    // Never reactivate blocked addresses or change any other automation.
    if (subscriber) {
      await updateAutomationState(subscriber.email, 'welcome_series', { step: 0 }).catch(() => {});
    }
    console.error('Newsletter welcome failed', { message: err.message });
    return res.status(500).json({ error: 'Your welcome email could not be sent. Please try again later.' });
  }
}
