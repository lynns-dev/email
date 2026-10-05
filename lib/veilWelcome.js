import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { findSubscriber } from './subscribersStore';
import { getSettings } from './settingsStore';
import { renderEmailHtml } from './emailBlocks';
import { sendEmail } from './resendEmail';
import { getEmailBaseUrl } from './emailBaseUrl';
import { DAY, ANSWERS, isBuyer, decideWelcome, recordAnswer, reserveStep } from './veilWelcomeRules.mjs';
import { welcomeContent, contentHtml } from './veilWelcomeContent.mjs';

export const welcomeEnabled = () => process.env.VEIL_WELCOME_ENABLED === 'true';
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
function signPayload(payload) {
  const secret = process.env.VEIL_WELCOME_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new Error('Welcome signing secret not configured');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
export function welcomeAnswerToken(state, answer) {
  if (!ANSWERS.includes(answer)) throw new Error('Invalid answer');
  const payload = Buffer.from(JSON.stringify({ id: state.id, answer, expires: state.enrolledAt + 37 * DAY })).toString('base64url');
  return `${payload}.${signPayload(payload)}`;
}
export async function resolveWelcomeAnswer(token) {
  if (typeof token !== 'string' || token.length > 1024) throw new Error('Invalid link');
  const [payload, signature, extra] = token.split('.');
  const expected = signPayload(payload || '');
  if (extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid link');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!ANSWERS.includes(data.answer) || !Number.isFinite(data.expires) || data.expires < Date.now()) throw new Error('Link expired');
  const email = await welcomeCommand(['GET', `veil_welcome_lookup:${data.id}`]);
  if (!email) throw new Error('Link expired');
  const state = await welcomeState(email);
  if (!state || state.id !== data.id) throw new Error('Invalid link');
  return { email, state, answer: data.answer };
}
export async function confirmWelcomeAnswer(token) {
  const resolved = await resolveWelcomeAnswer(token);
  return withWelcomeLock(resolved.email, async () => {
    const sub = await findSubscriber(resolved.email);
    const purchase = await verifyWelcomePurchase(sub || {});
    if (!sub || sub.status !== 'subscribed' || purchase.purchased === true) throw new Error('This invitation is no longer active');
    if (purchase.verified !== true) throw new Error('We could not verify this invitation. Please try later.');
    const state = await welcomeState(resolved.email);
    const updated = recordAnswer(state, resolved.answer, Date.now());
    if (!updated.adviceOnly) await saveState(resolved.email, updated);
    return { ok: true, adviceOnly: Boolean(updated.adviceOnly), answer: resolved.answer };
  });
}
export async function enrollWelcome(sub) {
  if (!welcomeEnabled()) return { action: 'none', reason: 'disabled' };
  if (!sub || sub.status !== 'subscribed' || sub.source !== 'newsletter') return { action: 'none', reason: 'no-signup-consent' };
  return withWelcomeLock(sub.email, async () => {
    const existing = await welcomeState(sub.email);
    if (existing) return { action: 'none', reason: 'already-enrolled' };
    const purchase = await verifyWelcomePurchase(sub);
    if (purchase.verified !== true) return { action: 'hold', reason: 'purchase-data-unavailable' };
    if (purchase.purchased) return { action: 'none', reason: 'purchased' };
    const state = { id: randomUUID(), enrolledAt: Date.now(), sent: {}, branchSends: 0 };
    // Check signing configuration now, not three days after enrollment.
    welcomeAnswerToken(state, 'scent');
    await welcomeCommand(['SET', `veil_welcome_lookup:${state.id}`, sub.email, 'EX', 38 * 86400]);
    await saveState(sub.email, state);
    return { action: 'enrolled' };
  });
}
export async function processWelcome(email, dryRun = false) {
  if (!welcomeEnabled()) return { action: 'none', reason: 'disabled' };
  return withWelcomeLock(email, async () => {
    let state = await welcomeState(email);
    let sub = await findSubscriber(email);
    const purchase = await verifyWelcomePurchase(sub || {});
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
    const links = Object.fromEntries(ANSWERS.map(answer => [answer, `${getEmailBaseUrl()}/welcome-answer?token=${encodeURIComponent(welcomeAnswerToken(state, answer))}`]));
    const content = contentHtml(decision.key, links);
    const unsub = `${getEmailBaseUrl()}/api/email/unsubscribe?token=${encodeURIComponent(sub.unsubToken)}`;
    const html = renderEmailHtml(content, settings).replace(/{{UNSUB_URL}}/g, unsub);
    // Final consent/purchase re-read immediately before reservation/send.
    sub = await findSubscriber(email);
    const finalPurchase = await verifyWelcomePurchase(sub || {});
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
  if (!welcomeEnabled()) return { disabled: true, sent: 0 };
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
