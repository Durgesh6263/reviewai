/**
 * STEP 5 — SUBSCRIPTION ENTITLEMENT REGRESSION TEST SUITE
 * 
 * Comprehensive, focused automated tests covering all 10 required entitlement cases:
 * 1. ACTIVE PAID + QR QUOTA AVAILABLE
 * 2. ACTIVE PAID + QR QUOTA EXHAUSTED
 * 3. ACTIVE PAID + AI QUOTA EXHAUSTED
 * 4. PAID SUBSCRIPTION EXPIRED
 * 5. ACTIVE FREE TRIAL
 * 6. FREE TRIAL EXPIRED
 * 7. MONTHLY RESET (deterministic boundaries, no carry forward)
 * 8. VERIFIED RENEWAL (auto-heal, no duplicate records)
 * 9. MULTIPLE BUSINESSES (strict isolation)
 * 10. SECURITY / BYPASS (direct API access prevention)
 * 
 * Uses deterministic fixed dates and authoritative entitlement resolver.
 */

import 'dotenv/config';
import assert from 'assert';
import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService, calculateUsagePeriod } from '../modules/subscription/entitlement';
import { QRService } from '../modules/qr/service';
import { QRController } from '../modules/qr/controller';
import { SubscriptionController } from '../modules/subscription/controller';
import { ReviewService } from '../modules/review/service';
import { ReviewController } from '../modules/review/controller';

async function runStep5RegressionTests() {
  console.log('========================================================================');
  console.log(' STEP 5 — SUBSCRIPTION ENTITLEMENT REGRESSION TEST SUITE                 ');
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
        slug: `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
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
    const slug = `qr-${label}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
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

  // Helper to test /subscription/status
  const callGetStatus = async (businessId?: string): Promise<any> => {
    let responseData: any = null;
    const mockReq = {
      user: { sub: userId, role: 'client' },
      query: businessId ? { business_id: businessId } : {},
      headers: {},
    } as any;
    const mockRes = {
      setHeader: () => {},
      json: (d: any) => {
        responseData = d?.data || d;
      },
    } as any;

    await subscriptionController.getStatus(mockReq, mockRes, (err: any) => {
      if (err) throw err;
    });
    return responseData;
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

  // Helper to test session start
  const callStartSession = async (payload: any): Promise<{ status: number; code?: string; session?: any }> => {
    let responseStatus = 201;
    let caughtError: any = null;
    let responseData: any = null;

    const mockReq = { body: payload, headers: {} } as any;
    const mockRes = {
      status: (s: number) => {
        responseStatus = s;
        return { json: (d: any) => { responseData = d; } };
      },
      json: (d: any) => { responseData = d; },
    } as any;

    await reviewController.startSession(mockReq, mockRes, (err: any) => {
      caughtError = err;
      if (err) responseStatus = err.statusCode || 500;
    });

    return { status: responseStatus, code: caughtError?.code, session: responseData?.data?.session };
  };

  // Helper to test AI review generation
  const callGenerateReview = async (payload: any): Promise<{ status: number; code?: string; review?: any }> => {
    let responseStatus = 201;
    let caughtError: any = null;
    let responseData: any = null;

    const mockReq = { body: payload, headers: {} } as any;
    const mockRes = {
      status: (s: number) => {
        responseStatus = s;
        return { json: (d: any) => { responseData = d; } };
      },
      json: (d: any) => { responseData = d; },
    } as any;

    await reviewController.generateReview(mockReq, mockRes, (err: any) => {
      caughtError = err;
      if (err) responseStatus = err.statusCode || 500;
    });

    return { status: responseStatus, code: caughtError?.code, review: responseData?.data?.review };
  };

  try {
    // =========================================================================
    // CASE 1: ACTIVE PAID + QR QUOTA AVAILABLE
    // =========================================================================
    console.log('--- CASE 1: ACTIVE PAID + QR QUOTA AVAILABLE ---');
    const biz1 = await createTestBusiness('Regress Biz 1', 'regress-biz-1');
    const qr1 = await createTestQR(biz1.id, 'Counter 1');

    await entitlementService.activatePlan({
      businessId: biz1.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
    });

    const qrCheck1 = await entitlementService.canUseService(biz1.id, 'qr_scan');
    assert.strictEqual(qrCheck1.allowed, true, 'Case 1: QR scan must be allowed');

    const qrPublic1 = await callGetBusinessByQRSlug(qr1.slug);
    assert.strictEqual(qrPublic1.status, 200, 'Case 1: Public QR route must return 200');

    const sessionRes1 = await callStartSession({
      qr_code_id: qr1.id,
      business_id: biz1.id,
      rating: 5,
    });
    assert.strictEqual(sessionRes1.status, 201, 'Case 1: Review session creation must be allowed');
    console.log('✔ CASE 1 PASSED: QR allowed, public QR works, review session allowed.\n');

    // =========================================================================
    // CASE 2: ACTIVE PAID + QR QUOTA EXHAUSTED
    // =========================================================================
    console.log('--- CASE 2: ACTIVE PAID + QR QUOTA EXHAUSTED ---');
    const biz2 = await createTestBusiness('Regress Biz 2', 'regress-biz-2');
    const qr2 = await createTestQR(biz2.id, 'Counter 2');

    await entitlementService.activatePlan({
      businessId: biz2.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
    });

    // Simulate 200/200 QR quota consumed, 10/100 AI quota used
    await supabase.from('subscriptions').update({
      metadata: {
        plan_id: 'base',
        plan_name: 'Base',
        duration_months: 6,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_month_qr_used: 200,
        current_month_ai_used: 10,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    } as any).eq('business_id', biz2.id);

    const qrCheck2 = await entitlementService.canUseService(biz2.id, 'qr_scan');
    assert.strictEqual(qrCheck2.allowed, false, 'Case 2: QR scan must be blocked');
    assert.strictEqual(qrCheck2.reason, 'QR_QUOTA_EXHAUSTED', 'Reason must be QR_QUOTA_EXHAUSTED');

    const status2 = await callGetStatus(biz2.id);
    assert.strictEqual(status2.is_active, true, 'Case 2: Subscription must remain ACTIVE');
    assert.strictEqual(status2.is_expired, false, 'Case 2: Must not be marked expired');
    assert.strictEqual(status2.status, 'ACTIVE', 'Case 2: Billing status must be ACTIVE');
    assert.strictEqual(status2.qr_scans.remaining, 0, 'Case 2: QR scans remaining must be 0');

    const aiCheck2 = await entitlementService.canUseService(biz2.id, 'ai_generation');
    assert.strictEqual(aiCheck2.allowed, true, 'Case 2: AI remains available if AI quota remains');
    console.log('✔ CASE 2 PASSED: QR blocked, subscription remains ACTIVE, AI remains available.\n');

    // =========================================================================
    // CASE 3: ACTIVE PAID + AI QUOTA EXHAUSTED
    // =========================================================================
    console.log('--- CASE 3: ACTIVE PAID + AI QUOTA EXHAUSTED ---');
    const biz3 = await createTestBusiness('Regress Biz 3', 'regress-biz-3');
    const qr3 = await createTestQR(biz3.id, 'Counter 3');

    await entitlementService.activatePlan({
      businessId: biz3.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
    });

    // Simulate 10/200 QR quota used, 100/100 AI quota exhausted
    await supabase.from('subscriptions').update({
      metadata: {
        plan_id: 'base',
        plan_name: 'Base',
        duration_months: 6,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_month_qr_used: 10,
        current_month_ai_used: 100,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    } as any).eq('business_id', biz3.id);

    const aiCheck3 = await entitlementService.canUseService(biz3.id, 'ai_generation');
    assert.strictEqual(aiCheck3.allowed, false, 'Case 3: AI must be blocked');
    assert.strictEqual(aiCheck3.reason, 'AI_QUOTA_EXHAUSTED', 'Reason must be AI_QUOTA_EXHAUSTED');

    const qrCheck3 = await entitlementService.canUseService(biz3.id, 'qr_scan');
    assert.strictEqual(qrCheck3.allowed, true, 'Case 3: QR remains available if QR quota remains');

    const publicQr3 = await callGetBusinessByQRSlug(qr3.slug);
    assert.strictEqual(publicQr3.status, 200, 'Case 3: Public QR route remains functional');

    const status3 = await callGetStatus(biz3.id);
    assert.strictEqual(status3.is_active, true, 'Case 3: Subscription remains ACTIVE');
    assert.strictEqual(status3.is_expired, false, 'Case 3: Must not be marked expired');
    console.log('✔ CASE 3 PASSED: AI blocked, QR remains available, subscription active.\n');

    // =========================================================================
    // CASE 4: PAID SUBSCRIPTION EXPIRED
    // =========================================================================
    console.log('--- CASE 4: PAID SUBSCRIPTION EXPIRED ---');
    const biz4 = await createTestBusiness('Regress Biz 4', 'regress-biz-4');
    const qr4 = await createTestQR(biz4.id, 'Counter 4');

    // Deterministic fixed expired period (ended 30 days ago)
    const fixedStart4 = '2026-01-01T00:00:00.000Z';
    const fixedEnd4 = '2026-07-01T00:00:00.000Z';

    await supabase.from('subscriptions').insert({
      business_id: biz4.id,
      owner_id: userId,
      plan_id: 'base',
      status: 'expired',
      billing_cycle: 'monthly',
      price_cents: 249900,
      currency: 'INR',
      current_period_start: fixedStart4,
      current_period_end: fixedEnd4,
      metadata: {
        plan_id: 'base',
        plan_name: 'Base',
        duration_months: 6,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_month_qr_used: 50,
        current_month_ai_used: 25,
      },
    } as any);

    const qrCheck4 = await entitlementService.canUseService(biz4.id, 'qr_scan');
    assert.strictEqual(qrCheck4.allowed, false, 'Case 4: QR must be blocked');
    assert.strictEqual(qrCheck4.reason, 'SUBSCRIPTION_EXPIRED');

    const publicQr4 = await callGetBusinessByQRSlug(qr4.slug);
    assert.strictEqual(publicQr4.status, 403, 'Case 4: Public /r/[slug] must be blocked');
    assert.strictEqual(publicQr4.code, 'SUBSCRIPTION_EXPIRED');

    const sessionRes4 = await callStartSession({
      qr_code_id: qr4.id,
      business_id: biz4.id,
      rating: 5,
    });
    assert.strictEqual(sessionRes4.status, 403, 'Case 4: Review session must be blocked');
    assert.strictEqual(sessionRes4.code, 'SUBSCRIPTION_EXPIRED');

    const status4 = await callGetStatus(biz4.id);
    assert.strictEqual(status4.is_expired, true, 'Case 4: Dashboard/Billing must resolve EXPIRED');
    assert.strictEqual(status4.is_blocked, true, 'Case 4: Dashboard must be locked');
    assert.strictEqual(status4.status, 'EXPIRED', 'Case 4: Billing status must be EXPIRED');
    console.log('✔ CASE 4 PASSED: QR blocked, session blocked, /r/[slug] blocked, Billing resolved EXPIRED.\n');

    // =========================================================================
    // CASE 5: ACTIVE FREE TRIAL
    // =========================================================================
    console.log('--- CASE 5: ACTIVE FREE TRIAL ---');
    const biz5 = await createTestBusiness('Regress Biz 5', 'regress-biz-5');
    const qr5 = await createTestQR(biz5.id, 'Counter 5');

    // Deterministic fixed trial active window: 2026-10-01 to 2026-10-15
    const fixedTrialStart5 = '2026-10-01T00:00:00.000Z';
    const fixedTrialEnd5 = '2026-10-15T00:00:00.000Z';
    const deterministicTrialDate5 = new Date('2026-10-05T12:00:00.000Z'); // 5 days into trial

    await supabase.from('subscriptions').insert({
      business_id: biz5.id,
      owner_id: userId,
      plan_id: 'free_trial',
      status: 'trialing',
      billing_cycle: 'monthly',
      price_cents: 0,
      currency: 'INR',
      trial_start: fixedTrialStart5,
      trial_end: fixedTrialEnd5,
      current_period_start: fixedTrialStart5,
      current_period_end: fixedTrialEnd5,
      metadata: {
        plan_id: 'free_trial',
        duration_days: 14,
        allocated_qr_quota: 100,
        allocated_ai_quota: 50,
        used_qr_quota: 20, // 80 remaining
        used_ai_quota: 10,
        remaining_qr_quota: 80,
        remaining_ai_quota: 40,
        trial_version: 1,
      },
    } as any);

    // Test with deterministic fixed date
    const entitlement5 = await entitlementService.getBusinessEntitlement(biz5.id, deterministicTrialDate5);
    assert.strictEqual(entitlement5.is_trial, true, 'Case 5: Must be trial');
    assert.strictEqual(entitlement5.is_expired, false, 'Case 5: Trial must not be expired');
    assert.strictEqual(entitlement5.current_month_qr_remaining, entitlement5.monthly_qr_quota - 20, 'Case 5: QR remaining must match total minus used');
    assert(entitlement5.current_month_qr_remaining > 0, 'Case 5: Must have QR quota remaining');

    const qrCheck5 = await entitlementService.canUseService(biz5.id, 'qr_scan', deterministicTrialDate5);
    assert.strictEqual(qrCheck5.allowed, true, 'Case 5: canUseService must allow QR');

    // Billing check via controller
    const status5 = await callGetStatus(biz5.id);
    assert.strictEqual(status5.is_trial, true, 'Case 5: Billing is_trial must be true');
    assert.strictEqual(status5.status, 'FREE_TRIAL', 'Case 5: Billing shows FREE_TRIAL, not PAID');
    assert.strictEqual(status5.plan.name, 'Free Trial', 'Case 5: Plan name must be Free Trial');
    console.log('✔ CASE 5 PASSED: QR allowed when quota remains, Billing shows TRIAL, not PAID.\n');

    // =========================================================================
    // CASE 6: FREE TRIAL EXPIRED
    // =========================================================================
    console.log('--- CASE 6: FREE TRIAL EXPIRED ---');
    const biz6 = await createTestBusiness('Regress Biz 6', 'regress-biz-6');
    const qr6 = await createTestQR(biz6.id, 'Counter 6');

    // Deterministic fixed trial expired window: 2026-08-01 to 2026-08-15
    const fixedTrialStart6 = '2026-08-01T00:00:00.000Z';
    const fixedTrialEnd6 = '2026-08-15T00:00:00.000Z';
    const deterministicTrialDate6 = new Date('2026-09-01T00:00:00.000Z'); // Past trial end

    await supabase.from('subscriptions').insert({
      business_id: biz6.id,
      owner_id: userId,
      plan_id: 'free_trial',
      status: 'expired',
      billing_cycle: 'monthly',
      price_cents: 0,
      currency: 'INR',
      trial_start: fixedTrialStart6,
      trial_end: fixedTrialEnd6,
      current_period_start: fixedTrialStart6,
      current_period_end: fixedTrialEnd6,
      metadata: {
        plan_id: 'free_trial',
        duration_days: 14,
        allocated_qr_quota: 100,
        allocated_ai_quota: 50,
        used_qr_quota: 10,
        used_ai_quota: 5,
        trial_version: 1,
      },
    } as any);

    const entitlement6 = await entitlementService.getBusinessEntitlement(biz6.id, deterministicTrialDate6);
    assert.strictEqual(entitlement6.is_expired, true, 'Case 6: Trial must be expired');
    assert.strictEqual(entitlement6.is_qr_allowed, false, 'Case 6: QR must not be allowed');

    const qrCheck6 = await entitlementService.canUseService(biz6.id, 'qr_scan', deterministicTrialDate6);
    assert.strictEqual(qrCheck6.allowed, false, 'Case 6: QR must be blocked');
    assert.strictEqual(qrCheck6.reason, 'TRIAL_EXPIRED');

    const publicQr6 = await callGetBusinessByQRSlug(qr6.slug);
    assert.strictEqual(publicQr6.status, 403, 'Case 6: Public /r/[slug] must be blocked with 403');
    assert.strictEqual(publicQr6.code, 'TRIAL_EXPIRED');

    const sessionRes6 = await callStartSession({
      qr_code_id: qr6.id,
      business_id: biz6.id,
      rating: 5,
    });
    assert.strictEqual(sessionRes6.status, 403, 'Case 6: Review session creation must be blocked with 403');
    assert.strictEqual(sessionRes6.code, 'TRIAL_EXPIRED');
    console.log('✔ CASE 6 PASSED: Expired trial strictly blocks QR, public access, and review sessions.\n');

    // =========================================================================
    // CASE 7: MONTHLY RESET (DETERMINISTIC FIXED BOUNDARIES)
    // =========================================================================
    console.log('--- CASE 7: MONTHLY RESET (DETERMINISTIC PERIOD LOGIC) ---');
    // Start date: 2026-05-15T00:00:00.000Z, Expiry: 2026-11-15T00:00:00.000Z (6 months)
    const fixedPlanStart = '2026-05-15T00:00:00.000Z';
    const fixedPlanExpiry = '2026-11-15T00:00:00.000Z';

    // 1. Period 0: Day before reset (2026-06-14T23:59:59.000Z)
    const datePeriod0 = new Date('2026-06-14T23:59:59.000Z');
    const p0 = calculateUsagePeriod(fixedPlanStart, fixedPlanExpiry, datePeriod0);
    assert.strictEqual(p0.period_index, 0, 'Must still be period 0 right before reset');
    assert.strictEqual(p0.is_past_expiry, false);

    // 2. Period 1: Exact second of crossing boundary (2026-06-15T00:00:00.000Z)
    const datePeriod1 = new Date('2026-06-15T00:00:00.000Z');
    const p1 = calculateUsagePeriod(fixedPlanStart, fixedPlanExpiry, datePeriod1);
    assert.strictEqual(p1.period_index, 1, 'Must advance to period 1 on exact start day-of-month boundary');
    assert.strictEqual(p1.is_past_expiry, false);

    // 3. Verify parseSubscriptionRecord resets usage and does NOT carry forward unused quota
    const mockDbSub = {
      id: 'mock-sub-7',
      business_id: 'mock-biz-7',
      status: 'active',
      plan_id: 'base',
      current_period_start: fixedPlanStart,
      current_period_end: fixedPlanExpiry,
      metadata: {
        plan_id: 'base',
        plan_name: 'Base',
        duration_months: 6,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_period_index: 0,
        current_month_qr_used: 150, // 50 unused last month
        current_month_ai_used: 80,
      },
    };

    // Evaluated in Period 0: 50 QR remaining
    const snapPeriod0 = entitlementService.parseSubscriptionRecord(mockDbSub, datePeriod0);
    assert.strictEqual(snapPeriod0.current_month_qr_used, 150);
    assert.strictEqual(snapPeriod0.current_month_qr_remaining, 50);

    // Evaluated in Period 1: usage resets to 0, remaining resets to 200 (NO 50 carried forward to 250!)
    const snapPeriod1 = entitlementService.parseSubscriptionRecord(mockDbSub, datePeriod1);
    assert.strictEqual(snapPeriod1.current_month_qr_used, 0, 'Usage resets to 0 in new period');
    assert.strictEqual(snapPeriod1.current_month_qr_remaining, 200, 'Remaining resets to monthly limit (200), NO carry forward');
    assert.strictEqual(snapPeriod1.current_month_ai_used, 0, 'AI usage resets to 0 in new period');
    assert.strictEqual(snapPeriod1.current_month_ai_remaining, 100, 'AI remaining resets to monthly limit (100)');

    // 4. Past overall subscription expiry: 2026-11-16T00:00:00.000Z
    const datePastExpiry = new Date('2026-11-16T00:00:00.000Z');
    const pExpiry = calculateUsagePeriod(fixedPlanStart, fixedPlanExpiry, datePastExpiry);
    assert.strictEqual(pExpiry.is_past_expiry, true, 'Past expiry must flag is_past_expiry');
    const snapExpired = entitlementService.parseSubscriptionRecord(mockDbSub, datePastExpiry);
    assert.strictEqual(snapExpired.is_expired, true, 'Snapshot must evaluate is_expired = true');
    assert.strictEqual(snapExpired.current_month_qr_remaining, 0, 'Quotas become 0 when overall subscription expires');
    console.log('✔ CASE 7 PASSED: Usage resets strictly at boundary, unused quota does not carry forward.\n');

    // =========================================================================
    // CASE 8: VERIFIED RENEWAL
    // =========================================================================
    console.log('--- CASE 8: VERIFIED RENEWAL (AUTO-HEAL, NO DUPLICATE QR) ---');
    const biz8 = await createTestBusiness('Regress Biz 8 Renewal', 'regress-biz-8');
    const qr8 = await createTestQR(biz8.id, 'Counter 8');

    // 1. First make the subscription expired and QR inactive
    await supabase.from('subscriptions').insert({
      business_id: biz8.id,
      owner_id: userId,
      plan_id: 'base',
      status: 'expired',
      billing_cycle: 'monthly',
      price_cents: 249900,
      currency: 'INR',
      current_period_start: '2026-01-01T00:00:00.000Z',
      current_period_end: '2026-07-01T00:00:00.000Z',
      metadata: { plan_id: 'base' },
    } as any);

    await supabase.from('qr_codes').update({ is_active: false } as any).eq('id', qr8.id);
    const { data: qrCheckInactive } = await supabase.from('qr_codes').select('is_active').eq('id', qr8.id).single();
    assert.strictEqual(qrCheckInactive?.is_active, false, 'QR must be inactive while expired');

    // 2. Renew subscription
    await entitlementService.activatePlan({
      businessId: biz8.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
    });

    // 3. Visitor hits existing QR route
    const renewalVisit = await callGetBusinessByQRSlug(qr8.slug);
    assert.strictEqual(renewalVisit.status, 200, 'Case 8: Existing QR becomes usable immediately (200 OK)');

    // 4. Check auto-heal in database
    const { data: qrCheckAutoHealed } = await supabase.from('qr_codes').select('is_active').eq('id', qr8.id).single();
    assert.strictEqual(qrCheckAutoHealed?.is_active, true, 'Case 8: Existing QR auto-healed to active');

    // 5. Check no duplicate QR records exist
    const { data: allQrsBiz8 } = await supabase.from('qr_codes').select('id').eq('business_id', biz8.id);
    assert.strictEqual(allQrsBiz8?.length, 1, 'Case 8: Exactly 1 QR record exists, no duplicates created');
    console.log('✔ CASE 8 PASSED: Existing QR usable again, auto-healed, 0 duplicates.\n');

    // =========================================================================
    // CASE 9: MULTIPLE BUSINESSES
    // =========================================================================
    console.log('--- CASE 9: MULTIPLE BUSINESSES ISOLATION ---');
    const biz9A = await createTestBusiness('Biz 9A Expired', 'biz-9a');
    const qr9A = await createTestQR(biz9A.id, 'QR 9A');

    const biz9B = await createTestBusiness('Biz 9B Active', 'biz-9b');
    const qr9B = await createTestQR(biz9B.id, 'QR 9B');

    // Biz 9A = Expired
    await supabase.from('subscriptions').insert({
      business_id: biz9A.id,
      owner_id: userId,
      plan_id: 'base',
      status: 'expired',
      billing_cycle: 'monthly',
      price_cents: 249900,
      currency: 'INR',
      current_period_start: '2026-01-01T00:00:00.000Z',
      current_period_end: '2026-07-01T00:00:00.000Z',
      metadata: { plan_id: 'base' },
    } as any);

    // Biz 9B = Active Paid
    await entitlementService.activatePlan({
      businessId: biz9B.id,
      ownerId: userId,
      planId: 'pro',
      durationMonths: 12,
      price: 8999,
      qrQuota: 500,
      aiQuota: 250,
    });

    // Verify 9A
    const status9A = await callGetStatus(biz9A.id);
    assert.strictEqual(status9A.is_expired, true, 'Case 9: Biz 9A must resolve EXPIRED');
    assert.strictEqual(status9A.is_blocked, true, 'Case 9: Biz 9A must be BLOCKED');
    const qrRes9A = await callGetBusinessByQRSlug(qr9A.slug);
    assert.strictEqual(qrRes9A.status, 403, 'Case 9: Biz 9A QR must be blocked (403)');

    // Verify 9B
    const status9B = await callGetStatus(biz9B.id);
    assert.strictEqual(status9B.is_expired, false, 'Case 9: Biz 9B must resolve NOT expired');
    assert.strictEqual(status9B.is_blocked, false, 'Case 9: Biz 9B must NOT be blocked');
    assert.strictEqual(status9B.status, 'ACTIVE', 'Case 9: Biz 9B status must be ACTIVE');
    assert.strictEqual(status9B.plan.name, 'Pro', 'Case 9: Biz 9B plan must be Pro');
    const qrRes9B = await callGetBusinessByQRSlug(qr9B.slug);
    assert.strictEqual(qrRes9B.status, 200, 'Case 9: Biz 9B QR must work (200 OK)');
    console.log('✔ CASE 9 PASSED: Complete isolation between businesses under same user.\n');

    // =========================================================================
    // CASE 10: SECURITY / BYPASS PREVENTION
    // =========================================================================
    console.log('--- CASE 10: SECURITY / BYPASS PREVENTION ---');
    const biz10 = await createTestBusiness('Regress Biz 10 Security', 'regress-biz-10');
    const qr10 = await createTestQR(biz10.id, 'Counter 10');

    // Expired subscription for biz10
    await supabase.from('subscriptions').insert({
      business_id: biz10.id,
      owner_id: userId,
      plan_id: 'base',
      status: 'expired',
      billing_cycle: 'monthly',
      price_cents: 249900,
      currency: 'INR',
      current_period_start: '2026-01-01T00:00:00.000Z',
      current_period_end: '2026-07-01T00:00:00.000Z',
      metadata: { plan_id: 'base' },
    } as any);

    // 1. Direct API: QR creation guard
    const qrCreateCheck = await entitlementService.canUseService(biz10.id, 'create_qr');
    assert.strictEqual(qrCreateCheck.allowed, false, 'Case 10: Direct QR creation must be blocked on expired account');

    // 2. Direct API: Session creation with expired business_id
    const bypassSession1 = await callStartSession({
      qr_code_id: qr10.id,
      business_id: biz10.id,
      rating: 5,
    });
    assert.strictEqual(bypassSession1.status, 403, 'Case 10: Direct session creation must be blocked (403)');

    // 3. Direct API: Session creation omitting business_id (trying to bypass via qr_code_id only)
    const bypassSession2 = await callStartSession({
      qr_code_id: qr10.id,
      rating: 5,
    });
    assert.strictEqual(bypassSession2.status, 403, 'Case 10: Direct session creation without business_id must be blocked (403)');

    // 4. Direct API: AI generation on expired account
    const bypassAi1 = await callGenerateReview({
      session_id: 'guest-session',
      business_id: biz10.id,
      rating: 5,
    });
    assert.strictEqual(bypassAi1.status, 403, 'Case 10: Direct AI generation specifying expired business must be blocked (403)');

    // 5. Direct API: Session mutation endpoints on session of expired account
    const { data: scanLog10 } = (await supabase.from('scan_logs').insert({
      business_id: biz10.id,
      qr_code_id: qr10.id,
      scanned_at: new Date('2026-06-01T00:00:00.000Z').toISOString(),
    } as any).select('id').single()) as any;

    const { data: sess10 } = (await supabase.from('review_sessions').insert({
      business_id: biz10.id,
      qr_code_id: qr10.id,
      scan_log_id: scanLog10.id,
      language: 'en',
      rating: 5,
      status: 'started',
    } as any).select().single()) as any;

    let ratingBlocked = false;
    try {
      await reviewService.selectRating(sess10.id, 5);
    } catch (e: any) {
      ratingBlocked = e.statusCode === 403;
    }
    assert.strictEqual(ratingBlocked, true, 'Case 10: selectRating on expired session must throw 403');

    let tagsBlocked = false;
    try {
      await reviewService.selectTags(sess10.id, ['Friendly Staff']);
    } catch (e: any) {
      tagsBlocked = e.statusCode === 403;
    }
    assert.strictEqual(tagsBlocked, true, 'Case 10: selectTags on expired session must throw 403');

    let copyBlocked = false;
    try {
      await reviewService.recordCopy(sess10.id);
    } catch (e: any) {
      copyBlocked = e.statusCode === 403;
    }
    assert.strictEqual(copyBlocked, true, 'Case 10: recordCopy on expired session must throw 403');

    let completeBlocked = false;
    try {
      await reviewService.completeReview(sess10.id);
    } catch (e: any) {
      completeBlocked = e.statusCode === 403;
    }
    assert.strictEqual(completeBlocked, true, 'Case 10: completeReview on expired session must throw 403');

    console.log('✔ CASE 10 PASSED: Direct API requests cannot bypass entitlement checks.\n');

    console.log('========================================================================');
    console.log(' 🎉 ALL 10 STEP 5 REGRESSION CASES PASSED WITH 100% SUCCESS RATE!        ');
    console.log('========================================================================');
  } finally {
    console.log('\nCleaning up test artifacts...');
    await cleanup();
    console.log('Cleanup completed.');
  }
}

runStep5RegressionTests().catch((err) => {
  console.error('\n❌ STEP 5 REGRESSION SUITE FAILED:', err);
  process.exit(1);
});
