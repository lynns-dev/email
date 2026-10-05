import { confirmWelcomeAnswer, resolveWelcomeAnswer, welcomeEnabled } from '../lib/veilWelcome';
const advice = {
  scent: 'Original is floral and warm. Citron Lumineaux is bright and woody. Violette Ambrée is fruit, soft flowers and amber.',
  powder: 'Press the puff into the powder. Sweep a light veil onto clean skin. Wear alone, or layer with a perfume you love.',
  price: 'Start with one 4oz jar at $45. The Veil Luxury Puff is included. Use your eligible VEIL15 code at checkout.',
  timing: 'No hurry from us. The collection is here to revisit. Nothing is reserved or charged.',
};
export default function WelcomeAnswer({ answer, token, saved, adviceOnly, error }) {
  return <main style={{ maxWidth: 560, margin: '64px auto', padding: 32, color: '#16140F', background: '#FCFBF7', fontFamily: 'Arial,sans-serif', lineHeight: 1.7 }}>
    <h1 style={{ fontFamily: 'Georgia,serif', fontWeight: 400 }}>A little help, from Veil.</h1>
    {error ? <p role="alert">{error}</p> : <>
      <p>{advice[answer]}</p>
      {saved ? <p role="status">{adviceOnly ? 'We have left the email series where it was. You can explore the collection below.' : 'Your choice is saved. We will tailor the next eligible note to it.'}</p> : <form method="post"><input type="hidden" name="token" value={token} /><button type="submit" style={{ padding: '16px 24px', background: '#16140F', color: '#FCFBF7', border: 0 }}>Confirm this answer</button><p style={{ fontSize: 13 }}>Opening this page alone does not change your email preferences.</p></form>}
      <a href="https://veilpuff.com/shop">Explore the collection</a>
    </>}
  </main>;
}
export async function getServerSideProps({ req, res, query }) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!welcomeEnabled()) return { props: { error: 'This invitation is not active yet.' } };
  try {
    if (!['GET', 'POST'].includes(req.method)) throw new Error('Unsupported request');
    let token = String(query.token || '');
    let result = null;
    if (req.method === 'POST') {
      // Native same-origin form POST; reject cross-origin preference writes.
      const origin = req.headers.origin;
      const host = req.headers.host;
      if (!origin || new URL(origin).host !== host) throw new Error('Please confirm from this page.');
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 2048) throw new Error('Invalid request');
      }
      token = new URLSearchParams(body).get('token') || '';
      result = await confirmWelcomeAnswer(token);
      if (!result?.ok) throw new Error('Please try again in a moment.');
    }
    const resolved = await resolveWelcomeAnswer(token);
    return { props: { answer: resolved.answer, token, saved: Boolean(result), adviceOnly: Boolean(result?.adviceOnly) } };
  } catch {
    return { props: { error: 'This invitation could not be confirmed. Please try later or visit the collection.' } };
  }
}
