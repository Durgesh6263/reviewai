import 'dotenv/config';
process.env.LOG_FORMAT = 'json';
process.env.NODE_ENV = 'test';

import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { planConfigService } from '../modules/admin/plan-config-service';
import { SubscriptionService } from '../modules/subscription/service';
import { SubscriptionController } from '../modules/subscription/controller';
import { BusinessService } from '../modules/business/service';

async function runStep2Verification() {
  console.log('=================================================================');
  console.log('STEP 2: ACTIVE TRIAL ENFORCEMENT SYNC VERIFICATION');
  console.log('=================================================================\n');

  const subService = new SubscriptionService(supabase, 'mock_key');
  const subController = new SubscriptionController(subService);
  const businessService = new BusinessService(supabase);

  // 1. Locate test users
  const { data: users } = (await supabase.from('users').select('id, email').limit(2)) as any;
  if (!users || users.length === 0) {
    console.error('No test users found.');
    process.exit(1);
  }

  const primaryUserId = users[0].id;

  // Backup original admin settings to restore at end
  const { data: originalSettings } = (await supabase
    .from('admin_settings')
    .select('id, limits')
    .limit(1)
    .single()) as any;

  const testBizIds: string[] = [];

  try {
    const createTestBiz = (name: string) => {
      const ts = Date.now() + Math.floor(Math.random() * 1000);
      return businessService.createBusiness(primaryUserId, {
        name,
        phone: '+1 555-0199',
        address_line1: '100 Test St',
        city: 'San Jose',
        state: 'CA',
        postal_code: '95112',
        country: 'US',
        google_review_url: `https://g.page/r/test_${ts}/review`,
      });
    };

    console.log('--- Setting up test businesses ---');
    const timestamp = Date.now();
    const [bizA, bizPaid, bizExpired, bizNew] = await Promise.all([
      createTestBiz(`Trial Biz A ${timestamp}`),
      createTestBiz(`Paid Biz ${timestamp}`),
      createTestBiz(`Expired Biz ${timestamp}`),
      createTestBiz(`New Biz ${timestamp}`),
    ]);
    testBizIds.push(bizA.id, bizPaid.id, bizExpired.id, bizNew.id);

    // Setup Paid Customer (for Test L)
    await entitlementService.activatePlan({
      businessId: bizPaid.id,
      ownerId: primaryUserId,
      planId: 'base',
      durationMonths: 6,
    });
    const paidInitial = await entitlementService.getBusinessEntitlement(bizPaid.id);

    // Setup Expired Trial Customer (for Test K)
    const pastStart = new Date(Date.now() - 20 * 86400000).toISOString();
    const pastEnd = new Date(Date.now() - 6 * 86400000).toISOString();
    await supabase.from('subscriptions').upsert({
      business_id: bizExpired.id,
      owner_id: primaryUserId,
      plan_id: 'free_trial',
      status: 'expired',
      billing_cycle: 'monthly',
      price_cents: 0,
      currency: 'INR',
      current_period_start: pastStart,
      current_period_end: pastEnd,
      trial_start: pastStart,
      trial_end: pastEnd,
      metadata: {
        plan_id: 'free_trial',
        duration: '14_days',
        duration_days: 14,
        allocated_qr_quota: 300,
        allocated_ai_quota: 150,
        used_qr_quota: 10,
        used_ai_quota: 5,
        remaining_qr_quota: 0,
        remaining_ai_quota: 0,
        exhaustion_reason: 'TRIAL_EXPIRED',
      },
    }, { onConflict: 'business_id' });

    // -------------------------------------------------------------------------
    // A. Active trial = 300 QR / 150 AI
    // -------------------------------------------------------------------------
    console.log('\n--- A. Active trial = 300 QR / 150 AI ---');
    await planConfigService.updateTrialConfig({
      duration_days: 14,
      total_qr_quota: 300,
      total_ai_quota: 150,
      max_qr_codes: 1,
      enabled: true,
    });

    const entA = await entitlementService.provisionTrialSubscription(bizA.id, primaryUserId);
    console.log(`Active Trial Provisioned: Total QR = ${entA.total_qr_quota}, Total AI = ${entA.total_ai_quota}, Status = ${entA.status}`);
    if (entA.total_qr_quota !== 300 || entA.total_ai_quota !== 150 || entA.status !== 'trialing') {
      throw new Error(`TEST A FAILED: Expected 300 QR / 150 AI, got ${entA.total_qr_quota} QR / ${entA.total_ai_quota} AI`);
    }
    console.log('✓ TEST A PASSED: Active trial created with 300 QR / 150 AI');

    // -------------------------------------------------------------------------
    // B. Use 10 QR / 5 AI
    // -------------------------------------------------------------------------
    console.log('\n--- B. Use 10 QR / 5 AI ---');
    const qrConsume10 = await entitlementService.consumeServiceQuota(bizA.id, 'qr_scan', 10);
    const aiConsume5 = await entitlementService.consumeServiceQuota(bizA.id, 'ai_generation', 5);
    if (!qrConsume10.success || !aiConsume5.success) {
      throw new Error(`TEST B FAILED: Quota consumption error: qr=${qrConsume10.error}, ai=${aiConsume5.error}`);
    }

    const entA_used = await entitlementService.getBusinessEntitlement(bizA.id);
    console.log(`After initial usage: Used QR = ${entA_used.used_qr}, Remaining QR = ${entA_used.remaining_qr}, Used AI = ${entA_used.used_ai}, Remaining AI = ${entA_used.remaining_ai}`);
    if (entA_used.used_qr !== 10 || entA_used.remaining_qr !== 290 || entA_used.used_ai !== 5 || entA_used.remaining_ai !== 145) {
      throw new Error(`TEST B FAILED: Incorrect usage counters`);
    }
    console.log('✓ TEST B PASSED: Used 10 QR / 5 AI successfully (290 QR / 145 AI remaining)');

    // -------------------------------------------------------------------------
    // C. Admin changes = 75 QR / 30 AI
    // -------------------------------------------------------------------------
    console.log('\n--- C. Admin changes = 75 QR / 30 AI ---');
    const updatedTrial = await planConfigService.updateTrialConfig({
      duration_days: 10,
      total_qr_quota: 75,
      total_ai_quota: 30,
      max_qr_codes: 2,
      enabled: true,
    });
    console.log(`Admin saved new config: Total QR = ${updatedTrial.total_qr_quota}, Total AI = ${updatedTrial.total_ai_quota}, Duration = ${updatedTrial.duration_days}d`);
    console.log('✓ TEST C PASSED: Admin changed trial limits to 75 QR / 30 AI');

    // -------------------------------------------------------------------------
    // D. Verify Billing = 75 / 10 used / 65 remaining
    // -------------------------------------------------------------------------
    console.log('\n--- D. Verify Billing = 75 / 10 used / 65 remaining ---');
    const entA_afterSync = await entitlementService.getBusinessEntitlement(bizA.id);
    console.log(`Entitlement QR: Total = ${entA_afterSync.total_qr_quota}, Used = ${entA_afterSync.used_qr}, Remaining = ${entA_afterSync.remaining_qr}`);
    if (entA_afterSync.total_qr_quota !== 75 || entA_afterSync.used_qr !== 10 || entA_afterSync.remaining_qr !== 65) {
      throw new Error(`TEST D FAILED: Expected 75 / 10 / 65, got ${entA_afterSync.total_qr_quota} / ${entA_afterSync.used_qr} / ${entA_afterSync.remaining_qr}`);
    }

    // Check through Billing API /subscription/status
    let statusApiResponse: any = null;
    const mockReq = {
      user: { sub: primaryUserId, role: 'owner' },
      query: { business_id: bizA.id },
    } as any;
    const mockRes = {
      setHeader: () => {},
      json: (data: any) => { statusApiResponse = data; },
    } as any;
    await subController.getStatus(mockReq, mockRes, () => {});
    const billingData = statusApiResponse?.data;
    if (billingData.total_qr_quota !== 75 || billingData.used_qr !== 10 || billingData.remaining_qr !== 65) {
      throw new Error(`TEST D FAILED (API): Billing API returned total=${billingData.total_qr_quota} / used=${billingData.used_qr} / rem=${billingData.remaining_qr}`);
    }
    console.log('✓ TEST D PASSED: Billing verified = 75 total / 10 used / 65 remaining QR');

    // -------------------------------------------------------------------------
    // E. Verify AI = 30 / 5 used / 25 remaining
    // -------------------------------------------------------------------------
    console.log('\n--- E. Verify AI = 30 / 5 used / 25 remaining ---');
    console.log(`Entitlement AI: Total = ${entA_afterSync.total_ai_quota}, Used = ${entA_afterSync.used_ai}, Remaining = ${entA_afterSync.remaining_ai}`);
    if (entA_afterSync.total_ai_quota !== 30 || entA_afterSync.used_ai !== 5 || entA_afterSync.remaining_ai !== 25) {
      throw new Error(`TEST E FAILED: Expected 30 / 5 / 25, got ${entA_afterSync.total_ai_quota} / ${entA_afterSync.used_ai} / ${entA_afterSync.remaining_ai}`);
    }
    if (billingData.total_ai_quota !== 30 || billingData.used_ai !== 5 || billingData.remaining_ai !== 25) {
      throw new Error(`TEST E FAILED (API): Billing API returned total=${billingData.total_ai_quota} / used=${billingData.used_ai} / rem=${billingData.remaining_ai}`);
    }
    console.log('✓ TEST E PASSED: Billing verified = 30 total / 5 used / 25 remaining AI');

    // -------------------------------------------------------------------------
    // F. Generate QR until 75 total usage
    // -------------------------------------------------------------------------
    console.log('\n--- F. Generate QR until 75 total usage ---');
    // Currently used is 10, remaining is 65. Consume remaining 65 QR:
    const consume65 = await entitlementService.consumeServiceQuota(bizA.id, 'qr_scan', 65);
    if (!consume65.success) {
      throw new Error(`TEST F FAILED: Failed to consume remaining 65 QR: ${consume65.error}`);
    }
    const entA_after75QR = await entitlementService.getBusinessEntitlement(bizA.id);
    console.log(`After consuming to 75: Total = ${entA_after75QR.total_qr_quota}, Used = ${entA_after75QR.used_qr}, Remaining = ${entA_after75QR.remaining_qr}`);
    if (entA_after75QR.used_qr !== 75 || entA_after75QR.remaining_qr !== 0) {
      throw new Error(`TEST F FAILED: Expected used=75, remaining=0. Got used=${entA_after75QR.used_qr}, remaining=${entA_after75QR.remaining_qr}`);
    }
    console.log('✓ TEST F PASSED: Generated QR until 75 total usage (remaining = 0)');

    // -------------------------------------------------------------------------
    // G. Next QR request is blocked
    // -------------------------------------------------------------------------
    console.log('\n--- G. Next QR request is blocked ---');
    const canUseQR = await entitlementService.canUseService(bizA.id, 'qr_scan');
    console.log(`canUseService('qr_scan'): allowed=${canUseQR.allowed}, reason=${canUseQR.reason}`);
    if (canUseQR.allowed) {
      throw new Error(`TEST G FAILED: canUseService allowed QR request when quota is exhausted!`);
    }

    const consumeNextQR = await entitlementService.consumeServiceQuota(bizA.id, 'qr_scan', 1);
    console.log(`consumeServiceQuota('qr_scan', 1): allowed=${consumeNextQR.allowed}, success=${consumeNextQR.success}, error=${consumeNextQR.error}`);
    if (consumeNextQR.allowed || consumeNextQR.success) {
      throw new Error(`TEST G FAILED: consumeServiceQuota allowed QR generation past limit!`);
    }
    console.log('✓ TEST G PASSED: Next QR request is strictly BLOCKED (exhaustion reason: QR_QUOTA_EXHAUSTED)');

    // -------------------------------------------------------------------------
    // H. Generate AI until 30 total usage
    // -------------------------------------------------------------------------
    console.log('\n--- H. Generate AI until 30 total usage ---');
    // Currently used is 5, remaining is 25. Consume remaining 25 AI:
    const consume25 = await entitlementService.consumeServiceQuota(bizA.id, 'ai_generation', 25);
    if (!consume25.success) {
      throw new Error(`TEST H FAILED: Failed to consume remaining 25 AI: ${consume25.error}`);
    }
    const entA_after30AI = await entitlementService.getBusinessEntitlement(bizA.id);
    console.log(`After consuming to 30: Total = ${entA_after30AI.total_ai_quota}, Used = ${entA_after30AI.used_ai}, Remaining = ${entA_after30AI.remaining_ai}`);
    if (entA_after30AI.used_ai !== 30 || entA_after30AI.remaining_ai !== 0) {
      throw new Error(`TEST H FAILED: Expected used=30, remaining=0. Got used=${entA_after30AI.used_ai}, remaining=${entA_after30AI.remaining_ai}`);
    }
    console.log('✓ TEST H PASSED: Generated AI until 30 total usage (remaining = 0)');

    // -------------------------------------------------------------------------
    // I. Next AI request is blocked
    // -------------------------------------------------------------------------
    console.log('\n--- I. Next AI request is blocked ---');
    const canUseAI = await entitlementService.canUseService(bizA.id, 'ai_generation');
    console.log(`canUseService('ai_generation'): allowed=${canUseAI.allowed}, reason=${canUseAI.reason}`);
    if (canUseAI.allowed) {
      throw new Error(`TEST I FAILED: canUseService allowed AI request when quota is exhausted!`);
    }

    const consumeNextAI = await entitlementService.consumeServiceQuota(bizA.id, 'ai_generation', 1);
    console.log(`consumeServiceQuota('ai_generation', 1): allowed=${consumeNextAI.allowed}, success=${consumeNextAI.success}, error=${consumeNextAI.error}`);
    if (consumeNextAI.allowed || consumeNextAI.success) {
      throw new Error(`TEST I FAILED: consumeServiceQuota allowed AI generation past limit!`);
    }
    console.log('✓ TEST I PASSED: Next AI request is strictly BLOCKED (exhaustion reason: AI_QUOTA_EXHAUSTED)');

    // -------------------------------------------------------------------------
    // J. Existing usage never resets
    // -------------------------------------------------------------------------
    console.log('\n--- J. Existing usage never resets ---');
    // Admin changes trial again, e.g. to 50 QR / 20 AI (lower than current used 75 / 30)
    console.log('Admin reduces limits below existing usage (50 QR / 20 AI)...');
    await planConfigService.updateTrialConfig({
      duration_days: 10,
      total_qr_quota: 50,
      total_ai_quota: 20,
    });

    const entA_afterLower = await entitlementService.getBusinessEntitlement(bizA.id);
    console.log(`After Admin lower limit: Used QR = ${entA_afterLower.used_qr}, Used AI = ${entA_afterLower.used_ai}, Remaining QR = ${entA_afterLower.remaining_qr}, Remaining AI = ${entA_afterLower.remaining_ai}`);
    if (entA_afterLower.used_qr !== 75 || entA_afterLower.used_ai !== 30) {
      throw new Error(`TEST J FAILED: Existing usage was mutated or reset! Got QR=${entA_afterLower.used_qr}, AI=${entA_afterLower.used_ai}`);
    }
    if (entA_afterLower.remaining_qr !== 0 || entA_afterLower.remaining_ai !== 0) {
      throw new Error(`TEST J FAILED: Remaining quota should be 0 when used > total`);
    }

    // Now Admin raises limits to 100 QR / 50 AI
    console.log('Admin raises limits above existing usage (100 QR / 50 AI)...');
    await planConfigService.updateTrialConfig({
      duration_days: 10,
      total_qr_quota: 100,
      total_ai_quota: 50,
    });

    const entA_afterRaise = await entitlementService.getBusinessEntitlement(bizA.id);
    console.log(`After Admin raise limit: Total QR = ${entA_afterRaise.total_qr_quota}, Used QR = ${entA_afterRaise.used_qr}, Remaining QR = ${entA_afterRaise.remaining_qr}`);
    console.log(`Total AI = ${entA_afterRaise.total_ai_quota}, Used AI = ${entA_afterRaise.used_ai}, Remaining AI = ${entA_afterRaise.remaining_ai}`);
    if (entA_afterRaise.used_qr !== 75 || entA_afterRaise.used_ai !== 30) {
      throw new Error(`TEST J FAILED: Existing usage was reset when raising limits!`);
    }
    if (entA_afterRaise.remaining_qr !== 25 || entA_afterRaise.remaining_ai !== 20) {
      throw new Error(`TEST J FAILED: Expected remaining 25 QR (100-75) and 20 AI (50-30), got ${entA_afterRaise.remaining_qr} QR / ${entA_afterRaise.remaining_ai} AI`);
    }
    console.log('✓ TEST J PASSED: Existing usage (75 QR / 30 AI) was NEVER reset or deleted across limit changes');

    // -------------------------------------------------------------------------
    // K. Expired trial remains blocked
    // -------------------------------------------------------------------------
    console.log('\n--- K. Expired trial remains blocked ---');
    const entExpired = await entitlementService.getBusinessEntitlement(bizExpired.id);
    console.log(`Expired Business: Status = ${entExpired.status}, is_active = ${entExpired.is_active}, reason = ${entExpired.exhaustion_reason}`);
    if (entExpired.status !== 'expired' || entExpired.is_active !== false) {
      throw new Error(`TEST K FAILED: Expired trial is not marked expired! status=${entExpired.status}`);
    }

    const canUseExpired = await entitlementService.canUseService(bizExpired.id, 'qr_scan');
    console.log(`Expired canUseService: allowed=${canUseExpired.allowed}, reason=${canUseExpired.reason}`);
    if (canUseExpired.allowed) {
      throw new Error(`TEST K FAILED: Expired trial allowed QR service!`);
    }
    console.log('✓ TEST K PASSED: Expired trial remains strictly blocked and was never reactivated');

    // -------------------------------------------------------------------------
    // L. Paid subscription remains completely unaffected
    // -------------------------------------------------------------------------
    console.log('\n--- L. Paid subscription remains completely unaffected ---');
    const paidAfter = await entitlementService.getBusinessEntitlement(bizPaid.id);
    console.log(`Paid Business: Plan = ${paidAfter.plan_id}, Total QR = ${paidAfter.total_qr_quota}, Total AI = ${paidAfter.total_ai_quota}, Duration = ${paidAfter.duration_months}m`);
    if (
      paidAfter.plan_id !== paidInitial.plan_id ||
      paidAfter.total_qr_quota !== paidInitial.total_qr_quota ||
      paidAfter.total_ai_quota !== paidInitial.total_ai_quota ||
      paidAfter.duration_months !== paidInitial.duration_months
    ) {
      throw new Error(`TEST L FAILED: Paid subscription was affected by trial config changes!`);
    }
    console.log('✓ TEST L PASSED: Paid subscription is 100% unaffected');

    // -------------------------------------------------------------------------
    // M. New trial uses latest Admin configuration
    // -------------------------------------------------------------------------
    console.log('\n--- M. New trial uses latest Admin configuration ---');
    // Current Admin trial config is 10 days / 100 QR / 50 AI
    const entNew = await entitlementService.provisionTrialSubscription(bizNew.id, primaryUserId);
    console.log(`New Business Provisioned: Duration = ${entNew.duration_days}d, Total QR = ${entNew.total_qr_quota}, Total AI = ${entNew.total_ai_quota}`);
    if (entNew.duration_days !== 10 || entNew.total_qr_quota !== 100 || entNew.total_ai_quota !== 50) {
      throw new Error(`TEST M FAILED: New trial did not use latest Admin configuration! Got ${entNew.duration_days}d / ${entNew.total_qr_quota} QR / ${entNew.total_ai_quota} AI`);
    }
    console.log('✓ TEST M PASSED: New trial created with latest Admin configuration (10d / 100 QR / 50 AI)');

    console.log('\n=================================================================');
    console.log('ALL TESTS A THROUGH M PASSED PERFECTLY!');
    console.log('=================================================================\n');

  } catch (error) {
    console.error('VERIFICATION FAILED:', error);
    process.exit(1);
  } finally {
    console.log('Cleaning up test data...');
    for (const bizId of testBizIds) {
      await supabase.from('subscriptions').delete().eq('business_id', bizId);
      await supabase.from('businesses').delete().eq('id', bizId);
    }

    if (originalSettings?.limits) {
      await supabase
        .from('admin_settings')
        .update({ limits: originalSettings.limits, updated_at: new Date().toISOString() })
        .eq('id', originalSettings.id);
      planConfigService.invalidateCache();
      console.log('Admin settings restored to original state.');
    }
  }
}

runStep2Verification().catch(err => {
  console.error('Fatal error in script:', err);
  process.exit(1);
});
