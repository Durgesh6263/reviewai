import 'dotenv/config';
process.env.LOG_FORMAT = 'json';
process.env.NODE_ENV = 'test';

import { supabaseAdmin as supabase } from '../config/supabase';
import { createClient } from '@supabase/supabase-js';
import { entitlementService } from '../modules/subscription/entitlement';
import { planConfigService } from '../modules/admin/plan-config-service';
import { SubscriptionService } from '../modules/subscription/service';
import { SubscriptionController } from '../modules/subscription/controller';
import { BusinessService } from '../modules/business/service';

interface TestSummary {
  configSync: boolean;
  usagePreservation: boolean;
  qrEnforcement: boolean;
  aiEnforcement: boolean;
  expiry: boolean;
  newClient: boolean;
  paidCustomerSafety: boolean;
  audit: boolean;
  cacheRefresh: boolean;
  security: boolean;
}

async function runStep4FinalVerification() {
  console.log('=================================================================');
  console.log('STEP 4: FINAL FREE TRIAL SYNC VERIFICATION PASS');
  console.log('=================================================================\n');

  const summary: TestSummary = {
    configSync: false,
    usagePreservation: false,
    qrEnforcement: false,
    aiEnforcement: false,
    expiry: false,
    newClient: false,
    paidCustomerSafety: false,
    audit: false,
    cacheRefresh: false,
    security: false,
  };

  const subService = new SubscriptionService(supabase, 'mock_key');
  const subController = new SubscriptionController(subService);
  const businessService = new BusinessService(supabase);

  // 1. Locate test users
  const { data: users } = (await supabase.from('users').select('id, email, role').limit(2)) as any;
  if (!users || users.length === 0) {
    console.error('No test users found.');
    process.exit(1);
  }

  const primaryUserId = users[0].id;
  const adminUserId = primaryUserId;

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
        address_line1: '400 Final Test Ave',
        city: 'San Jose',
        state: 'CA',
        postal_code: '95112',
        country: 'US',
        google_review_url: `https://g.page/r/test_final_${ts}/review`,
      });
    };

    console.log('--- Setting up test businesses ---');
    const timestamp = Date.now();
    const [bizActiveTrial, bizOverUsageTrial, bizExpiredTrial, bizPaidClient] = await Promise.all([
      createTestBiz(`Active Trial Client ${timestamp}`),
      createTestBiz(`Over Usage Trial Client ${timestamp}`),
      createTestBiz(`Expired Trial Client ${timestamp}`),
      createTestBiz(`Paid Base Client ${timestamp}`),
    ]);
    testBizIds.push(bizActiveTrial.id, bizOverUsageTrial.id, bizExpiredTrial.id, bizPaidClient.id);

    // Initial Baseline Trial Config: 14 days, 300 QR, 150 AI, max_qr_codes: 1
    await planConfigService.updateTrialConfig({
      duration_days: 14,
      total_qr_quota: 300,
      total_ai_quota: 150,
      max_qr_codes: 1,
      enabled: true,
      features: {
        google_reviews: true,
        ai_generation: true,
        qr_customization: false,
        advanced_analytics: false,
        api_access: false,
        white_label: false,
        priority_support: false,
      },
    }, adminUserId);

    // Provision Active Trial
    await entitlementService.provisionTrialSubscription(bizActiveTrial.id, primaryUserId);

    // Provision Over-Usage Trial
    await entitlementService.provisionTrialSubscription(bizOverUsageTrial.id, primaryUserId);

    // Provision Expired Trial (started 20 days ago, ended 6 days ago)
    const pastStart = new Date(Date.now() - 20 * 86400000).toISOString();
    const pastEnd = new Date(Date.now() - 6 * 86400000).toISOString();
    await supabase.from('subscriptions').upsert({
      business_id: bizExpiredTrial.id,
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
        duration_days: 14,
        allocated_qr_quota: 300,
        allocated_ai_quota: 150,
        used_qr_quota: 50,
        used_ai_quota: 25,
        remaining_qr_quota: 0,
        remaining_ai_quota: 0,
        exhaustion_reason: 'TRIAL_EXPIRED',
      },
    }, { onConflict: 'business_id' });

    // Provision Paid Customer (Base 6 Months, price INR 2999)
    await entitlementService.activatePlan({
      businessId: bizPaidClient.id,
      ownerId: primaryUserId,
      planId: 'base',
      durationMonths: 6,
    });
    // Consume some paid quota to establish a baseline
    await entitlementService.consumeServiceQuota(bizPaidClient.id, 'qr_scan', 15);
    await entitlementService.consumeServiceQuota(bizPaidClient.id, 'ai_generation', 8);
    const paidInitial = await entitlementService.getBusinessEntitlement(bizPaidClient.id);

    console.log('✓ Initial setup completed: Active trial, Over-usage trial, Expired trial, and Paid customer.\n');

    // -------------------------------------------------------------------------
    // 1. BASELINE USAGE SETUP
    // -------------------------------------------------------------------------
    console.log('--- Establishing Baseline Usage for Active Trial: 10 QR / 5 AI ---');
    const qrConsumeInit = await entitlementService.consumeServiceQuota(bizActiveTrial.id, 'qr_scan', 10);
    const aiConsumeInit = await entitlementService.consumeServiceQuota(bizActiveTrial.id, 'ai_generation', 5);
    if (!qrConsumeInit.success || !aiConsumeInit.success) {
      throw new Error(`Failed to consume baseline usage: qr=${qrConsumeInit.error}, ai=${aiConsumeInit.error}`);
    }

    const entBeforeChange = await entitlementService.getBusinessEntitlement(bizActiveTrial.id);
    console.log(`Baseline Active Trial: Used QR=${entBeforeChange.used_qr}, Rem QR=${entBeforeChange.remaining_qr}, Used AI=${entBeforeChange.used_ai}, Rem AI=${entBeforeChange.remaining_ai}`);
    if (entBeforeChange.used_qr !== 10 || entBeforeChange.remaining_qr !== 290 || entBeforeChange.used_ai !== 5 || entBeforeChange.remaining_ai !== 145) {
      throw new Error(`Baseline usage verification failed!`);
    }

    // Baseline usage for over-usage trial: 80 QR / 35 AI
    await entitlementService.consumeServiceQuota(bizOverUsageTrial.id, 'qr_scan', 80);
    await entitlementService.consumeServiceQuota(bizOverUsageTrial.id, 'ai_generation', 35);
    const entOverUsageBefore = await entitlementService.getBusinessEntitlement(bizOverUsageTrial.id);
    console.log(`Over-Usage Trial Baseline: Used QR=${entOverUsageBefore.used_qr}, Used AI=${entOverUsageBefore.used_ai}`);

    // Count currently active trials for audit verification
    const { count: preUpdateActiveTrialCount } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .or('plan_id.eq.free_trial,plan_id.eq.free,status.eq.trialing')
      .eq('status', 'trialing');

    console.log(`Active trials in system before Admin change: ${preUpdateActiveTrialCount}`);

    // -------------------------------------------------------------------------
    // 1. CONFIGURATION SYNC: Admin changes Trial to 10 days / 75 QR / 30 AI
    // -------------------------------------------------------------------------
    console.log('\n=================================================================');
    console.log('DIMENSION 1: CONFIGURATION SYNC');
    console.log('=================================================================');
    console.log('Admin changing trial config to: 10 days, 75 QR, 30 AI, max_qr_codes: 2...');

    const updatedTrialConfig = await planConfigService.updateTrialConfig({
      duration_days: 10,
      total_qr_quota: 75,
      total_ai_quota: 30,
      max_qr_codes: 2,
      features: {
        google_reviews: true,
        ai_generation: true,
        qr_customization: true, // newly enabled feature
        advanced_analytics: false,
        api_access: false,
        white_label: false,
        priority_support: false,
      },
    }, adminUserId);

    console.log(`Admin update saved. New Version: v${updatedTrialConfig.version}`);

    // Verify Active Trial receives new limits
    const entActiveAfterSync = await entitlementService.getBusinessEntitlement(bizActiveTrial.id);
    console.log(`Active Trial after Admin sync:
      Total QR: ${entActiveAfterSync.total_qr_quota} (Expected: 75)
      Total AI: ${entActiveAfterSync.total_ai_quota} (Expected: 30)
      Duration: ${entActiveAfterSync.duration_days} days (Expected: 10)
      Max QR Codes: ${entActiveAfterSync.max_qr_codes} (Expected: 2)
      Feature qr_customization: ${entActiveAfterSync.features?.qr_customization} (Expected: true)
    `);

    if (
      entActiveAfterSync.total_qr_quota !== 75 ||
      entActiveAfterSync.total_ai_quota !== 30 ||
      entActiveAfterSync.duration_days !== 10 ||
      entActiveAfterSync.max_qr_codes !== 2 ||
      entActiveAfterSync.features?.qr_customization !== true
    ) {
      throw new Error(`DIMENSION 1 FAILED: Active trial entitlement did not sync new configuration!`);
    }

    // Verify Billing API (/api/v1/subscription/status) returns the authoritative 75 / 30 values
    let billingStatusData: any = null;
    const mockReq = {
      user: { sub: primaryUserId, role: 'owner' },
      query: { business_id: bizActiveTrial.id },
    } as any;
    const mockRes = {
      setHeader: () => {},
      json: (data: any) => { billingStatusData = data; },
    } as any;
    await subController.getStatus(mockReq, mockRes, () => {});
    const clientBilling = billingStatusData?.data;

    console.log(`Client Billing API response:
      Total QR: ${clientBilling?.total_qr_quota}
      Total AI: ${clientBilling?.total_ai_quota}
      Duration Days: ${clientBilling?.duration_days}
      Max QR Codes: ${clientBilling?.max_qr_codes}
    `);

    if (
      clientBilling?.total_qr_quota !== 75 ||
      clientBilling?.total_ai_quota !== 30 ||
      clientBilling?.duration_days !== 10 ||
      clientBilling?.max_qr_codes !== 2
    ) {
      throw new Error(`DIMENSION 1 FAILED: Client Billing API did not return latest synced trial config!`);
    }

    summary.configSync = true;
    console.log('✓ DIMENSION 1 PASSED: Configuration sync successfully propagated to active trial clients and Billing');

    // -------------------------------------------------------------------------
    // 2. USAGE PRESERVATION
    // -------------------------------------------------------------------------
    console.log('\n=================================================================');
    console.log('DIMENSION 2: USAGE PRESERVATION');
    console.log('=================================================================');
    console.log(`Active Trial with 10 QR used / 5 AI used:
      QR: Total = ${entActiveAfterSync.total_qr_quota}, Used = ${entActiveAfterSync.used_qr}, Remaining = ${entActiveAfterSync.remaining_qr}
      AI: Total = ${entActiveAfterSync.total_ai_quota}, Used = ${entActiveAfterSync.used_ai}, Remaining = ${entActiveAfterSync.remaining_ai}
    `);

    if (entActiveAfterSync.used_qr !== 10 || entActiveAfterSync.remaining_qr !== 65) {
      throw new Error(`DIMENSION 2 FAILED: Expected QR total 75, used 10, remaining 65. Got used=${entActiveAfterSync.used_qr}, rem=${entActiveAfterSync.remaining_qr}`);
    }
    if (entActiveAfterSync.used_ai !== 5 || entActiveAfterSync.remaining_ai !== 25) {
      throw new Error(`DIMENSION 2 FAILED: Expected AI total 30, used 5, remaining 25. Got used=${entActiveAfterSync.used_ai}, rem=${entActiveAfterSync.remaining_ai}`);
    }

    // Billing check for preserved usage
    if (clientBilling?.used_qr !== 10 || clientBilling?.remaining_qr !== 65 || clientBilling?.used_ai !== 5 || clientBilling?.remaining_ai !== 25) {
      throw new Error(`DIMENSION 2 FAILED (Billing API): Billing API does not show 75/10/65 QR or 30/5/25 AI!`);
    }

    // Now test Over-Usage Trial:
    // Client had used 80 QR / 35 AI when limit was 300 / 150.
    // New limit is 75 QR / 30 AI. Used (80/35) > Total (75/30).
    const entOverUsageAfterSync = await entitlementService.getBusinessEntitlement(bizOverUsageTrial.id);
    console.log(`Over-Usage Trial after Admin limit reduction:
      QR: Total = ${entOverUsageAfterSync.total_qr_quota}, Used = ${entOverUsageAfterSync.used_qr}, Remaining = ${entOverUsageAfterSync.remaining_qr}
      AI: Total = ${entOverUsageAfterSync.total_ai_quota}, Used = ${entOverUsageAfterSync.used_ai}, Remaining = ${entOverUsageAfterSync.remaining_ai}
      Exhaustion Reason: ${entOverUsageAfterSync.exhaustion_reason}
    `);

    if (entOverUsageAfterSync.used_qr !== 80 || entOverUsageAfterSync.used_ai !== 35) {
      throw new Error(`DIMENSION 2 FAILED: Over-usage history was mutated or deleted! Got QR used=${entOverUsageAfterSync.used_qr}, AI used=${entOverUsageAfterSync.used_ai}`);
    }
    if (entOverUsageAfterSync.remaining_qr !== 0 || entOverUsageAfterSync.remaining_ai !== 0) {
      throw new Error(`DIMENSION 2 FAILED: Remaining quota must be exactly 0 when used > total`);
    }

    // Over-usage client services must be blocked
    const canUseOverUsageQR = await entitlementService.canUseService(bizOverUsageTrial.id, 'qr_scan');
    const canUseOverUsageAI = await entitlementService.canUseService(bizOverUsageTrial.id, 'ai_generation');
    if (canUseOverUsageQR.allowed || canUseOverUsageAI.allowed) {
      throw new Error(`DIMENSION 2 FAILED: Over-usage client was not blocked! qr=${canUseOverUsageQR.allowed}, ai=${canUseOverUsageAI.allowed}`);
    }

    summary.usagePreservation = true;
    console.log('✓ DIMENSION 2 PASSED: Usage is strictly preserved; when used > total, remaining is 0 and service is blocked');

    // -------------------------------------------------------------------------
    // 3. ACTUAL ENFORCEMENT (QR & AI)
    // -------------------------------------------------------------------------
    console.log('\n=================================================================');
    console.log('DIMENSION 3: ACTUAL ENFORCEMENT');
    console.log('=================================================================');

    // Currently bizActiveTrial has 65 QR remaining (10 used out of 75).
    // Test QR Quota allows usage:
    console.log('Testing QR consumption while quota is available (remaining: 65)...');
    const qrAllowedCheck = await entitlementService.canUseService(bizActiveTrial.id, 'qr_scan');
    if (!qrAllowedCheck.allowed) {
      throw new Error(`DIMENSION 3 FAILED: canUseService blocked QR when 65 remaining!`);
    }

    // Consume remaining 65 QR:
    const consumeRemainingQR = await entitlementService.consumeServiceQuota(bizActiveTrial.id, 'qr_scan', 65);
    if (!consumeRemainingQR.success) {
      throw new Error(`DIMENSION 3 FAILED: Error consuming remaining 65 QR: ${consumeRemainingQR.error}`);
    }

    const entAfterQRZero = await entitlementService.getBusinessEntitlement(bizActiveTrial.id);
    console.log(`After exhausting QR: Total=${entAfterQRZero.total_qr_quota}, Used=${entAfterQRZero.used_qr}, Remaining=${entAfterQRZero.remaining_qr}`);
    if (entAfterQRZero.used_qr !== 75 || entAfterQRZero.remaining_qr !== 0) {
      throw new Error(`DIMENSION 3 FAILED: QR remaining is not 0!`);
    }

    // Next QR operation MUST be blocked:
    const qrBlockCheck = await entitlementService.canUseService(bizActiveTrial.id, 'qr_scan');
    console.log(`QR Gatekeeper after 0 remaining: allowed=${qrBlockCheck.allowed}, reason=${qrBlockCheck.reason}`);
    if (qrBlockCheck.allowed) {
      throw new Error(`DIMENSION 3 FAILED: canUseService allowed QR when quota is 0!`);
    }

    const qrConsumePastLimit = await entitlementService.consumeServiceQuota(bizActiveTrial.id, 'qr_scan', 1);
    console.log(`QR consume past limit: success=${qrConsumePastLimit.success}, allowed=${qrConsumePastLimit.allowed}, reason=${qrConsumePastLimit.reason}`);
    if (qrConsumePastLimit.success || qrConsumePastLimit.allowed) {
      throw new Error(`DIMENSION 3 FAILED: consumeServiceQuota allowed QR past limit!`);
    }
    summary.qrEnforcement = true;
    console.log('✓ QR Enforcement verified: Quota allows usage, reaches zero, and next QR operation is strictly blocked');

    // Currently bizActiveTrial has 25 AI remaining (5 used out of 30).
    // Test AI Quota allows usage:
    console.log('Testing AI generation while quota is available (remaining: 25)...');
    const aiAllowedCheck = await entitlementService.canUseService(bizActiveTrial.id, 'ai_generation');
    if (!aiAllowedCheck.allowed) {
      throw new Error(`DIMENSION 3 FAILED: canUseService blocked AI when 25 remaining!`);
    }

    // Consume remaining 25 AI:
    const consumeRemainingAI = await entitlementService.consumeServiceQuota(bizActiveTrial.id, 'ai_generation', 25);
    if (!consumeRemainingAI.success) {
      throw new Error(`DIMENSION 3 FAILED: Error consuming remaining 25 AI: ${consumeRemainingAI.error}`);
    }

    const entAfterAIZero = await entitlementService.getBusinessEntitlement(bizActiveTrial.id);
    console.log(`After exhausting AI: Total=${entAfterAIZero.total_ai_quota}, Used=${entAfterAIZero.used_ai}, Remaining=${entAfterAIZero.remaining_ai}`);
    if (entAfterAIZero.used_ai !== 30 || entAfterAIZero.remaining_ai !== 0) {
      throw new Error(`DIMENSION 3 FAILED: AI remaining is not 0!`);
    }

    // Next AI operation MUST be blocked:
    const aiBlockCheck = await entitlementService.canUseService(bizActiveTrial.id, 'ai_generation');
    console.log(`AI Gatekeeper after 0 remaining: allowed=${aiBlockCheck.allowed}, reason=${aiBlockCheck.reason}`);
    if (aiBlockCheck.allowed) {
      throw new Error(`DIMENSION 3 FAILED: canUseService allowed AI when quota is 0!`);
    }

    const aiConsumePastLimit = await entitlementService.consumeServiceQuota(bizActiveTrial.id, 'ai_generation', 1);
    console.log(`AI consume past limit: success=${aiConsumePastLimit.success}, allowed=${aiConsumePastLimit.allowed}, reason=${aiConsumePastLimit.reason}`);
    if (aiConsumePastLimit.success || aiConsumePastLimit.allowed) {
      throw new Error(`DIMENSION 3 FAILED: consumeServiceQuota allowed AI past limit!`);
    }
    summary.aiEnforcement = true;
    console.log('✓ AI Enforcement verified: Quota allows usage, reaches zero, and next AI generation is strictly blocked');

    // -------------------------------------------------------------------------
    // 4. EXPIRY
    // -------------------------------------------------------------------------
    console.log('\n=================================================================');
    console.log('DIMENSION 4: EXPIRY');
    console.log('=================================================================');

    // 4a. Active trial expiry follows new configuration (start_date + 10 days)
    const activeStartMs = new Date(entActiveAfterSync.start_date).getTime();
    const expectedEndMs = activeStartMs + (10 * 86400000);
    const actualEndMs = new Date(entActiveAfterSync.end_date).getTime();
    const expiryDiffMinutes = Math.abs(expectedEndMs - actualEndMs) / 60000;
    console.log(`Active Trial End Date: ${entActiveAfterSync.end_date} (Diff from start + 10 days: ${expiryDiffMinutes.toFixed(2)} mins)`);
    if (expiryDiffMinutes > 5) {
      throw new Error(`DIMENSION 4 FAILED: Active trial expiry did not follow new duration (10 days)!`);
    }

    // 4b. Expired trial remains expired
    const entExpiredAfterTrialChange = await entitlementService.getBusinessEntitlement(bizExpiredTrial.id);
    console.log(`Expired Trial: Status = ${entExpiredAfterTrialChange.status}, is_active = ${entExpiredAfterTrialChange.is_active}, reason = ${entExpiredAfterTrialChange.exhaustion_reason}`);
    if (entExpiredAfterTrialChange.status !== 'expired' || entExpiredAfterTrialChange.is_active !== false) {
      throw new Error(`DIMENSION 4 FAILED: Expired trial was reactivated or marked active!`);
    }

    const canUseExpired = await entitlementService.canUseService(bizExpiredTrial.id, 'qr_scan');
    if (canUseExpired.allowed || canUseExpired.reason !== 'TRIAL_EXPIRED') {
      throw new Error(`DIMENSION 4 FAILED: Expired trial allowed QR service! allowed=${canUseExpired.allowed}, reason=${canUseExpired.reason}`);
    }

    // 4c. Billing days remaining matches server entitlement
    let expiredBillingData: any = null;
    const expiredReq = {
      user: { sub: primaryUserId, role: 'owner' },
      query: { business_id: bizExpiredTrial.id },
    } as any;
    const expiredRes = {
      setHeader: () => {},
      json: (data: any) => { expiredBillingData = data; },
    } as any;
    await subController.getStatus(expiredReq, expiredRes, () => {});
    console.log(`Expired Billing Status API: status = ${expiredBillingData?.data?.status}, raw_status = ${expiredBillingData?.data?.raw_status}, days_remaining = ${expiredBillingData?.data?.days_remaining}`);
    const isStatusExpired = String(expiredBillingData?.data?.status).toUpperCase() === 'EXPIRED' || expiredBillingData?.data?.raw_status === 'expired';
    if (expiredBillingData?.data?.days_remaining !== 0 || !isStatusExpired) {
      throw new Error(`DIMENSION 4 FAILED: Expired trial billing status does not show expired or 0 days remaining! status=${expiredBillingData?.data?.status}, days_rem=${expiredBillingData?.data?.days_remaining}`);
    }

    summary.expiry = true;
    console.log('✓ DIMENSION 4 PASSED: Active trial expiry follows new config; expired trials remain strictly expired and blocked');

    // -------------------------------------------------------------------------
    // 5. NEW CLIENT
    // -------------------------------------------------------------------------
    console.log('\n=================================================================');
    console.log('DIMENSION 5: NEW CLIENT PROVISIONING');
    console.log('=================================================================');
    const bizNewClient = await createTestBiz(`New Client Created Post-Admin Update ${Date.now()}`);
    testBizIds.push(bizNewClient.id);

    const entNewClient = await entitlementService.provisionTrialSubscription(bizNewClient.id, primaryUserId);
    console.log(`New Client Provisioned:
      Total QR: ${entNewClient.total_qr_quota} (Expected: 75)
      Total AI: ${entNewClient.total_ai_quota} (Expected: 30)
      Duration: ${entNewClient.duration_days} days (Expected: 10)
      Max QR Codes: ${entNewClient.max_qr_codes} (Expected: 2)
      Status: ${entNewClient.status} (Expected: trialing)
    `);

    if (
      entNewClient.total_qr_quota !== 75 ||
      entNewClient.total_ai_quota !== 30 ||
      entNewClient.duration_days !== 10 ||
      entNewClient.max_qr_codes !== 2 ||
      entNewClient.status !== 'trialing'
    ) {
      throw new Error(`DIMENSION 5 FAILED: New client did not automatically receive current trial configuration!`);
    }

    summary.newClient = true;
    console.log('✓ DIMENSION 5 PASSED: New client automatically receives current active trial configuration (10d, 75 QR, 30 AI)');

    // -------------------------------------------------------------------------
    // 6. PAID CUSTOMER SAFETY
    // -------------------------------------------------------------------------
    console.log('\n=================================================================');
    console.log('DIMENSION 6: PAID CUSTOMER SAFETY');
    console.log('=================================================================');
    const paidAfterAllTrialChanges = await entitlementService.getBusinessEntitlement(bizPaidClient.id);
    console.log(`Paid Customer Entitlement:
      Plan ID: ${paidAfterAllTrialChanges.plan_id} (Expected: ${paidInitial.plan_id})
      Plan Version: ${paidAfterAllTrialChanges.plan_version_id} (Expected: ${paidInitial.plan_version_id})
      Duration Months: ${paidAfterAllTrialChanges.duration_months}m (Expected: ${paidInitial.duration_months}m)
      Price INR: ${paidAfterAllTrialChanges.price_inr} (Expected: ${paidInitial.price_inr})
      Total QR: ${paidAfterAllTrialChanges.total_qr_quota} (Expected: ${paidInitial.total_qr_quota})
      Used QR: ${paidAfterAllTrialChanges.used_qr} (Expected: ${paidInitial.used_qr})
      Total AI: ${paidAfterAllTrialChanges.total_ai_quota} (Expected: ${paidInitial.total_ai_quota})
      Used AI: ${paidAfterAllTrialChanges.used_ai} (Expected: ${paidInitial.used_ai})
      End Date: ${paidAfterAllTrialChanges.end_date} (Expected: ${paidInitial.end_date})
      Status: ${paidAfterAllTrialChanges.status} (Expected: ${paidInitial.status})
    `);

    if (
      paidAfterAllTrialChanges.plan_id !== paidInitial.plan_id ||
      paidAfterAllTrialChanges.plan_version_id !== paidInitial.plan_version_id ||
      paidAfterAllTrialChanges.duration_months !== paidInitial.duration_months ||
      paidAfterAllTrialChanges.price_inr !== paidInitial.price_inr ||
      paidAfterAllTrialChanges.total_qr_quota !== paidInitial.total_qr_quota ||
      paidAfterAllTrialChanges.used_qr !== paidInitial.used_qr ||
      paidAfterAllTrialChanges.total_ai_quota !== paidInitial.total_ai_quota ||
      paidAfterAllTrialChanges.used_ai !== paidInitial.used_ai ||
      paidAfterAllTrialChanges.end_date !== paidInitial.end_date ||
      paidAfterAllTrialChanges.status !== paidInitial.status
    ) {
      throw new Error(`DIMENSION 6 FAILED: Paid customer data was mutated by Admin trial configuration change!`);
    }

    summary.paidCustomerSafety = true;
    console.log('✓ DIMENSION 6 PASSED: Paid customer plan, price, quota, expiry, version, and usage are 100% untouched');

    // -------------------------------------------------------------------------
    // 7. AUDIT
    // -------------------------------------------------------------------------
    console.log('\n=================================================================');
    console.log('DIMENSION 7: AUDIT');
    console.log('=================================================================');
    const { data: trialAuditLogs, error: auditFetchErr } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('resource_type', 'trial_config')
      .eq('action', 'TRIAL_CONFIG_CHANGED')
      .order('created_at', { ascending: false })
      .limit(1);

    if (auditFetchErr || !trialAuditLogs || trialAuditLogs.length === 0) {
      throw new Error(`DIMENSION 7 FAILED: No audit log found for TRIAL_CONFIG_CHANGED! ${auditFetchErr?.message}`);
    }

    const latestAudit = trialAuditLogs[0];
    console.log(`Latest Trial Audit Record:
      ID: ${latestAudit.id}
      Admin ID: ${latestAudit.metadata?.admin_id || latestAudit.user_id}
      Created At: ${latestAudit.created_at}
      Old Values: duration=${latestAudit.old_values?.duration_days}, QR=${latestAudit.old_values?.total_qr_quota}, AI=${latestAudit.old_values?.total_ai_quota}
      New Values: duration=${latestAudit.new_values?.duration_days}, QR=${latestAudit.new_values?.total_qr_quota}, AI=${latestAudit.new_values?.total_ai_quota}
      Affected Active Trials: ${latestAudit.metadata?.affected_active_trials}
      Affected Fields: ${JSON.stringify(latestAudit.metadata?.affected_fields)}
    `);

    const recordedAdminId = latestAudit.metadata?.admin_id || latestAudit.user_id;
    if (recordedAdminId !== adminUserId) {
      throw new Error(`DIMENSION 7 FAILED: Admin ID mismatch in audit log!`);
    }
    if (latestAudit.old_values?.duration_days !== 14 || latestAudit.old_values?.total_qr_quota !== 300 || latestAudit.old_values?.total_ai_quota !== 150) {
      throw new Error(`DIMENSION 7 FAILED: Previous values incorrect in audit log!`);
    }
    if (latestAudit.new_values?.duration_days !== 10 || latestAudit.new_values?.total_qr_quota !== 75 || latestAudit.new_values?.total_ai_quota !== 30) {
      throw new Error(`DIMENSION 7 FAILED: New values incorrect in audit log!`);
    }
    if (typeof latestAudit.metadata?.affected_active_trials !== 'number' || latestAudit.metadata?.affected_active_trials < 2) {
      throw new Error(`DIMENSION 7 FAILED: Affected active trial count missing or invalid!`);
    }

    summary.audit = true;
    console.log('✓ DIMENSION 7 PASSED: Audit log record accurately captures Admin, timestamp, previous values, new values, and affected trial count');

    // -------------------------------------------------------------------------
    // 8. CACHE / REFRESH
    // -------------------------------------------------------------------------
    console.log('\n=================================================================');
    console.log('DIMENSION 8: CACHE / REFRESH');
    console.log('=================================================================');
    // Change trial again to 12 days / 80 QR / 35 AI
    console.log('Admin changing trial config to 12 days / 80 QR / 35 AI to test cache invalidation...');
    await planConfigService.updateTrialConfig({
      duration_days: 12,
      total_qr_quota: 80,
      total_ai_quota: 35,
    }, adminUserId);

    // Call Billing API immediately without restarting server
    let billingRefetchedData: any = null;
    await subController.getStatus(mockReq, {
      setHeader: () => {},
      json: (data: any) => { billingRefetchedData = data; },
    } as any, () => {});

    console.log(`Billing refetch immediately after Admin save:
      Total QR: ${billingRefetchedData?.data?.total_qr_quota} (Expected: 80)
      Total AI: ${billingRefetchedData?.data?.total_ai_quota} (Expected: 35)
      Duration: ${billingRefetchedData?.data?.duration_days} (Expected: 12)
    `);

    if (
      billingRefetchedData?.data?.total_qr_quota !== 80 ||
      billingRefetchedData?.data?.total_ai_quota !== 35 ||
      billingRefetchedData?.data?.duration_days !== 12
    ) {
      throw new Error(`DIMENSION 8 FAILED: Client Billing returned stale cached values instead of new configuration!`);
    }

    summary.cacheRefresh = true;
    console.log('✓ DIMENSION 8 PASSED: Client Billing immediately reflects latest values upon save without server restart');

    // -------------------------------------------------------------------------
    // 9. SECURITY
    // -------------------------------------------------------------------------
    console.log('\n=================================================================');
    console.log('DIMENSION 9: SECURITY');
    console.log('=================================================================');
    const anonClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    // 9a. Normal client cannot modify admin_settings (trial config)
    console.log('Attempting unauthorized trial config update via anon client...');
    const { data: anonAdminUpdate, error: anonAdminErr } = await anonClient
      .from('admin_settings')
      .update({ limits: { trial: { duration_days: 999, total_qr_quota: 99999 } } })
      .eq('id', originalSettings.id)
      .select();

    console.log(`Anon admin_settings update result: error=${anonAdminErr?.message || 'none'}, modified rows=${anonAdminUpdate?.length || 0}`);
    if (anonAdminUpdate && anonAdminUpdate.length > 0) {
      throw new Error(`DIMENSION 9 FAILED: Anon/client was able to modify admin_settings!`);
    }

    // 9b. Normal client cannot modify subscriptions metadata directly (quota tampering)
    console.log('Attempting unauthorized subscription quota tampering via anon client...');
    const { data: anonSubUpdate, error: anonSubErr } = await anonClient
      .from('subscriptions')
      .update({
        metadata: {
          allocated_qr_quota: 99999,
          used_qr_quota: 0,
        },
      })
      .eq('business_id', bizActiveTrial.id)
      .select();

    console.log(`Anon subscription quota tamper result: error=${anonSubErr?.message || 'none'}, modified rows=${anonSubUpdate?.length || 0}`);
    if (anonSubUpdate && anonSubUpdate.length > 0) {
      throw new Error(`DIMENSION 9 FAILED: Anon/client was able to tamper with subscription quota!`);
    }

    // 9c. Verify entitlement remains authoritative and untampered
    const entSecurityCheck = await entitlementService.getBusinessEntitlement(bizActiveTrial.id);
    console.log(`Authoritative Entitlement after tamper attempts:
      Total QR: ${entSecurityCheck.total_qr_quota} (Expected: 80)
      Used QR: ${entSecurityCheck.used_qr} (Expected: 75)
    `);

    if (entSecurityCheck.total_qr_quota === 99999 || entSecurityCheck.used_qr === 0) {
      throw new Error(`DIMENSION 9 FAILED: Entitlement was corrupted by unauthorized tampering!`);
    }

    summary.security = true;
    console.log('✓ DIMENSION 9 PASSED: Client is strictly prohibited from modifying trial config, quotas, expiry, or usage counters');

    console.log('\n=================================================================');
    console.log('ALL 9 VERIFICATION DIMENSIONS PASSED PERFECTLY!');
    console.log('=================================================================\n');

  } catch (error) {
    console.error('VERIFICATION ERROR:', error);
    process.exit(1);
  } finally {
    console.log('Cleaning up test businesses and restoring original admin settings...');
    for (const id of testBizIds) {
      await supabase.from('subscriptions').delete().eq('business_id', id);
      await supabase.from('businesses').delete().eq('id', id);
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

runStep4FinalVerification().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
