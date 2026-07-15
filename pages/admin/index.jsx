import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { T, S } from '../../lib/theme';

export default function AdminDashboard() {
  const router = useRouter();
  const [subscribers, setSubscribers] = React.useState([]);
  const [campaigns, setCampaigns] = React.useState([]);
  const [automations, setAutomations] = React.useState([]);
  const [campaignForm, setCampaignForm] = React.useState({ subject: '', fromName: '', segment: 'all', html: '' });
  const [campaignFormMessage, setCampaignFormMessage] = React.useState('');
  const [sendingCampaignId, setSendingCampaignId] = React.useState(null);

  const loadSubscribers = React.useCallback(() => {
    fetch('/api/admin/email/subscribers').then((r) => r.json()).then((data) => setSubscribers(data.subscribers || [])).catch(() => {});
  }, []);

  const loadCampaigns = React.useCallback(() => {
    fetch('/api/admin/email/campaigns').then((r) => r.json()).then((data) => setCampaigns(data.campaigns || [])).catch(() => {});
  }, []);

  const loadAutomations = React.useCallback(() => {
    fetch('/api/admin/email/automations').then((r) => r.json()).then((data) => setAutomations(data.automations || [])).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadSubscribers();
    loadCampaigns();
    loadAutomations();
  }, [loadSubscribers, loadCampaigns, loadAutomations]);

  const handleSuppressSubscriber = async (email) => {
    if (!confirm(`Suppress ${email}? They will never receive an email again.`)) return;
    const res = await fetch('/api/admin/email/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action: 'suppress' }),
    });
    if (res.ok) loadSubscribers();
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    setCampaignFormMessage('');
    const res = await fetch('/api/admin/email/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaignForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setCampaignFormMessage(data.error || 'Failed to create campaign.');
      return;
    }
    setCampaigns((prev) => [...prev, data.campaign]);
    setCampaignForm({ subject: '', fromName: '', segment: 'all', html: '' });
    setCampaignFormMessage('Draft saved.');
  };

  const handleDeleteCampaign = async (id) => {
    if (!confirm('Delete this draft?')) return;
    const res = await fetch('/api/admin/email/campaigns', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (res.ok) setCampaigns(data.campaigns);
  };

  const handleSendCampaign = async (id) => {
    if (!confirm('Send this campaign now? This cannot be undone.')) return;
    setSendingCampaignId(id);
    try {
      const res = await fetch('/api/admin/email/send-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to send campaign.');
        return;
      }
      loadCampaigns();
    } finally {
      setSendingCampaignId(null);
    }
  };

  const handleToggleAutomation = async (automation) => {
    const res = await fetch('/api/admin/email/automations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: automation.id, enabled: !automation.enabled }),
    });
    const data = await res.json();
    if (res.ok) setAutomations((prev) => prev.map((a) => (a.id === automation.id ? data.automation : a)));
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  return (
    <div style={{ minHeight: '100vh', background: T.paper, padding: '32px 24px 80px' }}>
      <Head>
        <title>Email platform admin</title>
      </Head>

      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>Email platform</span>
          <button onClick={handleLogout} style={S.btnOutline}>Sign out</button>
        </div>

        <Section
          title={`Subscribers (${subscribers.length})`}
          action={<a href="/api/admin/email/subscribers?format=csv" style={S.btnOutline}>Export CSV</a>}
        >
          {subscribers.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No subscribers yet.</p>
          ) : (
            <div>
              <div style={headRow}>
                <div style={{ flex: 2 }}>Email</div>
                <div style={{ flex: 1 }}>Status</div>
                <div style={{ flex: 1 }}>Tier</div>
                <div style={{ flex: 1 }}>Joined</div>
                <div style={{ width: 90 }} />
              </div>
              {subscribers.map((s) => (
                <div key={s.email} style={row}>
                  <div style={{ flex: 2 }}>{s.email}</div>
                  <div style={{ flex: 1 }}>{s.status}</div>
                  <div style={{ flex: 1 }}>{s.tier}</div>
                  <div style={{ flex: 1 }}>{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}</div>
                  <div style={{ width: 90 }}>
                    {s.status !== 'suppressed' && (
                      <button onClick={() => handleSuppressSubscriber(s.email)} style={deleteBtn}>Suppress</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Campaigns (${campaigns.length})`}>
          {campaigns.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              {campaigns.map((c) => (
                <div key={c.id} style={listRow}>
                  <div style={{ flex: 1, fontSize: 14 }}>
                    <strong>{c.subject}</strong> — {c.status} · {c.segment}
                    <div style={{ fontSize: 12, color: T.soft, marginTop: 4 }}>
                      Sent {c.stats.sent} · Clicked {c.stats.clicked} · Bounced {c.stats.bounced} · Complained {c.stats.complained}
                    </div>
                  </div>
                  {c.status === 'draft' && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => handleSendCampaign(c.id)} disabled={sendingCampaignId === c.id} style={S.btnFill}>
                        {sendingCampaignId === c.id ? 'Sending…' : 'Send now'}
                      </button>
                      <button onClick={() => handleDeleteCampaign(c.id)} style={deleteBtn}>Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleCreateCampaign}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ flex: 2, minWidth: 220 }}>
                <label style={formLabel}>Subject</label>
                <input
                  value={campaignForm.subject}
                  onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
                  style={formInput}
                  required
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={formLabel}>From name</label>
                <input
                  value={campaignForm.fromName}
                  onChange={(e) => setCampaignForm({ ...campaignForm, fromName: e.target.value })}
                  style={formInput}
                  placeholder="Your store name"
                />
              </div>
              <div style={{ width: 160 }}>
                <label style={formLabel}>Segment</label>
                <select
                  value={campaignForm.segment}
                  onChange={(e) => setCampaignForm({ ...campaignForm, segment: e.target.value })}
                  style={formInput}
                >
                  <option value="all">All subscribed</option>
                  <option value="engaged">Engaged only</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={formLabel}>Email body (HTML)</label>
              <textarea
                value={campaignForm.html}
                onChange={(e) => setCampaignForm({ ...campaignForm, html: e.target.value })}
                style={{ ...formInput, height: 160, padding: 12, fontFamily: 'monospace', fontSize: 13 }}
                required
              />
            </div>
            {campaignForm.html && (
              <div style={{ marginBottom: 12 }}>
                <label style={formLabel}>Preview</label>
                <iframe
                  title="Campaign preview"
                  srcDoc={campaignForm.html}
                  style={{ width: '100%', height: 200, border: `1px solid ${T.line}`, background: T.white }}
                />
              </div>
            )}
            <button type="submit" style={S.btnFill}>Save draft</button>
            {campaignFormMessage && <span style={{ fontSize: 12, color: T.ink, marginLeft: 12 }}>{campaignFormMessage}</span>}
          </form>
        </Section>

        <Section title="Automations">
          {automations.map((a) => (
            <div key={a.id} style={{ paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ fontSize: 14 }}>{a.name}</strong>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.soft }}>
                  <input type="checkbox" checked={a.enabled} onChange={() => handleToggleAutomation(a)} />
                  Enabled
                </label>
              </div>
              {a.steps.map((step, i) => (
                <div key={i} style={{ fontSize: 12, color: T.soft, marginTop: 4 }}>
                  Day {step.delayDays}: {step.subject || '(suppress if still inactive)'}
                </div>
              ))}
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.line}`, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ ...S.label, margin: 0 }}>{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

const headRow = {
  display: 'flex', gap: 12, padding: '0 0 10px', borderBottom: `1px solid ${T.ink}`,
  fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.soft,
};
const row = { display: 'flex', gap: 12, padding: '12px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13, alignItems: 'center' };
const listRow = { display: 'flex', gap: 16, alignItems: 'flex-start', padding: '14px 0', borderBottom: `1px solid ${T.line}` };
const deleteBtn = {
  fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', border: `1px solid ${T.line}`,
  background: 'none', padding: '8px 12px', cursor: 'pointer', fontFamily: T.sans, flexShrink: 0, color: '#b3261e',
};
const formInput = {
  width: '100%', height: 40, padding: '0 12px', border: `1px solid ${T.line}`, background: T.white,
  fontFamily: T.sans, fontSize: 14, color: T.ink, outline: 'none', boxSizing: 'border-box',
};
const formLabel = { display: 'block', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.soft, marginBottom: 6 };
