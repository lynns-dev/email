# Veil welcome engine — staged, disabled

This branch implements the welcome engine, not an activated campaign. Production main is unchanged. Default is disabled unless VEIL_WELCOME_ENABLED is exactly true. Do not enable before all gates below pass.

## Implemented
- Explicit new newsletter signup enrollment, no confirmation click, no old-list backfill.
- Immediate Day 0; Day 3 question; four Day 4/7 branches; Day 14 and final Day 30.
- Twelve included content bodies; the price branch avoids claiming a verified $38.25 charged total.
- Signed opaque answer tokens, GET with no mutations, explicit same-origin POST confirmation.
- Per-enrollment state stored under separate keys, recipient lock, reserve-before-send ledger; ambiguous delivery stops for review rather than unsafe automatic retry.
- Latest confirmed answer replaces queued choice; maximum two branch sends. No replay after Day 10.
- Fresh subscriber/purchase checks immediately before send; unknown purchase state holds, unsubscribed/blocked/purchased exits.
- Welcome waits at least 24h after recorded marketing attempts and 48h after checkout start. Recovery/campaign/post-purchase send paths record their attempts when the feature is on. This is NOT a global cap that prohibits every other marketing flow; the welcome engine yields to them.
- Legacy welcome skipped for explicit new-engine enrollment, sunset skipped for its first 37 days; older recipients unchanged. Legacy step state is superseded at new enrollment so disabling does not restart old sends.
- Protected /admin/welcome-flow overview, linked from Automations. Existing welcome editor remains legacy: branch content is versioned in veilWelcomeContent.mjs rather than incorrectly pretending it is editable there.
- /api/welcome-rule-check runs synthetic rules/HTML checks on non-production deployments only. It never sends email or mutates storage.

## Remaining release gates
1. Connect authoritative lifetime PAID purchase history (not merely local webhook counts). VEIL_PURCHASE_VERIFY_URL must be HTTPS; authorization uses VEIL_PURCHASE_VERIFY_SECRET. Contract: POST {email}, response {verified:true,purchased:boolean,checkedAt:epochMilliseconds}; timestamp within 60 seconds. Cover Square AND other active payment routes/known aliases. This verifier is intentionally not implemented by the email app and missing configuration holds all prospect sends. Never manufacture purchased:false from empty or partial data.
2. Configure an independent random secret of at least 32 characters as VEIL_WELCOME_SIGNING_SECRET. Do not reuse the unsubscribe token or expose the secret to the client.
3. Test recipient ledger concurrency with the actual Upstash store and ambiguous provider outcomes. Existing subscriber store still rewrites a shared array and needs separate concurrency hardening before claiming fully race-free consent updates. Record lock acquisition guarantees cannot eliminate a purchase made during network delivery.
4. Verify existing companyName, physicalAddress, sender domain and unsubscribe. VEIL15 actual eligible checkout, purchaser exclusion and shipping/tax must be tested. No new discounts are created here.
5. Verify full signup → welcome → human survey POST → appropriate next branch in a controlled environment with synthetic purchase verifier and test inboxes; GET scans must not change state. Pure tests do not verify signing, storage, delivery or real order history.
6. Existing Vercel cron is daily. Due messages send on next daily run. A daily schedule cannot promise exact 30-minute recovery or exact follow-up minute. Arrange and verify a reliable scheduler separately if exact timing is needed; do not duplicate cron runners.
7. Preview deployments must use isolated storage and test email delivery configuration, not live subscriber data. Environment flag must stay off in production until verified and approved. Existing subscribed contacts are not retroactively migrated; review separately.
8. Confirm welcome copy finalization and handling of replies. Meta audiences/ads and checkout-restoration repair are not part of this branch.

## Read-only checks
Run Node against lib/veilWelcomeChecks.mjs with `runWelcomeRuleChecks()` or open the non-production /api/welcome-rule-check. The check result must say passed:true. Check the protected overview to confirm disabled and inspect missing gates. No deployment/CI success substitutes for live-path verification.

## Scope of guarantees
This implementation prefers missed/held email over duplicated or improperly targeted email. An ambiguous provider call consumes the step and exits for review; no blind retry. It does not claim exactly-once delivery, current identity reconciliation coverage, globally enforced marketing caps, editability through the legacy editor, or a verified end-to-end live flow.
