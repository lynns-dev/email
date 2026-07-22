import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { T, S } from '../../lib/theme';
import { renderEmailHtml, EMAIL_FONTS } from '../../lib/emailBlocks';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'settings', label: 'Settings' },
  { id: 'shopify', label: 'Shopify' },
  { id: 'subscribers', label: 'Subscribers' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'automations', label: 'Automations' },
];
const FLOW_DESCRIPTIONS = {
  welcome_series: 'Fires when a subscriber confirms (double opt-in) or syncs in already consented from Shopify.',
  sunset_winback: 'Fires when a subscriber goes quiet — win-back attempt, then auto-suppress if still inactive.',
  abandoned_checkout: 'Fires when the on-site tracking pixel reports a started checkout with no order since.',
  add_to_cart: 'Fires for cart activity that never reached checkout — softer than abandoned checkout.',
  order_received: 'Fires on every completed order — a thank-you, not a receipt (Shopify sends that separately).',
};

export default function AdminDashboard() {
  const router = useRouter();
  const [subscribers, setSubscribers] = React.useState([]);
  const [gradeSummary, setGradeSummary] = React.useState(null);
  const [campaigns, setCampaigns] = React.useState([]);
  const [automations, setAutomations] = React.useState([]);
  const [campaignForm, setCampaignForm] = React.useState({ subject: '', fromName: '', segment: 'all', contentHtml: '' });
  const [campaignFormMessage, setCampaignFormMessage] = React.useState('');
  const [sendingCampaignId, setSendingCampaignId] = React.useState(null);
  const [templates, setTemplates] = React.useState([]);
  const [templateName, setTemplateName] = React.useState('');
  const [templateMessage, setTemplateMessage] = React.useState('');
  const [shopifySyncing, setShopifySyncing] = React.useState(false);
  const [shopifySyncResult, setShopifySyncResult] = React.useState('');
  const [settings, setSettings] = React.useState(null);
  const [settingsForm, setSettingsForm] = React.useState(null);
  const [settingsMessage, setSettingsMessage] = React.useState('');
  const [domainInput, setDomainInput] = React.useState('');
  const [domainIdentity, setDomainIdentity] = React.useState(null);
  const [domainIdentityLoading, setDomainIdentityLoading] = React.useState(false);
  const [scheduleAt, setScheduleAt] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('overview');
  const [automationMessage, setAutomationMessage] = React.useState({});
  const [previewOpen, setPreviewOpen] = React.useState({});
  const [activeAutomationId, setActiveAutomationId] = React.useState(null);
  const [welcomeSending, setWelcomeSending] = React.useState(null);
  const [welcomeMessage, setWelcomeMessage] = React.useState({});
  const [subscriberSearch, setSubscriberSearch] = React.useState('');
  const [subscriberSort, setSubscriberSort] = React.useState('date-desc');
  const [newSubscriberEmail, setNewSubscriberEmail] = React.useState('');
  const [addingSubscriber, setAddingSubscriber] = React.useState(false);
  const [addSubscriberMessage, setAddSubscriberMessage] = React.useState('');

  const analytics = React.useMemo(() => {
    const totals = campaigns.reduce(
      (acc, c) => {
        acc.sent += c.stats.sent || 0;
        acc.delivered += c.stats.delivered || 0;
        acc.bounced += c.stats.bounced || 0;
        acc.complained += c.stats.complained || 0;
        acc.clicked += c.stats.clicked || 0;
        return acc;
      },
      { sent: 0, delivered: 0, bounced: 0, complained: 0, clicked: 0 }
    );
    const rate = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
    return {
      subscribed: subscribers.filter((s) => s.status === 'subscribed').length,
      totalSent: totals.sent,
      clickRate: rate(totals.clicked, totals.sent),
      bounceRate: rate(totals.bounced, totals.sent),
      complaintRate: rate(totals.complained, totals.sent),
    };
  }, [subscribers, campaigns]);

  const visibleSubscribers = React.useMemo(() => {
    const query = subscriberSearch.trim().toLowerCase();
    const filtered = query ? subscribers.filter((s) => s.email.toLowerCase().includes(query)) : subscribers;
    const direction = subscriberSort === 'date-asc' ? 1 : -1;
    return [...filtered].sort((a, b) => direction * ((a.createdAt || 0) - (b.createdAt || 0)));
  }, [subscribers, subscriberSearch, subscriberSort]);

  const loadSubscribers = React.useCallback(() => {
    fetch('/api/admin/email/subscribers')
      .then((r) => r.json())
      .then((data) => {
        setSubscribers(data.subscribers || []);
        setGradeSummary(data.gradeSummary || null);
      })
      .catch(() => {});
  }, []);

  const loadCampaigns = React.useCallback(() => {
    fetch('/api/admin/email/campaigns').then((r) => r.json()).then((data) => setCampaigns(data.campaigns || [])).catch(() => {});
  }, []);

  const loadAutomations = React.useCallback(() => {
    fetch('/api/admin/email/automations').then((r) => r.json()).then((data) => setAutomations(data.automations || [])).catch(() => {});
  }, []);

  const loadTemplates = React.useCallback(() => {
    fetch('/api/admin/email/templates').then((r) => r.json()).then((data) => setTemplates(data.templates || [])).catch(() => {});
  }, []);

  const loadSettings = React.useCallback(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings || null);
        setSettingsForm(data.settings || null);
      })
      .catch(() => {});
  }, []);

  const loadDomainIdentity = React.useCallback(() => {
    setDomainIdentityLoading(true);
    fetch('/api/admin/resend-identity')
      .then((r) => r.json())
      .then(setDomainIdentity)
      .catch(() => {})
      .finally(() => setDomainIdentityLoading(false));
  }, []);

  React.useEffect(() => {
    loadSubscribers();
    loadCampaigns();
    loadAutomations();
    loadTemplates();
    loadSettings();
    loadDomainIdentity();
  }, [loadSubscribers, loadCampaigns, loadAutomations, loadTemplates, loadSettings, loadDomainIdentity]);

  const handleSuppressSubscriber = async (email) => {
    if (!confirm(`Suppress ${email}? They will never receive an email again.`)) return;
    const res = await fetch('/api/admin/email/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action: 'suppress' }),
    });
    if (res.ok) loadSubscribers();
  };

  const handleAddSubscriber = async (e) => {
    e.preventDefault();
    setAddSubscriberMessage('');
    setAddingSubscriber(true);
    try {
      const res = await fetch('/api/admin/email/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newSubscriberEmail.trim(), action: 'add' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddSubscriberMessage(data.error || 'Failed to add subscriber.');
        return;
      }
      setNewSubscriberEmail('');
      setAddSubscriberMessage(`Added ${data.subscriber.email}.`);
      loadSubscribers();
    } finally {
      setAddingSubscriber(false);
    }
  };

  const handleSendWelcome = async (email) => {
    setWelcomeSending(email);
    setWelcomeMessage((prev) => ({ ...prev, [email]: '' }));
    try {
      const res = await fetch('/api/admin/email/send-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setWelcomeMessage((prev) => ({ ...prev, [email]: res.ok ? `Sent: "${data.subject}"` : data.error || 'Failed to send.' }));
    } finally {
      setWelcomeSending(null);
    }
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
    setCampaignForm({ subject: '', fromName: '', segment: 'all', contentHtml: '' });
    setCampaignFormMessage('Draft saved.');
  };

  const handleSaveTemplate = async () => {
    setTemplateMessage('');
    const res = await fetch('/api/admin/email/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName, contentHtml: campaignForm.contentHtml }),
    });
    const data = await res.json();
    if (!res.ok) {
      setTemplateMessage(data.error || 'Failed to save template.');
      return;
    }
    setTemplates((prev) => [...prev, data.template]);
    setTemplateName('');
    setTemplateMessage('Template saved.');
  };

  const handleUseTemplate = (templateId) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    // A copy, not a live link back to the template — editing this
    // campaign never mutates the saved template, same as starting a
    // campaign from any ESP's template library.
    setCampaignForm((prev) => ({ ...prev, contentHtml: template.contentHtml }));
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Delete this template?')) return;
    const res = await fetch('/api/admin/email/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (res.ok) setTemplates(data.templates);
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

  // Edits are applied to local state immediately (so the textarea and
  // preview feel live) and only PUT to the server when "Save changes" is
  // clicked — same pattern as the campaign composer, just addressed by
  // automationId + stepIndex instead of a single draft.
  const updateAutomationStep = (automationId, stepIndex, patch) => {
    setAutomations((prev) =>
      prev.map((a) => {
        if (a.id !== automationId) return a;
        const steps = a.steps.map((s, i) => (i === stepIndex ? { ...s, ...patch } : s));
        return { ...a, steps };
      })
    );
  };

  const handleSaveAutomationSteps = async (automation) => {
    const res = await fetch('/api/admin/email/automations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: automation.id, steps: automation.steps }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to save.');
      return;
    }
    setAutomations((prev) => prev.map((a) => (a.id === automation.id ? data.automation : a)));
    setAutomationMessage((prev) => ({ ...prev, [automation.id]: 'Saved.' }));
  };

  const togglePreview = (key) => {
    setPreviewOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsMessage('');
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setSettingsMessage(data.error || 'Failed to save settings.');
      return;
    }
    setSettings(data.settings);
    setSettingsMessage('Saved.');
  };

  const handleVerifyDomain = async () => {
    if (!domainInput.trim()) return;
    setDomainIdentityLoading(true);
    try {
      const res = await fetch('/api/admin/resend-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to start verification.');
        return;
      }
      setDomainIdentity(data);
      setDomainInput('');
    } finally {
      setDomainIdentityLoading(false);
    }
  };

  const handleScheduleCampaign = async (id) => {
    if (!scheduleAt) {
      alert('Pick a date and time first.');
      return;
    }
    const timestamp = new Date(scheduleAt).getTime();
    if (!confirm(`Schedule this campaign for ${new Date(timestamp).toLocaleString()}?`)) return;
    const res = await fetch('/api/admin/email/schedule-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, scheduledAt: timestamp }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to schedule campaign.');
      return;
    }
    setScheduleAt('');
    loadCampaigns();
  };

  const handleShopifySync = async () => {
    setShopifySyncing(true);
    setShopifySyncResult('');
    try {
      const res = await fetch('/api/admin/shopify/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setShopifySyncResult(data.error || 'Sync failed.');
        return;
      }
      setShopifySyncResult(`Synced ${data.synced} of ${data.total} consented customers.`);
      loadSubscribers();
    } finally {
      setShopifySyncing(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: T.paper }}>
      <Head>
        <title>Email platform admin</title>
      </Head>

      <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto', alignItems: 'flex-start' }}>
        <aside style={sidebar}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 28 }}>Email platform</div>
          <nav>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{ ...sidebarLink, ...(activeTab === tab.id ? sidebarLinkActive : {}) }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <button onClick={handleLogout} style={{ ...S.btnOutline, width: '100%', justifyContent: 'center', marginTop: 24 }}>Sign out</button>
        </aside>

        <main style={{ flex: 1, padding: '32px 24px 80px', minWidth: 0 }}>
        {activeTab === 'overview' && (
        <>
        <Section title="Analytics">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={gradeTile}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.subscribed}</div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Subscribers</div>
            </div>
            <div style={gradeTile}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.totalSent}</div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Emails sent (all-time)</div>
            </div>
            <div style={gradeTile}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.clickRate}%</div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Click rate</div>
            </div>
            <div style={gradeTile}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.bounceRate}%</div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Bounce rate</div>
            </div>
            <div style={gradeTile}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{analytics.complaintRate}%</div>
              <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Complaint rate</div>
            </div>
          </div>
        </Section>

        {gradeSummary && gradeSummary.total > 0 && (
          <Section title="List health">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {['A', 'B', 'C', 'D', 'F'].map((grade) => (
                <div key={grade} style={gradeTile}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{gradeSummary.counts[grade]}</div>
                  <div style={{ fontSize: 11, color: T.soft, marginTop: 2 }}>Grade {grade} · {gradeSummary.percentages[grade]}%</div>
                </div>
              ))}
            </div>
          </Section>
        )}
        </>
        )}

        {activeTab === 'settings' && (
        <>
        <Section title="Deliverability checklist">
          <div>
            <ChecklistRow ok={domainIdentity?.verified} label="Sending domain verified (DKIM + SPF)" busy={domainIdentityLoading} />
            <ChecklistRow ok={domainIdentity?.envConfigured?.webhookSecret} label="Bounce/complaint webhook configured" busy={domainIdentityLoading} />
            <ChecklistRow ok={Boolean(settings?.physicalAddress)} label="Physical address set (required for the legal footer)" busy={!settings} />
            <ChecklistRow ok label="One-click unsubscribe headers (built in)" />
          </div>
        </Section>

        <Section title="Settings">
          {settingsForm && (
            <form onSubmit={handleSaveSettings}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={formLabel}>Sender email</label>
                  <input value={settingsForm.senderEmail} onChange={(e) => setSettingsForm({ ...settingsForm, senderEmail: e.target.value })} style={formInput} placeholder="hello@yourdomain.com" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={formLabel}>Sender name</label>
                  <input value={settingsForm.senderName} onChange={(e) => setSettingsForm({ ...settingsForm, senderName: e.target.value })} style={formInput} placeholder="Your store name" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={formLabel}>Company name</label>
                  <input value={settingsForm.companyName} onChange={(e) => setSettingsForm({ ...settingsForm, companyName: e.target.value })} style={formInput} />
                </div>
                <div style={{ flex: 2, minWidth: 260 }}>
                  <label style={formLabel}>Physical address (CAN-SPAM requires this in every send)</label>
                  <input value={settingsForm.physicalAddress} onChange={(e) => setSettingsForm({ ...settingsForm, physicalAddress: e.target.value })} style={formInput} placeholder="123 Main St, City, ST 00000" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={formLabel}>Logo URL (shown at the top of every campaign)</label>
                  <input value={settingsForm.logoUrl} onChange={(e) => setSettingsForm({ ...settingsForm, logoUrl: e.target.value })} style={formInput} />
                </div>
                <div style={{ width: 200 }}>
                  <label style={formLabel}>Email font</label>
                  <select value={settingsForm.emailFont} onChange={(e) => setSettingsForm({ ...settingsForm, emailFont: e.target.value })} style={formInput}>
                    {EMAIL_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" style={S.btnFill}>Save settings</button>
              {settingsMessage && <span style={{ fontSize: 12, color: T.ink, marginLeft: 12 }}>{settingsMessage}</span>}
            </form>
          )}

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.line}` }}>
            <label style={formLabel}>Verify a sending domain</label>
            {domainIdentity?.domain ? (
              <div style={{ fontSize: 13 }}>
                <p><strong>{domainIdentity.domain}</strong> — {domainIdentity.verified ? 'Verified ✓' : `Pending (${domainIdentity.status || 'not started'})`}</p>
                {!domainIdentity.verified && domainIdentity.records?.length > 0 && (
                  <>
                    <p style={{ color: T.soft, marginTop: 8 }}>Add these records at your DNS provider:</p>
                    <ul style={{ marginTop: 6, paddingLeft: 20, color: T.soft }}>
                      {domainIdentity.records.map((r, i) => (
                        <li key={i} style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 4 }}>
                          {r.type} {r.name} → {r.value} {r.status && `(${r.status})`}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <button type="button" onClick={loadDomainIdentity} disabled={domainIdentityLoading} style={{ ...S.btnOutline, marginTop: 12 }}>
                  {domainIdentityLoading ? 'Checking…' : 'Check status'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input placeholder="mail.yourdomain.com" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} style={{ ...formInput, width: 240 }} />
                <button type="button" onClick={handleVerifyDomain} disabled={domainIdentityLoading} style={S.btnFill}>
                  {domainIdentityLoading ? 'Starting…' : 'Start verification'}
                </button>
              </div>
            )}
          </div>
        </Section>
        </>
        )}

        {activeTab === 'shopify' && (
        <>
        <Section title="Shopify sync">
          <p style={{ color: T.soft, fontSize: 14, marginBottom: 16 }}>
            Pulls in every Shopify customer whose email marketing consent is currently subscribed. Customers who aren't opted in are skipped, not imported.
          </p>
          <button onClick={handleShopifySync} disabled={shopifySyncing} style={S.btnFill}>
            {shopifySyncing ? 'Syncing…' : 'Sync now'}
          </button>
          {shopifySyncResult && <span style={{ fontSize: 12, color: T.ink, marginLeft: 12 }}>{shopifySyncResult}</span>}
        </Section>
        </>
        )}

        {activeTab === 'subscribers' && (
        <>
        <Section
          title={`Subscribers (${visibleSubscribers.length}${visibleSubscribers.length !== subscribers.length ? ` of ${subscribers.length}` : ''})`}
          action={<a href="/api/admin/email/subscribers?format=csv" style={S.btnOutline}>Export CSV</a>}
        >
          <form onSubmit={handleAddSubscriber} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <input
              type="email"
              placeholder="Add subscriber by email…"
              value={newSubscriberEmail}
              onChange={(e) => setNewSubscriberEmail(e.target.value)}
              style={{ ...formInput, width: 260 }}
              required
            />
            <button type="submit" disabled={addingSubscriber} style={S.btnFill}>
              {addingSubscriber ? 'Adding…' : 'Add subscriber'}
            </button>
            {addSubscriberMessage && <span style={{ fontSize: 12, color: T.ink }}>{addSubscriberMessage}</span>}
          </form>
          <p style={{ fontSize: 12, color: T.soft, marginTop: 0, marginBottom: 20 }}>
            Skips double opt-in and marks them subscribed immediately — only add someone here if you already have a lawful basis to email them.
          </p>

          {subscribers.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No subscribers yet.</p>
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <input
                  placeholder="Search by email…"
                  value={subscriberSearch}
                  onChange={(e) => setSubscriberSearch(e.target.value)}
                  style={{ ...formInput, width: 260 }}
                />
              </div>
              <div style={headRow}>
                <div style={{ flex: 2 }}>Email</div>
                <div style={{ flex: 1 }}>Status</div>
                <div style={{ flex: 1 }}>Tier</div>
                <div style={{ width: 60 }}>Grade</div>
                <div style={{ flex: 1 }}>
                  <button
                    type="button"
                    onClick={() => setSubscriberSort((prev) => (prev === 'date-desc' ? 'date-asc' : 'date-desc'))}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}
                  >
                    Joined {subscriberSort === 'date-desc' ? '↓' : '↑'}
                  </button>
                </div>
                <div style={{ width: 230 }} />
              </div>
              {visibleSubscribers.length === 0 ? (
                <p style={{ color: T.soft, fontSize: 13, padding: '16px 0' }}>No subscribers match "{subscriberSearch}".</p>
              ) : (
              visibleSubscribers.map((s) => (
                <div key={s.email} style={row}>
                  <div style={{ flex: 2 }}>{s.email}</div>
                  <div style={{ flex: 1 }}>{s.status}</div>
                  <div style={{ flex: 1 }}>{s.tier}</div>
                  <div style={{ width: 60 }}>{s.grade || '—'}</div>
                  <div style={{ flex: 1 }}>{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}</div>
                  <div style={{ width: 230, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {welcomeMessage[s.email] && <span style={{ fontSize: 11, color: T.soft }}>{welcomeMessage[s.email]}</span>}
                    {s.status === 'subscribed' && (
                      <button
                        onClick={() => handleSendWelcome(s.email)}
                        disabled={welcomeSending === s.email}
                        style={S.btnOutline}
                      >
                        {welcomeSending === s.email ? 'Sending…' : 'Send welcome email'}
                      </button>
                    )}
                    {s.status !== 'suppressed' && (
                      <button onClick={() => handleSuppressSubscriber(s.email)} style={deleteBtn}>Suppress</button>
                    )}
                  </div>
                </div>
              ))
              )}
            </div>
          )}
        </Section>
        </>
        )}

        {activeTab === 'campaigns' && (
        <>
        <Section title={`Templates (${templates.length})`}>
          {templates.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No saved templates yet — build a campaign below, then "Save as template" to reuse it later.</p>
          ) : (
            templates.map((t) => (
              <div key={t.id} style={listRow}>
                <div style={{ flex: 1, fontSize: 14 }}>{t.name}</div>
                <button onClick={() => handleDeleteTemplate(t.id)} style={deleteBtn}>Delete</button>
              </div>
            ))
          )}
        </Section>

        <Section title={`Campaigns (${campaigns.length})`}>
          {campaigns.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              {[...campaigns].sort((a, b) => (b.sentAt || b.scheduledAt || b.createdAt || 0) - (a.sentAt || a.scheduledAt || a.createdAt || 0)).map((c) => {
                const clickRate = c.stats.sent ? Math.round((c.stats.clicked / c.stats.sent) * 1000) / 10 : 0;
                const bounceRate = c.stats.sent ? Math.round((c.stats.bounced / c.stats.sent) * 1000) / 10 : 0;
                return (
                  <div key={c.id} style={listRow}>
                    <div style={{ flex: 1, fontSize: 14 }}>
                      <strong>{c.subject}</strong> — {c.status} · {c.segment}
                      {c.status === 'scheduled' && c.scheduledAt && <span> · sends {new Date(c.scheduledAt).toLocaleString()}</span>}
                      {c.sentAt && <span> · sent {new Date(c.sentAt).toLocaleDateString()}</span>}
                      <div style={{ fontSize: 12, color: T.soft, marginTop: 4 }}>
                        Sent {c.stats.sent} · Click rate {clickRate}% · Bounce rate {bounceRate}% · Complained {c.stats.complained}
                      </div>
                    </div>
                    {(c.status === 'draft' || c.status === 'scheduled') && (
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                        {c.status === 'draft' && (
                          <>
                            <button onClick={() => handleSendCampaign(c.id)} disabled={sendingCampaignId === c.id} style={S.btnFill}>
                              {sendingCampaignId === c.id ? 'Sending…' : 'Send now'}
                            </button>
                            <input
                              type="datetime-local"
                              value={scheduleAt}
                              onChange={(e) => setScheduleAt(e.target.value)}
                              style={{ ...formInput, width: 180, height: 40 }}
                            />
                            <button onClick={() => handleScheduleCampaign(c.id)} style={S.btnOutline}>Schedule</button>
                          </>
                        )}
                        <button onClick={() => handleDeleteCampaign(c.id)} style={deleteBtn}>{c.status === 'scheduled' ? 'Cancel' : 'Delete'}</button>
                      </div>
                    )}
                  </div>
                );
              })}
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
                  <option value="grade:A">Grade A only</option>
                  <option value="grade:A+B">Grade A+B</option>
                  <option value="grade:A+B+C">Grade A+B+C</option>
                </select>
              </div>
            </div>
            {templates.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={formLabel}>Start from template</label>
                <select defaultValue="" onChange={(e) => e.target.value && handleUseTemplate(e.target.value)} style={{ ...formInput, width: 260 }}>
                  <option value="">— none —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 320 }}>
                <label style={formLabel}>HTML content</label>
                <textarea
                  placeholder="Paste your email HTML here…"
                  value={campaignForm.contentHtml}
                  onChange={(e) => setCampaignForm({ ...campaignForm, contentHtml: e.target.value })}
                  style={{ ...formInput, height: 360, padding: 12, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}
                />

                <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    placeholder="Template name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    style={{ ...formInput, width: 180 }}
                  />
                  <button type="button" onClick={handleSaveTemplate} disabled={!templateName.trim() || !campaignForm.contentHtml.trim()} style={S.btnOutline}>
                    Save as template
                  </button>
                  {templateMessage && <span style={{ fontSize: 12, color: T.ink }}>{templateMessage}</span>}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 280 }}>
                <label style={formLabel}>Preview</label>
                <iframe
                  title="Campaign preview"
                  srcDoc={renderEmailHtml(campaignForm.contentHtml, settings || {}, { preview: true })}
                  style={{ width: '100%', height: 420, border: `1px solid ${T.line}`, background: T.paper }}
                />
              </div>
            </div>

            <button type="submit" style={{ ...S.btnFill, marginTop: 16 }}>Save draft</button>
            {campaignFormMessage && <span style={{ fontSize: 12, color: T.ink, marginLeft: 12 }}>{campaignFormMessage}</span>}
          </form>
        </Section>
        </>
        )}

        {activeTab === 'automations' && (
        <>
        <Section title="Automations">
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <nav style={{ width: 180, flexShrink: 0 }}>
              {automations.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setActiveAutomationId(a.id)}
                  style={{ ...sidebarLink, ...((activeAutomationId || automations[0]?.id) === a.id ? sidebarLinkActive : {}) }}
                >
                  {a.name}
                </button>
              ))}
            </nav>

            <div style={{ flex: 1, minWidth: 0 }}>
              {automations.filter((a) => a.id === (activeAutomationId || automations[0]?.id)).map((a) => (
            <div key={a.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ fontSize: 14 }}>{a.name}</strong>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.soft }}>
                  <input type="checkbox" checked={a.enabled} onChange={() => handleToggleAutomation(a)} />
                  Enabled
                </label>
              </div>
              {FLOW_DESCRIPTIONS[a.id] && <p style={{ fontSize: 12, color: T.soft, marginBottom: 16 }}>{FLOW_DESCRIPTIONS[a.id]}</p>}

              {a.steps.map((step, i) => {
                const isSuppress = !step.subject;
                const previewKey = `${a.id}-${i}`;
                return (
                  <div key={i} style={stepCard}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: isSuppress ? 0 : 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.soft, flexShrink: 0 }}>
                        {step.delayHours != null ? `Hour ${step.delayHours}` : `Day ${step.delayDays}`}
                      </span>
                      {isSuppress ? (
                        <span style={{ fontSize: 12, color: T.soft }}>Suppresses the subscriber instead of sending</span>
                      ) : (
                        <input
                          value={step.subject}
                          onChange={(e) => updateAutomationStep(a.id, i, { subject: e.target.value })}
                          style={{ ...formInput, flex: 1 }}
                          placeholder="Subject"
                        />
                      )}
                    </div>

                    {!isSuppress && (
                      <>
                        <textarea
                          placeholder="Paste this step's HTML here…"
                          value={step.html || ''}
                          onChange={(e) => updateAutomationStep(a.id, i, { html: e.target.value })}
                          style={{ ...formInput, height: 200, padding: 12, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}
                        />

                        <div style={{ marginTop: 12 }}>
                          <button type="button" onClick={() => togglePreview(previewKey)} style={S.btnOutline}>
                            {previewOpen[previewKey] ? 'Hide preview' : 'Preview'}
                          </button>
                        </div>

                        {previewOpen[previewKey] && (
                          <iframe
                            title={`${a.id} step ${i} preview`}
                            srcDoc={renderEmailHtml(step.html, settings || {}, { preview: true })}
                            style={{ width: '100%', height: 320, border: `1px solid ${T.line}`, marginTop: 10, background: T.paper }}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <button type="button" onClick={() => handleSaveAutomationSteps(a)} style={S.btnFill}>Save changes</button>
                {automationMessage[a.id] && <span style={{ fontSize: 12, color: T.ink }}>{automationMessage[a.id]}</span>}
              </div>
            </div>
              ))}
            </div>
          </div>
        </Section>
        </>
        )}
        </main>
      </div>
    </div>
  );
}

function ChecklistRow({ ok, label, busy }) {
  const icon = busy ? '…' : ok ? '✓' : '✕';
  const color = busy ? T.soft : ok ? '#1a7f37' : '#b3261e';
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', fontSize: 13 }}>
      <span style={{ color, fontWeight: 700, width: 16 }}>{icon}</span>
      <span>{label}</span>
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
const gradeTile = { background: T.paper, border: `1px solid ${T.line}`, padding: '14px 18px', minWidth: 90, textAlign: 'center' };
const stepCard = { background: T.paper, border: `1px solid ${T.line}`, padding: 14, marginBottom: 10 };
const sidebar = {
  width: 200, flexShrink: 0, padding: '32px 16px', borderRight: `1px solid ${T.line}`,
  position: 'sticky', top: 0, height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
};
const sidebarLink = {
  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 2,
  background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer',
  fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.soft,
};
const sidebarLinkActive = { background: T.ink, color: T.white };
