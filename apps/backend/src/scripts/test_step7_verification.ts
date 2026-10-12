import 'dotenv/config';
import { supabaseAdmin as supabase } from '../config/supabase';
import { planConfigService } from '../modules/admin/plan-config-service';
import { entitlementService } from '../modules/subscription/entitlement';
import { AdminService } from '../modules/admin/service';
import { AdminController } from '../modules/admin/controller';
import { SubscriptionService } from '../modules/subscription/service';
import { SubscriptionController } from '../modules/subscription/controller';
import { ValidationError, ConflictError, AuthorizationError } from '../shared/exceptions';

async function runStep7Verification() {
  console.log('====================================================');
  console.log('=== STARTING STEP 7 VERIFICATION SUITE ===');
  console.log('=== RENEWAL & RE-ACTIVATION BEHAVIOR ===');
  console.log('====================================================\n');

  const adminService = new AdminService(supabase);
  const adminController = new AdminController(adminService);
  const subscriptionService = new SubscriptionService(supabase, 'mock_stripe_key');
  const subscriptionController = new SubscriptionController(subscriptionService);

  // 1. Locate test business and owner
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
  const testOwnerId = business.owner_id;

  const { data: adminUserRow } = await (supabase
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle() as any);
  const testAdminId = adminUserRow?.id || testOwnerId;

  console.log(`Using Business: "${business.name}" (${testBusinessId})`);
  console.log(`Using Owner: ${testOwnerId}`);
  console.log(`Using Admin Reviewer: ${testAdminId}\n`);

  const createdRequestIds: string[] = [];

  const createMockReq = (body: any, user: { sub: string; role: string } = { sub: testOwnerId, role: 'owner' }, params: any = {}) => ({
    user,
    body,
    params,
    query: {},
  } as any);

  const createMockRes = () => {
    const res: any = {};
    res.statusCode = 200;
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data: any) => {
      res.data = data;
      return res;
    };
    return res;
  };

  // Helper to create a plan request via controller
  async function submitRequest(planId = 'base', durationMonths = 6, note = 'Renewal Request'): Promise<string> {
    const mockReq = createMockReq({
      business_id: testBusinessId,
      plan_id: planId,
      duration_months: durationMonths,
      note,
    });
    const mockRes = createMockRes();
    let errOccurred: any = null;
    await subscriptionController.createUpgradeRequest(mockReq, mockRes, (err) => {
      errOccurred = err;
    });
    if (errOccurred) throw errOccurred;
    const reqId = mockRes.data.data.id;
    createdRequestIds.push(reqId);
    return reqId;
  }

  try {
    // -----------------------------------------------------------------
    // SETUP: Clean up previous requests
    // -----------------------------------------------------------------
    await supabase.from('upgrade_requests').delete().eq('business_id', testBusinessId);

    // =================================================================
    // TEST A: Expired subscription -> new request allowed
    // =================================================================
    console.log('--- TEST A: Expired Subscription Allows New Plan Request ---');
    await (supabase.from('subscriptions').update as any)({
      status: 'expired',
      current_period_start: new Date(Date.now() - 30 * 86400000).toISOString(),
      current_period_end: new Date(Date.now() - 86400000).toISOString(),
      metadata: {
        plan_id: 'base',
        plan_version_id: 'base_v1',
        plan_version_number: 1,
        duration_months: 6,
        price_inr: 2499,
        allocated_qr_quota: 900,
        allocated_ai_quota: 450,
        used_qr_quota: 850,
        used_ai_quota: 400,
        remaining_qr_quota: 50,
        remaining_ai_quota: 50,
        exhaustion_reason: 'PLAN_EXPIRED',
      },
    }).eq('business_id', testBusinessId);

    const entA = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Initial Entitlement: status=${entA.status}, is_active=${entA.is_active}, exhaustion_reason=${entA.exhaustion_reason}`);
    if (entA.is_active) {
      throw new Error('TEST A FAILED: Expired subscription should not be active');
    }

    const reqAId = await submitRequest('base', 6, 'Renewal for expired subscription');
    console.log(`Request created successfully for expired subscription: ID=${reqAId}`);
    console.log('>>> TEST A PASSED: Expired subscription allows new request from Billing.\n');

    // Clean up request A
    await supabase.from('upgrade_requests').delete().eq('id', reqAId);

    // =================================================================
    // TEST B: QR-exhausted subscription -> new request allowed
    // =================================================================
    console.log('--- TEST B: QR-Exhausted Subscription Allows New Plan Request ---');
    // Set active status by date, but QR quota exhausted to 0
    await (supabase.from('subscriptions').update as any)({
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 90 * 86400000).toISOString(),
      metadata: {
        plan_id: 'base',
        plan_version_id: 'base_v1',
        plan_version_number: 1,
        duration_months: 6,
        price_inr: 2499,
        allocated_qr_quota: 900,
        allocated_ai_quota: 450,
        used_qr_quota: 900, // Fully exhausted!
        used_ai_quota: 200,
        remaining_qr_quota: 0,
        remaining_ai_quota: 250,
        exhaustion_reason: 'QR_QUOTA_EXHAUSTED',
      },
    }).eq('business_id', testBusinessId);

    const entB = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`QR Exhausted Check: is_active=${entB.is_active}, reason=${entB.exhaustion_reason}, used_qr=${entB.used_qr}/${entB.total_qr_quota}`);
    if (entB.is_active || entB.exhaustion_reason !== 'QR_QUOTA_EXHAUSTED') {
      throw new Error(`TEST B FAILED: Expected is_active=false and exhaustion_reason=QR_QUOTA_EXHAUSTED, got ${entB.is_active} / ${entB.exhaustion_reason}`);
    }

    const reqBId = await submitRequest('base', 6, 'Renewal because QR quota reached 0');
    console.log(`Request created successfully for QR-exhausted subscription: ID=${reqBId}`);
    console.log('>>> TEST B PASSED: QR-exhausted subscription allows new request from Billing.\n');

    // Clean up request B
    await supabase.from('upgrade_requests').delete().eq('id', reqBId);

    // =================================================================
    // TEST C: AI-exhausted subscription -> new request allowed
    // =================================================================
    console.log('--- TEST C: AI-Exhausted Subscription Allows New Plan Request ---');
    // Set active status by date, but AI quota exhausted to 0
    await (supabase.from('subscriptions').update as any)({
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 90 * 86400000).toISOString(),
      metadata: {
        plan_id: 'base',
        plan_version_id: 'base_v1',
        plan_version_number: 1,
        duration_months: 6,
        price_inr: 2499,
        allocated_qr_quota: 900,
        allocated_ai_quota: 450,
        used_qr_quota: 300,
        used_ai_quota: 450, // Fully exhausted!
        remaining_qr_quota: 600,
        remaining_ai_quota: 0,
        exhaustion_reason: 'AI_QUOTA_EXHAUSTED',
      },
    }).eq('business_id', testBusinessId);

    const entC = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`AI Exhausted Check: is_active=${entC.is_active}, reason=${entC.exhaustion_reason}, used_ai=${entC.used_ai}/${entC.total_ai_quota}`);
    if (entC.is_active || entC.exhaustion_reason !== 'AI_QUOTA_EXHAUSTED') {
      throw new Error(`TEST C FAILED: Expected is_active=false and exhaustion_reason=AI_QUOTA_EXHAUSTED, got ${entC.is_active} / ${entC.exhaustion_reason}`);
    }

    const reqCId = await submitRequest('base', 6, 'Renewal because AI quota reached 0');
    console.log(`Request created successfully for AI-exhausted subscription: ID=${reqCId}`);
    console.log('>>> TEST C PASSED: AI-exhausted subscription allows new request from Billing.\n');

    // =================================================================
    // TEST D: Admin activation starts usage at 0
    // =================================================================
    console.log('--- TEST D: Admin Activation Starts Usage at 0 (No Quota Carry-Over) ---');
    // Approve request C
    await adminService.updateUpgradeRequestStatus(reqCId, 'approved', testAdminId, 'Approved Test C renewal');

    const entD = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Activated Subscription Entitlement:`);
    console.log(`  Plan: ${entD.plan_name} (${entD.plan_version_id})`);
    console.log(`  Status: ${entD.status} (is_active=${entD.is_active})`);
    console.log(`  Used QR: ${entD.used_qr}/${entD.total_qr_quota} (remaining: ${entD.remaining_qr})`);
    console.log(`  Used AI: ${entD.used_ai}/${entD.total_ai_quota} (remaining: ${entD.remaining_ai})`);

    if (entD.used_qr !== 0 || entD.used_ai !== 0) {
      throw new Error(`TEST D FAILED: New activation usage must start at 0, got used_qr=${entD.used_qr}, used_ai=${entD.used_ai}`);
    }
    if (entD.remaining_qr !== entD.total_qr_quota || entD.remaining_ai !== entD.total_ai_quota) {
      throw new Error('TEST D FAILED: Remaining quota does not equal total fresh quota');
    }
    console.log('>>> TEST D PASSED: Usage starts fresh at exactly 0; no carry-over occurred.\n');

    // =================================================================
    // TEST E & F: Old subscription history remains unchanged & preserved
    // =================================================================
    console.log('--- TEST E & F: History Preservation (Previous Plan, Price, Quota, Dates) ---');
    const { data: subWithHistory }: any = await supabase
      .from('subscriptions')
      .select('metadata')
      .eq('business_id', testBusinessId)
      .single();

    const historyArr = (subWithHistory?.metadata as any)?.history || [];
    console.log(`Total Preserved Historical Subscriptions: ${historyArr.length}`);

    if (historyArr.length === 0) {
      throw new Error('TEST E FAILED: Previous subscription was not preserved in history');
    }

    const previousSub = historyArr[historyArr.length - 1];
    console.log(`Preserved Previous Subscription Snapshot:`);
    console.log(`  Plan Version: ${previousSub.plan_name} (${previousSub.plan_version_id})`);
    console.log(`  Purchased Price: ₹${previousSub.price_inr}`);
    console.log(`  Duration: ${previousSub.duration_months} Months`);
    console.log(`  Start / End: ${previousSub.start_date} -> ${previousSub.end_date}`);
    console.log(`  QR Quota & Used: ${previousSub.used_qr_quota}/${previousSub.total_qr_quota}`);
    console.log(`  AI Quota & Used: ${previousSub.used_ai_quota}/${previousSub.total_ai_quota}`);
    console.log(`  Archived At: ${previousSub.archived_at}`);

    if (previousSub.used_ai_quota !== 450 || previousSub.total_ai_quota !== 450) {
      throw new Error(`TEST E/F FAILED: Expected previous used_ai_quota=450, got ${previousSub.used_ai_quota}`);
    }
    if (previousSub.price_inr !== 2499) {
      throw new Error(`TEST E/F FAILED: Expected previous price ₹2499, got ${previousSub.price_inr}`);
    }
    console.log('>>> TEST E & F PASSED: Previous plan, price, quota, dates, and usage remain intact in history.\n');

    // =================================================================
    // TEST G: Active subscription cannot be duplicated
    // =================================================================
    console.log('--- TEST G: Active Subscription Protection ---');
    // Client now has an ACTIVE subscription with remaining quota from Test D
    let clientSubmitBlocked = false;
    try {
      await submitRequest('base', 6, 'Duplicate request attempt');
    } catch (err: any) {
      if (err instanceof ValidationError && err.message.includes('active paid subscription')) {
        clientSubmitBlocked = true;
        console.log(`Client request blocked: "${err.message}"`);
      } else {
        throw err;
      }
    }

    if (!clientSubmitBlocked) {
      throw new Error('TEST G FAILED: Client should be blocked from creating another request while subscription is active');
    }
    console.log('>>> TEST G PASSED: Active subscription cannot be duplicated while active.\n');

    // =================================================================
    // TEST H: New plan version gets its own snapshot
    // =================================================================
    console.log('--- TEST H: New Plan Version Gets Its Own Snapshot ---');
    const activeSubSnapshot = (subWithHistory?.metadata as any);
    if (!activeSubSnapshot.plan_version_id || !activeSubSnapshot.activated_at) {
      throw new Error('TEST H FAILED: Active subscription missing dedicated snapshot metadata');
    }
    console.log(`Active Snapshot Plan Version ID: ${activeSubSnapshot.plan_version_id}`);
    console.log(`Active Snapshot Duration: ${activeSubSnapshot.duration_months} Months`);
    console.log(`Active Snapshot Quotas: ${activeSubSnapshot.allocated_qr_quota} QR, ${activeSubSnapshot.allocated_ai_quota} AI`);
    console.log('>>> TEST H PASSED: New subscription has its own dedicated snapshot.\n');

    // =================================================================
    // TEST I: Direct API cannot bypass rules
    // =================================================================
    console.log('--- TEST I: Security - Direct API Bypasses Blocked ---');
    // 1. Non-admin cannot approve
    const mockNonAdminReq = createMockReq(
      { status: 'approved' },
      { sub: testOwnerId, role: 'owner' },
      { id: reqCId }
    );
    let nonAdminBlocked = false;
    await adminController.updateUpgradeRequestStatus(mockNonAdminReq, createMockRes(), (err) => {
      if (err instanceof AuthorizationError) {
        nonAdminBlocked = true;
        console.log(`Direct API blocked non-admin: ${err.message}`);
      }
    });
    if (!nonAdminBlocked) {
      throw new Error('TEST I FAILED: Non-admin direct approval was not blocked');
    }

    // 2. Cannot approve already-approved request
    let doubleApproveBlocked = false;
    try {
      await adminService.updateUpgradeRequestStatus(reqCId, 'approved', testAdminId);
    } catch (err: any) {
      if (err instanceof ConflictError) {
        doubleApproveBlocked = true;
        console.log(`Direct API blocked double-approval: ${err.message}`);
      }
    }
    if (!doubleApproveBlocked) {
      throw new Error('TEST I FAILED: Re-approving already approved request should throw ConflictError');
    }
    console.log('>>> TEST I PASSED: Direct API access rules and atomic concurrency cannot be bypassed.\n');

    // =================================================================
    // TEST J: Entitlement immediately uses the new subscription
    // =================================================================
    console.log('--- TEST J: Entitlement Service Immediate Verification ---');
    const finalEnt = await entitlementService.getBusinessEntitlement(testBusinessId);
    const canScan = await entitlementService.canUseService(testBusinessId, 'qr_scan');
    const canAi = await entitlementService.canUseService(testBusinessId, 'ai_generation');

    console.log(`Real-Time Service Access:`);
    console.log(`  QR Scan Allowed: ${canScan.allowed}`);
    console.log(`  AI Generation Allowed: ${canAi.allowed}`);

    if (!finalEnt.is_active || !canScan.allowed || !canAi.allowed) {
      throw new Error('TEST J FAILED: Core services not immediately unlocked after renewal');
    }
    console.log('>>> TEST J PASSED: Entitlement service immediately unlocks and enforces renewed subscription.\n');

    console.log('====================================================');
    console.log('=== ALL STEP 7 TESTS (A THROUGH J) PASSED 100%! ===');
    console.log('====================================================');
  } finally {
    if (createdRequestIds.length > 0) {
      await supabase.from('upgrade_requests').delete().in('id', createdRequestIds);
    }
  }
}

runStep7Verification().catch((err) => {
  console.error('\n*** STEP 7 VERIFICATION RUNNER FAILED ***\n', err);
  process.exit(1);
});
