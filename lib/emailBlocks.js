// The visual campaign builder's content model + renderer. Campaigns are
// composed as an ordered array of typed blocks (not hand-typed HTML) and
// rendered to email-safe HTML here — table-based layout with inline
// styles, since Gmail/Outlook/Apple Mail strip <style> tags and don't
// support modern CSS (flexbox/grid) reliably. This same module runs
// both server-side (API routes, to compute the HTML that actually gets
// sent) and client-side (the admin builder's live preview), so there's
// exactly one renderer to keep in sync.

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

export function createBlock(type) {
  const id = `b${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  if (type === 'text') return { id, type: 'text', content: '', linkText: '', linkUrl: '' };
  if (type === 'image') return { id, type: 'image', src: '', alt: '', linkUrl: '' };
  if (type === 'button') return { id, type: 'button', label: 'Shop now', url: '' };
  throw new Error(`Unknown block type: ${type}`);
}

function renderText(block, font) {
  const paragraph = escapeHtml(block.content).replace(/\n/g, '<br/>');
  const link = block.linkUrl && block.linkText
    ? `<div style="margin-top:8px;"><a href="${escapeHtml(block.linkUrl)}" style="color:${INK};text-decoration:underline;">${escapeHtml(block.linkText)}</a></div>`
    : '';
  return `
    <tr><td style="padding:16px 24px;font-family:${font};font-size:15px;line-height:1.6;color:${INK};">
      ${paragraph}${link}
    </td></tr>`;
}

function renderImage(block) {
  if (!block.src) return '';
  const img = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" style="width:100%;max-width:${MAX_WIDTH}px;display:block;border:0;" />`;
  const inner = block.linkUrl ? `<a href="${escapeHtml(block.linkUrl)}">${img}</a>` : img;
  return `<tr><td style="padding:0;">${inner}</td></tr>`;
}

function renderButton(block, font) {
  if (!block.url) return '';
  return `
    <tr><td style="padding:20px 24px;text-align:center;">
      <a href="${escapeHtml(block.url)}" style="background:${INK};color:#ffffff;font-family:${font};font-size:13px;font-weight:600;text-decoration:none;padding:14px 32px;display:inline-block;border-radius:2px;">${escapeHtml(block.label)}</a>
    </td></tr>`;
}

function renderLogoRow(logoUrl) {
  if (!logoUrl) return '';
  return `<tr><td style="padding:24px;text-align:center;"><img src="${escapeHtml(logoUrl)}" alt="" style="max-height:48px;display:inline-block;border:0;" /></td></tr>`;
}

// CAN-SPAM requires a visible physical address + working unsubscribe
// mechanism in the message body itself — the List-Unsubscribe header
// (lib/sesEmail.js) enables one-click unsubscribe in mail clients that
// support it, but isn't a substitute for a visible link a human can see
// and click. {{UNSUB_URL}} is filled in per-recipient by
// lib/emailLinks.js's personalizeSendHtml, same pattern as
// {{CAMPAIGN_ID}}/{{SEND_ID}} — in preview mode (no real recipient) it's
// substituted with '#' instead so the builder's live preview doesn't
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

const RENDERERS = { text: renderText, image: renderImage, button: renderButton };

export function renderBlocksToHtml(blocks, settings = {}, { preview = false } = {}) {
  const font = `'${settings.emailFont || 'Inter'}', ${FALLBACK_FONT}`;
  const fontLink = settings.emailFont
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(settings.emailFont)}:wght@400;600;700&display=swap" />`
    : '';

  const rows = [
    renderLogoRow(settings.logoUrl),
    ...(blocks || []).map((b) => (b.type === 'text' || b.type === 'button' ? RENDERERS[b.type](b, font) : RENDERERS[b.type]?.(b) || '')),
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
