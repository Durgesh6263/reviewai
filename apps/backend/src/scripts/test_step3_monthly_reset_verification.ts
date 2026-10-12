/**
 * STEP 3 VERIFICATION SUITE — MONTHLY USAGE PERIOD & RESET
 * 
 * Verifies:
 * A. Current period starts on 06/10 (06/10/2026 -> 05/11/2026, next reset 06/11/2026).
 * B. Use 50 QR -> 50 used / 150 remaining.
 * C. Move to 06/11.
 * D. New period -> 0 used / 200 remaining.
 * E. Previous period still shows 50 used (archived into monthly_history).
 * F. AI behaves independently (independent usage counters & limits).
 * G. Unused quota does not carry forward (Month 2 starts with 200, not 350).
 * H. Subscription expiry remains unchanged (06/04/2027).
 * I. After subscription expiry, no reset grants access (QR & AI blocked with SUBSCRIPTION_EXPIRED).
 * J. Only exhausted service is blocked (QR exhaustion blocks QR only; AI remains available).
 * K. Refreshing/reloading produces the same authoritative result.
 * L. Direct API calls cannot bypass the monthly limit.
 */

import 'dotenv/config';
import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService, calculateUsagePeriod } from '../modules/subscription/entitlement';

async function runStep3MonthlyResetVerification() {
  console.log('===============================================================');
  console.log('STARTING STEP 3 — MONTHLY USAGE PERIOD & RESET VERIFICATION');
  console.log('===============================================================\n');

  // Step 0: Ensure database connection & locate a test business
  const { data: business, error: bizErr } = await supabase
    .from('businesses')
    .select('id, owner_id, name')
    .limit(1)
    .single();

  if (bizErr || !business) {
    throw new Error(`Failed to locate a test business: ${bizErr?.message}`);
  }

  const biz = business as any;
  const testBusinessId = biz.id;
  const testOwnerId = biz.owner_id;
  console.log(`Test Business: "${biz.name}" (${testBusinessId})`);
  console.log(`Test Owner ID: ${testOwnerId}\n`);

  try {
    // -------------------------------------------------------------------------
    // SETUP: Create a test subscription with:
    // Start: 06/10/2026 (2026-10-06T00:00:00.000Z)
    // Duration: 6 months
    // QR: 200/month
    // AI: 100/month
    // -------------------------------------------------------------------------
    console.log('--- SETUP: Provision test subscription starting 06/10/2026 (6 months, 200 QR/mo, 100 AI/mo) ---');
    const subStartDate = new Date('2026-10-06T00:00:00.000Z');
    const expectedExpiryDate = new Date('2027-04-06T00:00:00.000Z');

    const activatedEnt = await entitlementService.activatePlan({
      businessId: testBusinessId,
      ownerId: testOwnerId,
      planId: 'base',
      durationMonths: 6,
      qrQuota: 200,
      aiQuota: 100,
      price: 2499,
      startDate: subStartDate,
    });

    console.log(`✓ Subscription activated successfully: Plan=${activatedEnt.plan_name}, Duration=${activatedEnt.duration_months} Months`);
    console.log(`  Start: ${activatedEnt.start_date}`);
    console.log(`  End:   ${activatedEnt.end_date}`);
    console.log(`  Monthly QR Limit: ${activatedEnt.monthly_qr_quota}`);
    console.log(`  Monthly AI Limit: ${activatedEnt.monthly_ai_quota}\n`);

    // -------------------------------------------------------------------------
    // TEST A: Current period starts on 06/10
    // -------------------------------------------------------------------------
    console.log('--- TEST A: Verify Current Period starts on 06/10 ---');
    const datePeriod1 = new Date('2026-10-06T12:00:00.000Z');
    const entPeriod1 = await entitlementService.getBusinessEntitlement(testBusinessId, datePeriod1);

    const p1Start = new Date(entPeriod1.current_period_start);
    const p1End = new Date(entPeriod1.current_period_end);
    const p1Reset = new Date(entPeriod1.next_monthly_reset);

    console.log(`  Period 1 Index: ${entPeriod1.current_period_index}`);
    console.log(`  Period 1 Start: ${entPeriod1.current_period_start} (Day: ${p1Start.getUTCDate()}/${p1Start.getUTCMonth() + 1})`);
    console.log(`  Period 1 End:   ${entPeriod1.current_period_end} (Day: ${p1End.getUTCDate()}/${p1End.getUTCMonth() + 1})`);
    console.log(`  Period 1 Next Reset: ${entPeriod1.next_monthly_reset} (Day: ${p1Reset.getUTCDate()}/${p1Reset.getUTCMonth() + 1})`);

    if (p1Start.getUTCDate() !== 6 || p1Start.getUTCMonth() !== 9) { // Month 9 is October
      throw new Error(`TEST A FAILED: Period 1 start date is ${entPeriod1.current_period_start}, expected 06/10/2026`);
    }
    if (p1End.getUTCDate() !== 5 || p1End.getUTCMonth() !== 10) { // Month 10 is November
      throw new Error(`TEST A FAILED: Period 1 end date is ${entPeriod1.current_period_end}, expected 05/11/2026`);
    }
    if (p1Reset.getUTCDate() !== 6 || p1Reset.getUTCMonth() !== 10) { // Month 10 is November
      throw new Error(`TEST A FAILED: Period 1 next reset is ${entPeriod1.next_monthly_reset}, expected 06/11/2026`);
    }
    console.log('✓ TEST A PASSED: Period 1 accurately calculated as 06/10/2026 → 05/11/2026, next reset 06/11/2026\n');

    // -------------------------------------------------------------------------
    // TEST B: Use 50 QR → 50 used / 150 remaining
    // -------------------------------------------------------------------------
    console.log('--- TEST B: Consume 50 QR in Period 1 ---');
    const consumeRes1 = await entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 50, datePeriod1);
    if (!consumeRes1.success || !consumeRes1.allowed) {
      throw new Error(`TEST B FAILED: Failed to consume 50 QR: ${consumeRes1.error || consumeRes1.reason}`);
    }

    const entAfter50 = await entitlementService.getBusinessEntitlement(testBusinessId, datePeriod1);
    console.log(`  QR Used:      ${entAfter50.current_month_qr_used} (Expected: 50)`);
    console.log(`  QR Remaining: ${entAfter50.current_month_qr_remaining} (Expected: 150)`);

    if (entAfter50.current_month_qr_used !== 50 || entAfter50.current_month_qr_remaining !== 150) {
      throw new Error(`TEST B FAILED: Expected 50 used and 150 remaining, got used=${entAfter50.current_month_qr_used}, remaining=${entAfter50.current_month_qr_remaining}`);
    }
    console.log('✓ TEST B PASSED: 50 QR used → 50 used / 150 remaining\n');

    // -------------------------------------------------------------------------
    // TEST C & D: Move to 06/11 → New Period (0 used / 200 remaining)
    // -------------------------------------------------------------------------
    console.log('--- TEST C & D: Move to 06/11 (2026-11-06) and verify Automatic New Period ---');
    const datePeriod2 = new Date('2026-11-06T00:00:00.000Z');
    const entPeriod2 = await entitlementService.getBusinessEntitlement(testBusinessId, datePeriod2);

    const p2Start = new Date(entPeriod2.current_period_start);
    const p2End = new Date(entPeriod2.current_period_end);
    const p2Reset = new Date(entPeriod2.next_monthly_reset);

    console.log(`  Period 2 Index: ${entPeriod2.current_period_index}`);
    console.log(`  Period 2 Start: ${entPeriod2.current_period_start} (Day: ${p2Start.getUTCDate()}/${p2Start.getUTCMonth() + 1})`);
    console.log(`  Period 2 End:   ${entPeriod2.current_period_end} (Day: ${p2End.getUTCDate()}/${p2End.getUTCMonth() + 1})`);
    console.log(`  Period 2 Next Reset: ${entPeriod2.next_monthly_reset} (Day: ${p2Reset.getUTCDate()}/${p2Reset.getUTCMonth() + 1})`);
    console.log(`  Period 2 QR Used:      ${entPeriod2.current_month_qr_used} (Expected: 0)`);
    console.log(`  Period 2 QR Remaining: ${entPeriod2.current_month_qr_remaining} (Expected: 200)`);

    if (p2Start.getUTCDate() !== 6 || p2Start.getUTCMonth() !== 10) { // Month 10 is November
      throw new Error(`TEST C FAILED: Period 2 start is ${entPeriod2.current_period_start}, expected 06/11/2026`);
    }
    if (p2End.getUTCDate() !== 5 || p2End.getUTCMonth() !== 11) { // Month 11 is December
      throw new Error(`TEST C FAILED: Period 2 end is ${entPeriod2.current_period_end}, expected 05/12/2026`);
    }
    if (entPeriod2.current_month_qr_used !== 0 || entPeriod2.current_month_qr_remaining !== 200) {
      throw new Error(`TEST D FAILED: New period usage must reset to 0 used / 200 remaining, got used=${entPeriod2.current_month_qr_used}, remaining=${entPeriod2.current_month_qr_remaining}`);
    }
    console.log('✓ TEST C & D PASSED: Moved to 06/11 → Period 2 started automatically with 0 used / 200 remaining\n');

    // -------------------------------------------------------------------------
    // TEST E: Previous period still shows 50 used in monthly_history
    // -------------------------------------------------------------------------
    console.log('--- TEST E: Verify previous period usage history is preserved ---');
    const monthlyHistory = entPeriod2.monthly_history || [];
    console.log(`  Monthly History records: ${monthlyHistory.length}`);
    console.log(`  Record 0: Period ${monthlyHistory[0]?.period_index + 1} (${monthlyHistory[0]?.period_start} -> ${monthlyHistory[0]?.period_end}): QR Used = ${monthlyHistory[0]?.qr_used}, AI Used = ${monthlyHistory[0]?.ai_used}`);

    if (monthlyHistory.length === 0) {
      throw new Error('TEST E FAILED: Monthly history is empty after rollover!');
    }
    const period0Record = monthlyHistory.find(h => h.period_index === 0);
    if (!period0Record || period0Record.qr_used !== 50) {
      throw new Error(`TEST E FAILED: Expected period 0 record with qr_used=50, found: ${JSON.stringify(period0Record)}`);
    }
    console.log('✓ TEST E PASSED: Previous period usage is preserved in monthly_history with 50 QR used\n');

    // -------------------------------------------------------------------------
    // TEST F: AI behaves independently
    // -------------------------------------------------------------------------
    console.log('--- TEST F: Verify AI behaves independently ---');
    // Consume 30 AI in Period 2
    const aiConsumeRes = await entitlementService.consumeServiceQuota(testBusinessId, 'ai_generation', 30, datePeriod2);
    if (!aiConsumeRes.success || !aiConsumeRes.allowed) {
      throw new Error(`TEST F FAILED: Failed to consume 30 AI: ${aiConsumeRes.error || aiConsumeRes.reason}`);
    }

    const entAfterAi = await entitlementService.getBusinessEntitlement(testBusinessId, datePeriod2);
    console.log(`  AI Used:      ${entAfterAi.current_month_ai_used} (Expected: 30)`);
    console.log(`  AI Remaining: ${entAfterAi.current_month_ai_remaining} (Expected: 70)`);
    console.log(`  QR Used:      ${entAfterAi.current_month_qr_used} (Expected: 0)`);
    console.log(`  QR Remaining: ${entAfterAi.current_month_qr_remaining} (Expected: 200)`);

    if (entAfterAi.current_month_ai_used !== 30 || entAfterAi.current_month_ai_remaining !== 70) {
      throw new Error(`TEST F FAILED: AI values incorrect: used=${entAfterAi.current_month_ai_used}, remaining=${entAfterAi.current_month_ai_remaining}`);
    }
    if (entAfterAi.current_month_qr_used !== 0 || entAfterAi.current_month_qr_remaining !== 200) {
      throw new Error(`TEST F FAILED: QR values altered by AI consumption: used=${entAfterAi.current_month_qr_used}, remaining=${entAfterAi.current_month_qr_remaining}`);
    }
    console.log('✓ TEST F PASSED: AI usage and quota operate completely independently from QR\n');

    // -------------------------------------------------------------------------
    // TEST G: Unused quota does NOT carry forward
    // -------------------------------------------------------------------------
    console.log('--- TEST G: Verify unused quota does not carry forward ---');
    // Month 1 had 150 unused QR.
    // If carry forward occurred, Month 2 remaining would be 350.
    // It must strictly be 200!
    if ((entPeriod2.current_month_qr_remaining as any) === 350) {
      throw new Error('TEST G FAILED: Unused quota was improperly carried forward to 350!');
    }
    if (entPeriod2.current_month_qr_remaining !== 200) {
      throw new Error(`TEST G FAILED: Expected exactly 200 remaining in new period, got ${entPeriod2.current_month_qr_remaining}`);
    }
    console.log(`  Month 1 Unused QR: 150`);
    console.log(`  Month 2 Starting Limit: 200 (Remaining = 200, NOT 350)`);
    console.log('✓ TEST G PASSED: Unused quota does not carry forward\n');

    // -------------------------------------------------------------------------
    // TEST H: Subscription expiry remains unchanged
    // -------------------------------------------------------------------------
    console.log('--- TEST H: Verify Subscription Expiry remains unchanged ---');
    console.log(`  Subscription Expiry: ${entPeriod2.end_date}`);
    console.log(`  Expected Expiry:     ${expectedExpiryDate.toISOString()}`);

    const actualExp = new Date(entPeriod2.end_date);
    if (actualExp.getUTCFullYear() !== 2027 || actualExp.getUTCMonth() !== 3 || actualExp.getUTCDate() !== 6) { // Month 3 is April
      throw new Error(`TEST H FAILED: Subscription expiry changed to ${entPeriod2.end_date}, expected 06/04/2027`);
    }
    console.log('✓ TEST H PASSED: Monthly resets never extend or alter subscription expiry (06/04/2027)\n');

    // -------------------------------------------------------------------------
    // TEST J: Only exhausted service is blocked
    // -------------------------------------------------------------------------
    console.log('--- TEST J: Verify only exhausted service is blocked ---');
    // In Period 2, consume all remaining 200 QR
    const qrConsumeAll = await entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 200, datePeriod2);
    if (!qrConsumeAll.success || !qrConsumeAll.allowed) {
      throw new Error(`TEST J FAILED: Failed to consume remaining 200 QR: ${qrConsumeAll.error}`);
    }

    const entAfterQrExhaust = await entitlementService.getBusinessEntitlement(testBusinessId, datePeriod2);
    console.log(`  QR Used:      ${entAfterQrExhaust.current_month_qr_used} / ${entAfterQrExhaust.monthly_qr_quota} (Remaining: ${entAfterQrExhaust.current_month_qr_remaining})`);
    console.log(`  AI Used:      ${entAfterQrExhaust.current_month_ai_used} / ${entAfterQrExhaust.monthly_ai_quota} (Remaining: ${entAfterQrExhaust.current_month_ai_remaining})`);
    console.log(`  Subscription is_active: ${entAfterQrExhaust.is_active}`);

    // Verify canUseService
    const canUseQr = await entitlementService.canUseService(testBusinessId, 'qr_scan', datePeriod2);
    const canUseAi = await entitlementService.canUseService(testBusinessId, 'ai_generation', datePeriod2);

    console.log(`  canUseService('qr_scan'): allowed=${canUseQr.allowed}, reason=${canUseQr.reason}`);
    console.log(`  canUseService('ai_generation'): allowed=${canUseAi.allowed}, reason=${canUseAi.reason}`);

    if (canUseQr.allowed) {
      throw new Error('TEST J FAILED: QR scan should be blocked when QR quota is exhausted!');
    }
    if (canUseQr.reason !== 'QR_QUOTA_EXHAUSTED') {
      throw new Error(`TEST J FAILED: Expected reason QR_QUOTA_EXHAUSTED, got ${canUseQr.reason}`);
    }
    if (!canUseAi.allowed) {
      throw new Error('TEST J FAILED: AI generation should remain allowed when only QR quota is exhausted!');
    }
    if (!entAfterQrExhaust.is_active) {
      throw new Error('TEST J FAILED: Entire plan should NOT be marked inactive when only QR is exhausted!');
    }
    console.log('✓ TEST J PASSED: Only QR service is blocked; AI service remains accessible\n');

    // -------------------------------------------------------------------------
    // TEST L: Direct API calls cannot bypass the monthly limit
    // -------------------------------------------------------------------------
    console.log('--- TEST L: Verify direct API calls cannot bypass monthly limit ---');
    // Try to consume 1 more QR scan (remaining = 0)
    const bypassAttempt1 = await entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1, datePeriod2);
    console.log(`  Attempt to consume 1 QR when remaining=0: success=${bypassAttempt1.success}, allowed=${bypassAttempt1.allowed}, reason=${bypassAttempt1.reason}`);
    if (bypassAttempt1.allowed || bypassAttempt1.success) {
      throw new Error('TEST L FAILED: API call bypassed the exhausted QR limit!');
    }

    // Try to consume 100 AI when remaining is 70
    const bypassAttempt2 = await entitlementService.consumeServiceQuota(testBusinessId, 'ai_generation', 100, datePeriod2);
    console.log(`  Attempt to consume 100 AI when remaining=70: success=${bypassAttempt2.success}, allowed=${bypassAttempt2.allowed}, reason=${bypassAttempt2.reason}`);
    if (bypassAttempt2.allowed || bypassAttempt2.success) {
      throw new Error('TEST L FAILED: API call bypassed remaining AI limit!');
    }
    console.log('✓ TEST L PASSED: Direct API calls cannot exceed or bypass monthly limits\n');

    // -------------------------------------------------------------------------
    // TEST I: After subscription expiry, no reset grants access
    // -------------------------------------------------------------------------
    console.log('--- TEST I: Verify after subscription expiry, no reset grants access ---');
    const dateAfterExpiry = new Date('2027-04-07T00:00:00.000Z'); // 1 day after expiry
    const entAfterExpiry = await entitlementService.getBusinessEntitlement(testBusinessId, dateAfterExpiry);

    console.log(`  Status at 07/04/2027: ${entAfterExpiry.status}`);
    console.log(`  is_active:            ${entAfterExpiry.is_active}`);
    console.log(`  Exhaustion Reason:    ${entAfterExpiry.exhaustion_reason}`);
    console.log(`  QR Remaining:         ${entAfterExpiry.current_month_qr_remaining}`);
    console.log(`  AI Remaining:         ${entAfterExpiry.current_month_ai_remaining}`);

    const canUseQrPostExp = await entitlementService.canUseService(testBusinessId, 'qr_scan', dateAfterExpiry);
    const canUseAiPostExp = await entitlementService.canUseService(testBusinessId, 'ai_generation', dateAfterExpiry);

    console.log(`  canUseService('qr_scan') post-expiry: allowed=${canUseQrPostExp.allowed}, reason=${canUseQrPostExp.reason}`);
    console.log(`  canUseService('ai_generation') post-expiry: allowed=${canUseAiPostExp.allowed}, reason=${canUseAiPostExp.reason}`);

    if (canUseQrPostExp.allowed || canUseAiPostExp.allowed) {
      throw new Error('TEST I FAILED: Services are allowed after subscription expiry!');
    }
    if (entAfterExpiry.status !== 'expired' || entAfterExpiry.is_active) {
      throw new Error(`TEST I FAILED: Expected status='expired' and is_active=false, got status=${entAfterExpiry.status}, is_active=${entAfterExpiry.is_active}`);
    }
    console.log('✓ TEST I PASSED: After expiry, all service access is strictly blocked and no reset grants access\n');

    // -------------------------------------------------------------------------
    // TEST K: Refreshing/reloading produces the same authoritative result
    // -------------------------------------------------------------------------
    console.log('--- TEST K: Verify refreshing/reloading produces identical authoritative result ---');
    const reload1 = await entitlementService.getBusinessEntitlement(testBusinessId, datePeriod2);
    const reload2 = await entitlementService.getBusinessEntitlement(testBusinessId, datePeriod2);

    if (reload1.current_month_qr_used !== reload2.current_month_qr_used ||
        reload1.current_month_ai_used !== reload2.current_month_ai_used ||
        reload1.current_month_qr_remaining !== reload2.current_month_qr_remaining ||
        reload1.current_month_ai_remaining !== reload2.current_month_ai_remaining ||
        reload1.current_period_index !== reload2.current_period_index ||
        reload1.monthly_history?.length !== reload2.monthly_history?.length) {
      throw new Error('TEST K FAILED: Consecutive loads produced different states!');
    }
    console.log(`  Reload 1: Period ${reload1.current_period_index}, QR Used=${reload1.current_month_qr_used}, AI Used=${reload1.current_month_ai_used}, History=${reload1.monthly_history?.length}`);
    console.log(`  Reload 2: Period ${reload2.current_period_index}, QR Used=${reload2.current_month_qr_used}, AI Used=${reload2.current_month_ai_used}, History=${reload2.monthly_history?.length}`);
    console.log('✓ TEST K PASSED: Repeated reads are 100% idempotent and consistent\n');

    console.log('===============================================================');
    console.log('ALL STEP 3 VERIFICATION TESTS (A through L) PASSED WITH SUCCESS!');
    console.log('===============================================================');

  } catch (err: any) {
    console.error('\n❌ STEP 3 VERIFICATION FAILED:');
    console.error(err.message || err);
    process.exit(1);
  }
}

runStep3MonthlyResetVerification().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
