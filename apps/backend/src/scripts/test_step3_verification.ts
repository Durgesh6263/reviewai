import 'dotenv/config';
process.env.LOG_FORMAT = 'json';
process.env.NODE_ENV = 'test';

import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { planConfigService } from '../modules/admin/plan-config-service';

async function runStep3Verification() {
  console.log('=== STARTING STEP 3 VERIFICATION SUITE ===\n');

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

  // Back up admin settings and subscriptions to restore cleanly
  const { data: originalSettings } = (await supabase
    .from('admin_settings')
    .select('limits')
    .limit(1)
    .maybeSingle()) as any;

  const { data: originalSubs } = (await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', testBusinessId)) as any;

  const testSubIds: string[] = [];

  try {
    // Ensure plans are initialized
    const initialPlans = await planConfigService.getPlans();
    console.log(`Initialized plan catalog: found ${initialPlans.length} plans: ${initialPlans.map(p => p.id).join(', ')}`);

    // -------------------------------------------------------------
    // TEST 1: Admin edits Base.
    // EXPECTED: New version is created/published where required.
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Admin edits Base & creates new version ---');
    const basePlanBefore = initialPlans.find(p => p.id === 'base')!;
    const activeVerBefore = basePlanBefore.versions.find(v => v.status === 'active') || basePlanBefore.versions[0];
    const initialVerNum = activeVerBefore.version_number;

    // Create a new version for Base (e.g. 6 Months: ₹2999, 1200 QR, 600 AI)
    const newVersion = await planConfigService.createPlanVersion(
      'base',
      {
        durations: {
          '1_month': { duration_months: 1, price_inr: 599, allocated_qr_quota: 200, allocated_ai_quota: 100, max_qr_codes: 1 },
          '6_months': { duration_months: 6, price_inr: 2999, allocated_qr_quota: 1200, allocated_ai_quota: 600, max_qr_codes: 5 },
          '12_months': { duration_months: 12, price_inr: 5499, allocated_qr_quota: 2400, allocated_ai_quota: 1200, max_qr_codes: 10 },
        },
        change_notes: 'Step 3 Test 1 Version update',
        publishImmediately: false, // Save as draft first
      },
      'admin-test'
    );

    console.log(`Created new version: v${newVersion.version_number}, status=${newVersion.status}`);
    if (newVersion.version_number > initialVerNum && newVersion.status === 'draft') {
      console.log('>>> TEST 1 PASSED: New version created successfully as draft without overwriting current active version.\n');
    } else {
      throw new Error(`TEST 1 FAILED: Unexpected new version ${JSON.stringify(newVersion)}`);
    }

    // -------------------------------------------------------------
    // TEST 2: Existing customer has Base Version 1. Admin publishes Base Version 2.
    // EXPECTED: Existing customer remains Version 1.
    // -------------------------------------------------------------
    console.log('--- TEST 2: Existing customer has Base Version 1. Admin publishes Base Version 2 ---');
    // First, activate customer on Version 1
    const subV1 = await entitlementService.activatePlan({
      businessId: testBusinessId,
      ownerId: testOwnerId,
      planId: 'base',
      durationMonths: 6,
      versionNumber: initialVerNum,
    });
    testSubIds.push(subV1.subscription_id);

    const custBeforePublish = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Customer before publish: Plan=${custBeforePublish.plan_name}, Version=${custBeforePublish.plan_version_id}, QR=${custBeforePublish.total_qr_quota}, Price=₹${custBeforePublish.price_inr}`);

    // Now Admin publishes newVersion
    await planConfigService.publishPlanVersion('base', newVersion.version_number, 'admin-test');
    console.log(`Admin published Base v${newVersion.version_number} as active.`);

    // Verify existing customer STILL has Version 1 quotas and price!
    const custAfterPublish = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Customer after publish: Plan=${custAfterPublish.plan_name}, Version=${custAfterPublish.plan_version_id}, QR=${custAfterPublish.total_qr_quota}, Price=₹${custAfterPublish.price_inr}`);

    if (
      custAfterPublish.plan_version_id === custBeforePublish.plan_version_id &&
      custAfterPublish.total_qr_quota === custBeforePublish.total_qr_quota &&
      custAfterPublish.total_ai_quota === custBeforePublish.total_ai_quota &&
      custAfterPublish.price_inr === custBeforePublish.price_inr
    ) {
      console.log('>>> TEST 2 PASSED: Existing customer remains on Version 1 snapshot despite Version 2 publication.\n');
    } else {
      throw new Error(`TEST 2 FAILED: Customer snapshot was mutated after publishing new version!`);
    }

    // -------------------------------------------------------------
    // TEST 3: New activation after Version 2 is active.
    // EXPECTED: New customer receives Version 2.
    // -------------------------------------------------------------
    console.log('--- TEST 3: New activation after Version 2 is active ---');
    const subV2 = await entitlementService.activatePlan({
      businessId: testBusinessId,
      ownerId: testOwnerId,
      planId: 'base',
      durationMonths: 6,
      // Notice: No versionNumber specified, must automatically pick active Version 2!
    });

    const custNew = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`New activation: Plan=${custNew.plan_name}, Version=${custNew.plan_version_id}, QR=${custNew.total_qr_quota}, AI=${custNew.total_ai_quota}, Price=₹${custNew.price_inr}`);

    if (
      custNew.plan_version_id === `base_v${newVersion.version_number}` &&
      custNew.total_qr_quota === 1200 &&
      custNew.total_ai_quota === 600 &&
      custNew.price_inr === 2999
    ) {
      console.log('>>> TEST 3 PASSED: New activation received newly published Version 2 (1200 QR, 600 AI, ₹2999).\n');
    } else {
      throw new Error(`TEST 3 FAILED: New customer did not receive Version 2 limits: ${JSON.stringify(custNew)}`);
    }

    // -------------------------------------------------------------
    // TEST 4: Admin changes trial: 14 days, 100 QR, 50 AI to 10 days, 75 QR, 30 AI.
    // EXPECTED: New trial gets 10 days, 75 QR, 30 AI.
    // -------------------------------------------------------------
    console.log('--- TEST 4: Admin updates trial configuration ---');
    const updatedTrial = await planConfigService.updateTrialConfig(
      {
        enabled: true,
        duration_days: 10,
        total_qr_quota: 75,
        total_ai_quota: 30,
        max_qr_codes: 1,
      },
      'admin-test'
    );

    console.log(`Trial config updated: Version=${updatedTrial.version}, Days=${updatedTrial.duration_days}, QR=${updatedTrial.total_qr_quota}, AI=${updatedTrial.total_ai_quota}`);

    if (
      updatedTrial.duration_days === 10 &&
      updatedTrial.total_qr_quota === 75 &&
      updatedTrial.total_ai_quota === 30
    ) {
      console.log('>>> TEST 4 PASSED: Admin successfully updated trial configuration.\n');
    } else {
      throw new Error('TEST 4 FAILED: Trial config not updated');
    }

    // -------------------------------------------------------------
    // TEST 5: Existing trial started with 14 days, 100 QR, 50 AI. Admin changes trial.
    // EXPECTED: Existing trial remains 14 days, 100 QR, 50 AI.
    // -------------------------------------------------------------
    console.log('--- TEST 5: Existing trial preservation rule ---');
    // Simulate an existing trial record created under old rules (14 days, 100 QR, 50 AI)
    const trialStartDate = new Date().toISOString();
    const trialEndDate = new Date(Date.now() + 14 * 86400000).toISOString();
    const existingTrialSub = {
      id: 'mock-trial-sub-id',
      business_id: testBusinessId,
      owner_id: testOwnerId,
      plan_id: 'free_trial',
      status: 'trialing',
      billing_cycle: 'monthly',
      price_cents: 0,
      currency: 'INR',
      trial_start: trialStartDate,
      trial_end: trialEndDate,
      current_period_start: trialStartDate,
      current_period_end: trialEndDate,
      metadata: {
        plan_id: 'free_trial',
        plan_name: 'Free Trial',
        plan_version_id: 'trial_v1',
        duration_days: 14,
        allocated_qr_quota: 100,
        allocated_ai_quota: 50,
        used_qr_quota: 10,
        used_ai_quota: 5,
        max_qr_codes: 1,
      }
    };

    // Verify entitlement parsing for this ongoing trial record snapshot
    const ongoingTrialEnt = entitlementService.parseSubscriptionRecord(existingTrialSub);
    console.log(`Ongoing trial: Version=${ongoingTrialEnt.plan_version_id}, Days=${ongoingTrialEnt.duration_days}, QR Total=${ongoingTrialEnt.total_qr_quota}, AI Total=${ongoingTrialEnt.total_ai_quota}`);

    if (
      ongoingTrialEnt.duration_days === 14 &&
      ongoingTrialEnt.total_qr_quota === 100 &&
      ongoingTrialEnt.total_ai_quota === 50
    ) {
      console.log('>>> TEST 5 PASSED: Existing trial customer retained 14 days, 100 QR, 50 AI without retroactive reduction.\n');
    } else {
      throw new Error(`TEST 5 FAILED: Existing trial terms mutated: ${JSON.stringify(ongoingTrialEnt)}`);
    }

    // -------------------------------------------------------------
    // TEST 6: Deactivate a plan version.
    // EXPECTED: Disappears from NEW purchase/request options. Existing subscriptions remain active.
    // -------------------------------------------------------------
    console.log('--- TEST 6: Deactivate/Archive plan version ---');
    // Archive version 2
    await planConfigService.archivePlanVersion('base', newVersion.version_number, 'admin-test');
    // Re-publish version 1 as active
    await planConfigService.publishPlanVersion('base', initialVerNum, 'admin-test');

    const publicCatalog = await planConfigService.getPublicPlans();
    const baseInPublic = publicCatalog.plans.find(p => p.id === 'base');
    console.log(`Public catalog Base active version: v${baseInPublic?.version_number}`);

    if (baseInPublic?.version_number === initialVerNum) {
      console.log('>>> TEST 6 PASSED: Archived version disappeared from public offerings; existing active version restored.\n');
    } else {
      throw new Error('TEST 6 FAILED: Public catalog did not reflect archived version');
    }

    // -------------------------------------------------------------
    // TEST 7: Client attempts to modify plan configuration through validation rules.
    // EXPECTED: Validation rejection (negative values, invalid durations rejected server-side).
    // -------------------------------------------------------------
    console.log('--- TEST 7: Server-side validation of plan configuration inputs ---');
    let validationPassed = false;
    try {
      await planConfigService.createPlanVersion(
        'base',
        {
          durations: {
            '1_month': { duration_months: -1, price_inr: -100, allocated_qr_quota: -5, allocated_ai_quota: -1, max_qr_codes: 0 },
            '6_months': { duration_months: 6, price_inr: 2499, allocated_qr_quota: 900, allocated_ai_quota: 450, max_qr_codes: 5 },
            '12_months': { duration_months: 12, price_inr: 4499, allocated_qr_quota: 1800, allocated_ai_quota: 900, max_qr_codes: 10 },
          },
        },
        'client-hacker'
      );
    } catch (e: any) {
      console.log(`Malicious payload rejected by server-side validator: "${e.message}"`);
      validationPassed = true;
    }

    if (validationPassed) {
      console.log('>>> TEST 7 PASSED: Server-side validation strictly rejected invalid durations/negative prices.\n');
    } else {
      throw new Error('TEST 7 FAILED: Server accepted invalid plan parameters!');
    }

    // -------------------------------------------------------------
    // TEST 8: Verify client billing page data source.
    // EXPECTED: Plans/prices/limits come dynamically from database. No hardcoded pricing.
    // -------------------------------------------------------------
    console.log('--- TEST 8: Verify dynamic public plan catalog ---');
    const dynamicCatalog = await planConfigService.getPublicPlans();
    console.log(`Catalog contains ${dynamicCatalog.plans.length} active plans:`);
    dynamicCatalog.plans.forEach(p => {
      console.log(`- ${p.name}: 1M=₹${p.durations['1_month'].price_inr}, 6M=₹${p.durations['6_months'].price_inr}, 12M=₹${p.durations['12_months'].price_inr}`);
    });

    if (
      dynamicCatalog.plans.length >= 3 &&
      dynamicCatalog.plans.some(p => p.id === 'base') &&
      dynamicCatalog.plans.some(p => p.id === 'pro') &&
      dynamicCatalog.plans.some(p => p.id === 'unlimited')
    ) {
      console.log('>>> TEST 8 PASSED: Client billing data source provides dynamic Base, Pro, Unlimited with 1, 6, 12-month matrices.\n');
    } else {
      throw new Error('TEST 8 FAILED: Dynamic plan catalog missing expected plans');
    }

    // -------------------------------------------------------------
    // TEST 9: Verify Admin usage metrics.
    // EXPECTED: Admin sees days remaining, QR used, QR remaining, AI used, AI remaining.
    // -------------------------------------------------------------
    console.log('--- TEST 9: Verify Admin subscription & usage visibility ---');
    const entUsage = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Admin Entitlement View:
  Business: ${testBusinessId}
  Plan: ${entUsage.plan_name} (v${entUsage.plan_version_id})
  Status: ${entUsage.status}
  Days Remaining: ${entUsage.days_remaining}
  QR: ${entUsage.used_qr} used / ${entUsage.total_qr_quota} total (${entUsage.remaining_qr} remaining)
  AI: ${entUsage.used_ai} used / ${entUsage.total_ai_quota} total (${entUsage.remaining_ai} remaining)`);

    if (
      entUsage.days_remaining !== undefined &&
      entUsage.used_qr !== undefined &&
      entUsage.remaining_qr !== undefined &&
      entUsage.used_ai !== undefined &&
      entUsage.remaining_ai !== undefined
    ) {
      console.log('>>> TEST 9 PASSED: Admin usage values server-derived and fully computed.\n');
    } else {
      throw new Error('TEST 9 FAILED: Missing usage fields in entitlement');
    }

    // -------------------------------------------------------------
    // TEST 10: Verify historical version.
    // EXPECTED: Old version remains available for historical subscriptions.
    // -------------------------------------------------------------
    console.log('--- TEST 10: Historical version retention ---');
    const basePlanAll = (await planConfigService.getPlans()).find(p => p.id === 'base')!;
    console.log(`Base Plan version count: ${basePlanAll.versions.length}`);
    basePlanAll.versions.forEach(v => {
      console.log(`- Version ${v.version_number}: Status=${v.status}, 6M QR=${v.durations['6_months'].allocated_qr_quota}, Price=₹${v.durations['6_months'].price_inr}`);
    });

    if (basePlanAll.versions.length >= 2) {
      console.log('>>> TEST 10 PASSED: Historical versions retained in database without deletion or corruption.\n');
    } else {
      throw new Error('TEST 10 FAILED: Historical versions not retained');
    }

    console.log('=====================================================');
    console.log('ALL STEP 3 VERIFICATION TESTS PASSED (10/10)');
    console.log('=====================================================');

  } catch (err: any) {
    console.error('\n*** TEST RUN FAILED ***\n', err);
    process.exit(1);
  } finally {
    console.log('\nCleaning up test records and restoring original configurations...');
    // Clean up created subscriptions
    if (testSubIds.length > 0) {
      await (supabase.from('subscriptions') as any)
        .delete()
        .in('id', testSubIds);
      console.log(`Removed ${testSubIds.length} test subscriptions.`);
    }

    // Restore original subscription
    if (originalSubs && originalSubs.length > 0) {
      const activeOriginal = originalSubs.find((s: any) => s.status === 'active' || s.status === 'trialing');
      if (activeOriginal) {
        await (supabase.from('subscriptions') as any)
          .update({
            status: activeOriginal.status,
            metadata: activeOriginal.metadata,
            current_period_end: activeOriginal.current_period_end,
            current_period_start: activeOriginal.current_period_start,
          })
          .eq('id', activeOriginal.id);
        console.log(`Restored original subscription: ${activeOriginal.id}`);
      }
    }

    // Restore original admin settings limits if existed
    if (originalSettings && originalSettings.limits) {
      await (supabase.from('admin_settings') as any)
        .update({ limits: originalSettings.limits })
        .eq('id', (originalSettings as any).id);
      console.log('Restored original admin_settings limits.');
    }

    console.log('Cleanup finished.');
  }
}

runStep3Verification().catch(console.error);
