/**
 * STEP 4 — FINAL END-TO-END SUBSCRIPTION + QR ENTITLEMENT AUDIT SUITE
 * 
 * Audits the complete end-to-end lifecycle and proves zero bypass:
 * 1. LOGIN -> DASHBOARD (status, cache headers, lock state)
 * 2. DASHBOARD -> BILLING (consistency, accurate badges, no false "Active Paid")
 * 3. BILLING -> QR CODES (creation guard, listing)
 * 4. EXISTING QR -> PUBLIC /r/[slug] (authoritative gatekeeping, no scan usage when blocked)
 * 5. PUBLIC QR -> REVIEW SESSION (session creation guard, direct session APIs)
 * 6. REVIEW SESSION -> AI GENERATION (quota deduction, AI independent usability, no guest bypass)
 * 7. AI GENERATION -> COPY/GOOGLE CONTINUE (completion guard)
 * 8. SUBSCRIPTION EXPIRY (Requirement A)
 * 9. MONTHLY QUOTA EXHAUSTION (Requirements B & C)
 * 10. NEXT MONTHLY PERIOD (Requirement E)
 * 11. VERIFIED RENEWAL (Requirement F - auto-heal, no duplicate QR)
 * 12. MULTIPLE BUSINESSES (Requirement G - strict business isolation)
 */

import 'dotenv/config';
import assert from 'assert';
import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { QRService } from '../modules/qr/service';
import { QRController } from '../modules/qr/controller';
import { SubscriptionController } from '../modules/subscription/controller';
import { ReviewService } from '../modules/review/service';
import { ReviewController } from '../modules/review/controller';

async function runStep4E2EEntitlementAudit() {
  console.log('========================================================================');
  console.log(' STEP 4 — FINAL END-TO-END SUBSCRIPTION + QR ENTITLEMENT AUDIT           ');
  console.log('========================================================================\n');

  const qrService = new QRService(supabase);
  const qrController = new QRController(qrService);
  const subscriptionController = new SubscriptionController({ supabase } as any);
  const reviewService = new ReviewService(supabase);
  const reviewController = new ReviewController(reviewService);

  // Setup test user
  const { data: user } = (await supabase.from('users').select('id, email, role').limit(1).single()) as any;
  if (!user) throw new Error('No user found in database');
  const userId = user.id;

  const testBizIds: string[] = [];
  const testQrIds: string[] = [];

  const createTestBusiness = async (name: string, slug: string) => {
    const { data: biz, error } = (await supabase
      .from('businesses')
      .insert({
        owner_id: userId,
        name,
        slug: `${slug}-${Date.now().toString(36)}`,
        status: 'active',
        google_review_url: 'https://g.page/r/test/review',
      } as any)
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
      } as any)
      .select()
      .single()) as any;
    if (error || !qr) throw new Error('Failed to create test QR: ' + (error?.message || ''));
    testQrIds.push(qr.id);
    return qr;
  };

  const cleanup = async () => {
    for (const bId of testBizIds) {
      await supabase.from('generated_reviews').delete().eq('business_id', bId);
      await supabase.from('review_sessions').delete().eq('business_id', bId);
      await supabase.from('scan_logs').delete().eq('business_id', bId);
      await supabase.from('qr_codes').delete().eq('business_id', bId);
      await supabase.from('subscriptions').delete().eq('business_id', bId);
      await supabase.from('businesses').delete().eq('id', bId);
    }
  };

  // Helper to fetch server-authoritative /subscription/status response
  const callGetStatus = async (businessId?: string): Promise<{ data: any; headers: Record<string, string> }> => {
    let responseData: any = null;
    const responseHeaders: Record<string, string> = {};
    const mockReq = {
      user: { sub: userId, role: 'client' },
      query: businessId ? { business_id: businessId } : {},
      headers: {},
    } as any;
    const mockRes = {
      setHeader: (name: string, value: string) => {
        responseHeaders[name.toLowerCase()] = value;
      },
      json: (d: any) => {
        responseData = d?.data || d;
      },
    } as any;

    await subscriptionController.getStatus(mockReq, mockRes, (err: any) => {
      if (err) throw err;
    });
    return { data: responseData, headers: responseHeaders };
  };

  // Helper to test public QR access (/r/:slug)
  const callGetBusinessByQRSlug = async (slug: string): Promise<{ status: number; code?: string; data?: any }> => {
    let responseStatus = 200;
    let caughtError: any = null;
    let responseData: any = null;

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
      if (err) responseStatus = err.statusCode || 500;
    });

    return { status: responseStatus, code: caughtError?.code, data: responseData };
  };

  // Helper to test review session creation (/review/sessions/start)
  const callStartSession = async (payload: any): Promise<{ status: number; code?: string; session?: any }> => {
    let responseStatus = 201;
    let caughtError: any = null;
    let responseData: any = null;

    const mockReq = {
      body: payload,
      headers: {},
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

    await reviewController.startSession(mockReq, mockRes, (err: any) => {
      caughtError = err;
      if (err) responseStatus = err.statusCode || 500;
    });

    return { status: responseStatus, code: caughtError?.code, session: responseData?.data?.session };
  };

  // Helper to test AI review generation (/review/sessions/generate)
  const callGenerateReview = async (payload: any): Promise<{ status: number; code?: string; review?: any }> => {
    let responseStatus = 201;
    let caughtError: any = null;
    let responseData: any = null;

    const mockReq = {
      body: payload,
      headers: {},
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

    await reviewController.generateReview(mockReq, mockRes, (err: any) => {
      caughtError = err;
      if (err) responseStatus = err.statusCode || 500;
    });

    return { status: responseStatus, code: caughtError?.code, review: responseData?.data?.review };
  };

  // Helper to test completing review (/review/sessions/complete)
  const callCompleteReview = async (sessionId: string): Promise<{ status: number; code?: string; redirect_url?: string }> => {
    let responseStatus = 200;
    let caughtError: any = null;
    let responseData: any = null;

    const mockReq = {
      body: { session_id: sessionId },
      params: { sessionId },
      headers: {},
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

    await reviewController.completeReview(mockReq, mockRes, (err: any) => {
      caughtError = err;
      if (err) responseStatus = err.statusCode || 500;
    });

    return { status: responseStatus, code: caughtError?.code, redirect_url: responseData?.data?.redirect_url };
  };

  try {
    // =========================================================================
    // SECTION 1: FLOW 1-7 (ACTIVE SUBSCRIPTION + QUOTAS AVAILABLE)
    // =========================================================================
    console.log('--- TEST 1: COMPLETE END-TO-END HAPPY PATH (FLOW 1-7) ---');
    const bizActive = await createTestBusiness('Active Cafe', 'active-cafe');
    const qrActive = await createTestQR(bizActive.id, 'Active Counter QR');

    await entitlementService.activatePlan({
      businessId: bizActive.id,
      ownerId: userId,
      planId: 'pro',
      durationMonths: 6,
      price: 4999,
      qrQuota: 500,
      aiQuota: 250,
    });

    // 1. LOGIN -> DASHBOARD
    const { data: dashStatus, headers: dashHeaders } = await callGetStatus(bizActive.id);
    assert.strictEqual(dashStatus.is_blocked, false, 'Dashboard must not be blocked');
    assert.strictEqual(dashStatus.is_active, true, 'Dashboard must show active state');
    assert.strictEqual(dashStatus.is_expired, false, 'Dashboard must not be expired');
    assert.strictEqual(dashHeaders['cache-control'], 'no-cache, no-store, must-revalidate', 'Cache-control must prevent stale caching');
    console.log('  ✔ Step 1 (Dashboard): Active state and strict anti-cache headers verified.');

    // 2. DASHBOARD -> BILLING
    assert.strictEqual(dashStatus.status, 'ACTIVE', 'Billing status must be ACTIVE');
    assert.strictEqual(dashStatus.plan.name, 'Pro', 'Plan name must be Pro');
    assert.strictEqual(dashStatus.qr_scans.limit, 500, 'QR limit must be 500');
    assert.strictEqual(dashStatus.qr_scans.remaining, 500, 'QR remaining must be 500');
    assert.strictEqual(dashStatus.ai_generations.limit, 250, 'AI limit must be 250');
    assert.strictEqual(dashStatus.ai_generations.remaining, 250, 'AI remaining must be 250');
    console.log('  ✔ Step 2 (Billing): Status, quotas, and limits consistent with authoritative resolver.');

    // 3. BILLING -> QR CODES
    const qrCheckAllowed = await entitlementService.canUseService(bizActive.id, 'create_qr');
    assert.strictEqual(qrCheckAllowed.allowed, true, 'Creating QR code must be allowed');
    console.log('  ✔ Step 3 (QR Management): QR code creation allowed under active plan.');

    // 4. EXISTING QR -> PUBLIC /r/[slug]
    const qrVisitRes = await callGetBusinessByQRSlug(qrActive.slug);
    assert.strictEqual(qrVisitRes.status, 200, 'Public QR route must return 200 OK');
    assert(qrVisitRes.data?.data?.business, 'Business details returned');
    console.log('  ✔ Step 4 (Public QR): /r/[slug] successfully resolved and served.');

    // Verify 1 QR quota consumed by the scan
    const afterScanEntitlement = await entitlementService.getBusinessEntitlement(bizActive.id);
    assert.strictEqual(afterScanEntitlement.current_month_qr_used, 1, 'QR scan must consume 1 quota unit');
    assert.strictEqual(afterScanEntitlement.current_month_qr_remaining, 499, 'QR remaining must be 499');

    // 5. PUBLIC QR -> REVIEW SESSION
    const sessionRes = await callStartSession({
      qr_code_id: qrActive.id,
      business_id: bizActive.id,
      rating: 5,
      language: 'en',
    });
    assert.strictEqual(sessionRes.status, 201, 'Review session must be created with 201');
    const sessionId = sessionRes.session?.id;
    assert(sessionId, 'Valid session ID returned');
    console.log('  ✔ Step 5 (Review Session): Session successfully started with ID ' + sessionId);

    // 6. REVIEW SESSION -> AI GENERATION
    const genRes = await callGenerateReview({
      session_id: sessionId,
      business_id: bizActive.id,
      rating: 5,
      language: 'en',
      tags: ['Fast Service', 'Clean Environment'],
    });
    assert.strictEqual(genRes.status, 201, 'AI generation must succeed with 201');
    assert(genRes.review?.generated_text, 'Generated review text must be present');

    const afterAiEntitlement = await entitlementService.getBusinessEntitlement(bizActive.id);
    assert.strictEqual(afterAiEntitlement.current_month_ai_used, 1, 'AI generation must consume 1 quota unit');
    assert.strictEqual(afterAiEntitlement.current_month_ai_remaining, 249, 'AI remaining must be 249');
    console.log('  ✔ Step 6 (AI Generation): Review generated and 1 AI quota unit consumed.');

    // 7. AI GENERATION -> COPY / GOOGLE CONTINUE
    const copyRes = await reviewService.recordCopy(sessionId);
    assert.strictEqual(copyRes.success, true, 'Copy review must succeed');

    const completeRes = await callCompleteReview(sessionId);
    assert.strictEqual(completeRes.status, 200, 'Complete review must succeed');
    assert.strictEqual(completeRes.redirect_url, 'https://g.page/r/test/review', 'Correct Google redirect URL');
    console.log('  ✔ Step 7 (Copy/Redirect): Customer copy recorded and redirect URL provided.\n');

    // =========================================================================
    // SECTION 2: REQUIREMENT A (SUBSCRIPTION / TRIAL EXPIRED HARD-LOCK)
    // =========================================================================
    console.log('--- TEST 2: REQUIREMENT A (SUBSCRIPTION EXPIRED HARD-LOCK) ---');
    const bizExpired = await createTestBusiness('Expired Bistro', 'expired-bistro');
    const qrExpired = await createTestQR(bizExpired.id, 'Expired Bistro QR');

    // Create an expired subscription
    await supabase.from('subscriptions').insert({
      business_id: bizExpired.id,
      owner_id: userId,
      plan_id: 'base',
      status: 'expired',
      billing_cycle: 'monthly',
      price_cents: 249900,
      currency: 'INR',
      current_period_start: new Date(Date.now() - 60 * 86400000).toISOString(),
      current_period_end: new Date(Date.now() - 30 * 86400000).toISOString(),
      metadata: {
        plan_id: 'base',
        plan_name: 'Base',
        duration_months: 1,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_month_qr_used: 50,
        current_month_ai_used: 25,
      },
    } as any);

    // Verify Dashboard = locked
    const { data: expiredDash } = await callGetStatus(bizExpired.id);
    assert.strictEqual(expiredDash.is_blocked, true, 'Dashboard must be blocked');
    assert.strictEqual(expiredDash.is_expired, true, 'Dashboard must show is_expired = true');
    assert.strictEqual(expiredDash.is_active, false, 'Dashboard must show is_active = false');
    assert.strictEqual(expiredDash.exhaustion_reason, 'SUBSCRIPTION_EXPIRED', 'Reason must be SUBSCRIPTION_EXPIRED');

    // Verify Billing = expired
    assert.strictEqual(expiredDash.status, 'EXPIRED', 'Billing status must be EXPIRED');

    // Verify existing QR record still exists in DB
    const { data: preservedQr } = await supabase.from('qr_codes').select('id').eq('id', qrExpired.id).single();
    assert(preservedQr, 'Existing QR record must NOT be deleted');

    // Verify /r/[slug] = blocked with 403
    const { count: scansBefore } = await supabase.from('scan_logs').select('*', { count: 'exact', head: true }).eq('business_id', bizExpired.id);
    const expiredQrAccess = await callGetBusinessByQRSlug(qrExpired.slug);
    assert.strictEqual(expiredQrAccess.status, 403, 'Public QR must return 403 for expired business');
    assert.strictEqual(expiredQrAccess.code, 'SUBSCRIPTION_EXPIRED', 'Block code must be SUBSCRIPTION_EXPIRED');

    // Verify QR scan usage = NOT incremented
    const { count: scansAfter } = await supabase.from('scan_logs').select('*', { count: 'exact', head: true }).eq('business_id', bizExpired.id);
    assert.strictEqual(scansAfter, scansBefore, 'Scan logs must NOT be incremented for expired business');

    // Verify review session creation = blocked with 403
    const expiredSessionCreate = await callStartSession({
      qr_code_id: qrExpired.id,
      business_id: bizExpired.id,
      rating: 5,
    });
    assert.strictEqual(expiredSessionCreate.status, 403, 'Session creation must return 403 for expired business');
    assert.strictEqual(expiredSessionCreate.code, 'SUBSCRIPTION_EXPIRED', 'Reason must be SUBSCRIPTION_EXPIRED');

    // Verify session creation without business_id (only qr_code_id) is also blocked
    const expiredSessionByQrOnly = await callStartSession({
      qr_code_id: qrExpired.id,
      rating: 5,
    });
    assert.strictEqual(expiredSessionByQrOnly.status, 403, 'Session creation with only qr_code_id must be blocked with 403');
    assert.strictEqual(expiredSessionByQrOnly.code, 'SUBSCRIPTION_EXPIRED');

    // Verify AI generation = blocked with 403
    const expiredAiGen = await callGenerateReview({
      session_id: 'guest-session',
      business_id: bizExpired.id,
      rating: 5,
    });
    assert.strictEqual(expiredAiGen.status, 403, 'AI generation must return 403 for expired business');
    assert.strictEqual(expiredAiGen.code, 'SUBSCRIPTION_EXPIRED');

    // Verify old session mutation APIs are also hard-blocked
    const { data: oldScanLog } = (await supabase.from('scan_logs').insert({
      business_id: bizExpired.id,
      qr_code_id: qrExpired.id,
      scanned_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    } as any).select('id').single()) as any;

    const { data: oldSession } = (await supabase.from('review_sessions').insert({
      business_id: bizExpired.id,
      qr_code_id: qrExpired.id,
      scan_log_id: oldScanLog.id,
      language: 'en',
      rating: 5,
      status: 'started',
    } as any).select().single()) as any;

    let copyBlocked = false;
    try {
      await reviewService.recordCopy(oldSession.id);
    } catch (e: any) {
      copyBlocked = e.statusCode === 403;
    }
    assert.strictEqual(copyBlocked, true, 'recordCopy on session of expired business must throw 403');

    let completeBlocked = false;
    try {
      await reviewService.completeReview(oldSession.id);
    } catch (e: any) {
      completeBlocked = e.statusCode === 403;
    }
    assert.strictEqual(completeBlocked, true, 'completeReview on session of expired business must throw 403');
    console.log('  ✔ Requirement A PASSED: Complete hard-lock across Dashboard, Billing, QR, Sessions, AI, and APIs.\n');

    // =========================================================================
    // SECTION 3: REQUIREMENT B (ACTIVE SUBSCRIPTION + QR MONTHLY QUOTA EXHAUSTED)
    // =========================================================================
    console.log('--- TEST 3: REQUIREMENT B (ACTIVE + QR MONTHLY QUOTA EXHAUSTED) ---');
    const bizQrExhausted = await createTestBusiness('QR Exhausted Cafe', 'qr-exhausted-cafe');
    const qrExhausted = await createTestQR(bizQrExhausted.id, 'QR Exhausted Counter');

    await entitlementService.activatePlan({
      businessId: bizQrExhausted.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
    });

    // Simulate 200/200 QR scans used in current monthly period
    await supabase.from('subscriptions').update({
      metadata: {
        plan_id: 'base',
        plan_name: 'Base',
        duration_months: 6,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_month_qr_used: 200,
        current_month_ai_used: 15,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    } as any).eq('business_id', bizQrExhausted.id);

    const { data: statusB } = await callGetStatus(bizQrExhausted.id);

    // 1. Subscription remains ACTIVE
    assert.strictEqual(statusB.is_active, true, 'Subscription must remain ACTIVE');
    assert.strictEqual(statusB.is_expired, false, 'Subscription must NOT be marked expired');
    assert.strictEqual(statusB.is_blocked, false, 'Dashboard must NOT lock the entire account');
    assert.strictEqual(statusB.status, 'ACTIVE', 'Billing status must remain ACTIVE');

    // 2. Billing shows QR 100% used / 0 remaining
    assert.strictEqual(statusB.qr_scans.used, 200, 'QR used must be 200');
    assert.strictEqual(statusB.qr_scans.remaining, 0, 'QR remaining must be 0');
    assert.strictEqual(statusB.qr_scans.percentage, 100, 'QR percentage must be 100%');
    assert(statusB.ai_generations.remaining > 0, 'AI quota must still remain available');

    // 3. QR usage = blocked
    const qrAccessB = await callGetBusinessByQRSlug(qrExhausted.slug);
    assert.strictEqual(qrAccessB.status, 403, 'Public QR route must be blocked with 403');
    assert.strictEqual(qrAccessB.code, 'QR_QUOTA_EXHAUSTED', 'Reason must be QR_QUOTA_EXHAUSTED');

    // 4. AI remains independently usable
    const aiCheckB = await entitlementService.canUseService(bizQrExhausted.id, 'ai_generation');
    assert.strictEqual(aiCheckB.allowed, true, 'AI service must remain independently usable');
    console.log('  ✔ Requirement B PASSED: Subscription active, QR blocked, AI independently usable.\n');

    // =========================================================================
    // SECTION 4: REQUIREMENT C (ACTIVE SUBSCRIPTION + AI QUOTA EXHAUSTED)
    // =========================================================================
    console.log('--- TEST 4: REQUIREMENT C (ACTIVE + AI QUOTA EXHAUSTED) ---');
    const bizAiExhausted = await createTestBusiness('AI Exhausted Cafe', 'ai-exhausted-cafe');
    const qrAiExhausted = await createTestQR(bizAiExhausted.id, 'AI Exhausted Counter');

    await entitlementService.activatePlan({
      businessId: bizAiExhausted.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
    });

    // Simulate 100/100 AI generations used, but QR scans remaining
    await supabase.from('subscriptions').update({
      metadata: {
        plan_id: 'base',
        plan_name: 'Base',
        duration_months: 6,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_month_qr_used: 20,
        current_month_ai_used: 100,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    } as any).eq('business_id', bizAiExhausted.id);

    const { data: statusC } = await callGetStatus(bizAiExhausted.id);

    // 1. Subscription remains ACTIVE
    assert.strictEqual(statusC.is_active, true, 'Subscription must remain ACTIVE');
    assert.strictEqual(statusC.is_expired, false, 'Subscription must NOT be marked expired');
    assert.strictEqual(statusC.is_blocked, false, 'Dashboard must NOT lock the entire account');
    assert.strictEqual(statusC.status, 'ACTIVE', 'Billing status must remain ACTIVE');

    // 2. Billing shows AI 100% used / 0 remaining
    assert.strictEqual(statusC.ai_generations.used, 100, 'AI used must be 100');
    assert.strictEqual(statusC.ai_generations.remaining, 0, 'AI remaining must be 0');
    assert.strictEqual(statusC.ai_generations.percentage, 100, 'AI percentage must be 100%');
    assert(statusC.qr_scans.remaining > 0, 'QR scans must remain available');

    // 3. QR remains usable
    const qrAccessC = await callGetBusinessByQRSlug(qrAiExhausted.slug);
    assert.strictEqual(qrAccessC.status, 200, 'Public QR route must remain ALLOWED');

    // 4. AI generation is blocked
    const aiCheckC = await entitlementService.canUseService(bizAiExhausted.id, 'ai_generation');
    assert.strictEqual(aiCheckC.allowed, false, 'AI generation must be BLOCKED');
    assert.strictEqual(aiCheckC.reason, 'AI_QUOTA_EXHAUSTED');
    console.log('  ✔ Requirement C PASSED: QR functional, AI blocked, subscription active.\n');

    // =========================================================================
    // SECTION 5: REQUIREMENT E (NEXT MONTHLY PERIOD ROLLOVER)
    // =========================================================================
    console.log('--- TEST 5: REQUIREMENT E (NEXT MONTHLY PERIOD USAGE RESET) ---');
    // Simulate advancing time past the monthly boundary (period 1 -> period 2)
    // The subscription started 35 days ago, so as of today it is in period 1 (0-indexed) or period index 1
    const startDate35DaysAgo = new Date(Date.now() - 35 * 86400000).toISOString();
    const expiry5MonthsFromNow = new Date(Date.now() + 145 * 86400000).toISOString();

    await supabase.from('subscriptions').update({
      current_period_start: startDate35DaysAgo,
      current_period_end: expiry5MonthsFromNow,
      metadata: {
        plan_id: 'base',
        plan_name: 'Base',
        duration_months: 6,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_period_index: 0, // previous month
        current_month_qr_used: 200, // was exhausted last month
        current_month_ai_used: 100, // was exhausted last month
      },
    } as any).eq('business_id', bizQrExhausted.id);

    // Call getBusinessEntitlement to trigger authoritative period rollover
    const rolloverEntitlement = await entitlementService.getBusinessEntitlement(bizQrExhausted.id);
    assert.strictEqual(rolloverEntitlement.current_period_index, 1, 'Current period index must advance to 1');
    assert.strictEqual(rolloverEntitlement.current_month_qr_used, 0, 'QR usage must reset to 0 in new period');
    assert.strictEqual(rolloverEntitlement.current_month_ai_used, 0, 'AI usage must reset to 0 in new period');
    assert.strictEqual(rolloverEntitlement.current_month_qr_remaining, 200, 'QR remaining must reset to 200');
    assert.strictEqual(rolloverEntitlement.current_month_ai_remaining, 100, 'AI remaining must reset to 100');
    assert.strictEqual(rolloverEntitlement.is_qr_allowed, true, 'QR service must become usable again');
    assert.strictEqual(rolloverEntitlement.is_ai_allowed, true, 'AI service must become usable again');
    console.log('  ✔ Requirement E PASSED: Quotas cleanly reset, no carry forward, service resumes.\n');

    // =========================================================================
    // SECTION 6: REQUIREMENT F (VERIFIED RENEWAL & QR AUTO-HEAL)
    // =========================================================================
    console.log('--- TEST 6: REQUIREMENT F (RENEWAL & QR AUTO-HEAL) ---');
    // Take the previously expired business (bizExpired) and simulate verified renewal
    // First, verify its QR is currently inactive
    await supabase.from('qr_codes').update({ is_active: false } as any).eq('id', qrExpired.id);
    const { data: qrBeforeRenewal } = await supabase.from('qr_codes').select('is_active').eq('id', qrExpired.id).single();
    assert.strictEqual(qrBeforeRenewal?.is_active, false, 'QR must be inactive before renewal');

    // Renew subscription
    await entitlementService.activatePlan({
      businessId: bizExpired.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
    });

    // Public visitor visits the EXISTING QR link (/r/[slug])
    const renewalVisit = await callGetBusinessByQRSlug(qrExpired.slug);
    assert.strictEqual(renewalVisit.status, 200, 'Existing QR must immediately return 200 OK after renewal');

    // Verify QR was automatically healed and set to is_active: true in DB
    const { data: qrAfterRenewal } = await supabase.from('qr_codes').select('is_active').eq('id', qrExpired.id).single();
    assert.strictEqual(qrAfterRenewal?.is_active, true, 'Existing QR code must be automatically healed to active');

    // Verify NO duplicate QR code was created
    const { data: allQrsForBiz } = await supabase.from('qr_codes').select('id').eq('business_id', bizExpired.id);
    assert.strictEqual(allQrsForBiz?.length, 1, 'Exactly 1 QR code must exist, NO duplicate records created');
    console.log('  ✔ Requirement F PASSED: Existing QR auto-healed, 0 duplicates, no manual DB activation.\n');

    // =========================================================================
    // SECTION 7: REQUIREMENT G (MULTIPLE BUSINESSES ISOLATION)
    // =========================================================================
    console.log('--- TEST 7: REQUIREMENT G (MULTI-BUSINESS ISOLATION) ---');
    const bizMulti1 = await createTestBusiness('Multi Biz 1 Expired', 'multi-1');
    const qrMulti1 = await createTestQR(bizMulti1.id, 'Multi 1 QR');
    const bizMulti2 = await createTestBusiness('Multi Biz 2 Active', 'multi-2');
    const qrMulti2 = await createTestQR(bizMulti2.id, 'Multi 2 QR');

    // Set Biz 1 = Expired
    await supabase.from('subscriptions').insert({
      business_id: bizMulti1.id,
      owner_id: userId,
      plan_id: 'base',
      status: 'expired',
      billing_cycle: 'monthly',
      price_cents: 249900,
      currency: 'INR',
      current_period_start: new Date(Date.now() - 60 * 86400000).toISOString(),
      current_period_end: new Date(Date.now() - 30 * 86400000).toISOString(),
      metadata: { plan_id: 'base', plan_name: 'Base' },
    } as any);

    // Set Biz 2 = Active Paid
    await entitlementService.activatePlan({
      businessId: bizMulti2.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
    });

    // Query status for Biz 1 specifically
    const { data: multi1Status } = await callGetStatus(bizMulti1.id);
    assert.strictEqual(multi1Status.is_expired, true, 'Biz 1 must be EXPIRED');
    assert.strictEqual(multi1Status.is_blocked, true, 'Biz 1 must be BLOCKED');

    // Query status for Biz 2 specifically
    const { data: multi2Status } = await callGetStatus(bizMulti2.id);
    assert.strictEqual(multi2Status.is_expired, false, 'Biz 2 must NOT be expired');
    assert.strictEqual(multi2Status.is_blocked, false, 'Biz 2 must NOT be blocked');
    assert.strictEqual(multi2Status.status, 'ACTIVE', 'Biz 2 status must be ACTIVE');

    // Verify Biz 1 QR is blocked
    const multi1QrRes = await callGetBusinessByQRSlug(qrMulti1.slug);
    assert.strictEqual(multi1QrRes.status, 403, 'Biz 1 QR must be BLOCKED (403)');

    // Verify Biz 2 QR works
    const multi2QrRes = await callGetBusinessByQRSlug(qrMulti2.slug);
    assert.strictEqual(multi2QrRes.status, 200, 'Biz 2 QR must be ALLOWED (200)');

    console.log('  ✔ Requirement G PASSED: Complete isolation between multiple businesses of same user.\n');

    console.log('========================================================================');
    console.log(' 🎉 ALL STEP 4 END-TO-END ENTITLEMENT AUDIT TESTS PASSED (100%)         ');
    console.log('========================================================================');
  } finally {
    console.log('\nCleaning up test artifacts...');
    await cleanup();
    console.log('Cleanup completed.');
  }
}

runStep4E2EEntitlementAudit().catch((err) => {
  console.error('\n❌ STEP 4 AUDIT FAILED:', err);
  process.exit(1);
});
