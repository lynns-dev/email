// The visual campaign builder's content model + renderer. Campaigns are
// composed as an ordered array of typed blocks (not hand-typed HTML) and
// rendered to email-safe HTML here — table-based layout with inline
// styles, since Gmail/Outlook/Apple Mail strip <style> tags and don't
// support modern CSS (flexbox/grid) reliably. This same module runs
// both server-side (API routes, to compute the HTML that actually gets
// sent) and client-side (the admin builder's live preview), so there's
// exactly one renderer to keep in sync.

const MAX_WIDTH = 600;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const INK = '#141414';

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

function renderText(block) {
  const paragraph = escapeHtml(block.content).replace(/\n/g, '<br/>');
  const link = block.linkUrl && block.linkText
    ? `<div style="margin-top:8px;"><a href="${escapeHtml(block.linkUrl)}" style="color:${INK};text-decoration:underline;">${escapeHtml(block.linkText)}</a></div>`
    : '';
  return `
    <tr><td style="padding:16px 24px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">
      ${paragraph}${link}
    </td></tr>`;
}

function renderImage(block) {
  if (!block.src) return '';
  const img = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" style="width:100%;max-width:${MAX_WIDTH}px;display:block;border:0;" />`;
  const inner = block.linkUrl ? `<a href="${escapeHtml(block.linkUrl)}">${img}</a>` : img;
  return `<tr><td style="padding:0;">${inner}</td></tr>`;
}

function renderButton(block) {
  if (!block.url) return '';
  return `
    <tr><td style="padding:20px 24px;text-align:center;">
      <a href="${escapeHtml(block.url)}" style="background:${INK};color:#ffffff;font-family:${FONT};font-size:13px;font-weight:600;text-decoration:none;padding:14px 32px;display:inline-block;border-radius:2px;">${escapeHtml(block.label)}</a>
    </td></tr>`;
}

const RENDERERS = { text: renderText, image: renderImage, button: renderButton };

export function renderBlocksToHtml(blocks) {
  const rows = (blocks || []).map((b) => RENDERERS[b.type]?.(b) || '').join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;">
  <tr><td align="center">
    <table role="presentation" width="${MAX_WIDTH}" cellpadding="0" cellspacing="0" style="max-width:${MAX_WIDTH}px;width:100%;background:#ffffff;">
      ${rows}
    </table>
  </td></tr>
</table>`;
}
