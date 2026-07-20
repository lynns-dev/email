// CORS for the one route actually called via cross-origin fetch() from a
// storefront's own page JS: pages/api/email/subscribe.js. Everything else
// (confirm/unsubscribe/click) is a plain browser navigation or email-client
// click, and resend-webhook is server-to-server from Resend — none of
// those go through the browser's CORS machinery. Origin is checked against an
// allowlist rather than echoing "*", since this is a public write endpoint.

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

// Returns true if the request was a handled CORS preflight (caller should
// return immediately). For actual requests, sets the allow-origin header
// (if the origin matches) and returns false so the handler continues.
export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
