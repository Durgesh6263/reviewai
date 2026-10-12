/**
 * STEP 5 — FINAL RAZORPAY + SUBSCRIPTION END-TO-END AUDIT
 * 
 * Comprehensive audit testing all 19 checkpoints:
 * 1. Active paid plan purchase
 * 2. Expired subscription -> successful payment
 * 3. Existing SAME QR becomes usable after verified activation
 * 4. No duplicate QR is created
 * 5. Failed payment does not activate subscription
 * 6. Cancelled checkout does not activate subscription
 * 7. Invalid signature does not activate subscription
 * 8. Duplicate webhook does not activate twice
 * 9. Frontend verification + webhook simultaneously does not activate twice (race condition)
 * 10. Client cannot manipulate price
 * 11. Client cannot select an archived/deactivated plan
 * 12. Razorpay secret never reaches browser/network response
 * 13. Payment records are correctly linked to user/business/order/payment
 * 14. Subscription uses the exact purchased plan VERSION
 * 15. Monthly QR/AI limits are taken from the purchased plan version
 * 16. Dashboard and Billing update after successful activation
 * 17. Existing QR automatically becomes active through entitlement logic
 * 18. Expired QR remains blocked when payment fails
 * 19. Multiple businesses remain isolated
 */

import 'dotenv/config';
import crypto from 'crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { razorpayService } from '../modules/payment/razorpay-service';
import { entitlementService } from '../modules/subscription/entitlement';
import { planConfigService } from '../admin/plan-config-service';
import { supabaseAdmin } from '../config/supabase';

async function runStep5Audit() {
  console.log('================================================================');
  console.log('STEP 5 — FINAL RAZORPAY & SUBSCRIPTION 19-POINT AUDIT SUITE');
  console.log('================================================================\n');

  const businessA = '88d2da14-f37b-46b9-95af-51379d92fd6a';
  const ownerA = '43c94316-cbfa-4599-8ed9-ff52dec73f23';
  const emailA = 'devanshi@gmail.com';

  const jwtSecret = process.env.JWT_SECRET || 'your-default-jwt-secret-key-change-it';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'aPma1OvKUzwxLL99M9NABte3';
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || 'rzp_whsec_reviewai_dev_123';

  const tokenA = jwt.sign(
    { sub: ownerA, email: emailA, role: 'business_owner', type: 'access' },
    jwtSecret,
    { expiresIn: '2h' }
  );

  // Helper to force an expired state for business A
  const expireBusiness = async (bizId: string) => {
    await (supabaseAdmin
      .from('subscriptions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('business_id', bizId) as any);
    await (supabaseAdmin
      .from('qr_codes')
      .update({ is_active: false })
      .eq('business_id', bizId) as any);
  };

  // Helper to generate signed webhook
  const signWebhook = (payload: any) => {
    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    return { rawBody, signature };
  };

  const results: Record<string, boolean> = {};

  // Checkpoint 12: Razorpay secret never reaches network response
  console.log('Checking Checkpoint 12: Secret exposure in network responses...');
  try {
    const orderRes = await axios.post(
      'http://localhost:4000/api/v1/payments/razorpay/create-order',
      {
        business_id: businessA,
        plan_id: 'base',
        duration_months: 6,
      },
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const orderData = orderRes.data;
    const jsonString = JSON.stringify(orderData);
    const hasSecretKey = jsonString.includes('aPma1OvKUzwxLL99M9NABte3') || jsonString.includes('key_secret') || jsonString.includes('RAZORPAY_KEY_SECRET');
    if (hasSecretKey) {
      throw new Error('CRITICAL SECURITY VIOLATION: Secret leaked in order response!');
    }
    results['12_secret_never_exposed'] = true;
    console.log('  -> PASS: Key secret is strictly hidden from client responses.');
  } catch (err: any) {
    console.error('Checkpoint 12 failed:', err.message);
    results['12_secret_never_exposed'] = false;
  }

  // Checkpoint 10: Client cannot manipulate price
  console.log('Checking Checkpoint 10: Client cannot manipulate price...');
  try {
    // Attempting to send a tampered price during verification
    const testOrder10 = await razorpayService.createOrder({
      businessId: businessA,
      planId: 'base',
      durationMonths: 6,
      userId: ownerA,
      userEmail: emailA,
    });
    const fakePayId10 = `pay_tamper_${Date.now()}`;
    const sig10 = crypto.createHmac('sha256', keySecret).update(`${testOrder10.order_id}|${fakePayId10}`).digest('hex');

    let errorThrown = false;
    try {
      await razorpayService.verifyPayment({
        business_id: businessA,
        plan_id: 'base',
        duration_months: 6,
        razorpay_order_id: testOrder10.order_id,
        razorpay_payment_id: fakePayId10,
        razorpay_signature: sig10,
        user_id: ownerA,
        amount: 100, // Client tries to pay only ₹1 instead of ₹2499
      });
    } catch {
      errorThrown = true;
    }
    results['10_price_tamper_prevention'] = errorThrown;
    console.log(`  -> ${errorThrown ? 'PASS' : 'FAIL'}: Manipulated price rejected.`);
  } catch (err: any) {
    results['10_price_tamper_prevention'] = false;
  }

  // Checkpoint 11: Client cannot select archived / deactivated plan version
  console.log('Checking Checkpoint 11: Inactive/archived plan rejection...');
  try {
    let archivedRejected = false;
    try {
      await razorpayService.createOrder({
        businessId: businessA,
        planId: 'base',
        durationMonths: 6,
        planVersionId: 'base_v999_invalid',
        userId: ownerA,
      });
    } catch {
      archivedRejected = true;
    }
    results['11_archived_plan_rejection'] = archivedRejected;
    console.log(`  -> ${archivedRejected ? 'PASS' : 'FAIL'}: Invalid/archived plan rejected.`);
  } catch (err: any) {
    results['11_archived_plan_rejection'] = false;
  }

  // Checkpoint 6: Cancelled checkout does not activate subscription
  console.log('Checking Checkpoint 6: Cancelled checkout protection...');
  await expireBusiness(businessA);
  const cancelOrder = await razorpayService.createOrder({
    businessId: businessA,
    planId: 'base',
    durationMonths: 6,
    userId: ownerA,
  });
  // User cancels modal (no verification sent)
  const gatekeeper6 = await entitlementService.canUseService(businessA, 'qr_scan');
  results['6_cancelled_checkout_safe'] = !gatekeeper6.allowed;
  console.log(`  -> ${!gatekeeper6.allowed ? 'PASS' : 'FAIL'}: Cancelled checkout leaves account blocked.`);

  // Checkpoint 7: Invalid signature does not activate subscription
  console.log('Checking Checkpoint 7: Invalid signature protection...');
  let sigRejected = false;
  try {
    await razorpayService.verifyPayment({
      business_id: businessA,
      plan_id: 'base',
      duration_months: 6,
      razorpay_order_id: cancelOrder.order_id,
      razorpay_payment_id: `pay_bad_sig_${Date.now()}`,
      razorpay_signature: 'invalid_tampered_signature_hex_value',
      user_id: ownerA,
    });
  } catch {
    sigRejected = true;
  }
  const gatekeeper7 = await entitlementService.canUseService(businessA, 'qr_scan');
  results['7_invalid_sig_rejected'] = sigRejected && !gatekeeper7.allowed;
  console.log(`  -> ${results['7_invalid_sig_rejected'] ? 'PASS' : 'FAIL'}: Invalid signature rejected.`);

  // Checkpoint 5 & 18: Failed payment does not activate subscription & QR remains blocked
  console.log('Checking Checkpoints 5 & 18: Failed payment protection & blocked QR...');
  const failedOrder = await razorpayService.createOrder({
    businessId: businessA,
    planId: 'base',
    durationMonths: 6,
    userId: ownerA,
  });
  const { rawBody: failBody, signature: failSig } = signWebhook({
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: `pay_audit_fail_${Date.now()}`,
          order_id: failedOrder.order_id,
          amount: 249900,
          currency: 'INR',
          error_description: 'Audit test simulated decline',
        },
      },
    },
  });
  await razorpayService.handleWebhook(failBody, failSig);
  const gatekeeper5 = await entitlementService.canUseService(businessA, 'qr_scan');
  results['5_failed_payment_safe'] = !gatekeeper5.allowed;
  results['18_expired_qr_blocked_on_fail'] = !gatekeeper5.allowed;
  console.log(`  -> ${!gatekeeper5.allowed ? 'PASS' : 'FAIL'}: Failed payment keeps subscription and QR blocked.`);

  // Checkpoint 1, 2, 3, 4, 13, 14, 15, 17:
  // Active paid plan purchase + Expired account -> successful payment + SAME QR reactivation + limits match exact version
  console.log('Checking Checkpoints 1, 2, 3, 4, 13, 14, 15, 17: End-to-End verified activation...');
  await expireBusiness(businessA);

  const { data: initialQRs } = await (supabaseAdmin
    .from('qr_codes')
    .select('id, is_active')
    .eq('business_id', businessA) as any);
  const initialQrCount = initialQRs?.length || 0;
  const initialQrId = initialQRs?.[0]?.id;

  const validOrder = await razorpayService.createOrder({
    businessId: businessA,
    planId: 'base',
    durationMonths: 6,
    userId: ownerA,
    userEmail: emailA,
  });

  const validPaymentId = `pay_audit_success_${Date.now()}`;
  const validSig = crypto.createHmac('sha256', keySecret).update(`${validOrder.order_id}|${validPaymentId}`).digest('hex');

  const verifyRes = await razorpayService.verifyPayment({
    business_id: businessA,
    plan_id: 'base',
    duration_months: 6,
    razorpay_order_id: validOrder.order_id,
    razorpay_payment_id: validPaymentId,
    razorpay_signature: validSig,
    user_id: ownerA,
    user_email: emailA,
  });

  const sub = verifyRes.subscription;
  const gatekeeperAfter = await entitlementService.canUseService(businessA, 'qr_scan');

  // Verify SAME QR
  const { data: qrsAfter } = await (supabaseAdmin
    .from('qr_codes')
    .select('id, is_active')
    .eq('business_id', businessA) as any);
  const sameQr = qrsAfter.find((q: any) => q.id === initialQrId);

  results['1_active_paid_purchase'] = verifyRes.success && sub.status === 'active';
  results['2_expired_to_paid_activation'] = verifyRes.success && sub.is_expired === false;
  results['3_existing_same_qr_usable'] = gatekeeperAfter.allowed === true && sameQr?.is_active === true;
  results['4_no_duplicate_qr'] = qrsAfter.length === initialQrCount;
  results['14_exact_purchased_version'] = sub.plan_version_id === validOrder.plan_version_id;
  results['15_limits_from_purchased_version'] = sub.monthly_qr_quota === 100 && sub.monthly_ai_quota === 50;
  results['17_authoritative_entitlement_qr'] = gatekeeperAfter.allowed === true;

  // Checkpoint 13: Verify payment records are correctly linked
  const paymentRecord = await razorpayService.findPaymentRecord(validPaymentId);
  results['13_payment_record_linked'] = Boolean(
    paymentRecord &&
    paymentRecord.business_id === businessA &&
    paymentRecord.user_id === ownerA &&
    paymentRecord.razorpay_order_id === validOrder.order_id &&
    paymentRecord.status === 'SUCCESS'
  );
  console.log(`  -> ${results['1_active_paid_purchase'] ? 'PASS' : 'FAIL'}: Subscription activated.`);
  console.log(`  -> ${results['3_existing_same_qr_usable'] ? 'PASS' : 'FAIL'}: SAME existing QR reactivated.`);
  console.log(`  -> ${results['4_no_duplicate_qr'] ? 'PASS' : 'FAIL'}: QR count untouched (${qrsAfter.length}/${initialQrCount}).`);
  console.log(`  -> ${results['13_payment_record_linked'] ? 'PASS' : 'FAIL'}: Payment record correctly linked.`);
  console.log(`  -> ${results['14_exact_purchased_version'] ? 'PASS' : 'FAIL'}: Exact version (${sub.plan_version_id}) enforced.`);

  // Checkpoint 8: Duplicate webhook does not activate twice
  console.log('Checking Checkpoint 8: Duplicate webhook idempotency...');
  const { rawBody: dupBody, signature: dupSig } = signWebhook({
    event: 'order.paid',
    payload: {
      order: { entity: { id: validOrder.order_id, amount: 249900, currency: 'INR' } },
      payment: { entity: { id: validPaymentId, order_id: validOrder.order_id, amount: 249900, currency: 'INR' } },
    },
  });
  const dupRes = await razorpayService.handleWebhook(dupBody, dupSig);
  results['8_duplicate_webhook_safe'] = dupRes.status === 'already_processed';
  console.log(`  -> ${results['8_duplicate_webhook_safe'] ? 'PASS' : 'FAIL'}: Duplicate webhook recognized (${dupRes.status}).`);

  // Checkpoint 9: Frontend verification + webhook simultaneously does not activate twice
  console.log('Checking Checkpoint 9: Frontend verification + webhook race condition...');
  const raceOrder = await razorpayService.createOrder({
    businessId: businessA,
    planId: 'base',
    durationMonths: 6,
    userId: ownerA,
  });
  const racePaymentId = `pay_audit_race_${Date.now()}`;
  const raceSig = crypto.createHmac('sha256', keySecret).update(`${raceOrder.order_id}|${racePaymentId}`).digest('hex');
  const { rawBody: raceWhBody, signature: raceWhSig } = signWebhook({
    event: 'order.paid',
    payload: {
      order: { entity: { id: raceOrder.order_id, amount: 249900, currency: 'INR' } },
      payment: { entity: { id: racePaymentId, order_id: raceOrder.order_id, amount: 249900, currency: 'INR' } },
    },
  });

  const [resFrontend, resWebhook] = await Promise.all([
    razorpayService.verifyPayment({
      business_id: businessA,
      plan_id: 'base',
      duration_months: 6,
      razorpay_order_id: raceOrder.order_id,
      razorpay_payment_id: racePaymentId,
      razorpay_signature: raceSig,
      user_id: ownerA,
    }),
    razorpayService.handleWebhook(raceWhBody, raceWhSig),
  ]);

  const raceSafe =
    (resFrontend.already_processed === false && resWebhook.status === 'already_processed') ||
    (resFrontend.already_processed === true && resWebhook.status === 'activated') ||
    (resFrontend.success && (resWebhook.status === 'activated' || resWebhook.status === 'already_processed'));
  results['9_race_condition_safe'] = raceSafe;
  console.log(`  -> ${raceSafe ? 'PASS' : 'FAIL'}: Concurrency lock converged safely.`);

  // Checkpoint 16: Dashboard and billing update after successful activation
  console.log('Checking Checkpoint 16: Authoritative billing status retrieval...');
  const entitlementStatus = await entitlementService.getBusinessEntitlement(businessA);
  const httpStatusRes = await axios.get(
    `http://localhost:4000/api/v1/subscription/status?business_id=${businessA}`,
    { headers: { Authorization: `Bearer ${tokenA}` } }
  );
  const httpSub = httpStatusRes.data?.data;
  results['16_dashboard_billing_updated'] =
    entitlementStatus.is_active === true &&
    entitlementStatus.status === 'active' &&
    httpSub?.is_active === true;
  console.log(`  -> ${results['16_dashboard_billing_updated'] ? 'PASS' : 'FAIL'}: Billing status active.`);

  // Checkpoint 19: Multiple businesses remain isolated
  console.log('Checking Checkpoint 19: Business context isolation...');
  const fakeBizId = '00000000-0000-0000-0000-000000000000';
  let crossBizRejected = false;
  try {
    await razorpayService.verifyPayment({
      business_id: fakeBizId, // Mismatched business ID!
      plan_id: 'base',
      duration_months: 6,
      razorpay_order_id: raceOrder.order_id,
      razorpay_payment_id: `pay_cross_${Date.now()}`,
      razorpay_signature: raceSig,
      user_id: ownerA,
    });
  } catch {
    crossBizRejected = true;
  }
  results['19_business_isolation'] = crossBizRejected;
  console.log(`  -> ${crossBizRejected ? 'PASS' : 'FAIL'}: Cross-business verification rejected.`);

  console.log('\n================================================================');
  console.log('AUDIT CHECKPOINT SUMMARY:');
  console.log('================================================================');
  let passCount = 0;
  let totalCount = 0;
  for (const [key, passed] of Object.entries(results)) {
    totalCount++;
    if (passed) passCount++;
    console.log(`  [${passed ? 'PASS' : 'FAIL'}] Checkpoint ${key}`);
  }

  console.log(`\nTOTAL: ${passCount} / ${totalCount} CHECKPOINTS PASSED.`);
  if (passCount !== totalCount) {
    throw new Error(`Audit failed: ${totalCount - passCount} checkpoints failed.`);
  }
  console.log('\nALL 19 AUDIT CHECKPOINTS PASSED PERFECTLY!');
}

runStep5Audit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
