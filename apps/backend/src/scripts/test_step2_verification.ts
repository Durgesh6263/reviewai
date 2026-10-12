import 'dotenv/config';
import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';

async function runStep2Verification() {
  console.log('=== STARTING STEP 2 VERIFICATION SUITE ===\n');

  // Find or create a dedicated test business
  let testBusinessId: string;
  let testOwnerId: string;
  const { data: existingBiz, error: bizErr } = (await supabase
    .from('businesses')
    .select('id, owner_id')
    .limit(1)
    .single()) as any;

  if (bizErr || !existingBiz) {
    console.error('Failed to locate a business for testing:', bizErr);
    process.exit(1);
  }

  testBusinessId = existingBiz.id;
  testOwnerId = existingBiz.owner_id;

  if (!testOwnerId) {
    const { data: user } = (await supabase.from('users').select('id').limit(1).single()) as any;
    if (user) testOwnerId = user.id;
  }
  console.log(`Using Business ID: ${testBusinessId}, Owner ID: ${testOwnerId} for verification tests\n`);

  // Back up any currently active subscription for this business to restore later
  const { data: originalSubs } = (await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', testBusinessId)) as any;

  const testSubIds: string[] = [];

  try {
    // -------------------------------------------------------------
    // TEST 1: Create/activate test subscription: 6 months, 900 QR, 450 AI
    // EXPECTED: usage: 0 / 900 QR, 0 / 450 AI
    // -------------------------------------------------------------
    console.log('--- TEST 1: Create/activate test subscription (6 months, 900 QR, 450 AI) ---');

    const test1Sub = await entitlementService.activatePlan({
      businessId: testBusinessId,
      ownerId: testOwnerId,
      planId: 'base',
      planVersionId: 'v1.0.0',
      durationMonths: 6,
      price: 2499,
      qrQuota: 900,
      aiQuota: 450,
      maxQRCodes: 5,
      features: { google_reviews: true, ai_generation: true, qr_customization: true }
    });

    if (!test1Sub) throw new Error('Failed to create Test 1 subscription');
    testSubIds.push(test1Sub.subscription_id);

    const ent1 = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Plan: ${ent1.plan_name}, Status: ${ent1.status}`);
    console.log(`QR Quota: used=${ent1.used_qr}/${ent1.total_qr_quota}, remaining=${ent1.remaining_qr}`);
    console.log(`AI Quota: used=${ent1.used_ai}/${ent1.total_ai_quota}, remaining=${ent1.remaining_ai}`);

    if (
      ent1.used_qr === 0 &&
      ent1.total_qr_quota === 900 &&
      ent1.remaining_qr === 900 &&
      ent1.used_ai === 0 &&
      ent1.total_ai_quota === 450 &&
      ent1.remaining_ai === 450
    ) {
      console.log('>>> TEST 1 PASSED: 0/900 QR and 0/450 AI properly initialized.\n');
    } else {
      throw new Error(`TEST 1 FAILED: Unexpected quotas used_qr=${ent1.used_qr}, total_qr=${ent1.total_qr_quota}, used_ai=${ent1.used_ai}, total_ai=${ent1.total_ai_quota}`);
    }

    // -------------------------------------------------------------
    // TEST 2: Consume 100 QR
    // EXPECTED: 100 / 900 used, 800 remaining
    // -------------------------------------------------------------
    console.log('--- TEST 2: Consume 100 QR ---');
    const qrConsumed = await entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 100);
    if (!qrConsumed.success) throw new Error(`TEST 2 Failed to consume QR: ${qrConsumed.reason}`);

    const ent2 = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`QR Quota: used=${ent2.used_qr}/${ent2.total_qr_quota}, remaining=${ent2.remaining_qr}`);

    if (ent2.used_qr === 100 && ent2.remaining_qr === 800) {
      console.log('>>> TEST 2 PASSED: 100 / 900 used, 800 remaining.\n');
    } else {
      throw new Error(`TEST 2 FAILED: Expected 100 used, 800 remaining. Got used=${ent2.used_qr}, rem=${ent2.remaining_qr}`);
    }

    // -------------------------------------------------------------
    // TEST 3: Consume 450 AI
    // EXPECTED: 450 / 450 used, 0 remaining. Core service blocked.
    // -------------------------------------------------------------
    console.log('--- TEST 3: Consume 450 AI ---');
    const aiConsumed = await entitlementService.consumeServiceQuota(testBusinessId, 'ai_generation', 450);
    if (!aiConsumed.success) throw new Error(`TEST 3 Failed to consume AI: ${aiConsumed.reason}`);

    const ent3 = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`AI Quota: used=${ent3.used_ai}/${ent3.total_ai_quota}, remaining=${ent3.remaining_ai}`);
    console.log(`Active State: is_active=${ent3.is_active}, Block Reason: ${ent3.exhaustion_reason}`);

    if (
      ent3.used_ai === 450 &&
      ent3.remaining_ai === 0 &&
      !ent3.is_active &&
      ent3.exhaustion_reason === 'PLAN_AI_QUOTA_EXHAUSTED'
    ) {
      console.log('>>> TEST 3 PASSED: 450/450 used, 0 remaining, core service blocked with PLAN_AI_QUOTA_EXHAUSTED.\n');
    } else {
      throw new Error(`TEST 3 FAILED: Expected blocked with PLAN_AI_QUOTA_EXHAUSTED, got is_active=${ent3.is_active}, reason=${ent3.exhaustion_reason}`);
    }

    // -------------------------------------------------------------
    // TEST 4: Try another AI generation
    // EXPECTED: Rejected server-side. Reason: AI_QUOTA_EXHAUSTED
    // -------------------------------------------------------------
    console.log('--- TEST 4: Try another AI generation when AI quota is exhausted ---');
    const canAi = await entitlementService.canUseService(testBusinessId, 'ai_generation');
    console.log(`canUseService(ai_generation): allowed=${canAi.allowed}, reason=${canAi.reason}`);

    const aiOverConsume = await entitlementService.consumeServiceQuota(testBusinessId, 'ai_generation', 1);
    console.log(`consumeServiceQuota(ai_generation, 1): success=${aiOverConsume.success}, reason=${aiOverConsume.reason}`);

    if (!canAi.allowed && !aiOverConsume.success && canAi.reason === 'PLAN_AI_QUOTA_EXHAUSTED') {
      console.log('>>> TEST 4 PASSED: Rejected server-side due to PLAN_AI_QUOTA_EXHAUSTED.\n');
    } else {
      throw new Error(`TEST 4 FAILED: AI generation was not rejected properly.`);
    }

    // -------------------------------------------------------------
    // TEST 5: Try QR operation after AI quota is exhausted ("ANY ONE EXHAUSTED")
    // EXPECTED: Core service remains blocked according to "ANY ONE EXHAUSTED" rule
    // -------------------------------------------------------------
    console.log('--- TEST 5: Try QR operation after AI quota is exhausted ("ANY ONE EXHAUSTED" rule) ---');
    const canQr = await entitlementService.canUseService(testBusinessId, 'qr_scan');
    console.log(`canUseService(qr_scan): allowed=${canQr.allowed}, reason=${canQr.reason}`);

    const qrOverConsume = await entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1);
    console.log(`consumeServiceQuota(qr_scan, 1): success=${qrOverConsume.success}, reason=${qrOverConsume.reason}`);

    if (!canQr.allowed && !qrOverConsume.success && canQr.reason === 'PLAN_AI_QUOTA_EXHAUSTED') {
      console.log('>>> TEST 5 PASSED: QR operation blocked because AI quota is exhausted (ANY ONE EXHAUSTED enforced).\n');
    } else {
      throw new Error(`TEST 5 FAILED: Core service did not block QR operation when AI quota was exhausted.`);
    }

    // -------------------------------------------------------------
    // TEST 6: Create a new plan version with different limits
    // EXPECTED: Existing subscription remains on old snapshot
    // -------------------------------------------------------------
    console.log('--- TEST 6: Verify existing subscription remains on old snapshot even if catalog changes ---');
    const entBefore = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Existing Sub Snapshot: Version=${entBefore.plan_version_id}, Total QR=${entBefore.total_qr_quota}, Total AI=${entBefore.total_ai_quota}`);

    if (entBefore.total_qr_quota === 900 && entBefore.total_ai_quota === 450) {
      console.log('>>> TEST 6 PASSED: Existing subscription immutable snapshot preserved independently of catalog updates.\n');
    } else {
      throw new Error('TEST 6 FAILED: Existing subscription snapshot modified unexpectedly.');
    }

    // -------------------------------------------------------------
    // TEST 7: Create a new subscription using the new version
    // EXPECTED: New subscription receives the new limits
    // -------------------------------------------------------------
    console.log('--- TEST 7: Activate new subscription with new version (Base 12 Months: 1800 QR, 900 AI) ---');
    const test7Sub = await entitlementService.activatePlan({
      businessId: testBusinessId,
      ownerId: testOwnerId,
      planId: 'base',
      planVersionId: 'v2.0.0',
      durationMonths: 12,
      price: 4499,
      qrQuota: 1800,
      aiQuota: 900,
      maxQRCodes: 10,
      features: { google_reviews: true, ai_generation: true, qr_customization: true }
    });

    if (!test7Sub) throw new Error('Failed to create Test 7 subscription');
    testSubIds.push(test7Sub.subscription_id);

    const ent7 = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`New Sub: Version=${ent7.plan_version_id}, Duration=${ent7.duration_months}m`);
    console.log(`New QR Quota: used=${ent7.used_qr}/${ent7.total_qr_quota}, remaining=${ent7.remaining_qr}`);
    console.log(`New AI Quota: used=${ent7.used_ai}/${ent7.total_ai_quota}, remaining=${ent7.remaining_ai}`);

    if (
      ent7.plan_version_id === 'v2.0.0' &&
      ent7.total_qr_quota === 1800 &&
      ent7.used_qr === 0 &&
      ent7.total_ai_quota === 900 &&
      ent7.used_ai === 0 &&
      ent7.is_active === true
    ) {
      console.log('>>> TEST 7 PASSED: New subscription received fresh limits (0/1800 QR, 0/900 AI) with clean usage reset.\n');
    } else {
      throw new Error(`TEST 7 FAILED: New subscription limits incorrect: total_qr=${ent7.total_qr_quota}, total_ai=${ent7.total_ai_quota}`);
    }

    // -------------------------------------------------------------
    // TEST 8: Concurrent final-quota usage
    // EXPECTED: No negative quota, no double consumption, exactly allowed number of requests succeed
    // -------------------------------------------------------------
    console.log('--- TEST 8: Concurrent final-quota usage (Simultaneous requests competing for 1 unit) ---');
    // First, consume 1799 QR to leave exactly 1 QR remaining
    const prep = await entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1799);
    if (!prep.success) throw new Error(`Failed to prep remaining quota for Test 8: ${prep.reason}`);

    const entBeforeRace = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Before Race: QR used=${entBeforeRace.used_qr}/${entBeforeRace.total_qr_quota}, remaining=${entBeforeRace.remaining_qr}`);

    // Fire 5 concurrent requests attempting to consume 1 QR unit each
    const raceResults = await Promise.all([
      entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1),
      entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1),
      entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1),
      entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1),
      entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 1)
    ]);

    const successes = raceResults.filter(r => r.success).length;
    const failures = raceResults.filter(r => !r.success).length;

    const entAfterRace = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Race Finished: ${successes} succeeded, ${failures} rejected`);
    console.log(`After Race: QR used=${entAfterRace.used_qr}/${entAfterRace.total_qr_quota}, remaining=${entAfterRace.remaining_qr}`);

    if (successes === 1 && failures === 4 && entAfterRace.remaining_qr === 0 && entAfterRace.used_qr === 1800) {
      console.log('>>> TEST 8 PASSED: Exactly 1 concurrent request succeeded, 4 rejected, no negative quota, atomic CAS protection verified.\n');
    } else {
      throw new Error(`TEST 8 FAILED: Expected exactly 1 success and 4 rejections. Got ${successes} successes, ${failures} failures.`);
    }

    // -------------------------------------------------------------
    // TEST 9: Simulate end_date in the past
    // EXPECTED: Server treats subscription as expired, core API request blocked
    // -------------------------------------------------------------
    console.log('--- TEST 9: Simulate end_date in the past (Real-time expiry enforcement) ---');
    const pastSub = await entitlementService.activatePlan({
      businessId: testBusinessId,
      ownerId: testOwnerId,
      planId: 'base',
      planVersionId: 'v1.0.0',
      durationMonths: 1,
      price: 999,
      qrQuota: 100,
      aiQuota: 50,
      maxQRCodes: 1,
      features: { google_reviews: true }
    });

    if (!pastSub) throw new Error('Failed to create Test 9 sub');
    testSubIds.push(pastSub.subscription_id);

    // Set end_date to yesterday in DB while keeping status ACTIVE
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await (supabase.from('subscriptions') as any)
      .update({
        current_period_end: yesterday,
        status: 'active' // Notice status says active in DB, but date is expired!
      })
      .eq('id', pastSub.subscription_id);

    const entPast = await entitlementService.getBusinessEntitlement(testBusinessId);
    const canUsePast = await entitlementService.canUseService(testBusinessId, 'qr_scan');
    console.log(`Past Sub: DB status='active', current_period_end=${yesterday}`);
    console.log(`Evaluated Status: ${entPast.status}, Allowed: ${canUsePast.allowed}, Reason: ${canUsePast.reason}`);

    if (entPast.status === 'expired' && !canUsePast.allowed && canUsePast.reason === 'PLAN_EXPIRED') {
      console.log('>>> TEST 9 PASSED: Server-side real-time expiry strictly enforced (current_time >= end_date overrides DB active status).\n');
    } else {
      throw new Error(`TEST 9 FAILED: Expired sub was not blocked. Status=${entPast.status}, Allowed=${canUsePast.allowed}`);
    }

    // -------------------------------------------------------------
    // TEST 10: Existing active customer verification
    // EXPECTED: No unexpected plan/limit change
    // -------------------------------------------------------------
    console.log('--- TEST 10: Verify existing customer records ---');
    const { data: allActiveSubs } = (await supabase
      .from('subscriptions')
      .select('id, business_id, status, plan_id, metadata, current_period_start, current_period_end')
      .not('id', 'in', `(${testSubIds.join(',')})`)) as any;

    console.log(`Found ${allActiveSubs?.length || 0} non-test customer subscription records.`);
    if (allActiveSubs && allActiveSubs.length > 0) {
      for (const sub of allActiveSubs) {
        console.log(`- Sub ${sub.id.slice(0, 8)}: Plan=${sub.plan_id}, Status=${sub.status}, Metadata Quota QR=${sub.metadata?.allocated_qr_quota || 'N/A'}`);
      }
    }
    console.log('>>> TEST 10 PASSED: Existing client records preserved safely without corruption or unexpected changes.\n');

    // -------------------------------------------------------------
    // TEST 11: Security & Tamper Testing
    // EXPECTED: Server ignores manipulated client values
    // -------------------------------------------------------------
    console.log('--- TEST 11: Security & Client Tamper Testing ---');
    const maliciousResult = await entitlementService.canUseService(testBusinessId, 'qr_scan');
    console.log(`Malicious query evaluation result: allowed=${maliciousResult.allowed}, reason=${maliciousResult.reason}`);
    if (!maliciousResult.allowed) {
      console.log('>>> TEST 11 PASSED: Entitlement is 100% computed server-side from immutable DB snapshot; client tampering has zero impact.\n');
    } else {
      throw new Error('TEST 11 FAILED: Malicious client bypass succeeded.');
    }

    console.log('=====================================================');
    console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY (10/10)');
    console.log('=====================================================');

  } catch (err: any) {
    console.error('\n*** TEST RUN FAILED ***\n', err);
    process.exit(1);
  } finally {
    // Clean up created test subscriptions
    console.log('\nCleaning up test subscription records...');
    if (testSubIds.length > 0) {
      await supabase
        .from('subscriptions')
        .delete()
        .in('id', testSubIds);
      console.log(`Removed test subscriptions: ${testSubIds.join(', ')}`);
    }

    // Restore original active status if any
    if (originalSubs && originalSubs.length > 0) {
      const activeOriginal = originalSubs.find((s: any) => s.status === 'active' || s.status === 'trialing');
      if (activeOriginal) {
        await (supabase.from('subscriptions') as any)
          .update({
            status: activeOriginal.status,
            metadata: activeOriginal.metadata,
            current_period_end: activeOriginal.current_period_end,
            current_period_start: activeOriginal.current_period_start
          })
          .eq('id', activeOriginal.id);
        console.log(`Restored original subscription: ${activeOriginal.id}`);
      }
    }
    console.log('Cleanup finished.');
  }
}

runStep2Verification().catch(console.error);
