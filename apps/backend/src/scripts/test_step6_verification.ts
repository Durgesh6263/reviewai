import 'dotenv/config';
import { supabaseAdmin as supabase } from '../config/supabase';
import { planConfigService } from '../modules/admin/plan-config-service';
import { entitlementService } from '../modules/subscription/entitlement';
import { AdminService } from '../modules/admin/service';
import { AdminController } from '../modules/admin/controller';
import { SubscriptionService } from '../modules/subscription/service';
import { SubscriptionController } from '../modules/subscription/controller';
import { ValidationError, ConflictError, AuthorizationError } from '../shared/exceptions';

async function runStep6Verification() {
  console.log('====================================================');
  console.log('=== STARTING STEP 6 VERIFICATION SUITE ===');
  console.log('=== ADMIN MANUAL SUBSCRIPTION ACTIVATION FLOW ===');
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

  // Locate an admin user or fallback
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

  // Helper to create mock Express request & response
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

  try {
    // -----------------------------------------------------------------
    // SETUP: Clean existing requests and set trial/expired subscription
    // -----------------------------------------------------------------
    await supabase.from('upgrade_requests').delete().eq('business_id', testBusinessId);
    await (supabase.from('subscriptions').update as any)({
      status: 'expired',
      current_period_end: new Date(Date.now() - 86400000).toISOString(),
      metadata: { is_trial: true, allocated_qr_quota: 100, allocated_ai_quota: 50, used_qr_quota: 40, used_ai_quota: 25 },
    }).eq('business_id', testBusinessId);

    // Fetch authoritative plans
    const allPlans = await planConfigService.getPlans();
    const basePlan = allPlans.find(p => p.id === 'base')!;
    const activeVersion = basePlan.versions.find(v => v.status === 'active') || basePlan.versions[0];
    const base6M = activeVersion.durations['6_months'];

    console.log(`Authoritative Base Plan Active Version: ${activeVersion.version_number}`);
    console.log(`Authoritative Base 6M Offering: ₹${base6M.price_inr}, ${base6M.allocated_qr_quota} QR, ${base6M.allocated_ai_quota} AI\n`);

    // Helper to create a fresh upgrade request
    async function createTestRequest(planId = 'base', durationMonths = 6, note = 'Test Step 6'): Promise<string> {
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

    // =================================================================
    // TEST A: Pending request appears in Admin
    // =================================================================
    console.log('--- TEST A: Pending Request Appears in Admin ---');
    const reqAId = await createTestRequest('base', 6, 'Verification Test A Request');
    const adminListA = await adminService.getUpgradeRequests({ page: 1, limit: 50, status: 'pending' });
    const foundA = adminListA.data.find(r => r.id === reqAId);

    if (!foundA) {
      throw new Error(`TEST A FAILED: Pending request ${reqAId} did not appear in Admin list`);
    }
    if (foundA.status !== 'pending') {
      throw new Error(`TEST A FAILED: Expected status 'pending', got '${foundA.status}'`);
    }
    console.log(`Found pending request in Admin: ID=${foundA.id}, Business="${foundA.business_name}", Client="${foundA.owner_name}", Status=${foundA.status}`);
    console.log('>>> TEST A PASSED: Pending request correctly appears in Admin.\n');

    // =================================================================
    // TEST B: Correct plan version/details are shown
    // =================================================================
    console.log('--- TEST B: Request Details Inspection (Plan Version, Usage, Price) ---');
    const detailsB = await adminService.getUpgradeRequest(reqAId);

    if (detailsB.duration_months !== 6) {
      throw new Error(`TEST B FAILED: Expected duration 6, got ${detailsB.duration_months}`);
    }
    if (detailsB.price_inr !== base6M.price_inr) {
      throw new Error(`TEST B FAILED: Expected price ₹${base6M.price_inr}, got ₹${detailsB.price_inr}`);
    }
    if (!detailsB.plan_version_id || !detailsB.plan_version_id.includes(`v${activeVersion.version_number}`)) {
      throw new Error(`TEST B FAILED: Expected plan version v${activeVersion.version_number}, got ${detailsB.plan_version_id}`);
    }
    if (detailsB.current_qr_used === undefined || detailsB.current_ai_used === undefined) {
      throw new Error(`TEST B FAILED: Current QR/AI usage not returned in request details`);
    }

    console.log(`Request Details Verified:`);
    console.log(`  Plan: ${detailsB.plan_name} (${detailsB.plan_version_id})`);
    console.log(`  Duration: ${detailsB.duration_months} Months`);
    console.log(`  Price Captured: ₹${detailsB.price_inr}`);
    console.log(`  Current Sub Status: ${detailsB.current_subscription_status}`);
    console.log(`  Current QR Usage: ${detailsB.current_qr_used} / ${detailsB.current_qr_limit}`);
    console.log(`  Current AI Usage: ${detailsB.current_ai_used} / ${detailsB.current_ai_limit}`);
    console.log('>>> TEST B PASSED: Correct plan version, duration, price, and current usage are shown.\n');

    // =================================================================
    // TEST C: Approve creates ACTIVE subscription
    // =================================================================
    console.log('--- TEST C: Approve Creates ACTIVE Subscription ---');
    const approvedReq = await adminService.updateUpgradeRequestStatus(reqAId, 'approved', testAdminId, 'Approved in Test C');

    if (approvedReq.status !== 'approved') {
      throw new Error(`TEST C FAILED: Request status should be approved, got ${approvedReq.status}`);
    }

    const entC = await entitlementService.getBusinessEntitlement(testBusinessId);
    if (entC.status !== 'active' || !entC.is_active || entC.is_trial) {
      throw new Error(`TEST C FAILED: Business entitlement not active paid: status=${entC.status}, is_active=${entC.is_active}, is_trial=${entC.is_trial}`);
    }
    console.log(`Entitlement Activated: Status=${entC.status}, IsActive=${entC.is_active}, IsTrial=${entC.is_trial}, Plan=${entC.plan_id}`);
    console.log('>>> TEST C PASSED: Approval immediately created ACTIVE paid subscription.\n');

    // =================================================================
    // TEST D: QR/AI usage starts from 0
    // =================================================================
    console.log('--- TEST D: QR/AI Usage Starts From 0 ---');
    if (entC.used_qr !== 0) {
      throw new Error(`TEST D FAILED: used_qr should be 0, got ${entC.used_qr}`);
    }
    if (entC.used_ai !== 0) {
      throw new Error(`TEST D FAILED: used_ai should be 0, got ${entC.used_ai}`);
    }
    if (entC.remaining_qr !== entC.total_qr_quota) {
      throw new Error(`TEST D FAILED: remaining_qr should equal total_qr_quota, got ${entC.remaining_qr}`);
    }
    if (entC.remaining_ai !== entC.total_ai_quota) {
      throw new Error(`TEST D FAILED: remaining_ai should equal total_ai_quota, got ${entC.remaining_ai}`);
    }
    console.log(`Usage Verified: used_qr=${entC.used_qr}/${entC.total_qr_quota}, used_ai=${entC.used_ai}/${entC.total_ai_quota}`);
    console.log('>>> TEST D PASSED: Usage starts exactly from 0.\n');

    // =================================================================
    // TEST E: Correct total quotas are assigned
    // =================================================================
    console.log('--- TEST E: Correct Total Quotas Assigned from Plan Version ---');
    if (entC.total_qr_quota !== base6M.allocated_qr_quota) {
      throw new Error(`TEST E FAILED: Expected total_qr_quota ${base6M.allocated_qr_quota}, got ${entC.total_qr_quota}`);
    }
    if (entC.total_ai_quota !== base6M.allocated_ai_quota) {
      throw new Error(`TEST E FAILED: Expected total_ai_quota ${base6M.allocated_ai_quota}, got ${entC.total_ai_quota}`);
    }
    console.log(`Quotas Verified: Total QR=${entC.total_qr_quota}, Total AI=${entC.total_ai_quota}`);
    console.log('>>> TEST E PASSED: Total quotas assigned match authoritative plan version.\n');

    // =================================================================
    // TEST F: Correct expiry date is calculated
    // =================================================================
    console.log('--- TEST F: Correct Expiry Date Calculated from Duration ---');
    const startDate = new Date(entC.start_date);
    const endDate = new Date(entC.end_date);
    const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`Subscription Period: ${startDate.toISOString()} to ${endDate.toISOString()} (${diffDays} days)`);
    if (diffDays < 180 || diffDays > 185) {
      throw new Error(`TEST F FAILED: 6 Months duration should calculate ~180-184 days, got ${diffDays}`);
    }
    console.log('>>> TEST F PASSED: Expiry date correctly calculated for duration.\n');

    // =================================================================
    // TEST G: Existing active subscription cannot be overwritten
    // =================================================================
    console.log('--- TEST G: Safeguard - Existing Active Subscription Cannot Be Overwritten ---');
    // Client currently has an ACTIVE paid subscription from Test C.
    // Insert a pending request record directly in DB to simulate a race or legacy request
    const { data: directReqG, error: insErrG } = await ((supabase
      .from('upgrade_requests')
      .insert as any)({
        business_id: testBusinessId,
        owner_id: testOwnerId,
        requested_plan: 'professional',
        status: 'pending',
        message: JSON.stringify({
          plan_id: 'pro',
          duration_months: 1,
          price_inr: 1499,
          allocated_qr_quota: 1000,
          allocated_ai_quota: 500,
        }),
      })
      .select()
      .single() as any);

    if (insErrG) throw insErrG;
    createdRequestIds.push(directReqG.id);

    let activeBlocked = false;
    try {
      await adminService.updateUpgradeRequestStatus(directReqG.id, 'approved', testAdminId);
    } catch (err: any) {
      if (err instanceof ValidationError && err.message.includes('active paid subscription')) {
        activeBlocked = true;
        console.log(`Safeguard successfully blocked overwrite: "${err.message}"`);
      } else {
        throw err;
      }
    }

    if (!activeBlocked) {
      throw new Error('TEST G FAILED: Admin approval should have been blocked because an active paid subscription exists');
    }
    console.log('>>> TEST G PASSED: Overwrite safeguard protects active paid subscriptions.\n');

    // Clean up request G
    await supabase.from('upgrade_requests').delete().eq('id', directReqG.id);

    // =================================================================
    // TEST H: Reject works
    // =================================================================
    console.log('--- TEST H: Reject Pending Request ---');
    // Set current subscription to expired so request can be submitted
    await (supabase.from('subscriptions').update as any)({
      status: 'expired',
      current_period_end: new Date(Date.now() - 86400000).toISOString(),
      metadata: { is_trial: true },
    }).eq('business_id', testBusinessId);

    const reqHId = await createTestRequest('base', 6, 'Verification Test H Request');
    const rejectReasonText = 'Payment screenshot is unreadable or mismatch';
    const rejectedReq = await adminService.updateUpgradeRequestStatus(reqHId, 'rejected', testAdminId, rejectReasonText);

    if (rejectedReq.status !== 'rejected') {
      throw new Error(`TEST H FAILED: Expected status 'rejected', got '${rejectedReq.status}'`);
    }
    if (rejectedReq.admin_notes !== rejectReasonText) {
      throw new Error(`TEST H FAILED: Expected admin_notes '${rejectReasonText}', got '${rejectedReq.admin_notes}'`);
    }
    if (!rejectedReq.reviewed_at) {
      throw new Error('TEST H FAILED: reviewed_at timestamp not recorded');
    }
    console.log(`Request Rejected: Status=${rejectedReq.status}, Reason="${rejectedReq.admin_notes}", ReviewedAt=${rejectedReq.reviewed_at}`);
    console.log('>>> TEST H PASSED: Reject properly stores status, timestamp, reviewer, and reason.\n');

    // =================================================================
    // TEST I: Rejected request cannot activate
    // =================================================================
    console.log('--- TEST I: Rejected Request Cannot Activate ---');
    // Check that subscription remained expired and was NOT activated
    const entI = await entitlementService.getBusinessEntitlement(testBusinessId);
    if (entI.is_active && !entI.is_trial) {
      throw new Error('TEST I FAILED: Subscription was activated despite rejection');
    }

    // Attempting to approve an already rejected request must fail
    let rejectReapprovalBlocked = false;
    try {
      await adminService.updateUpgradeRequestStatus(reqHId, 'approved', testAdminId);
    } catch (err: any) {
      if (err instanceof ConflictError) {
        rejectReapprovalBlocked = true;
        console.log(`Re-approval blocked with ConflictError: "${err.message}"`);
      } else {
        throw err;
      }
    }

    if (!rejectReapprovalBlocked) {
      throw new Error('TEST I FAILED: Re-approving a rejected request should throw ConflictError');
    }
    console.log('>>> TEST I PASSED: Rejected requests cannot activate any subscription.\n');

    // =================================================================
    // TEST J: Double-click/double API approval cannot create two subscriptions
    // =================================================================
    console.log('--- TEST J: Concurrency & Double-Click Protection ---');
    const reqJId = await createTestRequest('base', 6, 'Concurrency Test J Request');

    // Launch two parallel approval calls simultaneously
    const results = await Promise.allSettled([
      adminService.updateUpgradeRequestStatus(reqJId, 'approved', testAdminId, 'Concurrent Approval 1'),
      adminService.updateUpgradeRequestStatus(reqJId, 'approved', testAdminId, 'Concurrent Approval 2'),
    ]);

    const fulfilledCount = results.filter(r => r.status === 'fulfilled').length;
    const rejectedCount = results.filter(r => r.status === 'rejected').length;

    console.log(`Concurrent Results: Fulfilled=${fulfilledCount}, Rejected=${rejectedCount}`);
    if (fulfilledCount !== 1 || rejectedCount !== 1) {
      throw new Error(`TEST J FAILED: Expected exactly 1 success and 1 rejection, got ${fulfilledCount} successes and ${rejectedCount} rejections`);
    }

    const failedResult = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    console.log(`Second call failed with: ${failedResult.reason.message}`);
    if (!(failedResult.reason instanceof ConflictError)) {
      throw new Error(`TEST J FAILED: Expected ConflictError, got ${failedResult.reason}`);
    }
    console.log('>>> TEST J PASSED: Double-approval race condition prevented via atomic DB lock.\n');

    // =================================================================
    // TEST K: Non-admin cannot approve through direct API
    // =================================================================
    console.log('--- TEST K: Non-Admin Direct API Access Blocked ---');
    // Prepare an expired subscription and fresh pending request
    await (supabase.from('subscriptions').update as any)({
      status: 'expired',
      current_period_end: new Date(Date.now() - 86400000).toISOString(),
      metadata: { is_trial: true },
    }).eq('business_id', testBusinessId);
    const reqKId = await createTestRequest('base', 6, 'Authorization Test K Request');

    const nonAdminReq = createMockReq(
      { status: 'approved' },
      { sub: testOwnerId, role: 'owner' }, // Role is 'owner', not 'admin'
      { id: reqKId }
    );
    const mockResK = createMockRes();
    let authErrorCaught = false;

    await adminController.updateUpgradeRequestStatus(nonAdminReq, mockResK, (err) => {
      if (err instanceof AuthorizationError) {
        authErrorCaught = true;
        console.log(`Direct API blocked non-admin: ${err.statusCode} ${err.message}`);
      }
    });

    if (!authErrorCaught) {
      throw new Error('TEST K FAILED: Non-admin was able to call updateUpgradeRequestStatus without AuthorizationError');
    }
    console.log('>>> TEST K PASSED: Non-admin cannot approve or modify requests via API.\n');

    // =================================================================
    // TEST L: Client immediately sees updated subscription/entitlements
    // =================================================================
    console.log('--- TEST L: Client Real-Time Entitlement Reflection ---');
    // Admin approves request K
    await adminService.updateUpgradeRequestStatus(reqKId, 'approved', testAdminId, 'Approved in Test L');

    // Client queries entitlement
    const clientEnt = await entitlementService.getBusinessEntitlement(testBusinessId);
    if (!clientEnt.is_active || clientEnt.status !== 'active') {
      throw new Error('TEST L FAILED: Client does not immediately see active status');
    }

    const canUseQr = await entitlementService.canUseService(testBusinessId, 'qr_scan');
    const canUseAi = await entitlementService.canUseService(testBusinessId, 'ai_generation');

    if (!canUseQr.allowed || !canUseAi.allowed) {
      throw new Error(`TEST L FAILED: Entitlement enforcement blocked core services: QR allowed=${canUseQr.allowed}, AI allowed=${canUseAi.allowed}`);
    }

    console.log(`Client Entitlements Verified in Real-Time:`);
    console.log(`  Plan: ${clientEnt.plan_name} (${clientEnt.plan_version_id})`);
    console.log(`  Status: ${clientEnt.status} (is_active=${clientEnt.is_active})`);
    console.log(`  QR Scan Permitted: ${canUseQr.allowed}`);
    console.log(`  AI Generation Permitted: ${canUseAi.allowed}`);
    console.log('>>> TEST L PASSED: Client immediately receives updated active subscription and full entitlements.\n');

    // =================================================================
    // AUDIT LOG VERIFICATION
    // =================================================================
    console.log('--- AUDIT LOG VERIFICATION ---');
    const { data: auditLogs } = await (supabase
      .from('audit_logs')
      .select('*')
      .eq('resource_type', 'upgrade_request')
      .order('created_at', { ascending: false })
      .limit(5) as any);

    if (!auditLogs || auditLogs.length === 0) {
      throw new Error('AUDIT LOG FAILED: No audit log records found for upgrade_request actions');
    }

    const approvedAudit = auditLogs.find((l: any) => l.action === 'subscription_request.approved');
    const rejectedAudit = auditLogs.find((l: any) => l.action === 'subscription_request.rejected');

    if (!approvedAudit) throw new Error('AUDIT LOG FAILED: No approved audit record found');
    if (!rejectedAudit) throw new Error('AUDIT LOG FAILED: No rejected audit record found');

    console.log(`Audit Log for Approval: Action="${approvedAudit.action}", Admin="${approvedAudit.user_id}", PlanVersion="${approvedAudit.metadata?.details?.plan_version}", Result="${approvedAudit.metadata?.details?.result}"`);
    console.log(`Audit Log for Rejection: Action="${rejectedAudit.action}", Admin="${rejectedAudit.user_id}", Result="${rejectedAudit.metadata?.details?.result}"`);
    console.log('>>> AUDIT LOG PASSED: All admin approval and rejection events are fully audited.\n');

    console.log('====================================================');
    console.log('=== ALL STEP 6 TESTS (A THROUGH L) PASSED 100%! ===');
    console.log('====================================================');
  } finally {
    // Cleanup created requests
    if (createdRequestIds.length > 0) {
      await supabase.from('upgrade_requests').delete().in('id', createdRequestIds);
    }
  }
}

runStep6Verification().catch((err) => {
  console.error('\n*** STEP 6 VERIFICATION RUNNER FAILED ***\n', err);
  process.exit(1);
});
