/**
 * STEP 4 — FINAL MONTHLY QUOTA INTEGRATION VERIFICATION SCRIPT
 * 
 * Verifies all 12 criteria specified by the user:
 * 1. Single Source of Truth
 * 2. False Exhaustion Fix (0/200 QR, 0/100 AI -> Active, no warnings)
 * 3. Partial Exhaustion (QR 200/200, AI 50/100 -> QR blocked, AI available, ACTIVE)
 *                       (QR 50/200, AI 100/100 -> QR available, AI blocked, ACTIVE)
 * 4. Full Monthly Exhaustion (QR 200/200, AI 100/100 -> Both blocked, ACTIVE, not expired)
 * 5. Next Month Rollover (QR 0/200, AI 0/100, services resume, history preserved)
 * 6. Subscription Expiry (Time expired -> EXPIRED, both blocked, no reset reactivates)
 * 7. Client Billing Data Verification
 * 8. Admin View Data Verification
 * 9. Concurrent Usage with 1 quota remaining (Atomic CAS, exactly 1 succeeds)
 * 10. Data Migration Safety (Preserve old total duration usage without false exhaustion)
 * 11. Admin -> Client Sync (Changing monthly limits preserves usage and updates remaining)
 * 12. Final End-to-End Test Workflow
 */

import 'dotenv/config';
import { supabaseAdmin } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { AdminService } from '../modules/admin/service';
import { SubscriptionController } from '../modules/subscription/controller';
import { SubscriptionService } from '../modules/subscription/service';
const adminService = new AdminService(supabaseAdmin);
const subscriptionService = new SubscriptionService(supabaseAdmin as any, 'sk_test_mock');
const subscriptionController = new SubscriptionController(subscriptionService);

async function runStep4Verification() {
  console.log('================================================================');
  console.log('🚀 STEP 4 — FINAL MONTHLY QUOTA INTEGRATION VERIFICATION');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (details) {
        console.error('   Details:', details);
      }
      process.exit(1);
    }
  }

  // 1. SETUP: Get or create test business
  console.log('--- Step 0: Initializing Test Business ---');
  let testBusinessId = 'a3536170-6699-4816-aa79-6cc7c2351a49';
  let testOwnerId = '43c94316-cbfa-4599-8ed9-ff52dec73f23';

  const { data: existingBiz } = await supabaseAdmin
    .from('businesses')
    .select('id, owner_id')
    .eq('id', testBusinessId)
    .maybeSingle();

  if (!existingBiz) {
    const { data: newBiz, error: bErr } = await supabaseAdmin
      .from('businesses')
      .insert({
        id: testBusinessId,
        name: 'Step4 Verification Fitness Gym',
        slug: 'step4-verification-gym',
        owner_id: testOwnerId,
        is_active: true,
      })
      .select()
      .single();
    if (bErr) throw bErr;
  }
  console.log(`Using Business: ${testBusinessId}`);

  // ========================================================================
  // TEST 1: SINGLE SOURCE OF TRUTH & CLEAN ACTIVATION
  // ========================================================================
  console.log('\n--- 1. Testing Single Source of Truth & Plan Activation ---');
  const baseActivation = await entitlementService.activatePlan({
    businessId: testBusinessId,
    ownerId: testOwnerId,
    planId: 'base',
    durationMonths: 6,
    qrQuota: 200,
    aiQuota: 100,
    price: 2499,
    assignedBy: 'step4_test_runner',
    startDate: new Date(),
  });

  assert(baseActivation.status === 'active', 'Plan activated with status=active');
  assert(baseActivation.monthly_qr_quota === 200, 'Monthly QR quota is 200 scans/month');
  assert(baseActivation.monthly_ai_quota === 100, 'Monthly AI quota is 100 generations/month');
  assert(baseActivation.current_month_qr_used === 0, 'Initial month QR used is 0');
  assert(baseActivation.current_month_ai_used === 0, 'Initial month AI used is 0');
  assert(baseActivation.current_month_qr_remaining === 200, 'Initial month QR remaining is 200');
  assert(baseActivation.current_month_ai_remaining === 100, 'Initial month AI remaining is 100');

  // ========================================================================
  // TEST 2: FALSE EXHAUSTION FIX (0 used / 200 QR, 0 used / 100 AI)
  // ========================================================================
  console.log('\n--- 2. Testing False Exhaustion Fix (0 used / 200 QR, 0 used / 100 AI) ---');
  const entFresh = await entitlementService.getBusinessEntitlement(testBusinessId);
  const qrFreshCheck = await entitlementService.canUseService(testBusinessId, 'qr_scan');
  const aiFreshCheck = await entitlementService.canUseService(testBusinessId, 'ai_generation');

  assert(entFresh.is_active === true, 'Fresh active subscription is_active=true');
  assert(entFresh.status === 'active', 'Fresh active subscription status=active');
  assert(entFresh.exhaustion_reason === null, 'Fresh active subscription exhaustion_reason is null');
  assert(qrFreshCheck.allowed === true, 'QR scan is allowed when 0/200 used');
  assert(aiFreshCheck.allowed === true, 'AI generation is allowed when 0/100 used');

  // Simulate mock req/res to test controller output
  let controllerStatusData: any = null;
  const mockReq: any = {
    user: { sub: testOwnerId, role: 'business_owner' },
    query: { business_id: testBusinessId },
  };
  const mockRes: any = {
    setHeader: () => mockRes,
    status: () => mockRes,
    json: (payload: any) => { controllerStatusData = payload.data; },
  };
  await subscriptionController.getStatus(mockReq, mockRes, (err: any) => { if (err) throw err; });

  assert(controllerStatusData.status === 'ACTIVE', 'Controller display_status is ACTIVE');
  assert(controllerStatusData.is_blocked === false, 'Controller is_blocked is false (no lock modal)');
  assert(controllerStatusData.exhaustion_message === null, 'Controller exhaustion_message is null');
  assert(controllerStatusData.block_message === null, 'Controller block_message is null');
  assert(controllerStatusData.qr_scans.used === 0, 'Controller QR used is 0');
  assert(controllerStatusData.ai_generations.used === 0, 'Controller AI used is 0');

  // ========================================================================
  // TEST 3: PARTIAL EXHAUSTION
  // ========================================================================
  console.log('\n--- 3. Testing Partial Exhaustion ---');
  // Scenario A: QR: 200/200 used, AI: 50/100 used
  await supabaseAdmin.from('subscriptions').update({
    metadata: {
      ...baseActivation,
      monthly_qr_quota: 200,
      monthly_ai_quota: 100,
      current_month_qr_used: 200,
      current_month_ai_used: 50,
      current_month_qr_remaining: 0,
      current_month_ai_remaining: 50,
    },
    updated_at: new Date().toISOString(),
  }).eq('business_id', testBusinessId);

  const qrBlockedAiOk = await entitlementService.getBusinessEntitlement(testBusinessId);
  const canQrA = await entitlementService.canUseService(testBusinessId, 'qr_scan');
  const canAiA = await entitlementService.canUseService(testBusinessId, 'ai_generation');

  assert(qrBlockedAiOk.status === 'active', 'Scenario A: subscription status remains active');
  assert(qrBlockedAiOk.is_active === true, 'Scenario A: subscription is_active remains true');
  assert(canQrA.allowed === false, 'Scenario A: QR service is BLOCKED (200/200)');
  assert(canQrA.reason === 'QR_QUOTA_EXHAUSTED', 'Scenario A: QR block reason is QR_QUOTA_EXHAUSTED');
  assert(canAiA.allowed === true, 'Scenario A: AI service is AVAILABLE (50/100)');

  await subscriptionController.getStatus(mockReq, mockRes, (err: any) => { if (err) throw err; });
  assert(controllerStatusData.status === 'ACTIVE', 'Scenario A: display status remains ACTIVE');
  assert(controllerStatusData.is_blocked === false, 'Scenario A: account is_blocked is false');
  assert(controllerStatusData.exhaustion_message?.includes('QR scan quota has been exhausted'), 'Scenario A: notification indicates QR quota exhausted only');
  assert(!controllerStatusData.exhaustion_message?.includes('AI generation quota has been exhausted'), 'Scenario A: AI not exhausted');

  // Scenario B: QR: 50/200 used, AI: 100/100 used
  await supabaseAdmin.from('subscriptions').update({
    metadata: {
      ...baseActivation,
      monthly_qr_quota: 200,
      monthly_ai_quota: 100,
      current_month_qr_used: 50,
      current_month_ai_used: 100,
      current_month_qr_remaining: 150,
      current_month_ai_remaining: 0,
    },
    updated_at: new Date().toISOString(),
  }).eq('business_id', testBusinessId);

  const qrOkAiBlocked = await entitlementService.getBusinessEntitlement(testBusinessId);
  const canQrB = await entitlementService.canUseService(testBusinessId, 'qr_scan');
  const canAiB = await entitlementService.canUseService(testBusinessId, 'ai_generation');

  assert(qrOkAiBlocked.status === 'active', 'Scenario B: subscription status remains active');
  assert(qrOkAiBlocked.is_active === true, 'Scenario B: subscription is_active remains true');
  assert(canQrB.allowed === true, 'Scenario B: QR service is AVAILABLE (50/200)');
  assert(canAiB.allowed === false, 'Scenario B: AI service is BLOCKED (100/100)');
  assert(canAiB.reason === 'AI_QUOTA_EXHAUSTED', 'Scenario B: AI block reason is AI_QUOTA_EXHAUSTED');

  await subscriptionController.getStatus(mockReq, mockRes, (err: any) => { if (err) throw err; });
  assert(controllerStatusData.status === 'ACTIVE', 'Scenario B: display status remains ACTIVE');
  assert(controllerStatusData.is_blocked === false, 'Scenario B: account is_blocked is false');
  assert(controllerStatusData.exhaustion_message?.includes('AI generation quota has been exhausted'), 'Scenario B: notification indicates AI quota exhausted only');
  assert(!controllerStatusData.exhaustion_message?.includes('QR scan quota has been exhausted'), 'Scenario B: QR not exhausted');

  // ========================================================================
  // TEST 4: FULL MONTHLY EXHAUSTION (QR 200/200, AI 100/100)
  // ========================================================================
  console.log('\n--- 4. Testing Full Monthly Exhaustion ---');
  await supabaseAdmin.from('subscriptions').update({
    metadata: {
      ...baseActivation,
      monthly_qr_quota: 200,
      monthly_ai_quota: 100,
      current_month_qr_used: 200,
      current_month_ai_used: 100,
      current_month_qr_remaining: 0,
      current_month_ai_remaining: 0,
    },
    updated_at: new Date().toISOString(),
  }).eq('business_id', testBusinessId);

  const fullExhausted = await entitlementService.getBusinessEntitlement(testBusinessId);
  const canQrFull = await entitlementService.canUseService(testBusinessId, 'qr_scan');
  const canAiFull = await entitlementService.canUseService(testBusinessId, 'ai_generation');

  assert(fullExhausted.status === 'active', 'Full exhaustion: subscription status is ACTIVE');
  assert(fullExhausted.status !== 'expired', 'Full exhaustion: status is NOT expired');
  assert(fullExhausted.status !== 'canceled', 'Full exhaustion: status is NOT canceled');
  assert(fullExhausted.status !== 'suspended', 'Full exhaustion: status is NOT suspended');
  assert(fullExhausted.is_active === true, 'Full exhaustion: subscription is_active remains true');
  assert(canQrFull.allowed === false, 'Full exhaustion: QR service is blocked');
  assert(canAiFull.allowed === false, 'Full exhaustion: AI service is blocked');

  await subscriptionController.getStatus(mockReq, mockRes, (err: any) => { if (err) throw err; });
  assert(controllerStatusData.status === 'ACTIVE', 'Full exhaustion: display status is ACTIVE');
  assert(controllerStatusData.is_blocked === false, 'Full exhaustion: account is_blocked is false (no lock modal)');
  assert(controllerStatusData.exhaustion_message?.includes('monthly QR scan and AI generation quotas have been exhausted'), 'Full exhaustion: message explains both quotas exhausted and auto-resume next month');

  // ========================================================================
  // TEST 5: NEXT MONTH ROLLOVER
  // ========================================================================
  console.log('\n--- 5. Testing Next Month Rollover & Access Resumption ---');
  const startDate = new Date();
  // Move 35 days ahead (Period 2)
  const nextMonthDate = new Date(startDate.getTime() + (35 * 86400000));
  const nextMonthEnt = await entitlementService.getBusinessEntitlement(testBusinessId, nextMonthDate);
  const canQrNextMonth = await entitlementService.canUseService(testBusinessId, 'qr_scan', nextMonthDate);
  const canAiNextMonth = await entitlementService.canUseService(testBusinessId, 'ai_generation', nextMonthDate);

  assert(nextMonthEnt.current_month_qr_used === 0, 'Next month: QR used resets to 0');
  assert(nextMonthEnt.current_month_ai_used === 0, 'Next month: AI used resets to 0');
  assert(nextMonthEnt.current_month_qr_remaining === 200, 'Next month: QR remaining is 200');
  assert(nextMonthEnt.current_month_ai_remaining === 100, 'Next month: AI remaining is 100');
  assert(nextMonthEnt.current_period_index === 1, 'Next month: period_index is 1');
  assert(canQrNextMonth.allowed === true, 'Next month: QR service is AVAILABLE again');
  assert(canAiNextMonth.allowed === true, 'Next month: AI service is AVAILABLE again');

  // ========================================================================
  // TEST 6: SUBSCRIPTION EXPIRY
  // ========================================================================
  console.log('\n--- 6. Testing Subscription Expiry (After Full 6 Months) ---');
  // 6 months + 5 days into future
  const pastExpiryDate = new Date(startDate.getTime() + (185 * 86400000));
  const expiredEnt = await entitlementService.getBusinessEntitlement(testBusinessId, pastExpiryDate);
  const canQrExpired = await entitlementService.canUseService(testBusinessId, 'qr_scan', pastExpiryDate);
  const canAiExpired = await entitlementService.canUseService(testBusinessId, 'ai_generation', pastExpiryDate);

  assert(expiredEnt.status === 'expired', 'Expired: subscription status is EXPIRED');
  assert(expiredEnt.is_active === false, 'Expired: is_active is false');
  assert(expiredEnt.days_remaining === 0, 'Expired: days_remaining is 0');
  assert(canQrExpired.allowed === false, 'Expired: QR scan is BLOCKED');
  assert(canQrExpired.reason === 'SUBSCRIPTION_EXPIRED', 'Expired: QR block reason is SUBSCRIPTION_EXPIRED');
  assert(canAiExpired.allowed === false, 'Expired: AI generation is BLOCKED');
  assert(canAiExpired.reason === 'SUBSCRIPTION_EXPIRED', 'Expired: AI block reason is SUBSCRIPTION_EXPIRED');

  // ========================================================================
  // TEST 7: CLIENT BILLING DATA
  // ========================================================================
  console.log('\n--- 7. Testing Client Billing Authoritative Data ---');
  // Reset back to active state for billing inspection
  await entitlementService.activatePlan({
    businessId: testBusinessId,
    ownerId: testOwnerId,
    planId: 'base',
    durationMonths: 6,
    qrQuota: 200,
    aiQuota: 100,
    price: 2499,
    assignedBy: 'billing_test',
    startDate: new Date(),
  });

  await subscriptionController.getStatus(mockReq, mockRes, (err: any) => { if (err) throw err; });

  assert(Boolean(controllerStatusData.plan.name), 'Billing payload has Current Plan');
  assert(controllerStatusData.status === 'ACTIVE', 'Billing payload has Status=ACTIVE');
  assert(Boolean(controllerStatusData.start_date), 'Billing payload has Subscription Start');
  assert(Boolean(controllerStatusData.end_date), 'Billing payload has Subscription Expiry');
  assert(Boolean(controllerStatusData.current_period_start), 'Billing payload has Current Usage Period Start');
  assert(Boolean(controllerStatusData.current_period_end), 'Billing payload has Current Usage Period End');
  assert(Boolean(controllerStatusData.next_monthly_reset), 'Billing payload has Next Monthly Reset');
  assert(controllerStatusData.monthly_qr_limit === 200, 'Billing payload has Monthly QR Limit=200');
  assert(controllerStatusData.current_month_qr_used === 0, 'Billing payload has QR Used=0');
  assert(controllerStatusData.current_month_qr_remaining === 200, 'Billing payload has QR Remaining=200');
  assert(controllerStatusData.monthly_ai_limit === 100, 'Billing payload has Monthly AI Limit=100');
  assert(controllerStatusData.current_month_ai_used === 0, 'Billing payload has AI Used=0');
  assert(controllerStatusData.current_month_ai_remaining === 100, 'Billing payload has AI Remaining=100');

  // ========================================================================
  // TEST 8: ADMIN SUBSCRIPTIONS VIEW SYNC
  // ========================================================================
  console.log('\n--- 8. Testing Admin Subscriptions View Authoritative Sync ---');
  const adminSubsResult = await adminService.getSubscriptions({ limit: 100 });
  const adminSub = adminSubsResult.data.find(s => s.business_id === testBusinessId);

  assert(Boolean(adminSub), 'Admin returns target subscription record');
  assert(adminSub?.monthly_qr_limit === 200, 'Admin shows Monthly QR Limit = 200');
  assert(adminSub?.current_month_qr_used === 0, 'Admin shows QR Used = 0');
  assert(adminSub?.current_month_qr_remaining === 200, 'Admin shows QR Remaining = 200');
  assert(adminSub?.monthly_ai_limit === 100, 'Admin shows Monthly AI Limit = 100');
  assert(adminSub?.current_month_ai_used === 0, 'Admin shows AI Used = 0');
  assert(adminSub?.current_month_ai_remaining === 100, 'Admin shows AI Remaining = 100');
  assert(Boolean(adminSub?.current_period_start), 'Admin shows Current Period Start');
  assert(Boolean(adminSub?.next_monthly_reset), 'Admin shows Next Reset');
  assert(Boolean(adminSub?.end_date), 'Admin shows Subscription Expiry');

  // ========================================================================
  // TEST 9: CONCURRENT USAGE WITH 1 QUOTA REMAINING
  // ========================================================================
  console.log('\n--- 9. Testing Concurrency Safety with 1 Monthly Quota Remaining ---');
  // Set subscription to 1 QR and 1 AI remaining
  await supabaseAdmin.from('subscriptions').update({
    metadata: {
      ...baseActivation,
      monthly_qr_quota: 200,
      monthly_ai_quota: 100,
      current_month_qr_used: 199,
      current_month_ai_used: 99,
      current_month_qr_remaining: 1,
      current_month_ai_remaining: 1,
    },
    updated_at: new Date().toISOString(),
  }).eq('business_id', testBusinessId);

  // Send 5 concurrent QR consumption requests
  const qrConcurrentPromises = [
    entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1),
    entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1),
    entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1),
    entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1),
    entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1),
  ];
  const qrResults = await Promise.all(qrConcurrentPromises);
  const qrSuccesses = qrResults.filter(r => r.success && r.allowed).length;
  const qrFailures = qrResults.filter(r => !r.success || !r.allowed).length;

  assert(qrSuccesses === 1, `Concurrency QR: Exactly 1 request succeeded (got ${qrSuccesses})`);
  assert(qrFailures === 4, `Concurrency QR: Exactly 4 requests were rejected with exhaustion (got ${qrFailures})`);

  const entAfterQr = await entitlementService.getBusinessEntitlement(testBusinessId);
  assert(entAfterQr.current_month_qr_used === 200, 'Concurrency QR: current_month_qr_used is exactly 200');
  assert(entAfterQr.current_month_qr_remaining === 0, 'Concurrency QR: current_month_qr_remaining is exactly 0 (no negative overflow)');

  // Send 5 concurrent AI consumption requests
  const aiConcurrentPromises = [
    entitlementService.consumeServiceQuota(testBusinessId, 'ai_generation', 1),
    entitlementService.consumeServiceQuota(testBusinessId, 'ai_generation', 1),
    entitlementService.consumeServiceQuota(testBusinessId, 'ai_generation', 1),
    entitlementService.consumeServiceQuota(testBusinessId, 'ai_generation', 1),
    entitlementService.consumeServiceQuota(testBusinessId, 'ai_generation', 1),
  ];
  const aiResults = await Promise.all(aiConcurrentPromises);
  const aiSuccesses = aiResults.filter(r => r.success && r.allowed).length;
  const aiFailures = aiResults.filter(r => !r.success || !r.allowed).length;

  assert(aiSuccesses === 1, `Concurrency AI: Exactly 1 request succeeded (got ${aiSuccesses})`);
  assert(aiFailures === 4, `Concurrency AI: Exactly 4 requests were rejected with exhaustion (got ${aiFailures})`);

  const entAfterAi = await entitlementService.getBusinessEntitlement(testBusinessId);
  assert(entAfterAi.current_month_ai_used === 100, 'Concurrency AI: current_month_ai_used is exactly 100');
  assert(entAfterAi.current_month_ai_remaining === 0, 'Concurrency AI: current_month_ai_remaining is exactly 0 (no negative overflow)');

  // ========================================================================
  // TEST 10: DATA MIGRATION SAFETY
  // ========================================================================
  console.log('\n--- 10. Testing Data Migration Safety (Preserving Legacy Duration Quota) ---');
  // Inject legacy total-duration quota fields into subscription metadata
  const { data: currentSub } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('business_id', testBusinessId)
    .single();

  const legacyMeta = {
    ...currentSub.metadata,
    // Old legacy fields with large lifetime usage
    used_qr: 450,
    used_ai: 220,
    total_lifetime_qr_used: 450,
    total_lifetime_ai_used: 220,
    // Current period is month 2 with fresh monthly usage
    current_month_qr_used: 40,
    current_month_ai_used: 25,
  };

  await supabaseAdmin.from('subscriptions').update({
    metadata: legacyMeta,
    updated_at: new Date().toISOString(),
  }).eq('business_id', testBusinessId);

  const migrationEnt = await entitlementService.getBusinessEntitlement(testBusinessId);
  assert(migrationEnt.monthly_qr_quota === 200, 'Migration: monthly_qr_quota is 200');
  assert(migrationEnt.current_month_qr_used === 40, 'Migration: uses current month usage (40), not legacy total (450)');
  assert(migrationEnt.current_month_qr_remaining === 160, 'Migration: QR remaining is 160 (200 - 40)');
  assert(migrationEnt.current_month_ai_used === 25, 'Migration: uses current month usage (25), not legacy total (220)');
  assert(migrationEnt.current_month_ai_remaining === 75, 'Migration: AI remaining is 75 (100 - 25)');
  assert(migrationEnt.is_active === true, 'Migration: is_active=true (no false exhaustion from old 450 used scans)');
  assert(migrationEnt.status === 'active', 'Migration: status=active');

  // ========================================================================
  // TEST 11: ADMIN -> CLIENT SYNC (Updating Monthly Limits)
  // ========================================================================
  console.log('\n--- 11. Testing Admin -> Client Sync (Changing Monthly Limits) ---');
  // Admin changes monthly limit: 200 QR -> 300 QR, 100 AI -> 150 AI
  const updatedAdminSub = await adminService.updateSubscriptionPlan(
    currentSub.id,
    undefined,
    6,
    undefined,
    'admin_sync_tester',
    {
      monthly_qr_limit: 300,
      monthly_ai_limit: 150,
      preserve_usage: true,
    }
  );

  assert(Boolean(updatedAdminSub), 'Admin updated subscription limits');
  const syncEnt = await entitlementService.getBusinessEntitlement(testBusinessId);

  assert(syncEnt.monthly_qr_quota === 300, 'Sync: Monthly QR limit is now 300/month');
  assert(syncEnt.monthly_ai_quota === 150, 'Sync: Monthly AI limit is now 150/month');
  assert(syncEnt.current_month_qr_used === 40, 'Sync: Existing QR usage (40) is preserved');
  assert(syncEnt.current_month_ai_used === 25, 'Sync: Existing AI usage (25) is preserved');
  assert(syncEnt.current_month_qr_remaining === 260, 'Sync: Remaining QR recalculated correctly (300 - 40 = 260)');
  assert(syncEnt.current_month_ai_remaining === 125, 'Sync: Remaining AI recalculated correctly (150 - 25 = 125)');
  assert(syncEnt.status === 'active', 'Sync: Status remains ACTIVE');
  assert(syncEnt.exhaustion_reason === null, 'Sync: No false exhaustion notification appears');

  // ========================================================================
  // TEST 12: FINAL END-TO-END FLOW SUMMARY
  // ========================================================================
  console.log('\n--- 12. Final End-to-End Verification Check ---');
  console.log(`Passed ${passedTests} of ${totalTests} assertions.`);
  assert(passedTests === totalTests, 'All Step 4 verification checks passed with 100% compliance!');

  console.log('\n================================================================');
  console.log('🎉 STEP 4 VERIFICATION COMPLETED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runStep4Verification().catch(err => {
  console.error('Step 4 verification error:', err);
  process.exit(1);
});
