// Email clients cannot resolve relative links. Use this deployment's
// public origin when the optional environment setting is absent.
const DEFAULT_EMAIL_APP_URL = 'https://email-delta-eight.vercel.app';

export function getEmailBaseUrl() {
  const configured = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  if (!configured) return DEFAULT_EMAIL_APP_URL;
  const candidate = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid email app origin');
    }
    return url.origin;
  } catch {
    return DEFAULT_EMAIL_APP_URL;
  }
}
