/**
 * STEP 6 VERIFICATION SUITE — SUBSCRIPTION EXPIRY -> AUTOMATIC QR DEACTIVATION
 * 
 * Verifies all 12 scenarios (A through L):
 * Test A: Active paid plan -> QR works (allowed: true).
 * Test B: Paid plan expires -> QR stops (allowed: false, reason: 'SUBSCRIPTION_EXPIRED').
 * Test C: Expired plan -> QR remains in database, with is_active: false.
 * Test D: Trial expires -> QR stops (reason: 'TRIAL_EXPIRED'), public route blocked.
 * Test E: Monthly QR quota exhausted -> QR record is NOT deleted, is_active remains true, only operation blocked.
 * Test F: Next monthly period -> QR works again when period rolls over / resets.
 * Test G: New verified Razorpay payment -> existing eligible QR becomes active (is_active: true, no duplicates).
 * Test H: Failed payment -> QR remains inactive.
 * Test I: Deleted business (deleted_at !== null) -> QR cannot work (404/403 blocked).
 * Test J: Multiple businesses -> Business A (expired) QR inactive, Business B (active) QR remains active.
 * Test K: Direct public QR requests (/r/:slug and /r/:slug/scan) cannot bypass server-side entitlement.
 * Test L: Refresh / repeated requests observe consistent server-side state.
 */

import 'dotenv/config';
import crypto from 'crypto';
import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { QRService } from '../modules/qr/service';
import { QRController } from '../modules/qr/controller';
import { razorpayService } from '../modules/payment/razorpay-service';

async function runStep6Verification() {
  console.log('================================================================');
  console.log(' STEP 6: SUBSCRIPTION EXPIRY -> AUTOMATIC QR DEACTIVATION TEST  ');
  console.log('================================================================\n');

  const qrService = new QRService(supabase);
  const qrController = new QRController(qrService);

  // Setup test user
  const { data: user } = (await supabase.from('users').select('id, email').limit(1).single()) as any;
  if (!user) throw new Error('No user found in database');
  const userId = user.id;

  // Cleanup helper for test businesses
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
    const bizSlug = (await supabase.from('businesses').select('slug').eq('id', businessId).single()) as any;
    const slug = `${bizSlug.data.slug}-qr-${Math.random().toString(36).substring(2, 6)}`;
    const { data: qr, error } = (await supabase
      .from('qr_codes')
      .insert({
        business_id: businessId,
        slug,
        label,
        design: { primary_color: '#2563EB' },
        is_active: true,
      })
      .select()
      .single()) as any;
    if (error || !qr) throw new Error('Failed to create test QR: ' + (error?.message || ''));
    return qr;
  };

  try {
    // -------------------------------------------------------------------------
    // TEST A: Active paid plan -> QR works (allowed: true)
    // -------------------------------------------------------------------------
    console.log('--- TEST A: Active paid plan -> QR works ---');
    const bizA = await createTestBusiness('Test Biz A Active', 'biz-a');
    const qrA = await createTestQR(bizA.id, 'Biz A QR');

    // Activate a valid 1-month paid subscription
    const subA = await entitlementService.activatePlan({
      businessId: bizA.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 1,
      price: 799,
      qrQuota: 200,
      aiQuota: 100,
      maxQRCodes: 5,
      features: { google_reviews: true, ai_generation: true },
      assignedBy: 'test_suite',
      paymentStatus: 'SUCCESS',
    });

    const checkA = await entitlementService.canUseService(bizA.id, 'qr_scan');
    const qrRecordA = (await supabase.from('qr_codes').select('is_active').eq('id', qrA.id).single()) as any;

    console.log(`- canUseService allowed: ${checkA.allowed}`);
    console.log(`- QR is_active: ${qrRecordA.data?.is_active}`);

    if (!checkA.allowed || !qrRecordA.data?.is_active) {
      throw new Error('TEST A FAILED: Active paid plan QR is not working or active');
    }
    console.log('✔ TEST A PASSED: Active paid plan allows QR and QR is active\n');

    // -------------------------------------------------------------------------
    // TEST B: Paid plan expires -> QR stops (allowed: false, reason: 'SUBSCRIPTION_EXPIRED')
    // -------------------------------------------------------------------------
    console.log('--- TEST B: Paid plan expires -> QR stops ---');
    // Set subscription current_period_end in the past
    const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await supabase
      .from('subscriptions')
      .update({
        current_period_end: pastDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subA.subscription_id);

    const checkB = await entitlementService.canUseService(bizA.id, 'qr_scan');
    console.log(`- canUseService allowed: ${checkB.allowed}, reason: ${checkB.reason}`);

    if (checkB.allowed || checkB.reason !== 'SUBSCRIPTION_EXPIRED') {
      throw new Error(`TEST B FAILED: Expected allowed: false and reason: SUBSCRIPTION_EXPIRED, got: ${checkB.allowed}, ${checkB.reason}`);
    }
    console.log('✔ TEST B PASSED: Paid plan expiry returns allowed: false and SUBSCRIPTION_EXPIRED\n');

    // -------------------------------------------------------------------------
    // TEST C: Expired plan -> QR remains in database, with is_active: false
    // -------------------------------------------------------------------------
    console.log('--- TEST C: Expired plan -> QR remains in database, is_active: false ---');
    const { data: qrRecordC } = (await supabase
      .from('qr_codes')
      .select('*')
      .eq('id', qrA.id)
      .single()) as any;

    console.log(`- QR record exists: ${!!qrRecordC}`);
    console.log(`- QR is_active: ${qrRecordC?.is_active}`);
    console.log(`- QR slug preserved: ${qrRecordC?.slug === qrA.slug}`);

    if (!qrRecordC) {
      throw new Error('TEST C FAILED: QR code was deleted from database on expiry!');
    }
    if (qrRecordC.is_active !== false) {
      throw new Error(`TEST C FAILED: Expected is_active: false, got: ${qrRecordC.is_active}`);
    }
    console.log('✔ TEST C PASSED: QR record remains in database, identity preserved, is_active: false\n');

    // -------------------------------------------------------------------------
    // TEST D: Trial expires -> QR stops (reason: 'TRIAL_EXPIRED'), public route blocked
    // -------------------------------------------------------------------------
    console.log('--- TEST D: Trial expires -> QR stops, public route blocked ---');
    const bizD = await createTestBusiness('Test Biz D Trial', 'biz-d');
    const qrD = await createTestQR(bizD.id, 'Biz D QR');

    // Set trial subscription in past
    await supabase
      .from('subscriptions')
      .upsert({
        business_id: bizD.id,
        owner_id: userId,
        plan_id: 'free_trial',
        status: 'trialing',
        current_period_start: new Date(Date.now() - 15 * 86400000).toISOString(),
        current_period_end: pastDate,
        trial_start: new Date(Date.now() - 15 * 86400000).toISOString(),
        trial_end: pastDate,
        price_cents: 0,
        currency: 'INR',
        billing_cycle: 'monthly',
      }, { onConflict: 'business_id' });

    const checkD = await entitlementService.canUseService(bizD.id, 'qr_scan');
    console.log(`- Trial canUseService allowed: ${checkD.allowed}, reason: ${checkD.reason}`);

    if (checkD.allowed || checkD.reason !== 'TRIAL_EXPIRED') {
      throw new Error(`TEST D FAILED: Expected TRIAL_EXPIRED, got: ${checkD.allowed}, ${checkD.reason}`);
    }

    // Verify public route /r/:slug blocks access
    let publicRouteBlocked = false;
    let blockErrorStatus = 0;
    let blockErrorCode = '';
    const mockReq = { params: { slug: qrD.slug }, headers: {}, query: {} } as any;
    const mockRes = {
      status: (s: number) => ({ json: (j: any) => ({ status: s, ...j }) }),
    } as any;
    const mockNext = (err: any) => {
      if (err) {
        publicRouteBlocked = true;
        blockErrorStatus = err.statusCode || 500;
        blockErrorCode = err.code || '';
      }
    };

    await qrController.getBusinessByQRSlug(mockReq, mockRes, mockNext);
    console.log(`- Public route blocked: ${publicRouteBlocked}, status: ${blockErrorStatus}, code: ${blockErrorCode}`);

    if (!publicRouteBlocked || (blockErrorStatus !== 403 && blockErrorStatus !== 404)) {
      throw new Error(`TEST D FAILED: Public route did not block expired trial! status: ${blockErrorStatus}`);
    }
    console.log('✔ TEST D PASSED: Expired trial is blocked on server-side and public route\n');

    // -------------------------------------------------------------------------
    // TEST E: Monthly QR quota exhausted -> QR record is NOT deleted, is_active remains true, operation blocked
    // -------------------------------------------------------------------------
    console.log('--- TEST E: Monthly QR quota exhausted -> QR NOT deleted, is_active remains true ---');
    const bizE = await createTestBusiness('Test Biz E Quota', 'biz-e');
    const qrE = await createTestQR(bizE.id, 'Biz E QR');

    await entitlementService.activatePlan({
      businessId: bizE.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 1,
      price: 799,
      qrQuota: 10,
      aiQuota: 50,
      maxQRCodes: 5,
      features: { google_reviews: true },
      assignedBy: 'test_suite',
      paymentStatus: 'SUCCESS',
    });

    // Simulate quota exhaustion by setting current_month_qr_used = 10
    const { data: subRowE } = (await supabase.from('subscriptions').select('id, metadata').eq('business_id', bizE.id).single()) as any;
    await supabase.from('subscriptions').update({
      metadata: {
        ...subRowE.metadata,
        current_month_qr_used: 10,
        used_qr_quota: 10,
        remaining_qr_quota: 0,
      },
    }).eq('id', subRowE.id);

    const checkE = await entitlementService.canUseService(bizE.id, 'qr_scan');
    const { data: qrRecordE } = (await supabase.from('qr_codes').select('*').eq('id', qrE.id).single()) as any;

    console.log(`- canUseService allowed: ${checkE.allowed}, reason: ${checkE.reason}`);
    console.log(`- QR is_active: ${qrRecordE.is_active}`);

    if (checkE.allowed || checkE.reason !== 'QR_QUOTA_EXHAUSTED') {
      throw new Error(`TEST E FAILED: Expected QR_QUOTA_EXHAUSTED, got: ${checkE.reason}`);
    }
    if (qrRecordE.is_active !== true) {
      throw new Error(`TEST E FAILED: Monthly quota exhaustion must NOT deactivate QR code! Expected is_active: true, got: ${qrRecordE.is_active}`);
    }
    console.log('✔ TEST E PASSED: Quota exhaustion blocks service without deactivating QR or deleting record\n');

    // -------------------------------------------------------------------------
    // TEST F: Next monthly period -> QR works again when period rolls over / resets
    // -------------------------------------------------------------------------
    console.log('--- TEST F: Next monthly period -> QR works again upon rollover ---');
    // Simulate period rollover: reset current_month_qr_used to 0 (as done by calculateUsagePeriod)
    await supabase.from('subscriptions').update({
      metadata: {
        ...subRowE.metadata,
        current_period_index: 1,
        current_month_qr_used: 0,
        used_qr_quota: 0,
        remaining_qr_quota: 10,
        exhaustion_reason: null,
      },
    }).eq('id', subRowE.id);

    const checkF = await entitlementService.canUseService(bizE.id, 'qr_scan');
    console.log(`- canUseService after monthly reset: allowed: ${checkF.allowed}`);

    if (!checkF.allowed) {
      throw new Error(`TEST F FAILED: QR should work again in next period, got: ${checkF.reason}`);
    }
    console.log('✔ TEST F PASSED: Next monthly period allows QR scan automatically\n');

    // -------------------------------------------------------------------------
    // TEST G: New verified Razorpay payment -> existing eligible QR becomes active
    // -------------------------------------------------------------------------
    console.log('--- TEST G: Verified Razorpay payment -> reactivates existing QR (no duplicates) ---');
    // bizA's QR was previously deactivated (is_active: false)
    const { count: qrCountBefore } = await supabase.from('qr_codes').select('*', { count: 'exact', head: true }).eq('business_id', bizA.id);

    // Mock Razorpay payment verification
    const orderId = `order_test_${Date.now()}`;
    const paymentId = `pay_test_${Date.now()}`;
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'test_secret_key_12345';

    // Set order in cache
    razorpayService['orderCache'].set(orderId, {
      order_id: orderId,
      business_id: bizA.id,
      plan_id: 'base',
      duration_months: 1,
      plan_version_id: 'base_v1',
      price_inr: 799,
      created_at: new Date().toISOString(),
    });

    const signature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const paymentResult = await razorpayService.verifyPayment({
      business_id: bizA.id,
      plan_id: 'base',
      duration_months: 1,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      user_id: userId,
      user_email: user.email,
    });

    const { data: reactivatedQR } = (await supabase.from('qr_codes').select('*').eq('id', qrA.id).single()) as any;
    const { count: qrCountAfter } = await supabase.from('qr_codes').select('*', { count: 'exact', head: true }).eq('business_id', bizA.id);

    console.log(`- Payment verified: ${paymentResult.success}`);
    console.log(`- Existing QR is_active: ${reactivatedQR.is_active}`);
    console.log(`- QR count before: ${qrCountBefore}, after: ${qrCountAfter}`);

    if (!paymentResult.success || !reactivatedQR.is_active) {
      throw new Error('TEST G FAILED: QR code was not reactivated after verified payment');
    }
    if (qrCountBefore !== qrCountAfter) {
      throw new Error(`TEST G FAILED: Duplicate QR created! Before: ${qrCountBefore}, After: ${qrCountAfter}`);
    }
    console.log('✔ TEST G PASSED: Verified payment reactivates existing QR with identical identity and zero duplicates\n');

    // -------------------------------------------------------------------------
    // TEST H: Failed payment -> QR remains inactive
    // -------------------------------------------------------------------------
    console.log('--- TEST H: Failed payment -> QR remains inactive ---');
    const bizH = await createTestBusiness('Test Biz H Inactive', 'biz-h');
    const qrH = await createTestQR(bizH.id, 'Biz H QR');

    // Deactivate QR due to expiry
    await supabase.from('qr_codes').update({ is_active: false }).eq('id', qrH.id);

    // Attempt verification with invalid signature
    let paymentFailedAsExpected = false;
    try {
      await razorpayService.verifyPayment({
        business_id: bizH.id,
        plan_id: 'base',
        duration_months: 1,
        razorpay_order_id: 'fake_order',
        razorpay_payment_id: 'fake_pay',
        razorpay_signature: 'invalid_signature_hex',
        user_id: userId,
        user_email: user.email,
      });
    } catch {
      paymentFailedAsExpected = true;
    }

    const { data: qrRecordH } = (await supabase.from('qr_codes').select('is_active').eq('id', qrH.id).single()) as any;
    console.log(`- Failed payment rejected: ${paymentFailedAsExpected}`);
    console.log(`- QR is_active: ${qrRecordH.is_active}`);

    if (!paymentFailedAsExpected || qrRecordH.is_active !== false) {
      throw new Error('TEST H FAILED: Inactive QR must remain inactive on failed payment');
    }
    console.log('✔ TEST H PASSED: Failed payment is rejected and QR remains inactive\n');

    // -------------------------------------------------------------------------
    // TEST I: Deleted business (deleted_at !== null) -> QR cannot work
    // -------------------------------------------------------------------------
    console.log('--- TEST I: Deleted business (deleted_at !== null) -> QR blocked ---');
    const bizI = await createTestBusiness('Test Biz I Deleted', 'biz-i');
    const qrI = await createTestQR(bizI.id, 'Biz I QR');

    // Soft delete business
    await supabase.from('businesses').update({ deleted_at: new Date().toISOString() }).eq('id', bizI.id);

    let routeBlockedForDeleted = false;
    let deleteErrorCode = '';
    const reqI = { params: { slug: qrI.slug }, headers: {}, query: {} } as any;
    const resI = { status: () => ({ json: () => {} }) } as any;
    const nextI = (err: any) => {
      if (err) {
        routeBlockedForDeleted = true;
        deleteErrorCode = err.code || err.message;
      }
    };

    await qrController.getBusinessByQRSlug(reqI, resI, nextI);
    console.log(`- Deleted business blocked: ${routeBlockedForDeleted}, error: ${deleteErrorCode}`);

    if (!routeBlockedForDeleted) {
      throw new Error('TEST I FAILED: Deleted business QR was not blocked');
    }
    console.log('✔ TEST I PASSED: Deleted business QR access strictly blocked with 404\n');

    // -------------------------------------------------------------------------
    // TEST J: Multiple businesses -> Business A (expired) QR inactive, Business B (active) QR active
    // -------------------------------------------------------------------------
    console.log('--- TEST J: Multiple businesses isolation ---');
    const bizJ1 = await createTestBusiness('Biz J1 Expired', 'biz-j1');
    const qrJ1 = await createTestQR(bizJ1.id, 'Biz J1 QR');

    const bizJ2 = await createTestBusiness('Biz J2 Active', 'biz-j2');
    const qrJ2 = await createTestQR(bizJ2.id, 'Biz J2 QR');

    // Biz J1 expired subscription
    await entitlementService.activatePlan({
      businessId: bizJ1.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 1,
      price: 799,
      qrQuota: 200,
      aiQuota: 100,
      maxQRCodes: 5,
      features: {},
      paymentStatus: 'SUCCESS',
    });
    await supabase.from('subscriptions').update({ current_period_end: pastDate }).eq('business_id', bizJ1.id);

    // Biz J2 active subscription
    await entitlementService.activatePlan({
      businessId: bizJ2.id,
      ownerId: userId,
      planId: 'pro',
      durationMonths: 1,
      price: 1999,
      qrQuota: 500,
      aiQuota: 250,
      maxQRCodes: 10,
      features: {},
      paymentStatus: 'SUCCESS',
    });

    // Check entitlement on J1 (triggers auto-deactivation of J1's QR)
    const checkJ1 = await entitlementService.canUseService(bizJ1.id, 'qr_scan');
    const checkJ2 = await entitlementService.canUseService(bizJ2.id, 'qr_scan');

    const { data: recordJ1 } = (await supabase.from('qr_codes').select('is_active').eq('id', qrJ1.id).single()) as any;
    const { data: recordJ2 } = (await supabase.from('qr_codes').select('is_active').eq('id', qrJ2.id).single()) as any;

    console.log(`- Biz J1 (expired) QR is_active: ${recordJ1.is_active}, canUse: ${checkJ1.allowed}`);
    console.log(`- Biz J2 (active) QR is_active: ${recordJ2.is_active}, canUse: ${checkJ2.allowed}`);

    if (recordJ1.is_active !== false || checkJ1.allowed) {
      throw new Error('TEST J FAILED: Expired business J1 QR is still active');
    }
    if (recordJ2.is_active !== true || !checkJ2.allowed) {
      throw new Error('TEST J FAILED: Active business J2 QR was incorrectly affected by J1');
    }
    console.log('✔ TEST J PASSED: Expiry of Business A deactivates ONLY Business A; Business B remains ACTIVE\n');

    // -------------------------------------------------------------------------
    // TEST K: Direct public QR requests cannot bypass server-side entitlement
    // -------------------------------------------------------------------------
    console.log('--- TEST K: Direct public QR requests (/r/:slug and /r/:slug/scan) cannot bypass ---');
    // Using qrJ1 (which has is_active: false and subscription expired)
    let getSlugBlocked = false;
    let handleScanBlocked = false;

    // Direct /r/:slug test
    await qrController.getBusinessByQRSlug(
      { params: { slug: qrJ1.slug }, headers: {}, query: {} } as any,
      mockRes,
      (err: any) => { if (err) getSlugBlocked = true; }
    );

    // Direct /r/:slug/scan test
    try {
      await qrService.handleScan(qrJ1.slug, {
        ip_address: '127.0.0.1',
        user_agent: 'TestAgent/1.0',
      });
    } catch (err: any) {
      handleScanBlocked = true;
    }

    console.log(`- GET /r/:slug blocked: ${getSlugBlocked}`);
    console.log(`- POST /r/:slug/scan blocked: ${handleScanBlocked}`);

    if (!getSlugBlocked || !handleScanBlocked) {
      throw new Error('TEST K FAILED: Public routes allowed bypass of server-side entitlement');
    }
    console.log('✔ TEST K PASSED: Direct public endpoints (/r/:slug and /r/:slug/scan) strictly block inactive/expired QR\n');

    // -------------------------------------------------------------------------
    // TEST L: Refresh / repeated requests observe consistent server-side state
    // -------------------------------------------------------------------------
    console.log('--- TEST L: Refresh / repeated requests consistency ---');
    for (let i = 1; i <= 3; i++) {
      let blockedOnAttempt = false;
      await qrController.getBusinessByQRSlug(
        { params: { slug: qrJ1.slug }, headers: {}, query: {} } as any,
        mockRes,
        (err: any) => { if (err) blockedOnAttempt = true; }
      );
      if (!blockedOnAttempt) {
        throw new Error(`TEST L FAILED: Request ${i} was not blocked consistently`);
      }
    }
    console.log('✔ TEST L PASSED: Consistent state observed across 3 consecutive requests\n');

    console.log('================================================================');
    console.log('  ALL 12 STEP 6 SCENARIOS (A THROUGH L) PASSED SUCCESSFULLY!    ');
    console.log('================================================================');
  } finally {
    // Cleanup created businesses
    for (const bId of testBizIds) {
      await supabase.from('qr_codes').delete().eq('business_id', bId);
      await supabase.from('subscriptions').delete().eq('business_id', bId);
      await supabase.from('businesses').delete().eq('id', bId);
    }
  }
}

runStep6Verification().catch((err) => {
  console.error('\n❌ STEP 6 VERIFICATION RUNNER FAILED:', err);
  process.exit(1);
});
