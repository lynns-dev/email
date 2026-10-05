import { runWelcomeRuleChecks } from '../../lib/veilWelcomeChecks.mjs';
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.VERCEL_ENV === 'production') return res.status(404).end();
  if (req.method !== 'GET') return res.status(405).end();
  const result = runWelcomeRuleChecks();
  return res.status(result.passed ? 200 : 500).json(result);
}
