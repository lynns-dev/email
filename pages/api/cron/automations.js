// Scans subscribers for automation steps that are due and sends them.
// Triggered by Vercel Cron (see vercel.json) or an external pinger — see
// the "Automations" section of DEPLOYMENT.md for why Vercel's Hobby plan
// (daily-only cron) may not be frequent enough and what to use instead.
//
// welcome_series steps are timed off confirmedAt (delayDays is relative
// to double-opt-in confirmation). sunset_winback steps are timed off
// lastActivityAt (last click) rather than opens, since Apple Mail Privacy
// Protection makes "opened" true for most of a list within seconds
// regardless of whether anyone looked — see lib/emailEngagement.js.
// abandoned_checkout/add_to_cart/order_received are timed off the
// tracking-pixel/webhook signals recorded in lib/subscribersStore.js.

import { getAutomations } from '../../../lib/automationsStore';
import { getSubscribers, updateAutomationState, suppressByEmail } from '../../../lib/subscribersStore';
import { getSettings } from '../../../lib/settingsStore';
import { daysSinceActivity, WINBACK_AFTER_DAYS } from '../../../lib/emailEngagement';
import { renderEmailHtml } from '../../../lib/emailBlocks';
import { sendEmail } from '../../../lib/resendEmail';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Automation steps store `html` (lib/emailBlocks.js), same as campaigns,
// so they get the account's logo/footer/font automatically — but unlike
// campaigns, automation sends don't go through lib/emailSend.js's
// wrapLinksForSend/personalizeSendHtml pipeline (no per-campaign click
// tracking here), so the {{UNSUB_URL}} placeholder the footer leaves
// behind has to be filled in directly.
function renderStepHtml(step, settings, unsubUrl) {
  return renderEmailHtml(step.html, settings).replace(/{{UNSUB_URL}}/g, unsubUrl);
}

function unsubUrlFor(sub) {
  return `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/email/unsubscribe?token=${sub.unsubToken}`;
}

async function runWelcomeSeries(flow, subscribers, settings) {
  if (!flow.enabled) return 0;
  let sent = 0;
  const now = Date.now();

  for (const sub of subscribers) {
    if (sub.status !== 'subscribed' || !sub.confirmedAt) continue;
    const state = sub.automationState?.welcome_series || { step: 0 };
    if (state.step >= flow.steps.length) continue;

    const step = flow.steps[state.step];
    const dueAt = sub.confirmedAt + step.delayDays * DAY_MS;
    if (now < dueAt) continue;

    await sendEmail({ to: sub.email, subject: step.subject, html: renderStepHtml(step, settings, unsubUrlFor(sub)), unsubToken: sub.unsubToken });
    await updateAutomationState(sub.email, 'welcome_series', { step: state.step + 1 });
    sent += 1;
  }
  return sent;
}

async function runSunsetWinback(flow, subscribers, settings) {
  if (!flow.enabled) return { sent: 0, suppressed: 0 };
  let sent = 0;
  let suppressed = 0;

  for (const sub of subscribers) {
    if (sub.status !== 'subscribed') continue;
    const idleDays = daysSinceActivity(sub);
    const state = sub.automationState?.sunset_winback || { step: 0 };

    // Re-engaged since the win-back email went out — reset so a future
    // idle stretch gets its own fresh cycle instead of skipping straight
    // to suppression.
    if (idleDays < WINBACK_AFTER_DAYS && state.step > 0) {
      await updateAutomationState(sub.email, 'sunset_winback', { step: 0 });
      continue;
    }

    if (state.step >= flow.steps.length) continue;
    const step = flow.steps[state.step];
    if (idleDays < step.delayDays) continue;

    if (step.subject) {
      await sendEmail({ to: sub.email, subject: step.subject, html: renderStepHtml(step, settings, unsubUrlFor(sub)), unsubToken: sub.unsubToken });
      sent += 1;
    } else {
      await suppressByEmail(sub.email, 'sunset');
      suppressed += 1;
    }
    await updateAutomationState(sub.email, 'sunset_winback', { step: state.step + 1 });
  }
  return { sent, suppressed };
}

// checkoutStartedAt is cleared to null by subscribersStore.touchLastOrder
// the moment an order comes in (via the orders/create Shopify webhook),
// so a converted checkout naturally falls out of the `if
// (!sub.checkoutStartedAt) continue` guard below without any extra
// bookkeeping here.
async function runAbandonedCheckout(flow, subscribers, settings) {
  if (!flow.enabled) return 0;
  let sent = 0;
  const now = Date.now();

  for (const sub of subscribers) {
    if (sub.status !== 'subscribed' || !sub.checkoutStartedAt) continue;
    const state = sub.automationState?.abandoned_checkout || { step: 0 };
    if (state.step >= flow.steps.length) continue;

    const step = flow.steps[state.step];
    const dueAt = sub.checkoutStartedAt + step.delayHours * HOUR_MS;
    if (now < dueAt) continue;

    await sendEmail({ to: sub.email, subject: step.subject, html: renderStepHtml(step, settings, unsubUrlFor(sub)), unsubToken: sub.unsubToken });
    await updateAutomationState(sub.email, 'abandoned_checkout', { step: state.step + 1 });
    sent += 1;
  }
  return sent;
}

// Fires for cart activity that never reached checkout — a softer signal
// than abandoned_checkout, so it's superseded (not just skipped) the
// moment they do start a checkout; see subscribersStore.recordCheckoutStarted.
async function runAddToCart(flow, subscribers, settings) {
  if (!flow.enabled) return 0;
  let sent = 0;
  const now = Date.now();

  for (const sub of subscribers) {
    if (sub.status !== 'subscribed' || !sub.cartUpdatedAt) continue;
    const state = sub.automationState?.add_to_cart || { step: 0 };
    if (state.step >= flow.steps.length) continue;

    const step = flow.steps[state.step];
    const dueAt = sub.cartUpdatedAt + step.delayHours * HOUR_MS;
    if (now < dueAt) continue;

    await sendEmail({ to: sub.email, subject: step.subject, html: renderStepHtml(step, settings, unsubUrlFor(sub)), unsubToken: sub.unsubToken });
    await updateAutomationState(sub.email, 'add_to_cart', { step: state.step + 1 });
    sent += 1;
  }
  return sent;
}

// Not a transactional receipt (Shopify sends that) — a marketing-toned
// thank-you + later review/repeat-purchase nudge, timed off lastOrderAt.
// subscribersStore.touchLastOrder resets this to step 0 on every new
// order, so a repeat customer gets a fresh cycle each time.
async function runOrderReceived(flow, subscribers, settings) {
  if (!flow.enabled) return 0;
  let sent = 0;
  const now = Date.now();

  for (const sub of subscribers) {
    if (sub.status !== 'subscribed' || !sub.lastOrderAt) continue;
    const state = sub.automationState?.order_received || { step: 0 };
    if (state.step >= flow.steps.length) continue;

    const step = flow.steps[state.step];
    const dueAt = sub.lastOrderAt + step.delayHours * HOUR_MS;
    if (now < dueAt) continue;

    await sendEmail({ to: sub.email, subject: step.subject, html: renderStepHtml(step, settings, unsubUrlFor(sub)), unsubToken: sub.unsubToken });
    await updateAutomationState(sub.email, 'order_received', { step: state.step + 1 });
    sent += 1;
  }
  return sent;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Not authorized.' });
  }

  try {
    const [automations, subscribers, settings] = await Promise.all([getAutomations(), getSubscribers(), getSettings()]);
    const byId = (id) => automations.find((a) => a.id === id);

    const welcomeSent = await runWelcomeSeries(byId('welcome_series') || { enabled: false }, subscribers, settings);
    const sunsetResult = await runSunsetWinback(byId('sunset_winback') || { enabled: false }, subscribers, settings);
    const abandonedCheckoutSent = await runAbandonedCheckout(byId('abandoned_checkout') || { enabled: false }, subscribers, settings);
    const addToCartSent = await runAddToCart(byId('add_to_cart') || { enabled: false }, subscribers, settings);
    const orderReceivedSent = await runOrderReceived(byId('order_received') || { enabled: false }, subscribers, settings);

    return res.status(200).json({
      ok: true,
      welcomeSent,
      abandonedCheckoutSent,
      addToCartSent,
      orderReceivedSent,
      ...sunsetResult,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
