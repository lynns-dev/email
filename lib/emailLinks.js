// Rewrites <a href> targets in a campaign's HTML into click-tracking
// redirects, and lets the campaign-id/send-id be stamped in per recipient
// without re-parsing the HTML for every send. The redirect target is
// resolved server-side from the campaign's stored linkTargets array by
// index — the click URL itself only ever carries an index, never a raw
// URL, so a recipient can't tamper with the query string to turn this
// into an open redirect.

const HREF_RE = /href="([^"]*)"/g;

export function wrapLinksForSend(html) {
  const links = [];
  const wrapped = html.replace(HREF_RE, (match, url) => {
    // {{UNSUB_URL}} (lib/emailBlocks.js's footer) is filled in per
    // recipient below, not click-tracked like a normal campaign link —
    // wrapping it here would both point every recipient's unsubscribe
    // link at the same tracked redirect and consume the placeholder
    // before personalizeSendHtml ever gets to fill in a real token.
    if (!url || url.startsWith('mailto:') || url.startsWith('#') || url === '{{UNSUB_URL}}') return match;
    let idx = links.indexOf(url);
    if (idx === -1) {
      idx = links.length;
      links.push(url);
    }
    return `href="/api/email/click?c={{CAMPAIGN_ID}}&s={{SEND_ID}}&i=${idx}"`;
  });
  return { html: wrapped, links };
}

export function personalizeSendHtml(templateHtml, campaignId, sendId, unsubUrl) {
  return templateHtml
    .replace(/{{CAMPAIGN_ID}}/g, campaignId)
    .replace(/{{SEND_ID}}/g, sendId)
    .replace(/{{UNSUB_URL}}/g, unsubUrl);
}
