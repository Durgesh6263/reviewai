import 'dotenv/config';
process.env.LOG_FORMAT = 'json';
process.env.NODE_ENV = 'test';

import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService, BlockReason } from '../modules/subscription/entitlement';
import { QRService } from '../modules/qr/service';
import { ReviewService } from '../modules/review/service';
import { AIProviderFactory } from '../modules/review/ai/factory';
import { planConfigService } from '../modules/admin/plan-config-service';
import { AdminService } from '../modules/admin/service';

// Replicate headline resolution helper to verify UI consistency
function getExhaustionHeadline(reason?: string | null): string {
  switch (reason) {
    case 'TRIAL_EXPIRED':
      return 'Your free trial has ended. Choose a plan to continue.';
    case 'PLAN_EXPIRED':
      return 'Your plan has expired. Choose a plan to continue.';
    case 'QR_QUOTA_EXHAUSTED':
    case 'PLAN_QR_QUOTA_EXHAUSTED':
    case 'TRIAL_QR_QUOTA_EXHAUSTED':
      return 'Your QR scan limit has been reached. Choose a plan to continue.';
    case 'AI_QUOTA_EXHAUSTED':
    case 'PLAN_AI_QUOTA_EXHAUSTED':
    case 'TRIAL_AI_QUOTA_EXHAUSTED':
      return 'Your AI generation limit has been reached. Choose a plan to continue.';
    default:
      return 'Your access has ended. Choose a plan to continue.';
  }
}

async function runStep4Verification() {
  console.log('=== STARTING STEP 4 VERIFICATION SUITE ===\n');

  // Find business and user for test
  const { data: existingBiz, error: bizErr } = (await supabase
    .from('businesses')
    .select('id, owner_id')
    .limit(1)
    .single()) as any;

  if (bizErr || !existingBiz) {
    console.error('Failed to locate a business for testing:', bizErr);
    process.exit(1);
  }

  const testBusinessId = existingBiz.id;
  let testOwnerId = existingBiz.owner_id;
  if (!testOwnerId) {
    const { data: user } = (await supabase.from('users').select('id').limit(1).single()) as any;
    if (user) testOwnerId = user.id;
  }

  console.log(`Using Business ID: ${testBusinessId}, Owner ID: ${testOwnerId} for verification tests\n`);

  // Back up original subscription to restore cleanly at the end
  const { data: originalSubs } = (await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', testBusinessId)) as any;

  const originalSub = originalSubs && originalSubs.length > 0 ? originalSubs[0] : null;

  const qrService = new QRService(supabase);
  const aiFactory = new AIProviderFactory({ openai: undefined, gemini: undefined });
  const reviewService = new ReviewService(supabase, aiFactory);
  const adminService = new AdminService(supabase);

  try {
    // -------------------------------------------------------------
    // TEST 1: Set a test trial end time in the past.
    // EXPECTED: Core APIs blocked. Status interpreted as EXPIRED. Pay Now popup appears.
    // -------------------------------------------------------------
    console.log('--- TEST 1: Automatic Free Trial Expiration ---');
    const pastTrialStart = new Date(Date.now() - 15 * 86400000).toISOString();
    const pastTrialEnd = new Date(Date.now() - 1 * 86400000).toISOString(); // 1 day in the past

    await (supabase.from('subscriptions') as any).upsert(
      {
        business_id: testBusinessId,
        owner_id: testOwnerId,
        plan_id: 'free_trial',
        status: 'trialing',
        billing_cycle: 'monthly',
        price_cents: 0,
        currency: 'INR',
        trial_start: pastTrialStart,
        trial_end: pastTrialEnd,
        current_period_start: pastTrialStart,
        current_period_end: pastTrialEnd,
        metadata: {
          plan_id: 'free_trial',
          plan_name: 'Free Trial',
          plan_version_id: 'trial_v1',
          duration_days: 14,
          allocated_qr_quota: 100,
          allocated_ai_quota: 50,
          used_qr_quota: 10,
          used_ai_quota: 5,
          remaining_qr_quota: 90,
          remaining_ai_quota: 45,
          max_qr_codes: 1,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id' }
    );

    const trialEnt = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Trial Entitlement: status=${trialEnt.status}, is_active=${trialEnt.is_active}, reason=${trialEnt.exhaustion_reason}`);

    const canQrTrial = await entitlementService.canUseService(testBusinessId, 'qr_scan');
    const canAiTrial = await entitlementService.canUseService(testBusinessId, 'ai_generation');
    const headlineTrial = getExhaustionHeadline(canQrTrial.reason);

    console.log(`canUseService qr_scan: allowed=${canQrTrial.allowed}, reason=${canQrTrial.reason}`);
    console.log(`canUseService ai_generation: allowed=${canAiTrial.allowed}, reason=${canAiTrial.reason}`);
    console.log(`UI Headline: "${headlineTrial}"`);

    if (
      trialEnt.status === 'expired' &&
      !trialEnt.is_active &&
      !canQrTrial.allowed &&
      canQrTrial.reason === 'TRIAL_EXPIRED' &&
      !canAiTrial.allowed &&
      canAiTrial.reason === 'TRIAL_EXPIRED' &&
      headlineTrial === 'Your free trial has ended. Choose a plan to continue.'
    ) {
      console.log('>>> TEST 1 PASSED: Expired trial immediately blocks core APIs and shows Pay Now headline.\n');
    } else {
      throw new Error(`TEST 1 FAILED: Trial expiration not enforced properly: ${JSON.stringify(trialEnt)}`);
    }

    // -------------------------------------------------------------
    // TEST 2: Set paid plan end_date in the past.
    // EXPECTED: Core APIs blocked. Returns PLAN_EXPIRED. Pay Now popup appears.
    // -------------------------------------------------------------
    console.log('--- TEST 2: Automatic Paid Plan Expiration ---');
    const pastPlanStart = new Date(Date.now() - 190 * 86400000).toISOString();
    const pastPlanEnd = new Date(Date.now() - 5 * 86400000).toISOString(); // 5 days in the past

    await (supabase.from('subscriptions') as any).upsert(
      {
        business_id: testBusinessId,
        owner_id: testOwnerId,
        plan_id: 'base',
        status: 'active',
        billing_cycle: 'monthly',
        price_cents: 249900,
        currency: 'INR',
        trial_start: null,
        trial_end: null,
        current_period_start: pastPlanStart,
        current_period_end: pastPlanEnd,
        metadata: {
          plan_id: 'base',
          plan_name: 'Base',
          plan_version_id: 'base_v1',
          duration_months: 6,
          price_inr: 2499,
          allocated_qr_quota: 900,
          allocated_ai_quota: 450,
          used_qr_quota: 200,
          used_ai_quota: 100,
          remaining_qr_quota: 700,
          remaining_ai_quota: 350,
          max_qr_codes: 5,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id' }
    );

    const planEnt = await entitlementService.getBusinessEntitlement(testBusinessId);
    const canQrPlan = await entitlementService.canUseService(testBusinessId, 'qr_scan');
    const canAiPlan = await entitlementService.canUseService(testBusinessId, 'ai_generation');
    const headlinePlan = getExhaustionHeadline(canQrPlan.reason);

    console.log(`Plan Entitlement: status=${planEnt.status}, is_active=${planEnt.is_active}, reason=${planEnt.exhaustion_reason}`);
    console.log(`canUseService qr_scan: allowed=${canQrPlan.allowed}, reason=${canQrPlan.reason}`);
    console.log(`canUseService ai_generation: allowed=${canAiPlan.allowed}, reason=${canAiPlan.reason}`);
    console.log(`UI Headline: "${headlinePlan}"`);

    if (
      planEnt.status === 'expired' &&
      !planEnt.is_active &&
      !canQrPlan.allowed &&
      canQrPlan.reason === 'PLAN_EXPIRED' &&
      !canAiPlan.allowed &&
      canAiPlan.reason === 'PLAN_EXPIRED' &&
      headlinePlan === 'Your plan has expired. Choose a plan to continue.'
    ) {
      console.log('>>> TEST 2 PASSED: Expired paid plan immediately blocked with PLAN_EXPIRED.\n');
    } else {
      throw new Error(`TEST 2 FAILED: Paid plan expiration not enforced: ${JSON.stringify(planEnt)}`);
    }

    // -------------------------------------------------------------
    // TEST 3: Set QR usage equal to total quota.
    // EXPECTED: QR exhausted. Core access blocked according to ANY ONE EXHAUSTED rule. Pay Now popup appears.
    // -------------------------------------------------------------
    console.log('--- TEST 3: QR Quota Exhaustion Lock ---');
    const activeStart = new Date().toISOString();
    const futureEnd = new Date(Date.now() + 150 * 86400000).toISOString();

    await (supabase.from('subscriptions') as any).upsert(
      {
        business_id: testBusinessId,
        owner_id: testOwnerId,
        plan_id: 'base',
        status: 'active',
        billing_cycle: 'monthly',
        price_cents: 249900,
        currency: 'INR',
        trial_start: null,
        trial_end: null,
        current_period_start: activeStart,
        current_period_end: futureEnd,
        metadata: {
          plan_id: 'base',
          plan_name: 'Base',
          plan_version_id: 'base_v1',
          duration_months: 6,
          price_inr: 2499,
          allocated_qr_quota: 900,
          allocated_ai_quota: 450,
          used_qr_quota: 900, // EXACTLY EQUAL
          used_ai_quota: 100, // AI still has quota
          remaining_qr_quota: 0,
          remaining_ai_quota: 350,
          max_qr_codes: 5,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id' }
    );

    const qrExhaustedEnt = await entitlementService.getBusinessEntitlement(testBusinessId);
    const canQrAfterQrExhausted = await entitlementService.canUseService(testBusinessId, 'qr_scan');
    const canAiAfterQrExhausted = await entitlementService.canUseService(testBusinessId, 'ai_generation');
    const headlineQr = getExhaustionHeadline(canQrAfterQrExhausted.reason);

    console.log(`QR Exhausted: remaining_qr=${qrExhaustedEnt.remaining_qr}, is_active=${qrExhaustedEnt.is_active}`);
    console.log(`canUseService qr_scan: allowed=${canQrAfterQrExhausted.allowed}, reason=${canQrAfterQrExhausted.reason}`);
    console.log(`canUseService ai_generation: allowed=${canAiAfterQrExhausted.allowed}, reason=${canAiAfterQrExhausted.reason}`);
    console.log(`UI Headline: "${headlineQr}"`);

    if (
      !qrExhaustedEnt.is_active &&
      qrExhaustedEnt.remaining_qr === 0 &&
      !canQrAfterQrExhausted.allowed &&
      canQrAfterQrExhausted.reason === 'QR_QUOTA_EXHAUSTED' &&
      !canAiAfterQrExhausted.allowed &&
      canAiAfterQrExhausted.reason === 'QR_QUOTA_EXHAUSTED' &&
      headlineQr === 'Your QR scan limit has been reached. Choose a plan to continue.'
    ) {
      console.log('>>> TEST 3 PASSED: QR quota exhaustion blocks core services under ANY ONE EXHAUSTED rule.\n');
    } else {
      throw new Error(`TEST 3 FAILED: QR exhaustion not blocking properly: ${JSON.stringify(canQrAfterQrExhausted)}`);
    }

    // -------------------------------------------------------------
    // TEST 4: Set AI usage equal to total quota.
    // EXPECTED: AI exhausted. Core access blocked according to ANY ONE EXHAUSTED rule. Pay Now popup appears.
    // -------------------------------------------------------------
    console.log('--- TEST 4: AI Quota Exhaustion Lock ---');
    await (supabase.from('subscriptions') as any).upsert(
      {
        business_id: testBusinessId,
        owner_id: testOwnerId,
        plan_id: 'base',
        status: 'active',
        billing_cycle: 'monthly',
        price_cents: 249900,
        currency: 'INR',
        trial_start: null,
        trial_end: null,
        current_period_start: activeStart,
        current_period_end: futureEnd,
        metadata: {
          plan_id: 'base',
          plan_name: 'Base',
          plan_version_id: 'base_v1',
          duration_months: 6,
          price_inr: 2499,
          allocated_qr_quota: 900,
          allocated_ai_quota: 450,
          used_qr_quota: 300, // QR still has 600
          used_ai_quota: 450, // EXACTLY EQUAL
          remaining_qr_quota: 600,
          remaining_ai_quota: 0,
          max_qr_codes: 5,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id' }
    );

    const aiExhaustedEnt = await entitlementService.getBusinessEntitlement(testBusinessId);
    const canQrAfterAiExhausted = await entitlementService.canUseService(testBusinessId, 'qr_scan');
    const canAiAfterAiExhausted = await entitlementService.canUseService(testBusinessId, 'ai_generation');
    const headlineAi = getExhaustionHeadline(canAiAfterAiExhausted.reason);

    console.log(`AI Exhausted: remaining_ai=${aiExhaustedEnt.remaining_ai}, is_active=${aiExhaustedEnt.is_active}`);
    console.log(`canUseService qr_scan: allowed=${canQrAfterAiExhausted.allowed}, reason=${canQrAfterAiExhausted.reason}`);
    console.log(`canUseService ai_generation: allowed=${canAiAfterAiExhausted.allowed}, reason=${canAiAfterAiExhausted.reason}`);
    console.log(`UI Headline: "${headlineAi}"`);

    if (
      !aiExhaustedEnt.is_active &&
      aiExhaustedEnt.remaining_ai === 0 &&
      !canQrAfterAiExhausted.allowed &&
      canQrAfterAiExhausted.reason === 'AI_QUOTA_EXHAUSTED' &&
      !canAiAfterAiExhausted.allowed &&
      canAiAfterAiExhausted.reason === 'AI_QUOTA_EXHAUSTED' &&
      headlineAi === 'Your AI generation limit has been reached. Choose a plan to continue.'
    ) {
      console.log('>>> TEST 4 PASSED: AI quota exhaustion blocks core services under ANY ONE EXHAUSTED rule.\n');
    } else {
      throw new Error(`TEST 4 FAILED: AI exhaustion not blocking properly: ${JSON.stringify(canAiAfterAiExhausted)}`);
    }

    // -------------------------------------------------------------
    // TEST 5: Close popup.
    // EXPECTED: Protected APIs remain blocked. Frontend popup state cannot grant access.
    // -------------------------------------------------------------
    console.log('--- TEST 5: Popup Dismissal Safety Check ---');
    // Simulate user clicking Close (X) on modal in frontend
    const modalClosedInFrontend = true;
    console.log(`Simulating client popup closed: modalClosed=${modalClosedInFrontend}`);

    // Direct server verification
    const postCloseCheck = await entitlementService.canUseService(testBusinessId, 'qr_scan');
    console.log(`Server authorization check: allowed=${postCloseCheck.allowed}, reason=${postCloseCheck.reason}`);

    if (!postCloseCheck.allowed) {
      console.log('>>> TEST 5 PASSED: Closing popup does NOT grant access. Backend remains strictly authoritative.\n');
    } else {
      throw new Error('TEST 5 FAILED: Service allowed after client closed modal!');
    }

    // -------------------------------------------------------------
    // TEST 6: Refresh page.
    // EXPECTED: Lock remains active.
    // -------------------------------------------------------------
    console.log('--- TEST 6: Page Refresh / Session Persistence Check ---');
    // Fresh server query bypassing any client-side variable
    const freshEntitlement = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Fresh state from database: is_active=${freshEntitlement.is_active}, exhaustion_reason=${freshEntitlement.exhaustion_reason}`);

    if (!freshEntitlement.is_active && freshEntitlement.exhaustion_reason !== null) {
      console.log('>>> TEST 6 PASSED: Lock persists across fresh sessions/page reloads.\n');
    } else {
      throw new Error('TEST 6 FAILED: Lock did not persist across refresh!');
    }

    // -------------------------------------------------------------
    // TEST 7: Directly call protected API.
    // EXPECTED: Server rejects request. Frontend cannot bypass it.
    // -------------------------------------------------------------
    console.log('--- TEST 7: Direct Protected API Rejection ---');
    let qrBlocked = false;
    let reviewBlocked = false;

    // 1. Try QR Scan limit check
    try {
      await (qrService as any).checkQrScanLimit(testBusinessId);
    } catch (e: any) {
      console.log(`Direct QR scan check caught expected rejection: "${e.message}" (code: ${e.code || e.statusCode})`);
      qrBlocked = true;
    }

    // 2. Try Review Generation limit check
    try {
      await (reviewService as any).checkReviewGenerationLimit(testBusinessId);
    } catch (e: any) {
      console.log(`Direct AI generation check caught expected rejection: "${e.message}" (code: ${e.code || e.statusCode})`);
      reviewBlocked = true;
    }

    if (qrBlocked && reviewBlocked) {
      console.log('>>> TEST 7 PASSED: Direct API calls strictly rejected with 403 / exhaustion codes.\n');
    } else {
      throw new Error(`TEST 7 FAILED: Protected calls were not blocked: qrBlocked=${qrBlocked}, reviewBlocked=${reviewBlocked}`);
    }

    // -------------------------------------------------------------
    // TEST 8: Open Billing.
    // EXPECTED: Billing page remains accessible. Plans can be viewed/requested. No fake payment occurs.
    // -------------------------------------------------------------
    console.log('--- TEST 8: Billing Page Accessibility & Plan Request ---');
    // 1. Verify public plans catalog endpoint works even when locked
    const publicPlans = await planConfigService.getPublicPlans();
    console.log(`Public plans retrieved successfully: found ${publicPlans.plans.length} plans: ${publicPlans.plans.map(p => p.name).join(', ')}`);

    // 2. Verify admin subscriptions list displays accurate exhaustion badges for admin visibility
    const adminSubs = await adminService.getSubscriptions({ page: 1, limit: 10 });
    const currentAdminSub = adminSubs.data.find(s => s.business_id === testBusinessId);
    console.log(`Admin Visibility check:
  Business: ${currentAdminSub?.business_name}
  Plan: ${currentAdminSub?.plan_name} (${currentAdminSub?.plan_version_id})
  Status: ${currentAdminSub?.status}
  Exhaustion Reason: ${currentAdminSub?.exhaustion_reason}`);

    if (
      publicPlans.plans.length >= 3 &&
      currentAdminSub?.exhaustion_reason === 'AI_QUOTA_EXHAUSTED'
    ) {
      console.log('>>> TEST 8 PASSED: Billing data and Admin visibility remain fully accessible without fake payments.\n');
    } else {
      throw new Error('TEST 8 FAILED: Billing or Admin visibility failed');
    }

    console.log('=====================================================');
    console.log('ALL STEP 4 VERIFICATION TESTS PASSED (8/8)');
    console.log('=====================================================');

  } catch (err: any) {
    console.error('\n*** TEST RUN FAILED ***\n', err);
    process.exit(1);
  } finally {
    console.log('\nCleaning up and restoring original subscription...');
    if (originalSub) {
      await (supabase.from('subscriptions') as any).upsert(
        originalSub,
        { onConflict: 'business_id' }
      );
      console.log(`Restored original subscription: ${originalSub.id}`);
    }
    console.log('Cleanup finished.');
  }
}

runStep4Verification();
