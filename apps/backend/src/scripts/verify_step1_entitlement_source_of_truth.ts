/**
 * STEP 1 VERIFICATION SUITE — AUTHORITATIVE ENTITLEMENT SOURCE OF TRUTH
 * 
 * Verifies all 8 required cases from Requirement 12:
 * 1. active subscription + quota available → QR works
 * 2. active subscription + QR quota exhausted → QR blocked, AI unaffected
 * 3. active subscription + AI quota exhausted → AI blocked, QR unaffected
 * 4. expired subscription + quotas showing remaining → QR blocked
 * 5. expired subscription + quota 0 → QR blocked
 * 6. trial expired → QR blocked
 * 7. renewed/reactivated subscription → existing eligible QR works again
 * 8. multiple businesses under one user remain isolated
 */

import 'dotenv/config';
import assert from 'assert';
import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { QRService } from '../modules/qr/service';
import { QRController } from '../modules/qr/controller';
import { ReviewService } from '../modules/review/service';
import { SubscriptionController } from '../modules/subscription/controller';
import { AIProviderFactory } from '../modules/review/ai/factory';

async function runStep1Verification() {
  console.log('================================================================');
  console.log(' STEP 1: FIX SUBSCRIPTION STATE SOURCE OF TRUTH VERIFICATION    ');
  console.log('================================================================\n');

  const qrService = new QRService(supabase);
  const qrController = new QRController(qrService);
  const aiFactory = new AIProviderFactory({});
  const reviewService = new ReviewService(supabase, aiFactory);
  const subscriptionController = new SubscriptionController({ supabase } as any);

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
      await supabase.from('qr_codes').delete().eq('business_id', bId);
      await supabase.from('subscriptions').delete().eq('business_id', bId);
      await supabase.from('businesses').delete().eq('id', bId);
    }
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: active subscription + quota available -> QR works
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: active subscription + quota available -> QR works ---');
    const biz1 = await createTestBusiness('Biz One Paid Active', 'biz-1');
    const qr1 = await createTestQR(biz1.id, 'Biz 1 Main QR');

    await entitlementService.activatePlan({
      businessId: biz1.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
      assignedBy: 'test_admin',
    });

    const ent1 = await entitlementService.getBusinessEntitlement(biz1.id);
    assert.strictEqual(ent1.status, 'active', 'Biz 1 status must be active');
    assert.strictEqual(ent1.is_expired, false, 'Biz 1 must NOT be expired');
    assert.strictEqual(ent1.is_qr_allowed, true, 'Biz 1 QR service must be allowed');
    assert.strictEqual(ent1.is_ai_allowed, true, 'Biz 1 AI service must be allowed');

    const qrCheck1 = await entitlementService.canUseService(biz1.id, 'qr_scan');
    assert.strictEqual(qrCheck1.allowed, true, 'QR scan check must be allowed');

    const aiCheck1 = await entitlementService.canUseService(biz1.id, 'ai_generation');
    assert.strictEqual(aiCheck1.allowed, true, 'AI generation check must be allowed');

    // Test GET /r/:slug endpoint
    let slugWorked1 = false;
    await qrController.getBusinessByQRSlug(
      { params: { slug: qr1.slug }, headers: {}, query: {} } as any,
      { status: () => ({ json: () => { slugWorked1 = true; } }) } as any,
      (err: any) => { if (err) throw err; }
    );
    assert.strictEqual(slugWorked1, true, 'GET /r/:slug must return business data');
    console.log('✔ TEST 1 PASSED: Active subscription with remaining quota allows QR and AI.\n');

    // -------------------------------------------------------------------------
    // TEST 2: active subscription + QR quota exhausted -> QR blocked, AI unaffected
    // -------------------------------------------------------------------------
    console.log('--- TEST 2: active subscription + QR quota exhausted -> QR blocked, AI unaffected ---');
    // Set current month QR used to equal monthly limit (200)
    const { data: sub1 } = await supabase.from('subscriptions').select('metadata').eq('business_id', biz1.id).single();
    await supabase.from('subscriptions').update({
      metadata: {
        ...(sub1?.metadata || {}),
        current_month_qr_used: 200,
        used_qr_quota: 200,
        remaining_qr_quota: 0,
      },
    }).eq('business_id', biz1.id);

    const ent2 = await entitlementService.getBusinessEntitlement(biz1.id);
    // Priority Rule B: Subscription remains ACTIVE! Monthly quota exhaustion != expiry!
    assert.strictEqual(ent2.status, 'active', 'Subscription must REMAIN active despite QR quota exhaustion');
    assert.strictEqual(ent2.is_expired, false, 'Subscription must NOT be marked expired merely because quota is 0');
    assert.strictEqual(ent2.is_active, true, 'Subscription is_active must remain true');
    assert.strictEqual(ent2.is_qr_allowed, false, 'QR service must be BLOCKED');
    assert.strictEqual(ent2.is_ai_allowed, true, 'AI service must remain INDEPENDENT and ALLOWED');

    const qrCheck2 = await entitlementService.canUseService(biz1.id, 'qr_scan');
    assert.strictEqual(qrCheck2.allowed, false, 'QR scan must be blocked');
    assert.strictEqual(qrCheck2.reason, 'QR_QUOTA_EXHAUSTED', 'Block reason must be QR_QUOTA_EXHAUSTED');

    const aiCheck2 = await entitlementService.canUseService(biz1.id, 'ai_generation');
    assert.strictEqual(aiCheck2.allowed, true, 'AI generation must remain ALLOWED');

    // Verify GET /r/:slug blocks QR access
    let qrSlugBlocked2 = false;
    let qrSlugReason2 = '';
    await qrController.getBusinessByQRSlug(
      { params: { slug: qr1.slug }, headers: {}, query: {} } as any,
      { status: () => ({ json: () => {} }) } as any,
      (err: any) => {
        if (err && err.code === 'QR_QUOTA_EXHAUSTED') {
          qrSlugBlocked2 = true;
          qrSlugReason2 = err.code;
        }
      }
    );
    assert.strictEqual(qrSlugBlocked2, true, 'Public QR route must block access when QR quota is exhausted');
    assert.strictEqual(qrSlugReason2, 'QR_QUOTA_EXHAUSTED', 'Reason must be QR_QUOTA_EXHAUSTED');

    // Verify existing QR record was NOT deleted
    const { data: dbQr2 } = await supabase.from('qr_codes').select('*').eq('id', qr1.id).single();
    assert(dbQr2, 'QR record must still exist in database');
    console.log('✔ TEST 2 PASSED: Active subscription with QR quota exhausted blocks QR, leaves AI unaffected, preserves QR record.\n');

    // -------------------------------------------------------------------------
    // TEST 3: active subscription + AI quota exhausted -> AI blocked, QR unaffected
    // -------------------------------------------------------------------------
    console.log('--- TEST 3: active subscription + AI quota exhausted -> AI blocked, QR unaffected ---');
    // Replenish QR quota, exhaust AI quota (100)
    await supabase.from('subscriptions').update({
      metadata: {
        ...(sub1?.metadata || {}),
        current_month_qr_used: 10,
        used_qr_quota: 10,
        remaining_qr_quota: 190,
        current_month_ai_used: 100,
        used_ai_quota: 100,
        remaining_ai_quota: 0,
      },
    }).eq('business_id', biz1.id);

    const ent3 = await entitlementService.getBusinessEntitlement(biz1.id);
    // Priority Rule C:
    assert.strictEqual(ent3.status, 'active', 'Subscription must REMAIN active');
    assert.strictEqual(ent3.is_expired, false, 'Subscription must NOT be marked expired');
    assert.strictEqual(ent3.is_qr_allowed, true, 'QR service must be ALLOWED since QR quota remains');
    assert.strictEqual(ent3.is_ai_allowed, false, 'AI service must be BLOCKED');

    const qrCheck3 = await entitlementService.canUseService(biz1.id, 'qr_scan');
    assert.strictEqual(qrCheck3.allowed, true, 'QR scan must be allowed');

    const aiCheck3 = await entitlementService.canUseService(biz1.id, 'ai_generation');
    assert.strictEqual(aiCheck3.allowed, false, 'AI generation must be blocked');
    assert.strictEqual(aiCheck3.reason, 'AI_QUOTA_EXHAUSTED', 'Reason must be AI_QUOTA_EXHAUSTED');

    // Verify GET /r/:slug works normally
    let slugWorked3 = false;
    await qrController.getBusinessByQRSlug(
      { params: { slug: qr1.slug }, headers: {}, query: {} } as any,
      { status: () => ({ json: () => { slugWorked3 = true; } }) } as any,
      (err: any) => { if (err) throw err; }
    );
    assert.strictEqual(slugWorked3, true, 'Public QR route must work normally when QR quota is available');
    console.log('✔ TEST 3 PASSED: Active subscription with AI quota exhausted blocks AI, leaves QR unaffected.\n');

    // -------------------------------------------------------------------------
    // TEST 4: expired subscription + quotas showing remaining -> QR blocked
    // -------------------------------------------------------------------------
    console.log('--- TEST 4: expired subscription + quotas showing remaining -> QR blocked ---');
    const pastDate = new Date(Date.now() - 5 * 86400000).toISOString();
    const startDate = new Date(Date.now() - 35 * 86400000).toISOString();

    await supabase.from('subscriptions').update({
      status: 'expired',
      current_period_start: startDate,
      current_period_end: pastDate,
      metadata: {
        ...(sub1?.metadata || {}),
        current_month_qr_used: 10,
        current_month_ai_used: 5,
        remaining_qr_quota: 190, // Unused quota left before expiry
        remaining_ai_quota: 95,
      },
    }).eq('business_id', biz1.id);

    const ent4 = await entitlementService.getBusinessEntitlement(biz1.id);
    // Priority Rule A: Even if quotas show remaining, expired subscription BLOCKS everything!
    assert.strictEqual(ent4.status, 'expired', 'Status must be expired');
    assert.strictEqual(ent4.is_expired, true, 'is_expired must be true');
    assert.strictEqual(ent4.is_qr_allowed, false, 'QR service must be BLOCKED');
    assert.strictEqual(ent4.is_ai_allowed, false, 'AI service must be BLOCKED');

    const qrCheck4 = await entitlementService.canUseService(biz1.id, 'qr_scan');
    assert.strictEqual(qrCheck4.allowed, false, 'QR scan must be blocked');
    assert.strictEqual(qrCheck4.reason, 'SUBSCRIPTION_EXPIRED', 'Reason must be SUBSCRIPTION_EXPIRED');

    const aiCheck4 = await entitlementService.canUseService(biz1.id, 'ai_generation');
    assert.strictEqual(aiCheck4.allowed, false, 'AI generation must be blocked');
    assert.strictEqual(aiCheck4.reason, 'SUBSCRIPTION_EXPIRED', 'Reason must be SUBSCRIPTION_EXPIRED');

    // Verify review session creation is blocked
    let sessionBlocked4 = false;
    try {
      await reviewService.createSession({
        business_id: biz1.id,
        qr_code_id: qr1.id,
      });
    } catch (err: any) {
      if (err.statusCode === 403 && err.code === 'SUBSCRIPTION_EXPIRED') {
        sessionBlocked4 = true;
      }
    }
    assert.strictEqual(sessionBlocked4, true, 'Review session creation must be blocked for expired subscription');
    console.log('✔ TEST 4 PASSED: Expired subscription with leftover quotas strictly blocks QR and AI.\n');

    // -------------------------------------------------------------------------
    // TEST 5: expired subscription + quota 0 -> QR blocked
    // -------------------------------------------------------------------------
    console.log('--- TEST 5: expired subscription + quota 0 -> QR blocked ---');
    await supabase.from('subscriptions').update({
      metadata: {
        ...(sub1?.metadata || {}),
        current_month_qr_used: 200,
        current_month_ai_used: 100,
        remaining_qr_quota: 0,
        remaining_ai_quota: 0,
      },
    }).eq('business_id', biz1.id);

    const ent5 = await entitlementService.getBusinessEntitlement(biz1.id);
    assert.strictEqual(ent5.status, 'expired', 'Status must be expired');
    assert.strictEqual(ent5.is_expired, true, 'is_expired must be true');
    assert.strictEqual(ent5.is_qr_allowed, false, 'QR service must be BLOCKED');
    assert.strictEqual(ent5.is_ai_allowed, false, 'AI service must be BLOCKED');

    const qrCheck5 = await entitlementService.canUseService(biz1.id, 'qr_scan');
    assert.strictEqual(qrCheck5.allowed, false, 'QR scan must be blocked');
    assert.strictEqual(qrCheck5.reason, 'SUBSCRIPTION_EXPIRED', 'Reason must be SUBSCRIPTION_EXPIRED');
    console.log('✔ TEST 5 PASSED: Expired subscription with 0 quota strictly blocks QR and AI.\n');

    // -------------------------------------------------------------------------
    // TEST 6: trial expired -> QR blocked
    // -------------------------------------------------------------------------
    console.log('--- TEST 6: trial expired -> QR blocked ---');
    const biz2 = await createTestBusiness('Biz Two Trial Expired', 'biz-2');
    const qr2 = await createTestQR(biz2.id, 'Biz 2 Main QR');

    // Create expired free trial subscription
    const trialStart = new Date(Date.now() - 20 * 86400000).toISOString();
    const trialEnd = new Date(Date.now() - 6 * 86400000).toISOString();

    await supabase.from('subscriptions').upsert({
      business_id: biz2.id,
      owner_id: userId,
      plan_id: 'free_trial',
      status: 'expired',
      price_cents: 0,
      currency: 'INR',
      billing_cycle: 'monthly',
      current_period_start: trialStart,
      current_period_end: trialEnd,
      trial_start: trialStart,
      trial_end: trialEnd,
      metadata: {
        plan_id: 'free_trial',
        is_trial: true,
        duration_days: 14,
        allocated_qr_quota: 100,
        allocated_ai_quota: 50,
        remaining_qr_quota: 50,
        remaining_ai_quota: 25,
      },
    });

    const ent6 = await entitlementService.getBusinessEntitlement(biz2.id);
    assert.strictEqual(ent6.is_trial, true, 'Must be identified as trial');
    assert.strictEqual(ent6.is_expired, true, 'Must be identified as expired');
    assert.strictEqual(ent6.is_qr_allowed, false, 'QR service must be BLOCKED');
    assert.strictEqual(ent6.is_ai_allowed, false, 'AI service must be BLOCKED');

    const qrCheck6 = await entitlementService.canUseService(biz2.id, 'qr_scan');
    assert.strictEqual(qrCheck6.allowed, false, 'QR scan must be blocked');
    assert.strictEqual(qrCheck6.reason, 'TRIAL_EXPIRED', 'Reason must be TRIAL_EXPIRED');

    let qrSlugBlocked6 = false;
    await qrController.getBusinessByQRSlug(
      { params: { slug: qr2.slug }, headers: {}, query: {} } as any,
      { status: () => ({ json: () => {} }) } as any,
      (err: any) => {
        console.log('TEST 6 NEXT CALLED WITH:', err?.code, err?.message);
        if (err && (err.code === 'TRIAL_EXPIRED' || err.code === 'SUBSCRIPTION_EXPIRED')) {
          qrSlugBlocked6 = true;
        }
      }
    );
    assert.strictEqual(qrSlugBlocked6, true, 'Public QR route must block access with TRIAL_EXPIRED');
    console.log('✔ TEST 6 PASSED: Expired trial strictly blocks QR and public access.\n');

    // -------------------------------------------------------------------------
    // TEST 7: renewed/reactivated subscription -> existing eligible QR works again
    // -------------------------------------------------------------------------
    console.log('--- TEST 7: renewed/reactivated subscription -> existing eligible QR works again ---');
    // Reactivate biz2 with paid subscription
    await entitlementService.activatePlan({
      businessId: biz2.id,
      ownerId: userId,
      planId: 'pro',
      durationMonths: 6,
      price: 4999,
      qrQuota: 1000,
      aiQuota: 500,
      assignedBy: 'renewal_payment',
    });

    const ent7 = await entitlementService.getBusinessEntitlement(biz2.id);
    assert.strictEqual(ent7.status, 'active', 'Reactivated business must be active');
    assert.strictEqual(ent7.is_expired, false, 'Reactivated business must NOT be expired');
    assert.strictEqual(ent7.is_qr_allowed, true, 'QR service must be ALLOWED');
    assert.strictEqual(ent7.is_ai_allowed, true, 'AI service must be ALLOWED');

    // Verify existing QR code record is active and works again
    const { data: dbQr7 } = await supabase.from('qr_codes').select('*').eq('id', qr2.id).single();
    assert.strictEqual(dbQr7?.is_active, true, 'Existing QR code must be reactivated (is_active: true)');

    let slugWorked7 = false;
    await qrController.getBusinessByQRSlug(
      { params: { slug: qr2.slug }, headers: {}, query: {} } as any,
      { status: () => ({ json: () => { slugWorked7 = true; } }) } as any,
      (err: any) => { if (err) throw err; }
    );
    assert.strictEqual(slugWorked7, true, 'Existing QR code must be accessible again after plan reactivation');
    console.log('✔ TEST 7 PASSED: Reactivated subscription unblocks existing eligible QR codes without duplication.\n');

    // -------------------------------------------------------------------------
    // TEST 8: multiple businesses under one user remain isolated
    // -------------------------------------------------------------------------
    console.log('--- TEST 8: multiple businesses under one user remain isolated ---');
    // User owns:
    // biz1: currently EXPIRED (from Test 4/5)
    // biz2: currently ACTIVE (from Test 7)

    const entBiz1 = await entitlementService.getBusinessEntitlement(biz1.id);
    const entBiz2 = await entitlementService.getBusinessEntitlement(biz2.id);

    assert.strictEqual(entBiz1.status, 'expired', 'Biz 1 must remain EXPIRED');
    assert.strictEqual(entBiz1.is_expired, true, 'Biz 1 is_expired must be true');
    assert.strictEqual(entBiz1.is_qr_allowed, false, 'Biz 1 QR must be BLOCKED');

    assert.strictEqual(entBiz2.status, 'active', 'Biz 2 must remain ACTIVE');
    assert.strictEqual(entBiz2.is_expired, false, 'Biz 2 is_expired must be false');
    assert.strictEqual(entBiz2.is_qr_allowed, true, 'Biz 2 QR must be ALLOWED');

    // QR scan checks remain isolated
    const checkBiz1 = await entitlementService.canUseService(biz1.id, 'qr_scan');
    const checkBiz2 = await entitlementService.canUseService(biz2.id, 'qr_scan');
    assert.strictEqual(checkBiz1.allowed, false, 'Biz 1 QR must be blocked');
    assert.strictEqual(checkBiz2.allowed, true, 'Biz 2 QR must be allowed');

    // Verify SubscriptionController.getStatus isolation
    let statusBiz1: any = null;
    await subscriptionController.getStatus(
      { user: { sub: userId, role: user.role }, query: { business_id: biz1.id }, headers: {} } as any,
      { setHeader: () => {}, json: (data: any) => { statusBiz1 = data?.data; } } as any,
      (err: any) => { if (err) throw err; }
    );
    assert.strictEqual(statusBiz1.is_expired, true, 'Controller status for Biz 1 must show expired');
    assert.strictEqual(statusBiz1.is_blocked, true, 'Controller status for Biz 1 must show blocked');
    assert.strictEqual(statusBiz1.is_qr_allowed, false, 'Controller status for Biz 1 must show QR blocked');

    let statusBiz2: any = null;
    await subscriptionController.getStatus(
      { user: { sub: userId, role: user.role }, query: { business_id: biz2.id }, headers: {} } as any,
      { setHeader: () => {}, json: (data: any) => { statusBiz2 = data?.data; } } as any,
      (err: any) => { if (err) throw err; }
    );
    assert.strictEqual(statusBiz2.is_expired, false, 'Controller status for Biz 2 must show NOT expired');
    assert.strictEqual(statusBiz2.is_blocked, false, 'Controller status for Biz 2 must show NOT blocked');
    assert.strictEqual(statusBiz2.is_active, true, 'Controller status for Biz 2 must show ACTIVE');
    assert.strictEqual(statusBiz2.is_qr_allowed, true, 'Controller status for Biz 2 must show QR allowed');

    // Test default business resolution when query has NO business_id:
    // Should prioritize Biz 2 (Active Paid) over Biz 1 (Expired)
    let statusDefault: any = null;
    await subscriptionController.getStatus(
      { user: { sub: userId, role: user.role }, query: {}, headers: {} } as any,
      { setHeader: () => {}, json: (data: any) => { statusDefault = data?.data; } } as any,
      (err: any) => { if (err) throw err; }
    );
    assert.strictEqual(statusDefault.business_id, biz2.id, 'Default resolution must prioritize active paid business over expired business');
    assert.strictEqual(statusDefault.status, 'ACTIVE', 'Default resolution must show ACTIVE subscription');
    assert.strictEqual(statusDefault.is_blocked, false, 'Default resolution must not lock user out');

    console.log('✔ TEST 8 PASSED: Multiple businesses under one user remain strictly isolated and default ranking works.\n');

    console.log('================================================================');
    console.log(' ALL 8 REQUIRED ENTITLEMENT TEST CASES PASSED SUCCESSFULLY!     ');
    console.log('================================================================');
  } finally {
    await cleanup();
  }
}

runStep1Verification().catch((err) => {
  console.error('\n❌ STEP 1 VERIFICATION FAILED:', err);
  process.exit(1);
});
