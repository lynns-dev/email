import { useState } from 'react';
import { runWelcomeRuleChecks } from '../../lib/veilWelcomeChecks.mjs';
import { welcomeContent } from '../../lib/veilWelcomeContent.mjs';
export default function WelcomeFlow({ checks, production }) {
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState('No subscriber mail sent from this page yet.');
  const [busy, setBusy] = useState(false);
  const [testEmail, setTestEmail] = useState('lynns02091222@gmail.com');
  const [links, setLinks] = useState(null);
  async function call(action, extra = {}) {
    const res = await fetch('/api/admin/email/welcome-rollout', action ? { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action, ...extra }) } : {});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  async function operate(action) {
    setBusy(true);
    try {
      const data = await call(action, { email:testEmail });
      if (action === 'test') { setLinks(data.links); setMessage('One test welcome accepted by the sender. Open each test answer link below to check confirmation.'); }
      else { setSummary(data); setMessage('Status refreshed.'); }
    } catch (err) { setMessage(err.message); }
    finally { setBusy(false); }
  }
  async function rollout() {
    setBusy(true);
    try {
      let data = await call('start');
      setSummary(data);
      let batches = 0;
      while (!data.job?.finished && batches < 120) {
        data = await call('batch');
        setSummary(data);
        setMessage(`Processed ${data.job.processed} of ${data.job.total}. Welcome sends recorded: ${data.job.welcomeSent}.`);
        batches += 1;
      }
      setMessage(data.job?.finished ? 'Rollout processed. Refresh status to verify sent and held counts.' : 'Rollout paused safely. Click Start / resume to continue.');
    } catch (err) { setMessage(`Stopped safely: ${err.message}. Refresh status before resuming.`); }
    finally { setBusy(false); }
  }
  return <main style={{maxWidth:960,margin:'40px auto',padding:32,fontFamily:'Arial,sans-serif',lineHeight:1.6,color:'#16140F',background:'#FCFBF7'}}>
    <a href="/admin">Back to email admin</a><h1>Veil welcome routing</h1>
    <p>Approved scope: all currently subscribed contacts, including past buyers. Pending, unsubscribed and blocked addresses are excluded. Later recorded orders stop the sequence; unreported orders cannot be detected.</p>
    <p>One opening email, then Day 3, one Day 4/7 answer branch, Day 14 and Day 30. No reply skips the branch. Daily follow-ups go on the next scheduled run. The first-order 15% code is not renewed for past buyers.</p>
    <button disabled={busy} onClick={()=>operate(null)}>Refresh status</button>{' '}
    <button disabled={busy} onClick={()=>operate('prepare')}>Prepare secure answer links</button>
    <p role="status">{message}</p>
    {summary && <><h2>{summary.enabled ? 'Flow active' : 'Flow disabled'}</h2><p>Contacts: {summary.totals.contacts}. Subscribed: {summary.totals.subscribed}. Unsubscribed: {summary.totals.unsubscribed}. Blocked: {summary.totals.suppressed}. Pending: {summary.totals.pending}.</p><p>Secure signing: {summary.signingReady ? 'ready' : 'missing'}. Test send recorded: {summary.tested ? 'yes' : 'no'}.</p>{summary.job && <p>Approved cohort: {summary.job.total}. Processed: {summary.job.processed}. Enrolled: {summary.job.enrolled}. Welcome sent: {summary.job.welcomeSent}. Active: {summary.job.active}. Needs review: {summary.job.heldForReview}.</p>}</>}
    <h2>Internal test</h2><label>Test inbox <input type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)} /></label>{' '}<button disabled={busy} onClick={()=>operate('test')}>Send one test welcome</button>
    {links && <><h3>Signed QA answer links</h3><ul>{Object.entries(links).map(([answer,url])=><li key={answer}><a href={url} target="_blank" rel="noreferrer">Test {answer} answer</a></li>)}</ul><p>These test links affect QA state only, not subscriber schedules.</p></>}
    <h2>Activate and process the approved cohort</h2><button disabled={busy || !production} onClick={rollout}>Start / resume approved rollout</button><p>{production ? 'Processes subscribed contacts in resumable batches. Never reactivates blocked or unsubscribed people.' : 'Bulk delivery unavailable on preview. Deploy verified version before activation.'}</p>
    <h2>Rule checks</h2><p>{checks.passed ? 'All passed' : 'Failures'} — {checks.total} synthetic checks; not proof of inbox delivery.</p><details><summary>Check details</summary><ul>{checks.results.map(r=><li key={r.name}>{r.passed?'PASS':'FAIL'} — {r.name}</li>)}</ul></details>
    <h2>Messages</h2><ul>{Object.entries(welcomeContent).map(([key,item])=><li key={key}>{key} — {item.subject}</li>)}</ul>
  </main>;
}
export function getServerSideProps() { return { props:{ checks:runWelcomeRuleChecks(), production:process.env.VERCEL_ENV === 'production' } }; }
