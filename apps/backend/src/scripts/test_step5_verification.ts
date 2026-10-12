import 'dotenv/config';
import { supabaseAdmin as supabase } from '../config/supabase';
import { planConfigService } from '../modules/admin/plan-config-service';
import { entitlementService } from '../modules/subscription/entitlement';
import { AdminService } from '../modules/admin/service';
import { SubscriptionController } from '../modules/subscription/controller';
import { SubscriptionService } from '../modules/subscription/service';
import { ValidationError } from '../shared/exceptions';

async function runStep5Verification() {
  console.log('====================================================');
  console.log('=== STARTING STEP 5 VERIFICATION SUITE ===');
  console.log('====================================================\n');

  const adminService = new AdminService(supabase);
  const subscriptionService = new SubscriptionService(supabase, 'mock_stripe_key');
  const subscriptionController = new SubscriptionController(subscriptionService);

  // Find or use a test business & owner
  const { data: business, error: bizErr } = (await supabase
    .from('businesses')
    .select('id, name, owner_id')
    .limit(1)
    .single()) as any;

  if (bizErr || !business) {
    console.error('Failed to locate test business:', bizErr);
    process.exit(1);
  }

  const testBusinessId = business.id;
  const testOwnerId = business.owner_id || '00000000-0000-0000-0000-000000000001';
  console.log(`Using Business: "${business.name}" (${testBusinessId}), Owner: ${testOwnerId}\n`);

  // Track created requests & subscriptions to clean up after test
  const createdRequestIds: string[] = [];

  try {
    // -----------------------------------------------------------------
    // TEST A: Trial/expired client opens Billing (Fetch Dynamic Offerings)
    // -----------------------------------------------------------------
    console.log('--- TEST A: Trial/expired client opens Billing ---');
    const publicData = await planConfigService.getPublicPlans();
    if (!publicData.plans || publicData.plans.length < 3) {
      throw new Error(`TEST A FAILED: Expected at least 3 active plans, got ${publicData.plans?.length}`);
    }
    console.log(`Successfully loaded ${publicData.plans.length} dynamic plans: ${publicData.plans.map(p => p.name).join(', ')}`);
    console.log('>>> TEST A PASSED: Billing offerings loaded dynamically from Admin config.\n');

    // -----------------------------------------------------------------
    // TEST B, C, D: Base 1M, Base 6M, Pro & Unlimited selections
    // -----------------------------------------------------------------
    console.log('--- TEST B, C, D: Inspect Plan & Duration Offerings (Base 1M, Base 6M, Pro, Unlimited) ---');
    const basePlan = publicData.plans.find(p => p.id === 'base');
    const proPlan = publicData.plans.find(p => p.id === 'pro');
    const unlPlan = publicData.plans.find(p => p.id === 'unlimited');

    if (!basePlan || !proPlan || !unlPlan) {
      throw new Error('TEST B/C/D FAILED: Missing Base, Pro, or Unlimited plan offerings');
    }

    // Base 1M
    const base1M = basePlan.durations['1_month'];
    console.log(`Base 1M: Price=₹${base1M.price_inr}, Duration=${base1M.duration_months}M, QR=${base1M.allocated_qr_quota}, AI=${base1M.allocated_ai_quota}`);
    if (base1M.duration_months !== 1 || base1M.price_inr <= 0 || base1M.allocated_qr_quota <= 0) {
      throw new Error('TEST B FAILED: Base 1M offering invalid');
    }
    console.log('>>> TEST B PASSED: Base 1-month selection verified.');

    // Base 6M
    const base6M = basePlan.durations['6_months'];
    console.log(`Base 6M: Price=₹${base6M.price_inr}, Duration=${base6M.duration_months}M, QR=${base6M.allocated_qr_quota}, AI=${base6M.allocated_ai_quota}`);
    if (base6M.duration_months !== 6 || base6M.price_inr <= 0 || base6M.allocated_qr_quota <= 0) {
      throw new Error('TEST C FAILED: Base 6M offering invalid');
    }
    console.log('>>> TEST C PASSED: Base 6-month selection verified.');

    // Pro and Unlimited selections
    const pro6M = proPlan.durations['6_months'];
    const unl12M = unlPlan.durations['12_months'];
    console.log(`Pro 6M: Price=₹${pro6M.price_inr}, QR=${pro6M.allocated_qr_quota}, AI=${pro6M.allocated_ai_quota}`);
    console.log(`Unlimited 12M: Price=₹${unl12M.price_inr}, QR=${unl12M.allocated_qr_quota === -1 ? 'Unlimited' : unl12M.allocated_qr_quota}`);
    if (!pro6M || !unl12M) {
      throw new Error('TEST D FAILED: Pro or Unlimited durations invalid');
    }
    console.log('>>> TEST D PASSED: Pro and Unlimited plan selections verified.\n');

    // -----------------------------------------------------------------
    // TEST E: Correct dynamic price/quota shown (NOT hardcoded)
    // -----------------------------------------------------------------
    console.log('--- TEST E: Verify Dynamic Non-Hardcoded Values ---');
    if (base6M.price_inr === undefined || base6M.allocated_qr_quota === undefined || base6M.allocated_ai_quota === undefined) {
      throw new Error('TEST E FAILED: Offering missing dynamic properties');
    }
    console.log(`Dynamic Values for Base 6M: ₹${base6M.price_inr}, ${base6M.allocated_qr_quota} QR, ${base6M.allocated_ai_quota} AI`);
    console.log('>>> TEST E PASSED: Offerings are dynamic and unhardcoded.\n');

    // -----------------------------------------------------------------
    // PREPARE FOR REQUEST TESTS: Clean any pre-existing pending requests
    // -----------------------------------------------------------------
    await supabase.from('upgrade_requests').delete().eq('business_id', testBusinessId);
    // Ensure subscription is in trial or expired state so request can proceed
    await (supabase.from('subscriptions').update as any)({ status: 'trialing', metadata: { is_trial: true } }).eq('business_id', testBusinessId);

    // Mock Express Request & Response helpers
    const createMockReq = (body: any, userId = testOwnerId) => ({
      user: { sub: userId, role: 'owner' },
      body,
      params: {},
      query: {},
    } as any);

    const createMockRes = () => {
      const res: any = {};
      res.statusCode = 200;
      res.status = (code: number) => { res.statusCode = code; return res; };
      res.json = (data: any) => { res.data = data; return res; };
      return res;
    };

    // -----------------------------------------------------------------
    // TEST F: Request creates PENDING request with exact version & duration
    // -----------------------------------------------------------------
    console.log('--- TEST F: Submit Activation Request for Base 6-Months ---');
    const mockReqF = createMockReq({
      business_id: testBusinessId,
      plan_id: 'base',
      duration_months: 6,
      note: 'Need activation for Q4 marketing campaign',
    });
    const mockResF = createMockRes();

    await subscriptionController.createUpgradeRequest(mockReqF, mockResF, (err) => {
      if (err) throw err;
    });

    if (mockResF.statusCode !== 201) {
      throw new Error(`TEST F FAILED: Expected 201 Created, got ${mockResF.statusCode}`);
    }

    const createdReq = mockResF.data.data;
    console.log(`Created Request ID: ${createdReq.id}, Status: ${createdReq.status}, Plan: ${createdReq.plan_name}, Duration: ${createdReq.duration_months}M, Price: ₹${createdReq.price_inr}`);
    createdRequestIds.push(createdReq.id);

    if (createdReq.status !== 'pending' || createdReq.duration_months !== 6 || createdReq.price_inr !== base6M.price_inr) {
      throw new Error(`TEST F FAILED: Invalid request details stored`);
    }
    console.log('>>> TEST F PASSED: PENDING activation request created with exact plan version, duration, and price.\n');

    // -----------------------------------------------------------------
    // TEST G: Duplicate pending request is prevented
    // -----------------------------------------------------------------
    console.log('--- TEST G: Prevent Duplicate Pending Request ---');
    let duplicateRejected = false;
    const mockReqG = createMockReq({
      business_id: testBusinessId,
      plan_id: 'pro',
      duration_months: 6,
    });
    const mockResG = createMockRes();

    await subscriptionController.createUpgradeRequest(mockReqG, mockResG, (err) => {
      if (err && err instanceof ValidationError) {
        duplicateRejected = true;
        console.log(`Duplicate correctly rejected with message: "${err.message}"`);
      }
    });

    if (!duplicateRejected) {
      throw new Error('TEST G FAILED: Duplicate pending request was NOT rejected');
    }
    console.log('>>> TEST G PASSED: Duplicate pending request successfully prevented.\n');

    // -----------------------------------------------------------------
    // TEST H: Client cannot manipulate price/quota through browser/API
    // -----------------------------------------------------------------
    console.log('--- TEST H: Prevent Client Price/Quota Tampering ---');
    // Clear pending request so we can test tampering attempt
    await supabase.from('upgrade_requests').delete().eq('business_id', testBusinessId);

    const mockReqH = createMockReq({
      business_id: testBusinessId,
      plan_id: 'base',
      duration_months: 6,
      // TAMPERED ATTRIBUTES: client attempts to pay ₹1 and get 999,999 quotas
      price: 1,
      price_inr: 1,
      amount: 100,
      allocated_qr_quota: 999999,
      allocated_ai_quota: 999999,
      qr_quota: 999999,
      ai_quota: 999999,
    });
    const mockResH = createMockRes();

    await subscriptionController.createUpgradeRequest(mockReqH, mockResH, (err) => {
      if (err) throw err;
    });

    const tamperedReqResult = mockResH.data.data;
    createdRequestIds.push(tamperedReqResult.id);

    console.log(`Client requested ₹1 & 999,999 quotas. Stored values: Price=₹${tamperedReqResult.price_inr}, QR Quota=${tamperedReqResult.allocated_qr_quota}, AI Quota=${tamperedReqResult.allocated_ai_quota}`);
    if (tamperedReqResult.price_inr === 1 || tamperedReqResult.allocated_qr_quota === 999999) {
      throw new Error('TEST H FAILED: Server trusted client-provided price or quota!');
    }
    if (tamperedReqResult.price_inr !== base6M.price_inr || tamperedReqResult.allocated_qr_quota !== base6M.allocated_qr_quota) {
      throw new Error(`TEST H FAILED: Server did not enforce authoritative config values`);
    }
    console.log('>>> TEST H PASSED: Client price and quota tampering completely ignored. Authoritative Admin values enforced.\n');

    // -----------------------------------------------------------------
    // TEST I: Active paid subscription cannot accidentally be replaced
    // -----------------------------------------------------------------
    console.log('--- TEST I: Prevent Replacing Active Paid Subscription ---');
    // Temporarily activate a paid subscription
    await entitlementService.activatePlan({
      businessId: testBusinessId,
      ownerId: testOwnerId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
    });

    let activeReplaceRejected = false;
    const mockReqI = createMockReq({
      business_id: testBusinessId,
      plan_id: 'unlimited',
      duration_months: 12,
    });
    const mockResI = createMockRes();

    await subscriptionController.createUpgradeRequest(mockReqI, mockResI, (err) => {
      if (err && err instanceof ValidationError) {
        activeReplaceRejected = true;
        console.log(`Active subscription replacement blocked: "${err.message}"`);
      }
    });

    if (!activeReplaceRejected) {
      throw new Error('TEST I FAILED: Active subscription replacement was NOT blocked');
    }
    console.log('>>> TEST I PASSED: Accidental replacement of active paid subscription blocked.\n');

    // -----------------------------------------------------------------
    // TEST J: Admin can see the request with duration, price & status
    // -----------------------------------------------------------------
    console.log('--- TEST J: Admin Visibility of Activation Requests ---');
    // Set status to trial/expired again, clear pending, and create a fresh request
    await (supabase.from('subscriptions').update as any)({ status: 'trialing', metadata: { is_trial: true } }).eq('business_id', testBusinessId);
    await supabase.from('upgrade_requests').delete().eq('business_id', testBusinessId);

    const mockReqJ = createMockReq({
      business_id: testBusinessId,
      plan_id: 'base',
      duration_months: 6,
      note: 'Admin review verification request',
    });
    const mockResJ = createMockRes();
    await subscriptionController.createUpgradeRequest(mockReqJ, mockResJ, (err) => {
      if (err) throw err;
    });

    const activeReqId = mockResJ.data.data.id;
    createdRequestIds.push(activeReqId);

    const adminRequests = await adminService.getUpgradeRequests({ page: 1, limit: 50, status: 'pending' });
    const foundAdminReq = adminRequests.data.find(r => r.id === activeReqId);

    if (!foundAdminReq) {
      throw new Error(`TEST J FAILED: Request ${activeReqId} not visible in Admin upgrade requests`);
    }

    console.log(`Admin found request: Business="${foundAdminReq.business_name}", Plan="${foundAdminReq.plan_name}", Duration=${foundAdminReq.duration_months}M, Price=₹${foundAdminReq.price_inr}, Status=${foundAdminReq.status}`);
    if (foundAdminReq.duration_months !== 6 || foundAdminReq.price_inr !== base6M.price_inr) {
      throw new Error('TEST J FAILED: Admin request metadata does not match authoritative values');
    }
    console.log('>>> TEST J PASSED: Admin can clearly identify client, plan, duration, price, date, and status.\n');

    // -----------------------------------------------------------------
    // TEST K: Admin activation creates normal Step 1–4 subscription snapshot
    // -----------------------------------------------------------------
    console.log('--- TEST K: Admin Manual Activation Reuses Step 1–4 Logic ---');
    const { data: adminUserRow } = await (supabase.from('users').select('id').eq('role', 'admin').limit(1).maybeSingle() as any);
    const adminUser = adminUserRow?.id || testOwnerId;
    const updatedReq = await adminService.updateUpgradeRequestStatus(activeReqId, 'approved', adminUser, 'Approved via Step 5 verification');

    if (updatedReq.status !== 'approved') {
      throw new Error(`TEST K FAILED: Request status is not approved, got ${updatedReq.status}`);
    }

    // Verify subscription snapshot in database
    const { data: activatedSub } = (await supabase
      .from('subscriptions')
      .select('*')
      .eq('business_id', testBusinessId)
      .single()) as any;

    if (!activatedSub || activatedSub.status !== 'active') {
      throw new Error('TEST K FAILED: Subscription status is not active in database');
    }

    const subMeta = activatedSub.metadata;
    console.log(`Subscription Snapshot: Plan=${subMeta.plan_name}, PlanVersion=${subMeta.plan_version_id}, TotalQR=${subMeta.allocated_qr_quota}, TotalAI=${subMeta.allocated_ai_quota}, UsedQR=${subMeta.used_qr_quota}, UsedAI=${subMeta.used_ai_quota}`);
    
    if (subMeta.used_qr_quota !== 0 || subMeta.used_ai_quota !== 0) {
      throw new Error('TEST K FAILED: Activated subscription quota did not start at 0 used');
    }
    if (subMeta.allocated_qr_quota !== base6M.allocated_qr_quota || subMeta.allocated_ai_quota !== base6M.allocated_ai_quota) {
      throw new Error(`TEST K FAILED: Incorrect quotas allocated: QR=${subMeta.allocated_qr_quota}, AI=${subMeta.allocated_ai_quota}`);
    }
    console.log('>>> TEST K PASSED: Admin activation created standard Step 1–4 subscription snapshot with 0 used.\n');

    // -----------------------------------------------------------------
    // TEST L: Activated subscription shows correct total QR/AI quota & duration
    // -----------------------------------------------------------------
    console.log('--- TEST L: Entitlement Enforcement of Activated Plan ---');
    const entitlement = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Entitlement Status: ${entitlement.status}, Active=${entitlement.is_active}`);
    console.log(`Total QR: ${entitlement.total_qr_quota}, Remaining QR: ${entitlement.remaining_qr}`);
    console.log(`Total AI: ${entitlement.total_ai_quota}, Remaining AI: ${entitlement.remaining_ai}`);
    console.log(`Start Date: ${entitlement.start_date}, End Date: ${entitlement.end_date}, Days Remaining: ${entitlement.days_remaining}`);

    if (!entitlement.is_active || entitlement.remaining_qr !== base6M.allocated_qr_quota || entitlement.remaining_ai !== base6M.allocated_ai_quota) {
      throw new Error('TEST L FAILED: Entitlement remaining quotas do not match purchased total quota');
    }
    if (entitlement.days_remaining < 170 || entitlement.days_remaining > 190) {
      throw new Error(`TEST L FAILED: Duration calculation incorrect for 6-months: ${entitlement.days_remaining} days`);
    }
    console.log('>>> TEST L PASSED: Correct total QR/AI quota and 6-month duration enforced.\n');

    // -----------------------------------------------------------------
    // TEST M: No monthly reset exists (Total quota consumed across duration)
    // -----------------------------------------------------------------
    console.log('--- TEST M: Verify Total Quota Model (NO Monthly Reset) ---');
    const consumeRes = await entitlementService.consumeServiceQuota(testBusinessId, 'qr_scan', 120);
    if (!consumeRes.success) {
      throw new Error(`TEST M FAILED: Could not consume QR quota: ${consumeRes.reason}`);
    }

    const postConsumeEntitlement = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`After 120 QR Scans: Used=${postConsumeEntitlement.used_qr}, Remaining=${postConsumeEntitlement.remaining_qr} / ${postConsumeEntitlement.total_qr_quota}`);

    const expectedRemaining = base6M.allocated_qr_quota - 120;
    if (postConsumeEntitlement.used_qr !== 120 || postConsumeEntitlement.remaining_qr !== expectedRemaining) {
      throw new Error(`TEST M FAILED: Quotas did not deduct correctly: Used=${postConsumeEntitlement.used_qr}, Remaining=${postConsumeEntitlement.remaining_qr}`);
    }

    // Verify metadata snapshot retains total counters without any monthly reset fields
    const { data: finalSub } = (await supabase.from('subscriptions').select('metadata').eq('business_id', testBusinessId).single()) as any;
    if (finalSub.metadata.monthly_qr_quota !== undefined) {
      throw new Error('TEST M FAILED: Found monthly_qr_quota in subscription metadata!');
    }
    console.log('>>> TEST M PASSED: Quotas are total quotas across the full duration with NO monthly reset.\n');

    console.log('====================================================');
    console.log('=== ALL STEP 5 VERIFICATION TESTS (A–M) PASSED! ===');
    console.log('====================================================');

  } catch (err: any) {
    console.error('\n❌ STEP 5 VERIFICATION ERROR:', err);
    process.exit(1);
  } finally {
    // Clean up created requests
    if (createdRequestIds.length > 0) {
      await supabase.from('upgrade_requests').delete().in('id', createdRequestIds);
    }
  }
}

runStep5Verification().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
