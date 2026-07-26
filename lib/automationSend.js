// Shared send machinery for automation steps — used by both
// pages/api/cron/automations.js (batches of subscribers due for a step)
// and this file's sendAutomationStepNow (the admin's manual "send now"
// buttons, one subscriber at a time). Gives automation emails the same
// click-tracking/conversion-analysis treatment campaigns already have
// (lib/emailSend.js) instead of being invisible to analytics.

import { randomUUID } from 'crypto';
import { getAutomation, updateStepLinkTargets, logAutomationSend, incrementStepStat } from './automationsStore';
import { updateAutomationState } from './subscribersStore';
import { renderEmailHtml, renderCartItemsHtml } from './emailBlocks';
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
// the send and bumping the step's `sent` stat. {{CART_ITEMS}} is filled
// from whatever's on the subscriber's own record — empty for anyone
// without a captured cart (most subscribers, most flows), so this is
// safe to always compute rather than needing every caller to know
// whether the flow it's sending even uses the placeholder.
export async function sendStepToSubscriber(flowId, stepIndex, template, subject, subscriber) {
  const sendId = randomUUID();
  const cartItemsHtml = renderCartItemsHtml(subscriber.checkoutItems);
  const html = personalizeSendHtml(template, '', sendId, unsubUrlFor(subscriber), cartItemsHtml);
  await sendEmail({ to: subscriber.email, subject, html, unsubToken: subscriber.unsubToken });
  await logAutomationSend(flowId, stepIndex, [{ sendId, email: subscriber.email, sentAt: Date.now() }]);
  await incrementStepStat(flowId, stepIndex, 'sent', 1);
}

// Manual "send now" for a single subscriber's next due step in a given
// flow — generalized from what used to be a welcome-series-only
// function, so abandoned_checkout (in particular, for when the cron
// cadence isn't tight enough to hit its short delay) can be triggered on
// demand instead of waiting for the cron to pick it up. {{CART_ITEMS}}
// comes from the subscriber's own checkoutItems via sendStepToSubscriber,
// so this "just works" for abandoned_checkout without any special-casing
// here — same code path as every other flow.
export async function sendAutomationStepNow(flowId, subscriber) {
  const flow = await getAutomation(flowId);
  if (!flow) throw new Error('Automation not found.');
  if (!flow.enabled) throw new Error(`The ${flow.name} automation is disabled.`);

  const state = subscriber.automationState?.[flowId] || { step: 0 };
  if (state.step >= flow.steps.length) {
    throw new Error(`This subscriber has already received every ${flow.name} step.`);
  }

  const step = flow.steps[state.step];
  if (!step.subject) {
    throw new Error('This step has no content to send.');
  }

  const settings = await getSettings();
  const template = await prepareStepTemplate(flowId, step, state.step, settings);
  await sendStepToSubscriber(flowId, state.step, template, step.subject, subscriber);
  await updateAutomationState(subscriber.email, flowId, { step: state.step + 1 });

  return { subject: step.subject, step: state.step };
}
