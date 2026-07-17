import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { T, S } from '../../lib/theme';
import { createBlock, renderBlocksToHtml } from '../../lib/emailBlocks';

const BLOCK_LABELS = { text: 'Text', image: 'Image', button: 'Button' };

export default function AdminDashboard() {
  const router = useRouter();
  const [subscribers, setSubscribers] = React.useState([]);
  const [gradeSummary, setGradeSummary] = React.useState(null);
  const [campaigns, setCampaigns] = React.useState([]);
  const [automations, setAutomations] = React.useState([]);
  const [campaignForm, setCampaignForm] = React.useState({ subject: '', fromName: '', segment: 'all', blocks: [] });
  const [campaignFormMessage, setCampaignFormMessage] = React.useState('');
  const [sendingCampaignId, setSendingCampaignId] = React.useState(null);
  const [templates, setTemplates] = React.useState([]);
  const [templateName, setTemplateName] = React.useState('');
  const [templateMessage, setTemplateMessage] = React.useState('');
  const [shopifySyncing, setShopifySyncing] = React.useState(false);
  const [shopifySyncResult, setShopifySyncResult] = React.useState('');

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

  React.useEffect(() => {
    loadSubscribers();
    loadCampaigns();
    loadAutomations();
    loadTemplates();
  }, [loadSubscribers, loadCampaigns, loadAutomations, loadTemplates]);

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
    setCampaignForm({ subject: '', fromName: '', segment: 'all', blocks: [] });
    setCampaignFormMessage('Draft saved.');
  };

  const handleAddBlock = (type) => {
    setCampaignForm((prev) => ({ ...prev, blocks: [...prev.blocks, createBlock(type)] }));
  };

  const handleUpdateBlock = (id, patch) => {
    setCampaignForm((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  };

  const handleRemoveBlock = (id) => {
    setCampaignForm((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== id) }));
  };

  const handleMoveBlock = (id, direction) => {
    setCampaignForm((prev) => {
      const blocks = [...prev.blocks];
      const idx = blocks.findIndex((b) => b.id === id);
      const swapWith = idx + direction;
      if (swapWith < 0 || swapWith >= blocks.length) return prev;
      [blocks[idx], blocks[swapWith]] = [blocks[swapWith], blocks[idx]];
      return { ...prev, blocks };
    });
  };

  const handleSaveTemplate = async () => {
    setTemplateMessage('');
    const res = await fetch('/api/admin/email/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName, blocks: campaignForm.blocks }),
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
    // Fresh block ids so editing this campaign never mutates the saved
    // template — it's a copy, same as starting a campaign from any ESP's
    // template library.
    setCampaignForm((prev) => ({
      ...prev,
      blocks: template.blocks.map((b) => ({ ...b, id: createBlock(b.type).id })),
    }));
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

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
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
    <div style={{ minHeight: '100vh', background: T.paper, padding: '32px 24px 80px' }}>
      <Head>
        <title>Email platform admin</title>
      </Head>

      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>Email platform</span>
          <button onClick={handleLogout} style={S.btnOutline}>Sign out</button>
        </div>

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

        <Section title="Shopify sync">
          <p style={{ color: T.soft, fontSize: 14, marginBottom: 16 }}>
            Pulls in every Shopify customer whose email marketing consent is currently subscribed. Customers who aren't opted in are skipped, not imported.
          </p>
          <button onClick={handleShopifySync} disabled={shopifySyncing} style={S.btnFill}>
            {shopifySyncing ? 'Syncing…' : 'Sync now'}
          </button>
          {shopifySyncResult && <span style={{ fontSize: 12, color: T.ink, marginLeft: 12 }}>{shopifySyncResult}</span>}
        </Section>

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
                <div style={{ width: 60 }}>Grade</div>
                <div style={{ flex: 1 }}>Joined</div>
                <div style={{ width: 90 }} />
              </div>
              {subscribers.map((s) => (
                <div key={s.email} style={row}>
                  <div style={{ flex: 2 }}>{s.email}</div>
                  <div style={{ flex: 1 }}>{s.status}</div>
                  <div style={{ flex: 1 }}>{s.tier}</div>
                  <div style={{ width: 60 }}>{s.grade || '—'}</div>
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

        <Section title={`Templates (${templates.length})`}>
          {templates.length === 0 ? (
            <p style={{ color: T.soft, fontSize: 14 }}>No saved templates yet — build a campaign below, then "Save as template" to reuse it later.</p>
          ) : (
            templates.map((t) => (
              <div key={t.id} style={listRow}>
                <div style={{ flex: 1, fontSize: 14 }}>{t.name} <span style={{ color: T.soft, fontSize: 12 }}>({t.blocks.length} block{t.blocks.length === 1 ? '' : 's'})</span></div>
                <button onClick={() => handleDeleteTemplate(t.id)} style={deleteBtn}>Delete</button>
              </div>
            ))
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
                <label style={formLabel}>Content</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button type="button" onClick={() => handleAddBlock('text')} style={S.btnOutline}>+ Text</button>
                  <button type="button" onClick={() => handleAddBlock('image')} style={S.btnOutline}>+ Image</button>
                  <button type="button" onClick={() => handleAddBlock('button')} style={S.btnOutline}>+ Button</button>
                </div>

                {campaignForm.blocks.length === 0 ? (
                  <p style={{ color: T.soft, fontSize: 13 }}>No blocks yet — add text, an image, or a button above.</p>
                ) : (
                  campaignForm.blocks.map((block, i) => (
                    <BlockCard
                      key={block.id}
                      block={block}
                      isFirst={i === 0}
                      isLast={i === campaignForm.blocks.length - 1}
                      onChange={(patch) => handleUpdateBlock(block.id, patch)}
                      onRemove={() => handleRemoveBlock(block.id)}
                      onMove={(dir) => handleMoveBlock(block.id, dir)}
                    />
                  ))
                )}

                <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    placeholder="Template name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    style={{ ...formInput, width: 180 }}
                  />
                  <button type="button" onClick={handleSaveTemplate} disabled={!templateName.trim() || campaignForm.blocks.length === 0} style={S.btnOutline}>
                    Save as template
                  </button>
                  {templateMessage && <span style={{ fontSize: 12, color: T.ink }}>{templateMessage}</span>}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 280 }}>
                <label style={formLabel}>Preview</label>
                <iframe
                  title="Campaign preview"
                  srcDoc={renderBlocksToHtml(campaignForm.blocks)}
                  style={{ width: '100%', height: 420, border: `1px solid ${T.line}`, background: T.paper }}
                />
              </div>
            </div>

            <button type="submit" style={{ ...S.btnFill, marginTop: 16 }}>Save draft</button>
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

function BlockCard({ block, isFirst, isLast, onChange, onRemove, onMove }) {
  return (
    <div style={blockCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.soft }}>{BLOCK_LABELS[block.type]}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => onMove(-1)} disabled={isFirst} style={iconBtn}>↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={isLast} style={iconBtn}>↓</button>
          <button type="button" onClick={onRemove} style={{ ...iconBtn, color: '#b3261e' }}>✕</button>
        </div>
      </div>

      {block.type === 'text' && (
        <>
          <textarea
            placeholder="Paragraph text…"
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
            style={{ ...formInput, height: 80, padding: 10 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input placeholder="Link text (optional)" value={block.linkText} onChange={(e) => onChange({ linkText: e.target.value })} style={{ ...formInput, flex: 1 }} />
            <input placeholder="Link URL" value={block.linkUrl} onChange={(e) => onChange({ linkUrl: e.target.value })} style={{ ...formInput, flex: 1 }} />
          </div>
        </>
      )}

      {block.type === 'image' && (
        <>
          <input placeholder="Image URL" value={block.src} onChange={(e) => onChange({ src: e.target.value })} style={formInput} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input placeholder="Alt text" value={block.alt} onChange={(e) => onChange({ alt: e.target.value })} style={{ ...formInput, flex: 1 }} />
            <input placeholder="Link URL (optional)" value={block.linkUrl} onChange={(e) => onChange({ linkUrl: e.target.value })} style={{ ...formInput, flex: 1 }} />
          </div>
        </>
      )}

      {block.type === 'button' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Button label" value={block.label} onChange={(e) => onChange({ label: e.target.value })} style={{ ...formInput, flex: 1 }} />
          <input placeholder="Button URL" value={block.url} onChange={(e) => onChange({ url: e.target.value })} style={{ ...formInput, flex: 1 }} />
        </div>
      )}
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
const blockCard = { background: T.paper, border: `1px solid ${T.line}`, padding: 14, marginBottom: 10 };
const iconBtn = {
  width: 26, height: 26, border: `1px solid ${T.line}`, background: T.white, cursor: 'pointer',
  fontSize: 12, color: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
};
