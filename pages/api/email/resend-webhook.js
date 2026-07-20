// Receives Resend's bounce/complaint webhook events (configured in the
// Resend dashboard — see DEPLOYMENT.md). This is what keeps the
// complaint rate under Gmail/Yahoo's bulk-sender threshold automatically:
// a bounce or a spam complaint suppresses that address immediately
// instead of relying on someone noticing later.
//
// Every request's signature is verified (lib/webhookVerify.js) before
// it's trusted, since this endpoint is public and an unverified
// "email.complained" event would let anyone suppress an arbitrary
// subscriber. Raw body is needed for signature verification, so the
// default JSON body parser is disabled and the body is read + parsed
// manually.
//
// Resend's live docs were unreachable (bot-protected) while building
// this, so the exact bounce-type field below is defensive: any
// email.bounced event suppresses the recipient rather than trying to
// distinguish permanent/transient the way the old SES integration did —
// safer to over-suppress a bad address than under-suppress and risk the
// complaint rate. Revisit if Resend's payload turns out to carry that
// distinction explicitly.

import { suppressByEmail } from '../../../lib/subscribersStore';
import { verifyWebhookSignature } from '../../../lib/webhookVerify';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const rawBody = await readRawBody(req);
  const verified = verifyWebhookSignature(rawBody, req.headers, process.env.RESEND_WEBHOOK_SECRET);
  if (!verified) return res.status(403).end();

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).end();
  }

  const recipients = event.data?.to || [];

  if (event.type === 'email.bounced') {
    await Promise.all(recipients.map((email) => suppressByEmail(email, 'bounce')));
  } else if (event.type === 'email.complained') {
    await Promise.all(recipients.map((email) => suppressByEmail(email, 'complaint')));
  }

  return res.status(200).end();
}
