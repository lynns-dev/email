// Shared send machinery for automation steps — used by both
// pages/api/cron/automations.js (batches of subscribers due for a step)
// and this file's sendWelcomeEmailNow (the admin's manual "Send welcome
// email" button, one subscriber at a time). Gives automation emails the
// same click-tracking/conversion-analysis treatment campaigns already
// have (lib/emailSend.js) instead of being invisible to analytics.

import { randomUUID } from 'crypto';
import { getAutomation, updateStepLinkTargets, logAutomationSend, incrementStepStat } from './automationsStore';
import { updateAutomationState } from './subscribersStore';
import { renderEmailHtml } from './emailBlocks';
import { sendEmail } from './resendEmail';
import { getSettings } from './settingsStore';
import { wrapLinksForSend, personalizeSendHtml } from './emailLinks';

function unsubUrlFor(sub) {
  return `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/email/unsubscribe?token=${sub.unsubToken}`;
}

// Wraps a step's links into click-trackable redirects and persists the
// resolved targets on the step so pages/api/email/click.js can resolve
// them later. Call once per (flow, step) per batch of sends, not once
// per subscriber — the step's content (and therefore its links) is the
// same for everyone; only the per-recipient {{SEND_ID}}/{{UNSUB_URL}}
// substitution (personalizeSendHtml, below) varies.
export async function prepareStepTemplate(flowId, step, stepIndex, settings) {
  const rendered = renderEmailHtml(step.html, settings);
  const { html: wrapped, links } = wrapLinksForSend(
    rendered,
    (idx) => `/api/email/click?f=${encodeURIComponent(flowId)}&st=${stepIndex}&s={{SEND_ID}}&i=${idx}`
  );
  await updateStepLinkTargets(flowId, stepIndex, links);
  return wrapped;
}

// Sends one already-prepared step template to one subscriber, logging
// the send and bumping the step's `sent` stat.
export async function sendStepToSubscriber(flowId, stepIndex, template, subject, subscriber) {
  const sendId = randomUUID();
  const html = personalizeSendHtml(template, '', sendId, unsubUrlFor(subscriber));
  await sendEmail({ to: subscriber.email, subject, html, unsubToken: subscriber.unsubToken });
  await logAutomationSend(flowId, stepIndex, [{ sendId, email: subscriber.email, sentAt: Date.now() }]);
  await incrementStepStat(flowId, stepIndex, 'sent', 1);
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
  const template = await prepareStepTemplate('welcome_series', step, state.step, settings);
  await sendStepToSubscriber('welcome_series', state.step, template, step.subject, subscriber);
  await updateAutomationState(subscriber.email, 'welcome_series', { step: state.step + 1 });

  return { subject: step.subject, step: state.step };
}
