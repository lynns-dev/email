// SES identity management (domain verification + DKIM + account status)
// for the Settings/Deliverability UI — separate from lib/sesEmail.js
// (which only sends). Needs a broader IAM policy than send-only: see
// DEPLOYMENT.md's IAM step for the added ses:CreateEmailIdentity /
// ses:GetEmailIdentity / ses:GetAccount scopes.

import { SESv2Client, CreateEmailIdentityCommand, GetEmailIdentityCommand, GetAccountCommand } from '@aws-sdk/client-sesv2';

let client = null;
function getClient() {
  if (client) return client;
  const region = process.env.AWS_REGION;
  if (!region || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set.');
  }
  client = new SESv2Client({ region });
  return client;
}

// Domain identity (not single-email) — this is what actually supports
// DKIM/alignment, matching the guidance already in DEPLOYMENT.md Step 3a.
// Easy DKIM (Amazon-generated signing key) is used, which is why no
// DkimSigningAttributes are passed — SES returns 3 CNAME tokens to add.
export async function createDomainIdentity(domain) {
  const command = new CreateEmailIdentityCommand({ EmailIdentity: domain });
  const result = await getClient().send(command);
  return {
    domain,
    dkimTokens: result.DkimAttributes?.Tokens || [],
    verified: result.VerifiedForSendingStatus || false,
  };
}

export async function getIdentityStatus(domain) {
  const command = new GetEmailIdentityCommand({ EmailIdentity: domain });
  const result = await getClient().send(command);
  return {
    domain,
    dkimTokens: result.DkimAttributes?.Tokens || [],
    dkimStatus: result.DkimAttributes?.Status || 'NOT_STARTED',
    verified: result.VerifiedForSendingStatus || false,
  };
}

export async function getAccountStatus() {
  const command = new GetAccountCommand({});
  const result = await getClient().send(command);
  return {
    productionAccessEnabled: Boolean(result.ProductionAccessEnabled),
    sendingEnabled: Boolean(result.SendingEnabled),
  };
}
