import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { findSubscriber } from './subscribersStore';
import { getSettings } from './settingsStore';
import { renderEmailHtml } from './emailBlocks';
import { sendEmail } from './resendEmail';
import { getEmailBaseUrl } from './emailBaseUrl';
import { DAY, ANSWERS, isBuyer, decideWelcome, recordAnswer, reserveStep } from './veilWelcomeRules.mjs';
import { welcomeContent, contentHtml } from './veilWelcomeContent.mjs';

export async function welcomeConfig() {
  const raw = await welcomeCommand(['GET', 'veil_welcome_config_v1']);
  return raw ? JSON.parse(raw) : { enabled: false, audience: 'non-buyers' };
}
export async function welcomeEnabled() { return (await welcomeConfig()).enabled === true; }
export const welcomeDigest = (email) => createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
const stateKey = (email) => `veil_welcome_v1:${welcomeDigest(email)}`;
const markerKey = (email) => `marketing_last_send:${welcomeDigest(email)}`;

export async function welcomeCommand(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Welcome storage unavailable');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(8000) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('Welcome storage command failed');
  return data.result;
}
export async function welcomeState(email) {
  const value = await welcomeCommand(['GET', stateKey(email)]);
  return value ? JSON.parse(value) : null;
}
async function saveState(email, state) {
  await welcomeCommand(['SET', stateKey(email), JSON.stringify(state)]);
}
export async function withWelcomeLock(email, work) {
  const key = `veil_welcome_lock:${welcomeDigest(email)}`;
  const owner = randomUUID();
  if (await welcomeCommand(['SET', key, owner, 'NX', 'EX', 120]) !== 'OK') return { action: 'hold', reason: 'busy' };
  try { return await work(); }
  finally {
    await welcomeCommand(['EVAL', "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, owner]).catch(() => {});
  }
}
export async function isWelcomeManaged(email) { return Boolean(await welcomeState(email)); }

// Missing/stale/unreachable verification never means 'not purchased'.
// Connect to an authenticated authoritative paid-order-history service before activation.
export async function verifyWelcomePurchase(sub) {
  if (isBuyer(sub)) return { verified: true, purchased: true };
  if (!sub?.email) return { verified: false };
  const endpoint = process.env.VEIL_PURCHASE_VERIFY_URL;
  const secret = process.env.VEIL_PURCHASE_VERIFY_SECRET;
  if (!endpoint || !secret || !endpoint.startsWith('https://')) return { verified: false };
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: JSON.stringify({ email: sub.email }), signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || data.verified !== true || typeof data.purchased !== 'boolean' || !Number.isFinite(data.checkedAt) || Math.abs(Date.now() - data.checkedAt) > 60000) return { verified: false };
    return data;
  } catch { return { verified: false }; }
}
async function signPayload(payload) {
  const stored = await welcomeCommand(['GET', 'veil_welcome_signing_v1']);
  const secret = stored || process.env.VEIL_WELCOME_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new Error('Welcome signing secret not configured');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
export async function welcomeAnswerToken(state, answer) {
  if (!ANSWERS.includes(answer)) throw new Error('Invalid answer');
  const payload = Buffer.from(JSON.stringify({ id: state.id, answer, qa: state.qa === true, expires: state.enrolledAt + 37 * DAY })).toString('base64url');
  return `${payload}.${await signPayload(payload)}`;
}
export async function welcomeConfirmationProof(token) {
  const hour = Math.floor(Date.now() / 3600000);
  return `${hour}.${await signPayload(`confirm:${token}:${hour}`)}`;
}
export async function verifyWelcomeConfirmation(token, proof) {
  const [hour, signature] = String(proof || '').split('.');
  const now = Math.floor(Date.now() / 3600000);
  if (![now, now - 1].includes(Number(hour)) || !signature) return false;
  const expected = await signPayload(`confirm:${token}:${hour}`);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
export async function resolveWelcomeAnswer(token) {
  if (typeof token !== 'string' || token.length > 1024) throw new Error('Invalid link');
  const [payload, signature, extra] = token.split('.');
  const expected = await signPayload(payload || '');
  if (extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid link');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!ANSWERS.includes(data.answer) || !Number.isFinite(data.expires) || data.expires < Date.now()) throw new Error('Link expired');
  if (data.qa === true) {
    const raw = await welcomeCommand(['GET', `veil_welcome_test:${data.id}`]);
    if (!raw) throw new Error('Test expired');
    const state = JSON.parse(raw);
    return { email: state.email, state, answer: data.answer, qa: true };
  }
  const email = await welcomeCommand(['GET', `veil_welcome_lookup:${data.id}`]);
  if (!email) throw new Error('Link expired');
  const state = await welcomeState(email);
  if (!state || state.id !== data.id) throw new Error('Invalid link');
  return { email, state, answer: data.answer };
}
export async function confirmWelcomeAnswer(token) {
  const resolved = await resolveWelcomeAnswer(token);
  if (resolved.qa) {
    const updated = recordAnswer(resolved.state, resolved.answer, Date.now());
    await welcomeCommand(['SET', `veil_welcome_test:${updated.id}`, JSON.stringify(updated), 'EX', 86400]);
    return { ok: true, answer: resolved.answer, adviceOnly: false, qa: true };
  }
  return withWelcomeLock(resolved.email, async () => {
    const sub = await findSubscriber(resolved.email);
    const state = await welcomeState(resolved.email);
    const purchase = state.audience === 'all-subscribers' ? {} : await verifyWelcomePurchase(sub || {});
    const eligibility = decideWelcome(state, sub, purchase, Date.now());
    if (eligibility.action === 'exit' || !sub || sub.status !== 'subscribed') throw new Error('This invitation is no longer active');
    if (state.audience !== 'all-subscribers' && purchase.verified !== true) throw new Error('We could not verify this invitation. Please try later.');
    const updated = recordAnswer(state, resolved.answer, Date.now());
    if (!updated.adviceOnly) await saveState(resolved.email, updated);
    return { ok: true, adviceOnly: Boolean(updated.adviceOnly), answer: resolved.answer };
  });
}
export async function enrollWelcome(sub, bulk = false) {
  if (!await welcomeEnabled()) return { action: 'none', reason: 'disabled' };
  if (!sub || sub.status !== 'subscribed' || (!bulk && sub.source !== 'newsletter')) return { action: 'none', reason: 'not-subscribed' };
  return withWelcomeLock(sub.email, async () => {
    const existing = await welcomeState(sub.email);
    if (existing) return { action: 'none', reason: 'already-enrolled' };
    // Persist enrollment even when purchase verification is temporarily unavailable.
    // processWelcome fails closed; old cadence remains superseded for this signup.
    const config = await welcomeConfig();
    const state = { id: randomUUID(), enrolledAt: Date.now(), sent: {}, branchSends: 0, audience: config.audience, baselineOrders: Number(sub.ordersCount) || 0, existingContact: bulk };
    // Check signing configuration now, not three days after enrollment.
    await welcomeAnswerToken(state, 'scent');
    await welcomeCommand(['SET', `veil_welcome_lookup:${state.id}`, sub.email, 'EX', 38 * 86400]);
    await saveState(sub.email, state);
    return { action: 'enrolled' };
  });
}
export async function processWelcome(email, dryRun = false) {
  if (!await welcomeEnabled()) return { action: 'none', reason: 'disabled' };
  return withWelcomeLock(email, async () => {
    let state = await welcomeState(email);
    let sub = await findSubscriber(email);
    const purchase = state?.audience === 'all-subscribers' ? {} : await verifyWelcomePurchase(sub || {});
    const marker = Number(await welcomeCommand(['GET', markerKey(email)])) || 0;
    const decision = decideWelcome(state, sub, purchase, Date.now(), marker);
    if (dryRun) return decision;
    if (decision.action === 'exit' || decision.action === 'complete') {
      await saveState(email, { ...state, [decision.action === 'exit' ? 'exited' : 'completed']: Date.now(), reason: decision.reason });
      return decision;
    }
    if (decision.action !== 'send') return decision;
    const settings = await getSettings();
    if (!settings.companyName || !settings.physicalAddress) return { action: 'hold', reason: 'business-footer-missing' };
    const links = Object.fromEntries(await Promise.all(ANSWERS.map(async answer => [answer, `${getEmailBaseUrl()}/welcome-answer?token=${encodeURIComponent(await welcomeAnswerToken(state, answer))}`])));
    let content = contentHtml(decision.key, links);
    if (state.existingContact && decision.key === 'welcome') content = content.replace('Welcome to Veil.', 'A quiet invitation, again.');
    // Past buyers are included, but the original first-order code is not renewed.
    if (state.audience === 'all-subscribers') content = content.replace('Your first order is 15% less with code VEIL15. Enter it at checkout.', 'If this is your first order, use your eligible VEIL15 code for 15% off at checkout.');
    const unsub = `${getEmailBaseUrl()}/api/email/unsubscribe?token=${encodeURIComponent(sub.unsubToken)}`;
    const html = renderEmailHtml(content, settings).replace(/{{UNSUB_URL}}/g, unsub);
    // Final consent/purchase re-read immediately before reservation/send.
    sub = await findSubscriber(email);
    const finalPurchase = state.audience === 'all-subscribers' ? {} : await verifyWelcomePurchase(sub || {});
    const finalDecision = decideWelcome(state, sub, finalPurchase, Date.now(), marker);
    if (finalDecision.action !== 'send' || finalDecision.key !== decision.key) return finalDecision;
    state = reserveStep(state, decision.key, Date.now());
    await saveState(email, state);
    // Permanent reservation before network I/O: ambiguous sends hold for human review,
    // never silently retry and risk mailing twice. No 'exactly once' delivery claim.
    try {
      const result = await sendEmail({ to: email, subject: welcomeContent[decision.key].subject, html, unsubToken: sub.unsubToken });
      state.sent[decision.key] = { ...state.sent[decision.key], status: 'sent', providerId: result.id };
      if (decision.key === 'day30') state.completed = Date.now();
      await saveState(email, state);
      return { action: 'sent', key: decision.key };
    } catch (err) {
      state.exited = Date.now();
      state.reason = 'send-needs-review';
      state.sent[decision.key].status = 'needs-review';
      await saveState(email, state);
      return { action: 'hold', reason: 'send-needs-review' };
    }
  });
}
export async function runVeilWelcome(subscribers) {
  if (!await welcomeEnabled()) return { disabled: true, sent: 0 };
  const result = { sent: 0, held: 0, exited: 0 };
  // Only explicit new-flow enrollments; never backfill an old list from cron.
  for (const sub of subscribers) {
    if (!await isWelcomeManaged(sub.email)) continue;
    const outcome = await processWelcome(sub.email);
    if (outcome.action === 'sent') result.sent += 1;
    if (outcome.action === 'hold') result.held += 1;
    if (outcome.action === 'exit') result.exited += 1;
  }
  return result;
}
export async function recordMarketingSend(email) {
  await welcomeCommand(['SET', markerKey(email), String(Date.now())]);
}
