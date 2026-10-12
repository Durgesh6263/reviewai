/**
 * STEP 2 VERIFICATION SUITE — HARD-LOCK QR ACCESS WHEN ENTITLEMENT IS BLOCKED
 * 
 * Verifies all security requirements from Step 2:
 * 1. QR Generation / Activation entitlement checks (create and activate blocked when expired/exhausted)
 * 2. Public QR Route /r/[slug] under exact conditions:
 *    A. subscription active + QR quota available -> ALLOWED
 *    B. subscription active + QR quota exhausted -> QR BLOCKED, AI UNAFFECTED
 *    C. subscription expired -> BLOCKED (no session, no scan log increment)
 *    D. trial active + QR quota available -> ALLOWED
 *    E. trial expired -> BLOCKED
 *    F. renewed subscription -> automatically WORKS AGAIN without manual DB toggle
 * 3. Direct API calls while blocked:
 *    - POST /r/:slug/scan -> REJECTED (403)
 *    - POST /review/sessions/start -> REJECTED (403)
 *    - GET /review/sessions/:sessionId -> REJECTED (403)
 *    - GET /review/sessions/:sessionId/step -> REJECTED (403)
 *    - POST /review/sessions/complete -> REJECTED (403)
 *    - POST /review/sessions/feedback -> REJECTED (403)
 * 4. Multi-business isolation under same owner
 */

import 'dotenv/config';
import assert from 'assert';
import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { QRService } from '../modules/qr/service';
import { QRController } from '../modules/qr/controller';
import { ReviewService } from '../modules/review/service';
import { ReviewController } from '../modules/review/controller';
import { AIProviderFactory } from '../modules/review/ai/factory';

async function runStep2Verification() {
  console.log('================================================================');
  console.log(' STEP 2: HARD-LOCK QR ACCESS WHEN ENTITLEMENT IS BLOCKED        ');
  console.log('================================================================\n');

  const qrService = new QRService(supabase);
  const qrController = new QRController(qrService);
  const aiFactory = new AIProviderFactory({});
  const reviewService = new ReviewService(supabase, aiFactory);
  const reviewController = new ReviewController(reviewService);

  // Setup test user
  const { data: user } = (await supabase.from('users').select('id, email, role').limit(1).single()) as any;
  if (!user) throw new Error('No user found in database');
  const userId = user.id;

  const testBizIds: string[] = [];

  const createTestBusiness = async (name: string, slug: string) => {
    const { data: biz, error } = (await supabase
      .from('businesses')
      .insert({
        owner_id: userId,
        name,
        slug: `${slug}-${Date.now().toString(36)}`,
        status: 'active',
        google_review_url: 'https://g.page/r/test/review',
      })
      .select()
      .single()) as any;
    if (error || !biz) throw new Error('Failed to create test business: ' + (error?.message || ''));
    testBizIds.push(biz.id);
    return biz;
  };

  const createTestQR = async (businessId: string, label: string) => {
    const slug = `qr-${label}-${Date.now().toString(36)}`;
    const { data: qr, error } = (await supabase
      .from('qr_codes')
      .insert({
        business_id: businessId,
        label,
        slug,
        is_active: true,
      })
      .select()
      .single()) as any;
    if (error || !qr) throw new Error('Failed to create test QR: ' + (error?.message || ''));
    return qr;
  };

  const cleanup = async () => {
    for (const bId of testBizIds) {
      await supabase.from('review_sessions').delete().eq('business_id', bId);
      await supabase.from('scan_logs').delete().eq('business_id', bId);
      await supabase.from('qr_codes').delete().eq('business_id', bId);
      await supabase.from('subscriptions').delete().eq('business_id', bId);
      await supabase.from('businesses').delete().eq('id', bId);
    }
  };

  // Helper to execute getBusinessByQRSlug and capture output or error
  const callGetBusinessByQRSlug = async (slug: string): Promise<{ status: number; data?: any; error?: any; code?: string }> => {
    let responseStatus = 200;
    let responseData: any = null;
    let caughtError: any = null;

    const mockReq = {
      params: { slug },
      headers: {},
      query: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      get: (header: string) => (header === 'user-agent' ? 'TestBrowser' : undefined),
    } as any;

    const mockRes = {
      status: (s: number) => {
        responseStatus = s;
        return {
          json: (d: any) => {
            responseData = d;
          },
        };
      },
      json: (d: any) => {
        responseData = d;
      },
    } as any;

    await qrController.getBusinessByQRSlug(mockReq, mockRes, (err: any) => {
      caughtError = err;
      if (err) {
        responseStatus = err.statusCode || 500;
      }
    });

    return {
      status: responseStatus,
      data: responseData,
      error: caughtError,
      code: caughtError?.code,
    };
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: QR GENERATION & ACTIVATION ENFORCEMENT
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: QR Generation and Activation Entitlement Enforcement ---');
    const bizGen = await createTestBusiness('Biz Gen Test', 'biz-gen');
    const qrGen = await createTestQR(bizGen.id, 'Biz Gen Initial QR');

    // Make bizGen subscription expired
    const expiredDate = new Date(Date.now() - 5 * 86400000).toISOString();
    await supabase.from('subscriptions').upsert({
      business_id: bizGen.id,
      owner_id: userId,
      plan_id: 'base',
      status: 'expired',
      price_cents: 249900,
      currency: 'INR',
      billing_cycle: 'monthly',
      current_period_start: new Date(Date.now() - 35 * 86400000).toISOString(),
      current_period_end: expiredDate,
      metadata: {
        plan_id: 'base',
        monthly_qr_quota: 200,
        current_month_qr_used: 10,
      },
    }, { onConflict: 'business_id' });

    // Try creating a new QR code while expired -> MUST REJECT
    let createError: any = null;
    try {
      await qrService.createQRCode(bizGen.id, userId, 'owner', { name: 'Attempted QR' });
    } catch (err: any) {
      createError = err;
    }
    assert(createError, 'Creating QR code for expired subscription must be rejected');
    assert.strictEqual(createError.statusCode, 403);
    assert.strictEqual(createError.code, 'SUBSCRIPTION_EXPIRED');

    // Try activating an inactive QR code while expired -> MUST REJECT
    let activateError: any = null;
    try {
      await qrService.updateQRCode(bizGen.id, qrGen.id, userId, 'owner', { is_active: true });
    } catch (err: any) {
      activateError = err;
    }
    assert(activateError, 'Activating QR code for expired subscription must be rejected');
    assert.strictEqual(activateError.statusCode, 403);
    assert.strictEqual(activateError.code, 'SUBSCRIPTION_EXPIRED');

    console.log('✔ TEST 1 PASSED: QR creation and activation strictly rejected when expired.\n');

    // -------------------------------------------------------------------------
    // TEST 2: CASE A — Subscription Active + Quota Available -> QR ALLOWED
    // -------------------------------------------------------------------------
    console.log('--- TEST 2: CASE A — Subscription Active + Quota Available -> QR ALLOWED ---');
    const bizA = await createTestBusiness('Biz A Active', 'biz-a');
    const qrA = await createTestQR(bizA.id, 'Biz A QR');

    await entitlementService.activatePlan({
      businessId: bizA.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
    });

    const resA = await callGetBusinessByQRSlug(qrA.slug);
    assert.strictEqual(resA.status, 200, 'Must return 200 OK');
    assert(resA.data?.data?.business, 'Must render business data');
    assert.strictEqual(resA.data?.data?.business?.id, bizA.id);
    console.log('✔ TEST 2 (CASE A) PASSED: Active subscription with remaining quota renders review flow.\n');

    // -------------------------------------------------------------------------
    // TEST 3: CASE B — Subscription Active + QR Quota Exhausted -> QR BLOCKED, AI UNAFFECTED
    // -------------------------------------------------------------------------
    console.log('--- TEST 3: CASE B — Active + QR Quota Exhausted -> QR BLOCKED, AI UNAFFECTED ---');
    // Set QR used = 200 (exhausted)
    await supabase.from('subscriptions').update({
      metadata: {
        plan_id: 'base',
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_month_qr_used: 200,
        current_month_ai_used: 10,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    }).eq('business_id', bizA.id);

    const resB = await callGetBusinessByQRSlug(qrA.slug);
    assert.strictEqual(resB.status, 403, 'Must return 403 Forbidden');
    assert.strictEqual(resB.code, 'QR_QUOTA_EXHAUSTED', 'Reason must be QR_QUOTA_EXHAUSTED');

    // Check that AI generation remains unaffected and independent
    const aiCheckB = await entitlementService.canUseService(bizA.id, 'ai_generation');
    assert.strictEqual(aiCheckB.allowed, true, 'AI service must remain usable when QR quota is exhausted');

    console.log('✔ TEST 3 (CASE B) PASSED: QR quota exhausted blocks QR, leaves AI service unaffected.\n');

    // -------------------------------------------------------------------------
    // TEST 4: CASE C — Subscription Expired -> BLOCKED (No review session, no scan log)
    // -------------------------------------------------------------------------
    console.log('--- TEST 4: CASE C — Subscription Expired -> BLOCKED COMPLETELY ---');
    const bizC = await createTestBusiness('Biz C Expired', 'biz-c');
    const qrC = await createTestQR(bizC.id, 'Biz C QR');

    await supabase.from('subscriptions').upsert({
      business_id: bizC.id,
      owner_id: userId,
      plan_id: 'base',
      status: 'expired',
      price_cents: 249900,
      currency: 'INR',
      billing_cycle: 'monthly',
      current_period_start: new Date(Date.now() - 40 * 86400000).toISOString(),
      current_period_end: new Date(Date.now() - 5 * 86400000).toISOString(),
      metadata: {
        plan_id: 'base',
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_month_qr_used: 10,
        current_month_ai_used: 5,
      },
    }, { onConflict: 'business_id' });

    // Initial count of scan logs and sessions
    const { count: scanCountBefore } = await supabase.from('scan_logs').select('*', { count: 'exact', head: true }).eq('business_id', bizC.id);
    const { count: sessionCountBefore } = await supabase.from('review_sessions').select('*', { count: 'exact', head: true }).eq('business_id', bizC.id);

    const resC = await callGetBusinessByQRSlug(qrC.slug);
    assert.strictEqual(resC.status, 403, 'Must return 403 Forbidden');
    assert.strictEqual(resC.code, 'SUBSCRIPTION_EXPIRED', 'Must be SUBSCRIPTION_EXPIRED');

    // Verify scan log and review sessions were NOT created
    const { count: scanCountAfter } = await supabase.from('scan_logs').select('*', { count: 'exact', head: true }).eq('business_id', bizC.id);
    const { count: sessionCountAfter } = await supabase.from('review_sessions').select('*', { count: 'exact', head: true }).eq('business_id', bizC.id);
    assert.strictEqual(scanCountAfter, scanCountBefore, 'Scan logs must NOT increment when blocked');
    assert.strictEqual(sessionCountAfter, sessionCountBefore, 'Review sessions must NOT be created when blocked');

    console.log('✔ TEST 4 (CASE C) PASSED: Expired subscription blocked completely without creating scans or sessions.\n');

    // -------------------------------------------------------------------------
    // TEST 5: CASE D — Trial Active + Quota Available -> QR ALLOWED
    // -------------------------------------------------------------------------
    console.log('--- TEST 5: CASE D — Trial Active + Quota Available -> QR ALLOWED ---');
    const bizD = await createTestBusiness('Biz D Trial Active', 'biz-d');
    const qrD = await createTestQR(bizD.id, 'Biz D QR');

    const trialStartD = new Date().toISOString();
    const trialEndD = new Date(Date.now() + 10 * 86400000).toISOString();

    await supabase.from('subscriptions').upsert({
      business_id: bizD.id,
      owner_id: userId,
      plan_id: 'free_trial',
      status: 'trialing',
      price_cents: 0,
      currency: 'INR',
      billing_cycle: 'monthly',
      current_period_start: trialStartD,
      current_period_end: trialEndD,
      trial_start: trialStartD,
      trial_end: trialEndD,
      metadata: {
        plan_id: 'free_trial',
        is_trial: true,
        duration_days: 14,
        allocated_qr_quota: 100,
        allocated_ai_quota: 50,
        remaining_qr_quota: 100,
        remaining_ai_quota: 50,
      },
    }, { onConflict: 'business_id' });

    const resD = await callGetBusinessByQRSlug(qrD.slug);
    assert.strictEqual(resD.status, 200, 'Must return 200 OK for active trial');
    assert(resD.data?.data?.business, 'Must render business data for active trial');
    console.log('✔ TEST 5 (CASE D) PASSED: Active trial renders review flow.\n');

    // -------------------------------------------------------------------------
    // TEST 6: CASE E — Trial Expired -> BLOCKED
    // -------------------------------------------------------------------------
    console.log('--- TEST 6: CASE E — Trial Expired -> BLOCKED ---');
    const bizE = await createTestBusiness('Biz E Trial Expired', 'biz-e');
    const qrE = await createTestQR(bizE.id, 'Biz E QR');

    const trialStartE = new Date(Date.now() - 20 * 86400000).toISOString();
    const trialEndE = new Date(Date.now() - 6 * 86400000).toISOString();

    await supabase.from('subscriptions').upsert({
      business_id: bizE.id,
      owner_id: userId,
      plan_id: 'free_trial',
      status: 'expired',
      price_cents: 0,
      currency: 'INR',
      billing_cycle: 'monthly',
      current_period_start: trialStartE,
      current_period_end: trialEndE,
      trial_start: trialStartE,
      trial_end: trialEndE,
      metadata: {
        plan_id: 'free_trial',
        is_trial: true,
        duration_days: 14,
        allocated_qr_quota: 100,
        allocated_ai_quota: 50,
      },
    }, { onConflict: 'business_id' });

    const resE = await callGetBusinessByQRSlug(qrE.slug);
    assert.strictEqual(resE.status, 403, 'Must return 403 Forbidden for expired trial');
    assert.strictEqual(resE.code, 'TRIAL_EXPIRED', 'Must be TRIAL_EXPIRED');
    console.log('✔ TEST 6 (CASE E) PASSED: Expired trial strictly blocked with TRIAL_EXPIRED.\n');

    // -------------------------------------------------------------------------
    // TEST 7: CASE F — Renewed Subscription -> Existing QR works automatically
    // -------------------------------------------------------------------------
    console.log('--- TEST 7: CASE F — Renewed Subscription -> Works automatically without manual DB toggle ---');
    // Ensure qrC on bizC was left with is_active: false
    await supabase.from('qr_codes').update({ is_active: false }).eq('id', qrC.id);

    // Renew bizC with paid plan
    await entitlementService.activatePlan({
      businessId: bizC.id,
      ownerId: userId,
      planId: 'pro',
      durationMonths: 12,
      price: 8999,
      qrQuota: 1000,
      aiQuota: 500,
      assignedBy: 'renewal',
    });

    // Public QR route accessed for the existing QR code
    const resF = await callGetBusinessByQRSlug(qrC.slug);
    assert.strictEqual(resF.status, 200, 'Must return 200 OK after renewal');
    assert(resF.data?.data?.business, 'Must render business data after renewal');

    // Verify existing QR code in database is valid and active without creating duplicates
    const { data: qrsBizC } = await supabase.from('qr_codes').select('*').eq('business_id', bizC.id);
    assert.strictEqual(qrsBizC?.length, 1, 'No duplicate QR code should be created on renewal');
    assert.strictEqual(qrsBizC![0].id, qrC.id, 'Existing QR record must be preserved');
    assert.strictEqual(qrsBizC![0].is_active, true, 'Existing QR must be active');
    console.log('✔ TEST 7 (CASE F) PASSED: Renewed subscription automatically reactivates existing QR.\n');

    // -------------------------------------------------------------------------
    // TEST 8: DIRECT API CALLS PROTECTION WHILE BLOCKED
    // -------------------------------------------------------------------------
    console.log('--- TEST 8: Direct API Calls Protection While Blocked ---');
    // bizE is expired trial
    // 1. POST /r/:slug/scan
    let scanApiError: any = null;
    try {
      await qrService.handleScan(qrE.slug, {
        ip_address: '127.0.0.1',
        user_agent: 'TestAgent',
      });
    } catch (err: any) {
      scanApiError = err;
    }
    assert(scanApiError, 'POST /r/:slug/scan must be rejected when blocked');
    assert.strictEqual(scanApiError.statusCode, 403);
    assert.strictEqual(scanApiError.code, 'TRIAL_EXPIRED');

    // 2. POST /review/sessions/start
    let sessionStartError: any = null;
    try {
      await reviewService.createSession({
        business_id: bizE.id,
        qr_code_id: qrE.id,
      });
    } catch (err: any) {
      sessionStartError = err;
    }
    assert(sessionStartError, 'POST /review/sessions/start must be rejected when blocked');
    assert.strictEqual(sessionStartError.statusCode, 403);
    assert.strictEqual(sessionStartError.code, 'TRIAL_EXPIRED');

    // 3. Create dummy session on expired biz and test session endpoints
    const { data: dummySession } = await supabase.from('review_sessions').insert({
      business_id: bizE.id,
      qr_code_id: qrE.id,
      status: 'started',
    }).select().single();

    if (dummySession) {
      // Test getSessionWithReview
      let getSessError: any = null;
      try {
        await reviewService.getSessionWithReview(dummySession.id);
      } catch (err: any) {
        getSessError = err;
      }
      assert(getSessError, 'GET /review/sessions/:id must be rejected when blocked');
      assert.strictEqual(getSessError.statusCode, 403);

      // Test getFlowStep
      let getStepError: any = null;
      try {
        await reviewService.getFlowStep(dummySession.id);
      } catch (err: any) {
        getStepError = err;
      }
      assert(getStepError, 'GET /review/sessions/:id/step must be rejected when blocked');
      assert.strictEqual(getStepError.statusCode, 403);

      // Test completeReview
      let completeError: any = null;
      try {
        await reviewService.completeReview(dummySession.id);
      } catch (err: any) {
        completeError = err;
      }
      assert(completeError, 'POST /review/sessions/complete must be rejected when blocked');
      assert.strictEqual(completeError.statusCode, 403);

      // Test submitPrivateFeedback
      let feedbackError: any = null;
      try {
        await reviewService.submitPrivateFeedback(dummySession.id, 'Feedback message');
      } catch (err: any) {
        feedbackError = err;
      }
      assert(feedbackError, 'POST /review/sessions/feedback must be rejected when blocked');
      assert.strictEqual(feedbackError.statusCode, 403);
    }

    console.log('✔ TEST 8 PASSED: All direct API calls strictly blocked with 403 when entitlement is blocked.\n');

    // -------------------------------------------------------------------------
    // TEST 9: MULTI-BUSINESS SAFETY UNDER ONE USER
    // -------------------------------------------------------------------------
    console.log('--- TEST 9: Multi-Business Isolation Under Same User ---');
    // bizE is expired (TRIAL_EXPIRED)
    // bizC is active paid renewed (PRO PLAN)
    // Both owned by same userId
    const resBizE = await callGetBusinessByQRSlug(qrE.slug);
    assert.strictEqual(resBizE.status, 403, 'Expired business must remain blocked');

    const resBizC = await callGetBusinessByQRSlug(qrC.slug);
    assert.strictEqual(resBizC.status, 200, 'Active business must remain usable');

    console.log('✔ TEST 9 PASSED: One business being blocked never affects another business under the same user.\n');

    console.log('================================================================');
    console.log(' ALL STEP 2 HARD-LOCK VERIFICATION TESTS PASSED SUCCESSFULLY!   ');
    console.log('================================================================');
  } finally {
    await cleanup();
  }
}

runStep2Verification().catch((err) => {
  console.error('\n❌ STEP 2 VERIFICATION FAILED:', err);
  process.exit(1);
});
