// Renders the "your order has shipped" transactional email — a plain,
// table-based layout matching lib/emailBlocks.js's conventions (inline
// styles, no <style> tag, since Gmail/Outlook/Apple Mail strip those), but
// kept separate from that module rather than reusing renderEmailHtml():
// this content isn't merchant-authored HTML pasted into a campaign/
// automation step, it's built here from the tracking fields admin enters
// per order, and it deliberately skips renderEmailHtml()'s CAN-SPAM
// unsubscribe footer — see lib/resendEmail.js's sendTransactionalEmail for
// why that's correct for a transactional order notice.

const MAX_WIDTH = 600;
const FALLBACK_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const INK = '#141414';
const SOFT = '#6b6b6b';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderOrderShippedEmail({ orderId, carrier, trackingNumber, trackingUrl, settings = {} }) {
  const font = `'${settings.emailFont || 'Inter'}', ${FALLBACK_FONT}`;

  const logoRow = settings.logoUrl
    ? `<tr><td style="padding:24px;text-align:center;"><img src="${escapeHtml(settings.logoUrl)}" alt="" style="max-height:48px;display:inline-block;border:0;" /></td></tr>`
    : '';

  const detailRows = [
    orderId && `<tr><td style="padding:4px 0;color:${SOFT};">Order</td><td style="padding:4px 0;text-align:right;">${escapeHtml(orderId)}</td></tr>`,
    carrier && `<tr><td style="padding:4px 0;color:${SOFT};">Carrier</td><td style="padding:4px 0;text-align:right;">${escapeHtml(carrier)}</td></tr>`,
    `<tr><td style="padding:4px 0;color:${SOFT};">Tracking number</td><td style="padding:4px 0;text-align:right;">${escapeHtml(trackingNumber)}</td></tr>`,
  ].filter(Boolean).join('');

  const trackButton = trackingUrl
    ? `<div style="text-align:center;margin:24px 0 4px;"><a href="${escapeHtml(trackingUrl)}" style="background:${INK};color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:14px 32px;display:inline-block;border-radius:2px;">Track your package</a></div>`
    : '';

  const footerLines = [settings.companyName, settings.physicalAddress].filter(Boolean).map(escapeHtml).join('<br/>');
  const footer = footerLines
    ? `<tr><td style="padding:24px;text-align:center;font-family:${font};font-size:12px;line-height:1.6;color:${SOFT};border-top:1px solid #ececec;">${footerLines}</td></tr>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;">
  <tr><td align="center">
    <table role="presentation" width="${MAX_WIDTH}" cellpadding="0" cellspacing="0" style="max-width:${MAX_WIDTH}px;width:100%;background:#ffffff;">
      ${logoRow}
      <tr><td style="padding:16px 24px 8px;font-family:${font};font-size:20px;font-weight:600;color:${INK};">Your order has shipped!</td></tr>
      <tr><td style="padding:0 24px 20px;font-family:${font};font-size:15px;line-height:1.6;color:${INK};">It's on its way to you.</td></tr>
      <tr><td style="padding:0 24px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${font};font-size:14px;border-top:1px solid #ececec;border-bottom:1px solid #ececec;">
          ${detailRows}
        </table>
      </td></tr>
      <tr><td style="padding:0 24px 24px;">${trackButton}</td></tr>
      ${footer}
    </table>
  </td></tr>
</table>`;
}
