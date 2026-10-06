export const DAY = 86400000;
export const ANSWERS = ['scent', 'powder', 'price', 'timing'];
export function isBuyer(sub) {
  return Boolean(sub?.lastOrderAt || sub?.lastPurchaseAt || Number(sub?.ordersCount) > 0);
}
export function decideWelcome(state, sub, purchase, now, lastMarketingAt = 0) {
  if (!state || state.completed || state.exited) return { action: 'none', reason: 'not-active' };
  if (!sub || sub.status !== 'subscribed') return { action: 'exit', reason: 'not-subscribed' };
  if (state.audience === 'all-subscribers') {
    // Explicit owner-approved cohort includes PAST buyers, not future orders.
    const timestamp = Math.max(Number(sub.lastOrderAt) || Date.parse(sub.lastOrderAt) || 0, Number(sub.lastPurchaseAt) || Date.parse(sub.lastPurchaseAt) || 0);
    if (timestamp > state.enrolledAt || Number(sub.ordersCount || 0) > Number(state.baselineOrders || 0)) return { action: 'exit', reason: 'new-purchase-recorded' };
  } else {
    if (isBuyer(sub) || purchase?.purchased === true) return { action: 'exit', reason: 'purchased' };
    if (purchase?.verified !== true || purchase.purchased !== false) return { action: 'hold', reason: 'purchase-data-unavailable' };
  }
  if (!Number.isFinite(state.enrolledAt) || state.enrolledAt > now) return { action: 'hold', reason: 'invalid-enrollment' };
  const age = now - state.enrolledAt;
  if (age > 37 * DAY) return { action: 'complete', reason: 'expired-without-catchup' };
  if (now - Math.max(lastMarketingAt || 0, state.lastSentAt || 0) < DAY) return { action: 'hold', reason: 'daily-send-cap' };
  if (sub.checkoutStartedAt && now - sub.checkoutStartedAt < 2 * DAY) return { action: 'hold', reason: 'checkout-priority' };
  const sent = state.sent || {};
  const step = (key) => sent[key] ? { action: 'hold', reason: 'reserved-or-sent' } : { action: 'send', key };
  // Select the CURRENT stage first: an outage must not burst-send old stages.
  if (age >= 30 * DAY) return step('day30');
  if (age >= 14 * DAY) return step('day14');
  if (age >= 4 * DAY && age <= 10 * DAY && ANSWERS.includes(state.answer)) {
    const count = state.branchSends || 0;
    if (count >= 2) return { action: 'none', reason: 'branch-limit' };
    if (state.answerVersion !== state.lastBranchVersion) return step(`${state.answer}4`);
    const due = Math.max(state.enrolledAt + 7 * DAY, (state.lastBranchAt || 0) + 3 * DAY);
    if (count < 2 && now >= due) return step(`${state.answer}7`);
    return { action: 'none', reason: 'branch-not-due' };
  }
  if (age >= 3 * DAY && age < 4 * DAY) return step('survey');
  if (age < DAY) return step('welcome');
  return { action: 'none', reason: 'not-due' };
}
export function recordAnswer(state, answer, now) {
  if (!ANSWERS.includes(answer)) throw new Error('Invalid answer');
  if (!state || state.completed || state.exited || now - state.enrolledAt > 10 * DAY) return { ...state, adviceOnly: true };
  if (state.answer === answer) return state;
  return { ...state, answer, answeredAt: now, answerVersion: (state.answerVersion || 0) + 1 };
}
export function reserveStep(state, key, now) {
  const branch = /^(scent|powder|price|timing)[47]$/.test(key);
  return {
    ...state,
    sent: { ...state.sent, [key]: { status: 'reserved', at: now } },
    lastSentAt: now,
    ...(branch ? { branchSends: (state.branchSends || 0) + 1, lastBranchAt: now, lastBranchVersion: state.answerVersion } : {}),
  };
}
