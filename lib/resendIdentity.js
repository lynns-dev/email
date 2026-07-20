// Resend's Domains API (domain verification + DNS records) for the
// Settings/Deliverability UI — separate from lib/resendEmail.js (which
// only sends). Unlike SES, Resend has no "sandbox vs production access"
// concept to check — a verified domain is a verified domain, no separate
// approval step — so the Deliverability checklist doesn't carry that row
// anymore.

const API_BASE = 'https://api.resend.com';

function authHeaders() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set.');
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

function normalizeDomain(data) {
  return {
    id: data.id,
    domain: data.name,
    verified: data.status === 'verified',
    status: data.status,
    records: (data.records || []).map((r) => ({
      type: r.type,
      name: r.name,
      value: r.value,
      record: r.record,
      status: r.status,
    })),
  };
}

export async function createDomain(name) {
  const res = await fetch(`${API_BASE}/domains`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Resend domain create failed: ${res.status} ${await res.text().catch(() => '')}`);
  return normalizeDomain(await res.json());
}

export async function getDomainStatus(id) {
  const res = await fetch(`${API_BASE}/domains/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Resend domain lookup failed: ${res.status} ${await res.text().catch(() => '')}`);
  return normalizeDomain(await res.json());
}
