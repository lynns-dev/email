// Email content model: campaigns and automation steps store raw HTML
// pasted in directly (not a visual block builder) and it's wrapped here
// with the account's logo (top) and a CAN-SPAM footer (bottom) from
// lib/settingsStore.js — table-based outer layout with inline styles
// since Gmail/Outlook/Apple Mail strip <style> tags and don't support
// modern CSS (flexbox/grid) reliably; the pasted content itself is the
// author's own HTML, styled however they wrote it. This same module
// runs both server-side (API routes, to compute the HTML that actually
// gets sent) and client-side (the admin composer's live preview), so
// there's exactly one renderer to keep in sync.

const MAX_WIDTH = 600;
const FALLBACK_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const INK = '#141414';
const SOFT = '#6b6b6b';

// A short curated list rather than every Google Font — Outlook desktop
// and a fair share of webmail clients ignore linked web fonts entirely
// and fall back to the sans-serif stack regardless of which one is
// picked, so the fallback matters as much as the choice itself.
export const EMAIL_FONTS = ['Inter', 'Hanken Grotesk', 'Poppins', 'Montserrat', 'Lato', 'Playfair Display', 'Roboto', 'Open Sans'];

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLogoRow(logoUrl) {
  if (!logoUrl) return '';
  return `<tr><td style="padding:24px;text-align:center;"><img src="${escapeHtml(logoUrl)}" alt="" style="max-height:48px;display:inline-block;border:0;" /></td></tr>`;
}

// The pasted HTML is trusted content the merchant wrote themselves (same
// trust level as any other admin-only field in this app), so it's
// embedded as-is rather than sanitized — a default font/color is applied
// to the containing cell so plain, unstyled markup still reads sensibly.
function renderContentRow(html, font) {
  if (!html) return '';
  return `<tr><td style="padding:16px 24px;font-family:${font};font-size:15px;line-height:1.6;color:${INK};">${html}</td></tr>`;
}

// CAN-SPAM requires a visible physical address + working unsubscribe
// mechanism in the message body itself — the List-Unsubscribe header
// (lib/resendEmail.js) enables one-click unsubscribe in mail clients that
// support it, but isn't a substitute for a visible link a human can see
// and click. {{UNSUB_URL}} is filled in per-recipient by
// lib/emailLinks.js's personalizeSendHtml, same pattern as
// {{CAMPAIGN_ID}}/{{SEND_ID}} — in preview mode (no real recipient) it's
// substituted with '#' instead so the composer's live preview doesn't
// show raw template syntax.
function renderFooter(settings, font, preview) {
  const unsubUrl = preview ? '#' : '{{UNSUB_URL}}';
  const lines = [settings?.companyName, settings?.physicalAddress].filter(Boolean).map(escapeHtml).join('<br/>');
  return `
    <tr><td style="padding:24px;text-align:center;font-family:${font};font-size:12px;line-height:1.6;color:${SOFT};border-top:1px solid #ececec;">
      ${lines}
      <div style="margin-top:8px;"><a href="${unsubUrl}" style="color:${SOFT};text-decoration:underline;">Unsubscribe</a></div>
    </td></tr>`;
}

export function renderEmailHtml(contentHtml, settings = {}, { preview = false } = {}) {
  const font = `'${settings.emailFont || 'Inter'}', ${FALLBACK_FONT}`;
  const fontLink = settings.emailFont
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(settings.emailFont)}:wght@400;600;700&display=swap" />`
    : '';

  const rows = [
    renderLogoRow(settings.logoUrl),
    renderContentRow(contentHtml, font),
    renderFooter(settings, font, preview),
  ].join('\n');

  return `${fontLink}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;">
  <tr><td align="center">
    <table role="presentation" width="${MAX_WIDTH}" cellpadding="0" cellspacing="0" style="max-width:${MAX_WIDTH}px;width:100%;background:#ffffff;">
      ${rows}
    </table>
  </td></tr>
</table>`;
}
