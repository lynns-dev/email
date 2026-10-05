import { runWelcomeRuleChecks } from '../../lib/veilWelcomeChecks.mjs';
import { welcomeContent } from '../../lib/veilWelcomeContent.mjs';
export default function WelcomeFlow({ enabled, checks, gates, steps }) {
  return <main style={{ maxWidth: 960, margin: '40px auto', padding: 32, fontFamily: 'Arial,sans-serif', color: '#16140F', background: '#FCFBF7' }}>
    <a href="/admin">Back to email admin</a>
    <h1>Veil welcome routing</h1>
    <p role="status">{enabled ? 'Switch enabled — check all launch gates before any enrollment.' : 'Disabled. No new-flow emails are being sent.'}</p>
    <h2>Launch gates</h2>
    <ul>{gates.map(g => <li key={g.name}>{g.name}: {g.ready ? 'configured — end-to-end verification still required' : 'not configured'}</li>)}</ul>
    <p>Daily cron sends due follow-ups on its next run, not at an exact minute. No old contacts are auto-enrolled. Existing welcome content continues until the new version is deployed and switched on.</p>
    <h2>Synthetic checks</h2><p>{checks.passed ? 'All passed' : 'Failures detected'} · {checks.total} checks. These do not send emails, query purchase history or prove delivery.</p>
    <details><summary>See individual checks</summary><ul>{checks.results.map(r => <li key={r.name}>{r.passed ? 'PASS' : 'FAIL'} — {r.name}</li>)}</ul></details>
    <h2>Routes and messages</h2>
    <p>Day 0 → Day 3 question → one confirmed Day 4/7 branch → Day 14 → Day 30. No response skips branch sends. Purchase or loss of subscription exits. Unavailable purchase history holds.</p>
    <ul>{steps.map(step => <li key={step.key}><strong>{step.key}</strong> — {step.subject}</li>)}</ul>
    <p>The new engine has a separate recipient ledger. The older “Welcome series” editor does not edit these branch definitions. Activation and live migration remain a separate, reviewed release.</p>
  </main>;
}
export function getServerSideProps() {
  const signing = process.env.VEIL_WELCOME_SIGNING_SECRET || '';
  return { props: {
    enabled: process.env.VEIL_WELCOME_ENABLED === 'true',
    checks: runWelcomeRuleChecks(),
    gates: [
      { name: 'Signed answer secret', ready: signing.length >= 32 },
      { name: 'Authoritative purchase-history URL', ready: Boolean(process.env.VEIL_PURCHASE_VERIFY_URL?.startsWith('https://')) },
      { name: 'Purchase-history authorization', ready: Boolean(process.env.VEIL_PURCHASE_VERIFY_SECRET) },
    ],
    steps: Object.entries(welcomeContent).map(([key, item]) => ({ key, subject: item.subject })),
  } };
}
