import { DAY, decideWelcome, recordAnswer, reserveStep } from './veilWelcomeRules.mjs';
import { contentHtml, welcomeContent } from './veilWelcomeContent.mjs';
export function runWelcomeRuleChecks() {
  const start = 1700000000000;
  const state = { id: 'fixture', enrolledAt: start, sent: {}, branchSends: 0 };
  const sub = { email: 'test@example.invalid', status: 'subscribed' };
  const verified = { verified: true, purchased: false };
  const results = [];
  const check = (name, fn) => {
    try { if (!fn()) throw new Error('Unexpected decision'); results.push({ name, passed: true }); }
    catch (err) { results.push({ name, passed: false, error: err.message }); }
  };
  const choose = (s = state, at = start, p = verified, subscriber = sub, marker = 0) => decideWelcome(s, subscriber, p, at, marker);
  check('Immediate welcome eligible', () => choose().key === 'welcome');
  check('Day 3 survey', () => choose(state, start + 3 * DAY).key === 'survey');
  check('No answer skips branch', () => choose(state, start + 4 * DAY).action === 'none');
  for (const answer of ['scent', 'powder', 'price', 'timing']) {
    const selected = recordAnswer(state, answer, start + 3 * DAY);
    check(`${answer}: day 4 routing`, () => choose(selected, start + 4 * DAY).key === `${answer}4`);
    const sent = reserveStep(selected, `${answer}4`, start + 4 * DAY);
    check(`${answer}: day 7 routing`, () => choose(sent, start + 7 * DAY).key === `${answer}7`);
  }
  check('Day 14 common email', () => choose(state, start + 14 * DAY).key === 'day14');
  check('Day 30 final email', () => choose(state, start + 30 * DAY).key === 'day30');
  check('Outage selects current stage, not old welcome', () => choose(state, start + 15 * DAY).key === 'day14');
  check('Expired enrollment does not catch up', () => choose(state, start + 38 * DAY).action === 'complete');
  check('Unavailable purchase history holds', () => choose(state, start, {}).action === 'hold');
  check('Verified purchaser exits', () => choose(state, start, { verified: true, purchased: true }).action === 'exit');
  check('Local purchaser exits even on verifier failure', () => choose(state, start, {}, { ...sub, ordersCount: 1 }).action === 'exit');
  check('Unsubscribed contact exits', () => choose(state, start, verified, { ...sub, status: 'unsubscribed' }).action === 'exit');
  check('Blocked contact exits', () => choose(state, start, verified, { ...sub, status: 'suppressed' }).action === 'exit');
  check('Daily preceding-marketing cap', () => choose(state, start + 3 * DAY, verified, sub, start + 2.5 * DAY).reason === 'daily-send-cap');
  check('Checkout gets 48-hour priority', () => choose(state, start + 3 * DAY, verified, { ...sub, checkoutStartedAt: start + 2 * DAY }).reason === 'checkout-priority');
  check('Reserved send cannot duplicate', () => choose(reserveStep(state, 'welcome', start), start + DAY / 2).action !== 'send');
  const selected = recordAnswer(state, 'scent', start + 3 * DAY);
  const sentFirst = reserveStep(selected, 'scent4', start + 4 * DAY);
  const switched = recordAnswer(sentFirst, 'price', start + 5 * DAY);
  check('Human switch replaces unsent follow-up', () => choose(switched, start + 5 * DAY).key === 'price4');
  check('Two branch sends maximum', () => choose(reserveStep(switched, 'price4', start + 5 * DAY), start + 8 * DAY).reason === 'branch-limit');
  check('Repeated answer is idempotent', () => recordAnswer(selected, 'scent', start + 4 * DAY).answerVersion === selected.answerVersion);
  check('Late answer is advice only', () => recordAnswer(state, 'price', start + 11 * DAY).adviceOnly === true);
  check('Incomplete day-7 follow-up expires after day 10', () => choose(sentFirst, start + 11 * DAY).action === 'none');
  check('Completed flow never sends', () => choose({ ...state, completed: start }).action === 'none');
  const urls = Object.fromEntries(['scent', 'powder', 'price', 'timing'].map(a => [a, `https://example.invalid/welcome-answer?token=fixture-${a}`]));
  check('Twelve templates all render', () => Object.keys(welcomeContent).length === 12 && Object.keys(welcomeContent).every(key => contentHtml(key, urls).includes('<h1')));
  check('Survey refuses missing links', () => { try { contentHtml('survey'); return false; } catch { return true; } });
  check('Only absolute product/answer destinations', () => Object.keys(welcomeContent).every(key => !/href="(?!https:\/\/)/.test(contentHtml(key, urls))));
  check('Unknown step is rejected', () => { try { contentHtml('unknown'); return false; } catch { return true; } });
  const all = { ...state, audience: 'all-subscribers', baselineOrders: 2 };
  check('Approved all-subscriber cohort includes past buyer', () => choose(all, start, {}, { ...sub, ordersCount: 2, lastOrderAt: start - DAY }).key === 'welcome');
  check('Approved cohort does not need incomplete lifetime history', () => choose(all, start, {}).key === 'welcome');
  check('New recorded order stops approved cohort', () => choose(all, start + DAY, {}, { ...sub, ordersCount: 3 }).action === 'exit');
  check('New recorded timestamp stops approved cohort', () => choose(all, start + DAY, {}, { ...sub, ordersCount: 2, lastOrderAt: start + 1 }).action === 'exit');
  check('All cohort still excludes unsubscribed', () => choose(all, start, {}, { ...sub, status: 'unsubscribed' }).action === 'exit');
  check('All cohort still excludes suppressed', () => choose(all, start, {}, { ...sub, status: 'suppressed' }).action === 'exit');
  check('All cohort still excludes pending', () => choose(all, start, {}, { ...sub, status: 'pending' }).action === 'exit');
  return { passed: results.every(r => r.passed), total: results.length, results };
}
