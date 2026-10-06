import { randomBytes, randomUUID } from 'crypto';
import { verifySession, SESSION_COOKIE } from '../../../../lib/adminAuth';
import { getSubscribers, findSubscriber } from '../../../../lib/subscribersStore';
import { getSettings } from '../../../../lib/settingsStore';
import { renderEmailHtml } from '../../../../lib/emailBlocks';
import { sendEmail } from '../../../../lib/resendEmail';
import { getEmailBaseUrl } from '../../../../lib/emailBaseUrl';
import { welcomeConfig, welcomeCommand, welcomeState, welcomeAnswerToken, enrollWelcome, processWelcome, withWelcomeLock } from '../../../../lib/veilWelcome';
import { welcomeContent, contentHtml } from '../../../../lib/veilWelcomeContent.mjs';
import { runWelcomeRuleChecks } from '../../../../lib/veilWelcomeChecks.mjs';
const JOB = 'veil_welcome_rollout_oct2026';
export const config = { maxDuration: 60 };
async function readJob() { const raw = await welcomeCommand(['GET', JOB]); return raw ? JSON.parse(raw) : null; }
async function saveJob(job) { await welcomeCommand(['SET', JOB, JSON.stringify(job)]); }
async function summary() {
  const subscribers = await getSubscribers();
  const cfg = await welcomeConfig();
  const job = await readJob();
  const totals = { contacts: subscribers.length, subscribed: 0, unsubscribed: 0, suppressed: 0, pending: 0, other: 0 };
  for (const sub of subscribers) { const key = Object.hasOwn(totals, sub.status) ? sub.status : 'other'; totals[key] += 1; }
  const states = job ? await Promise.all(job.emails.map(email => welcomeState(email))) : [];
  return { enabled: cfg.enabled === true, audience: cfg.audience, totals, checks: runWelcomeRuleChecks(), signingReady: Boolean(await welcomeCommand(['GET', 'veil_welcome_signing_v1'])), tested: Boolean(cfg.testedAt), job: job ? { total: job.emails.length, processed: job.cursor, finished: job.cursor >= job.emails.length, enrolled: states.filter(Boolean).length, welcomeSent: states.filter(s => s?.sent?.welcome?.status === 'sent').length, heldForReview: states.filter(s => s?.reason === 'send-needs-review').length, active: states.filter(s => s && !s.exited && !s.completed).length } : null };
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!await verifySession(req.cookies?.[SESSION_COOKIE])) return res.status(401).json({ error: 'Sign in required' });
  try {
    if (req.method === 'GET') return res.json(await summary());
    if (req.method !== 'POST') return res.status(405).end();
    if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Use the same-origin admin form' });
    const action = req.body?.action;
    if (action === 'prepare') {
      await welcomeCommand(['SET', 'veil_welcome_signing_v1', randomBytes(48).toString('hex'), 'NX']);
      const cfg = await welcomeConfig();
      await welcomeCommand(['SET', 'veil_welcome_config_v1', JSON.stringify({ ...cfg, audience: 'all-subscribers', approvedScope: 'All subscribed contacts including past buyers; no blocked or unsubscribed contacts', preparedAt: Date.now() })]);
      return res.json(await summary());
    }
    if (action === 'test') {
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!['lynns02091222@gmail.com', 'lynnsee02091222@gmail.com'].includes(email)) throw new Error('Use an approved internal test inbox');
      const sub = await findSubscriber(email);
      if (sub?.status !== 'subscribed') throw new Error('Test contact must be subscribed');
      const settings = await getSettings();
      if (!settings.companyName || !settings.physicalAddress) throw new Error('Business footer is missing');
      const state = { id: randomUUID(), enrolledAt: Date.now(), sent: {}, audience: 'all-subscribers', baselineOrders: sub.ordersCount || 0, qa: true, email };
      await welcomeCommand(['SET', `veil_welcome_test:${state.id}`, JSON.stringify(state), 'EX', 86400]);
      const links = Object.fromEntries(await Promise.all(['scent','powder','price','timing'].map(async a => [a, `${getEmailBaseUrl()}/welcome-answer?token=${encodeURIComponent(await welcomeAnswerToken(state, a))}`])));
      // Preview environment points QA answer links at THIS deployment, not production.
      const origin = `https://${req.headers.host}`;
      for (const key of Object.keys(links)) links[key] = links[key].replace(getEmailBaseUrl(), origin);
      for (const key of Object.keys(welcomeContent)) contentHtml(key, links);
      const html = renderEmailHtml(contentHtml('welcome', links), settings).replace(/{{UNSUB_URL}}/g, `${getEmailBaseUrl()}/api/email/unsubscribe?token=${encodeURIComponent(sub.unsubToken)}`);
      const sent = await sendEmail({ to: email, subject: '[TEST] A softer way to wear scent', html, unsubToken: sub.unsubToken });
      const cfg = await welcomeConfig();
      await welcomeCommand(['SET', 'veil_welcome_config_v1', JSON.stringify({ ...cfg, testedAt: Date.now(), testProviderId: sent.id })]);
      return res.json({ ok: true, sent: true, testId: state.id, links });
    }
    if (action === 'start') {
      if (process.env.VERCEL_ENV !== 'production') throw new Error('Bulk rollout is production-only');
      const checks = runWelcomeRuleChecks();
      const cfg = await welcomeConfig();
      if (!checks.passed || !cfg.testedAt || !await welcomeCommand(['GET','veil_welcome_signing_v1'])) throw new Error('Preparation and checks required');
      await withWelcomeLock('rollout-control', async () => {
        if (!await readJob()) {
          const subscribers = await getSubscribers();
          const emails = [...new Set(subscribers.filter(s => s.status === 'subscribed').map(s => s.email))].sort();
          await saveJob({ id: randomUUID(), emails, cursor: 0, approvedAt: Date.now() });
        }
        await welcomeCommand(['SET','veil_welcome_config_v1',JSON.stringify({ ...cfg, audience:'all-subscribers', enabled:true, activatedAt:Date.now() })]);
      });
      return res.json(await summary());
    }
    if (action === 'batch') {
      if (process.env.VERCEL_ENV !== 'production' || !(await welcomeConfig()).enabled) throw new Error('Rollout not active');
      await withWelcomeLock('rollout-control', async () => {
        const job = await readJob();
        if (!job) throw new Error('Rollout not started');
        const deadline = Date.now() + 40000;
        let processed = 0;
        while (job.cursor < job.emails.length && processed < 3 && Date.now() < deadline) {
          const email = job.emails[job.cursor];
          const sub = await findSubscriber(email);
          if (sub?.status === 'subscribed') {
            await enrollWelcome(sub, true);
            await processWelcome(email);
          }
          job.cursor += 1;
          processed += 1;
          await saveJob(job);
        }
      });
      return res.json(await summary());
    }
    throw new Error('Unknown action');
  } catch (err) { return res.status(400).json({ error: err.message }); }
}
