import { getSubscribers } from '../../../../lib/subscribersStore';
import { sendWelcomeEmailNow } from '../../../../lib/automationSend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  try {
    const subscribers = await getSubscribers();
    const subscriber = subscribers.find((s) => s.email === email);
    if (!subscriber) return res.status(404).json({ error: 'Subscriber not found.' });
    if (subscriber.status !== 'subscribed') {
      return res.status(400).json({ error: 'Only subscribed contacts can be sent an automation email.' });
    }

    const result = await sendWelcomeEmailNow(subscriber);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
