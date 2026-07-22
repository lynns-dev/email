// Manual, on-demand send of the next due welcome_series step for a
// single subscriber — same rendering and step-advancement logic as
// pages/api/cron/automations.js's runWelcomeSeries, but for one contact
// at a time and without the delayDays timing gate, since a manual send
// from the admin means "now," not "when it's due." Used by the
// Subscribers tab's "Send welcome email" button — handy for catching
// someone up after a sync (e.g. the Shopify-import path skipping
// welcome_series until pages/api/cron/automations.js's fix) or just to
// preview what a real send looks like without waiting on the cron.

import { getAutomation } from './automationsStore';
import { updateAutomationState } from './subscribersStore';
import { renderEmailHtml } from './emailBlocks';
import { sendEmail } from './resendEmail';
import { getSettings } from './settingsStore';

function unsubUrlFor(sub) {
  return `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/email/unsubscribe?token=${sub.unsubToken}`;
}

export async function sendWelcomeEmailNow(subscriber) {
  const flow = await getAutomation('welcome_series');
  if (!flow || !flow.enabled) throw new Error('The welcome series automation is disabled.');

  const state = subscriber.automationState?.welcome_series || { step: 0 };
  if (state.step >= flow.steps.length) {
    throw new Error('This subscriber has already received every welcome-series step.');
  }

  const step = flow.steps[state.step];
  const settings = await getSettings();
  const html = renderEmailHtml(step.html, settings).replace(/{{UNSUB_URL}}/g, unsubUrlFor(subscriber));

  await sendEmail({ to: subscriber.email, subject: step.subject, html, unsubToken: subscriber.unsubToken });
  await updateAutomationState(subscriber.email, 'welcome_series', { step: state.step + 1 });

  return { subject: step.subject, step: state.step };
}
