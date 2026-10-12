import 'dotenv/config';
/**
 * STEP 8 VERIFICATION TEST SUITE
 * 
 * Tests:
 *  A. Trial values display correctly.
 *  B. Active subscription values display correctly.
 *  C. QR usage updates in real-time.
 *  D. AI usage updates in real-time.
 *  E. Remaining values are correct (total - used).
 *  F. Expiry/days remaining is correct.
 *  G. Exhaustion status is correct (QR_QUOTA_EXHAUSTED, AI_QUOTA_EXHAUSTED, EXPIRED).
 *  H. Multiple businesses do not mix data.
 *  I. Admin sees the same authoritative values.
 *  J. Browser/API manipulation cannot change displayed authoritative data.
 */

import { supabaseAdmin } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { SubscriptionController } from '../modules/subscription/controller';
import { SubscriptionService } from '../modules/subscription/service';
import { AdminService } from '../modules/admin/service';

async function runStep8Verification() {
  console.log('====================================================');
  console.log('=== STARTING STEP 8 VERIFICATION SUITE ===');
  console.log('=== SUBSCRIPTION & USAGE DISPLAY ===');
  console.log('====================================================\n');

  const supabase = supabaseAdmin;
  const subscriptionService = new SubscriptionService(supabase, 'mock_stripe_key');
  const controller = new SubscriptionController(subscriptionService);
  const adminService = new AdminService(supabase);

  // 1. Locate businesses & owners
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, owner_id')
    .is('deleted_at', null)
    .limit(5);

  const bizList: any[] = (businesses as any) || [];
  if (bizList.length === 0) {
    throw new Error('No businesses found in database to run tests.');
  }

  const bizA: any = bizList[0];
  console.log(`Using Primary Business A: "${bizA.name}" (${bizA.id}), Owner: ${bizA.owner_id}`);

  // Find or create Business B for the same owner to test multiple businesses (Test H)
  let bizB: any = bizList.find((b: any) => b.id !== bizA.id && b.owner_id === bizA.owner_id);
  let createdBizB = false;

  if (!bizB) {
    console.log('Creating secondary Business B for the same owner to test multiple businesses isolation...');
    const { data: newBiz, error: createBizErr } = await (supabase
      .from('businesses') as any)
      .insert({
        name: 'Step 8 Secondary Test Biz',
        slug: `step8-biz-b-${Date.now()}`,
        owner_id: bizA.owner_id,
        status: 'active',
      })
      .select('id, name, owner_id')
      .single();

    if (createBizErr || !newBiz) {
      throw new Error(`Failed to create secondary business: ${createBizErr?.message}`);
    }
    bizB = newBiz;
    createdBizB = true;
  }
  console.log(`Using Secondary Business B: "${bizB.name}" (${bizB.id})\n`);

  // Helper for mock HTTP request/response to test controller endpoints
  const createMockReqRes = (userSub: string, userRole: string = 'user', query: any = {}) => {
    const req: any = {
      user: { sub: userSub, role: userRole },
      query,
      params: {},
      body: {},
    };
    let responseData: any = null;
    let statusCode: number = 200;
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: any) {
        responseData = payload;
        return this;
      },
    };
    const next = (err: any) => {
      if (err) throw err;
    };
    return { req, res, next, getResult: () => ({ statusCode, data: responseData }) };
  };

  try {
    // =================================================================
    // TEST A: Trial values display correctly
    // =================================================================
    console.log('--- TEST A: Trial Values Display Correctly ---');
    // Set Business B to clean trial state
    await supabase.from('subscriptions').delete().eq('business_id', bizB.id);

    const mockTrial = createMockReqRes(bizB.owner_id, 'user', { business_id: bizB.id });
    await controller.getStatus(mockTrial.req, mockTrial.res, mockTrial.next);
    const trialStatus = mockTrial.getResult().data?.data;

    console.log('Trial Status Response:', {
      plan_name: trialStatus.plan.name,
      status: trialStatus.status,
      is_trial: trialStatus.is_trial,
      qr_limit: trialStatus.qr_scans.limit,
      ai_limit: trialStatus.ai_generations.limit,
      days_remaining: trialStatus.days_remaining,
      price_paid: trialStatus.price_paid,
    });

    if (trialStatus.status !== 'FREE_TRIAL') {
      throw new Error(`TEST A FAILED: Expected status FREE_TRIAL, got ${trialStatus.status}`);
    }
    if (!trialStatus.is_trial) {
      throw new Error('TEST A FAILED: Expected is_trial === true');
    }
    if (trialStatus.price_paid !== 0) {
      throw new Error(`TEST A FAILED: Expected price_paid 0, got ${trialStatus.price_paid}`);
    }
    if (trialStatus.days_remaining <= 0) {
      throw new Error('TEST A FAILED: Expected days_remaining > 0 for active trial');
    }
    console.log('>>> TEST A PASSED: Trial values display correctly.\n');

    // =================================================================
    // TEST B: Active subscription values display correctly
    // =================================================================
    console.log('--- TEST B: Active Subscription Values Display Correctly ---');
    // Activate Pro plan on Business A (6 Months, 2400 QR, 1200 AI, ₹4999)
    await entitlementService.activatePlan({
      businessId: bizA.id,
      ownerId: bizA.owner_id,
      planId: 'pro',
      durationMonths: 6,
      price: 4999,
      qrQuota: 2400,
      aiQuota: 1200,
      maxQRCodes: 10,
    });

    const mockActive = createMockReqRes(bizA.owner_id, 'user', { business_id: bizA.id });
    await controller.getStatus(mockActive.req, mockActive.res, mockActive.next);
    const activeStatus = mockActive.getResult().data?.data;

    console.log('Active Subscription Status:', {
      plan_name: activeStatus.plan.name,
      status: activeStatus.status,
      duration: activeStatus.plan.duration,
      price_paid: activeStatus.price_paid,
      qr_total: activeStatus.qr_scans.limit,
      ai_total: activeStatus.ai_generations.limit,
      days_remaining: activeStatus.days_remaining,
    });

    if (activeStatus.status !== 'ACTIVE') {
      throw new Error(`TEST B FAILED: Expected status ACTIVE, got ${activeStatus.status}`);
    }
    if (activeStatus.plan.name !== 'Pro') {
      throw new Error(`TEST B FAILED: Expected plan Pro, got ${activeStatus.plan.name}`);
    }
    if (activeStatus.price_paid !== 4999) {
      throw new Error(`TEST B FAILED: Expected price_paid 4999, got ${activeStatus.price_paid}`);
    }
    if (activeStatus.qr_scans.limit !== 2400 || activeStatus.ai_generations.limit !== 1200) {
      throw new Error('TEST B FAILED: Quota limits do not match activated plan');
    }
    console.log('>>> TEST B PASSED: Active subscription values display correctly.\n');

    // =================================================================
    // TEST C: QR usage updates
    // =================================================================
    console.log('--- TEST C: QR Usage Updates in Real-Time ---');
    const qrConsumeRes = await entitlementService.consumeServiceQuota(bizA.id, 'qr_scan', 120);
    if (!qrConsumeRes.success) {
      throw new Error(`TEST C FAILED: Could not consume QR quota: ${qrConsumeRes.error}`);
    }

    const mockQrCheck = createMockReqRes(bizA.owner_id, 'user', { business_id: bizA.id });
    await controller.getStatus(mockQrCheck.req, mockQrCheck.res, mockQrCheck.next);
    const qrUpdatedStatus = mockQrCheck.getResult().data?.data;

    console.log(`QR Usage: ${qrUpdatedStatus.qr_scans.used} used of ${qrUpdatedStatus.qr_scans.limit} total (Remaining: ${qrUpdatedStatus.qr_scans.remaining})`);
    if (qrUpdatedStatus.qr_scans.used !== 120) {
      throw new Error(`TEST C FAILED: Expected 120 used QR, got ${qrUpdatedStatus.qr_scans.used}`);
    }
    console.log('>>> TEST C PASSED: QR usage updates correctly.\n');

    // =================================================================
    // TEST D: AI usage updates
    // =================================================================
    console.log('--- TEST D: AI Usage Updates in Real-Time ---');
    const aiConsumeRes = await entitlementService.consumeServiceQuota(bizA.id, 'ai_generation', 60);
    if (!aiConsumeRes.success) {
      throw new Error(`TEST D FAILED: Could not consume AI quota: ${aiConsumeRes.error}`);
    }

    const mockAiCheck = createMockReqRes(bizA.owner_id, 'user', { business_id: bizA.id });
    await controller.getStatus(mockAiCheck.req, mockAiCheck.res, mockAiCheck.next);
    const aiUpdatedStatus = mockAiCheck.getResult().data?.data;

    console.log(`AI Usage: ${aiUpdatedStatus.ai_generations.used} used of ${aiUpdatedStatus.ai_generations.limit} total (Remaining: ${aiUpdatedStatus.ai_generations.remaining})`);
    if (aiUpdatedStatus.ai_generations.used !== 60) {
      throw new Error(`TEST D FAILED: Expected 60 used AI, got ${aiUpdatedStatus.ai_generations.used}`);
    }
    console.log('>>> TEST D PASSED: AI usage updates correctly.\n');

    // =================================================================
    // TEST E: Remaining values are correct
    // =================================================================
    console.log('--- TEST E: Remaining Values Are Correct ---');
    const expectedRemainingQr = 2400 - 120; // 2280
    const expectedRemainingAi = 1200 - 60;  // 1140

    if (aiUpdatedStatus.qr_scans.remaining !== expectedRemainingQr) {
      throw new Error(`TEST E FAILED: Expected remaining QR ${expectedRemainingQr}, got ${aiUpdatedStatus.qr_scans.remaining}`);
    }
    if (aiUpdatedStatus.ai_generations.remaining !== expectedRemainingAi) {
      throw new Error(`TEST E FAILED: Expected remaining AI ${expectedRemainingAi}, got ${aiUpdatedStatus.ai_generations.remaining}`);
    }
    console.log(`Calculated Remaining: QR = ${aiUpdatedStatus.qr_scans.remaining}, AI = ${aiUpdatedStatus.ai_generations.remaining}`);
    console.log('>>> TEST E PASSED: Remaining values match (total - used) exactly.\n');

    // =================================================================
    // TEST F: Expiry/days remaining is correct
    // =================================================================
    console.log('--- TEST F: Expiry & Days Remaining Are Correct ---');
    const now = Date.now();
    const endMs = new Date(aiUpdatedStatus.current_period_end).getTime();
    const calculatedDaysRemaining = Math.max(0, Math.ceil((endMs - now) / 86400000));

    console.log(`Start Date: ${aiUpdatedStatus.start_date}`);
    console.log(`Expiry Date: ${aiUpdatedStatus.current_period_end}`);
    console.log(`Days Remaining: ${aiUpdatedStatus.days_remaining} (Expected: ~${calculatedDaysRemaining})`);

    if (Math.abs(aiUpdatedStatus.days_remaining - calculatedDaysRemaining) > 1) {
      throw new Error(`TEST F FAILED: Days remaining mismatch: got ${aiUpdatedStatus.days_remaining}, expected ${calculatedDaysRemaining}`);
    }
    console.log('>>> TEST F PASSED: Expiry date and days remaining are accurately calculated.\n');

    // =================================================================
    // TEST G: Exhaustion status is correct
    // =================================================================
    console.log('--- TEST G: Exhaustion Status & Exhaustion Message Handling ---');
    
    // Sub-test G1: QR Quota Exhaustion
    const { data: subRow } = await (supabase
      .from('subscriptions') as any)
      .select('metadata')
      .eq('business_id', bizA.id)
      .single();
    
    const originalMeta = (subRow as any)?.metadata || {};

    // Simulate QR Quota Exhaustion
    await (supabase.from('subscriptions') as any).update({
      metadata: { ...originalMeta, used_qr_quota: 2400 },
      updated_at: new Date().toISOString(),
    }).eq('business_id', bizA.id);

    const mockQrExhausted = createMockReqRes(bizA.owner_id, 'user', { business_id: bizA.id });
    await controller.getStatus(mockQrExhausted.req, mockQrExhausted.res, mockQrExhausted.next);
    const qrExhaustedStatus = mockQrExhausted.getResult().data?.data;

    console.log('QR Exhausted Check:', {
      status: qrExhaustedStatus.status,
      is_active: qrExhaustedStatus.is_active,
      exhaustion_message: qrExhaustedStatus.exhaustion_message,
    });
    if (qrExhaustedStatus.status !== 'QR_QUOTA_EXHAUSTED' || qrExhaustedStatus.is_active) {
      throw new Error(`TEST G1 FAILED: Expected QR_QUOTA_EXHAUSTED, got ${qrExhaustedStatus.status}`);
    }
    if (qrExhaustedStatus.exhaustion_message !== 'Your QR scan quota has been exhausted.') {
      throw new Error(`TEST G1 FAILED: Expected exact QR exhaustion message, got "${qrExhaustedStatus.exhaustion_message}"`);
    }

    // Sub-test G2: AI Quota Exhaustion
    await (supabase.from('subscriptions') as any).update({
      metadata: { ...originalMeta, used_qr_quota: 120, used_ai_quota: 1200 },
      updated_at: new Date().toISOString(),
    }).eq('business_id', bizA.id);

    const mockAiExhausted = createMockReqRes(bizA.owner_id, 'user', { business_id: bizA.id });
    await controller.getStatus(mockAiExhausted.req, mockAiExhausted.res, mockAiExhausted.next);
    const aiExhaustedStatus = mockAiExhausted.getResult().data?.data;

    console.log('AI Exhausted Check:', {
      status: aiExhaustedStatus.status,
      is_active: aiExhaustedStatus.is_active,
      exhaustion_message: aiExhaustedStatus.exhaustion_message,
    });
    if (aiExhaustedStatus.status !== 'AI_QUOTA_EXHAUSTED' || aiExhaustedStatus.is_active) {
      throw new Error(`TEST G2 FAILED: Expected AI_QUOTA_EXHAUSTED, got ${aiExhaustedStatus.status}`);
    }
    if (aiExhaustedStatus.exhaustion_message !== 'Your AI generation quota has been exhausted.') {
      throw new Error(`TEST G2 FAILED: Expected exact AI exhaustion message, got "${aiExhaustedStatus.exhaustion_message}"`);
    }

    // Sub-test G3: Time Expiry
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    await (supabase.from('subscriptions') as any).update({
      metadata: { ...originalMeta, used_qr_quota: 120, used_ai_quota: 60 },
      current_period_end: pastDate,
      updated_at: new Date().toISOString(),
    }).eq('business_id', bizA.id);

    const mockTimeExpired = createMockReqRes(bizA.owner_id, 'user', { business_id: bizA.id });
    await controller.getStatus(mockTimeExpired.req, mockTimeExpired.res, mockTimeExpired.next);
    const timeExpiredStatus = mockTimeExpired.getResult().data?.data;

    console.log('Time Expired Check:', {
      status: timeExpiredStatus.status,
      is_active: timeExpiredStatus.is_active,
      exhaustion_message: timeExpiredStatus.exhaustion_message,
    });
    if (timeExpiredStatus.status !== 'EXPIRED' || timeExpiredStatus.is_active) {
      throw new Error(`TEST G3 FAILED: Expected EXPIRED, got ${timeExpiredStatus.status}`);
    }
    if (timeExpiredStatus.exhaustion_message !== 'Your subscription has expired.') {
      throw new Error(`TEST G3 FAILED: Expected exact expiry message, got "${timeExpiredStatus.exhaustion_message}"`);
    }

    // Restore Business A active state
    const futureDate = new Date(Date.now() + 180 * 86400000).toISOString();
    await (supabase.from('subscriptions') as any).update({
      metadata: { ...originalMeta, used_qr_quota: 120, used_ai_quota: 60 },
      current_period_end: futureDate,
      updated_at: new Date().toISOString(),
    }).eq('business_id', bizA.id);

    console.log('>>> TEST G PASSED: All exhaustion statuses and messages handled accurately.\n');

    // =================================================================
    // TEST H: Multiple businesses do not mix data
    // =================================================================
    console.log('--- TEST H: Multiple Businesses Do Not Mix Data ---');
    // Query Business A: Active paid plan with 120 QR and 60 AI used
    const mockMultiA = createMockReqRes(bizA.owner_id, 'user', { business_id: bizA.id });
    await controller.getStatus(mockMultiA.req, mockMultiA.res, mockMultiA.next);
    const statusBizA = mockMultiA.getResult().data?.data;

    // Query Business B: Free Trial with 0 QR and 0 AI used
    const mockMultiB = createMockReqRes(bizA.owner_id, 'user', { business_id: bizB.id });
    await controller.getStatus(mockMultiB.req, mockMultiB.res, mockMultiB.next);
    const statusBizB = mockMultiB.getResult().data?.data;

    console.log(`Business A (${bizA.name}): Plan=${statusBizA.plan.name}, Status=${statusBizA.status}, Used QR=${statusBizA.qr_scans.used}`);
    console.log(`Business B (${bizB.name}): Plan=${statusBizB.plan.name}, Status=${statusBizB.status}, Used QR=${statusBizB.qr_scans.used}`);

    if (statusBizA.business_id !== bizA.id || statusBizB.business_id !== bizB.id) {
      throw new Error('TEST H FAILED: business_id in response does not match queried business');
    }
    if (statusBizA.status === statusBizB.status) {
      throw new Error('TEST H FAILED: Business A and Business B should have different statuses');
    }
    if (statusBizB.qr_scans.used !== 0 || statusBizA.qr_scans.used !== 120) {
      throw new Error('TEST H FAILED: Quotas or usage leaked between businesses');
    }
    console.log('>>> TEST H PASSED: Multiple businesses never mix subscriptions or quotas.\n');

    // =================================================================
    // TEST I: Admin sees the same authoritative values
    // =================================================================
    console.log('--- TEST I: Admin Sees The Same Authoritative Values ---');
    const adminSubsResult = await adminService.getSubscriptions({ page: 1, limit: 50 });
    const adminRowBizA = adminSubsResult.data.find(s => s.business_id === bizA.id);

    if (!adminRowBizA) {
      throw new Error('TEST I FAILED: Business A not found in Admin Subscriptions list');
    }

    console.log('Admin View for Business A:', {
      business: adminRowBizA.business_name,
      client: adminRowBizA.owner_name,
      plan: adminRowBizA.plan_name,
      status: adminRowBizA.status,
      period: `${adminRowBizA.current_period_start} -> ${adminRowBizA.current_period_end}`,
      days_remaining: adminRowBizA.days_remaining,
      qr: `${adminRowBizA.total_qr_quota} total | ${adminRowBizA.used_qr} used | ${adminRowBizA.remaining_qr} remaining`,
      ai: `${adminRowBizA.total_ai_quota} total | ${adminRowBizA.used_ai} used | ${adminRowBizA.remaining_ai} remaining`,
    });

    if (adminRowBizA.status !== statusBizA.status) {
      throw new Error(`TEST I FAILED: Admin status (${adminRowBizA.status}) !== Client status (${statusBizA.status})`);
    }
    if (adminRowBizA.used_qr !== statusBizA.qr_scans.used) {
      throw new Error(`TEST I FAILED: Admin used_qr (${adminRowBizA.used_qr}) !== Client used_qr (${statusBizA.qr_scans.used})`);
    }
    if (adminRowBizA.used_ai !== statusBizA.ai_generations.used) {
      throw new Error(`TEST I FAILED: Admin used_ai (${adminRowBizA.used_ai}) !== Client used_ai (${statusBizA.ai_generations.used})`);
    }
    console.log('>>> TEST I PASSED: Admin sees identical authoritative values as the client.\n');

    // =================================================================
    // TEST J: Browser/API manipulation cannot change displayed data
    // =================================================================
    console.log('--- TEST J: Security - Browser/API Manipulation Cannot Alter Data ---');
    // Client tries to pass manipulated quota limits in query or body
    const mockTampered = createMockReqRes(bizA.owner_id, 'user', {
      business_id: bizA.id,
      total_qr_quota: 999999, // Tampered param
      is_active: true,        // Tampered param
      price_paid: 0,          // Tampered param
    });
    mockTampered.req.body = { total_qr_quota: 999999, is_active: true };

    await controller.getStatus(mockTampered.req, mockTampered.res, mockTampered.next);
    const tamperedStatus = mockTampered.getResult().data?.data;

    if (tamperedStatus.qr_scans.limit === 999999) {
      throw new Error('TEST J FAILED: API accepted client-side tampered total_qr_quota');
    }
    if (tamperedStatus.qr_scans.limit !== 2400) {
      throw new Error(`TEST J FAILED: Expected authoritative 2400 limit, got ${tamperedStatus.qr_scans.limit}`);
    }
    console.log('Tamper Attempt Result: Client attempted 999999 QR limit; server strictly returned authoritative 2400.');
    console.log('>>> TEST J PASSED: Displayed values are strictly derived from trusted server-side state.\n');

    console.log('====================================================');
    console.log('=== ALL STEP 8 TESTS (A THROUGH J) PASSED 100%! ===');
    console.log('====================================================');
  } finally {
    // Cleanup temporary business B if we created it
    if (createdBizB && bizB) {
      await supabase.from('subscriptions').delete().eq('business_id', bizB.id);
      await supabase.from('businesses').delete().eq('id', bizB.id);
      console.log('Cleaned up temporary Business B.');
    }
  }
}

runStep8Verification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
  });
