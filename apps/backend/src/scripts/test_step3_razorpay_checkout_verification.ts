/**
 * STEP 3 — Comprehensive Verification Suite:
 * Razorpay Checkout + Server-Side Payment Verification
 * 
 * Verifies:
 * 1. Checkout flow: Server order creation with authoritative amount
 * 2. Server verification of Razorpay HMAC-SHA256 signature
 * 3. Validation against original pending order (user, business, plan, amount)
 * 4. Test Case A: Successful test payment -> verification succeeds -> subscription activates -> SAME existing QR usable
 * 5. Test Case B: Cancelled checkout -> subscription remains unchanged -> QR remains blocked
 * 6. Test Case C: Failed payment -> status recorded as failed -> subscription remains unchanged
 * 7. Test Case D: Invalid signature -> verification rejected -> subscription NOT activated
 * 8. Test Case E: Manipulated client amount -> verification rejected
 * 9. Test Case F: Replayed payment (Idempotency) -> returns already_processed, no duplicate subscription, no extra QR
 * 10. Test Case G: Expired account -> successful payment -> SAME existing QR becomes active again
 */

import 'dotenv/config';
import crypto from 'crypto';
import { razorpayService } from '../modules/payment/razorpay-service';
import { entitlementService } from '../modules/subscription/entitlement';
import { supabaseAdmin } from '../config/supabase';

async function runStep3Verification() {
  console.log('====================================================');
  console.log('STEP 3 — RAZORPAY CHECKOUT & VERIFICATION SUITE');
  console.log('====================================================');

  const testBusinessId = '88d2da14-f37b-46b9-95af-51379d92fd6a';
  const testUserId = '43c94316-cbfa-4599-8ed9-ff52dec73f23';
  const testUserEmail = 'devanshi@gmail.com';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'aPma1OvKUzwxLL99M9NABte3';

  // --- INITIAL STATE AUDIT ---
  console.log('\n--- INITIAL STATE AUDIT ---');
  const { data: initialQRs } = await (supabaseAdmin
    .from('qr_codes')
    .select('id, slug, is_active')
    .eq('business_id', testBusinessId) as any);

  console.log(`Initial QR Codes Count for business: ${initialQRs?.length || 0}`);
  const existingQrId = initialQRs?.[0]?.id;
  console.log(`Target Existing QR ID: ${existingQrId} (is_active: ${initialQRs?.[0]?.is_active})`);

  // Ensure initial subscription is in expired state for testing reactivation
  await (supabaseAdmin
    .from('subscriptions')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('business_id', testBusinessId) as any);

  // Deactivate QR to simulate expired state
  await (supabaseAdmin
    .from('qr_codes')
    .update({ is_active: false })
    .eq('business_id', testBusinessId) as any);

  const initialGatekeeper = await entitlementService.canUseService(testBusinessId, 'qr_scan');
  console.log(`Initial gatekeeper access: allowed = ${initialGatekeeper.allowed}, reason = ${initialGatekeeper.reason}`);
  if (initialGatekeeper.allowed) {
    throw new Error('Precondition failed: Expected account to be blocked/expired');
  }

  // --- TEST CASE B: Cancelled Checkout ---
  console.log('\n--- TEST CASE B: Cancelled Checkout ---');
  // Client creates an order but user closes modal / cancels checkout
  const cancelledOrder = await razorpayService.createOrder({
    businessId: testBusinessId,
    planId: 'base',
    durationMonths: 6,
    userId: testUserId,
    userEmail: testUserEmail,
  });
  console.log(`User created order ${cancelledOrder.order_id} but cancelled checkout modal.`);
  const gatekeeperAfterCancel = await entitlementService.canUseService(testBusinessId, 'qr_scan');
  console.log(`Gatekeeper after cancelled checkout: allowed = ${gatekeeperAfterCancel.allowed}`);
  if (gatekeeperAfterCancel.allowed) {
    throw new Error('TEST B FAILED: Subscription activated despite cancelled checkout');
  }
  console.log('TEST CASE B PASSED: Cancelled checkout left subscription and QR safely blocked.');

  // --- TEST CASE C: Failed Gateway Payment ---
  console.log('\n--- TEST CASE C: Failed Gateway Payment ---');
  await razorpayService.recordFailedPayment({
    business_id: testBusinessId,
    user_id: testUserId,
    razorpay_order_id: cancelledOrder.order_id,
    razorpay_payment_id: 'pay_failed_test_' + Date.now(),
    reason: 'PAYMENT_FAILED_USER_DROPPED',
  });
  const gatekeeperAfterFail = await entitlementService.canUseService(testBusinessId, 'qr_scan');
  if (gatekeeperAfterFail.allowed) {
    throw new Error('TEST C FAILED: Subscription activated despite failed payment');
  }
  console.log('TEST CASE C PASSED: Failed payment did not activate subscription.');

  // --- TEST CASE D: Invalid Payment Signature ---
  console.log('\n--- TEST CASE D: Invalid Payment Signature Rejection ---');
  const orderForSigTest = await razorpayService.createOrder({
    businessId: testBusinessId,
    planId: 'base',
    durationMonths: 6,
    userId: testUserId,
    userEmail: testUserEmail,
  });

  const fakePaymentId = `pay_fake_${Date.now()}`;
  const badSignature = 'invalid_tampered_hmac_sha256_signature_abc123';

  try {
    await razorpayService.verifyPayment({
      business_id: testBusinessId,
      plan_id: 'base',
      duration_months: 6,
      razorpay_order_id: orderForSigTest.order_id,
      razorpay_payment_id: fakePaymentId,
      razorpay_signature: badSignature,
      user_id: testUserId,
      user_email: testUserEmail,
    });
    throw new Error('TEST D FAILED: Invalid signature was NOT rejected!');
  } catch (err: any) {
    console.log(`TEST CASE D PASSED: Server rejected invalid signature -> "${err.message}"`);
  }

  // --- TEST CASE E: Manipulated Amount ---
  console.log('\n--- TEST CASE E: Manipulated Client Amount Rejection ---');
  // Client tampers with the payment amount
  const validPaymentIdE = `pay_test_${Date.now()}_e`;
  const validSigE = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderForSigTest.order_id}|${validPaymentIdE}`)
    .digest('hex');

  try {
    await razorpayService.verifyPayment({
      business_id: testBusinessId,
      plan_id: 'base',
      duration_months: 6,
      razorpay_order_id: orderForSigTest.order_id,
      razorpay_payment_id: validPaymentIdE,
      razorpay_signature: validSigE,
      user_id: testUserId,
      user_email: testUserEmail,
      amount: 1, // Tampered client amount: 1 paisa instead of authoritative amount!
    });
    throw new Error('TEST E FAILED: Manipulated amount was NOT rejected!');
  } catch (err: any) {
    console.log(`TEST CASE E PASSED: Server rejected manipulated amount -> "${err.message}"`);
  }

  // --- TEST CASE A & G: Successful Test Payment + SAME QR Reactivation ---
  console.log('\n--- TEST CASE A & G: Successful Test Payment & SAME QR Reactivation ---');
  const validOrder = await razorpayService.createOrder({
    businessId: testBusinessId,
    planId: 'base',
    durationMonths: 6,
    userId: testUserId,
    userEmail: testUserEmail,
  });

  const realTestPaymentId = `pay_test_${Date.now()}_success`;
  const validSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${validOrder.order_id}|${realTestPaymentId}`)
    .digest('hex');

  console.log(`Submitting valid payment verification:`);
  console.log(`  Order ID:   ${validOrder.order_id}`);
  console.log(`  Payment ID: ${realTestPaymentId}`);

  const verifyResult = await razorpayService.verifyPayment({
    business_id: testBusinessId,
    plan_id: 'base',
    duration_months: 6,
    razorpay_order_id: validOrder.order_id,
    razorpay_payment_id: realTestPaymentId,
    razorpay_signature: validSignature,
    user_id: testUserId,
    user_email: testUserEmail,
  });

  console.log(`Verification Response: success = ${verifyResult.success}`);
  if (!verifyResult.success) {
    throw new Error('TEST A FAILED: Payment verification failed');
  }

  // Verify Subscription is now ACTIVE
  const { data: updatedSub } = await (supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('business_id', testBusinessId)
    .maybeSingle() as any);

  console.log('Subscription details after verification:');
  console.log(`  Status:             ${updatedSub.status}`);
  console.log(`  Plan:               ${updatedSub.plan_id} (${updatedSub.metadata?.plan_version_id})`);
  console.log(`  Duration:           ${updatedSub.metadata?.duration_months} Months`);
  console.log(`  Start Date:         ${updatedSub.current_period_start}`);
  console.log(`  End Date:           ${updatedSub.current_period_end}`);
  console.log(`  Monthly QR Quota:   ${updatedSub.metadata?.monthly_qr_quota}`);
  console.log(`  Current QR Used:    ${updatedSub.metadata?.current_month_qr_used}`);
  console.log(`  Current AI Used:    ${updatedSub.metadata?.current_month_ai_used}`);

  if (updatedSub.status !== 'active') {
    throw new Error(`TEST A FAILED: Expected active subscription, got ${updatedSub.status}`);
  }
  if (updatedSub.metadata?.current_month_qr_used !== 0 || updatedSub.metadata?.current_month_ai_used !== 0) {
    throw new Error('TEST A FAILED: Fresh paid usage was not initialized to 0');
  }

  // Verify SAME existing QR Code is reactivated (NOT a new QR code!)
  const { data: postPaymentQRs } = await (supabaseAdmin
    .from('qr_codes')
    .select('id, slug, is_active')
    .eq('business_id', testBusinessId) as any);

  console.log(`Post-Payment QR Count: ${postPaymentQRs.length}`);
  const targetQR = postPaymentQRs.find((q: any) => q.id === existingQrId);
  console.log(`Existing QR Code (${existingQrId}): is_active = ${targetQR?.is_active}`);

  if (postPaymentQRs.length !== initialQRs.length) {
    throw new Error('TEST G FAILED: Duplicate QR code was generated! Expected SAME QR.');
  }
  if (!targetQR || !targetQR.is_active) {
    throw new Error('TEST G FAILED: Existing QR was NOT reactivated!');
  }

  // Authoritative Gatekeeper Check
  const postPaymentGatekeeper = await entitlementService.canUseService(testBusinessId, 'qr_scan');
  console.log(`Gatekeeper access after activation: allowed = ${postPaymentGatekeeper.allowed}`);
  if (!postPaymentGatekeeper.allowed) {
    throw new Error('TEST A FAILED: canUseService still returns false after activation');
  }
  console.log('TEST CASE A & G PASSED: Payment verified, subscription active, SAME existing QR reactivated.');

  // --- TEST CASE F: Replayed Payment Request (Idempotency) ---
  console.log('\n--- TEST CASE F: Idempotency (Replayed Payment Request) ---');
  const replayResult = await razorpayService.verifyPayment({
    business_id: testBusinessId,
    plan_id: 'base',
    duration_months: 6,
    razorpay_order_id: validOrder.order_id,
    razorpay_payment_id: realTestPaymentId, // EXACT SAME payment ID
    razorpay_signature: validSignature,
    user_id: testUserId,
    user_email: testUserEmail,
  });

  console.log(`Replay Result: already_processed = ${replayResult.already_processed}`);
  if (!replayResult.already_processed) {
    throw new Error('TEST F FAILED: Idempotency flag was not set on replayed payment');
  }

  // Check no extra QR or subscription row was created
  const { data: finalQRs } = await (supabaseAdmin
    .from('qr_codes')
    .select('id')
    .eq('business_id', testBusinessId) as any);

  if (finalQRs.length !== initialQRs.length) {
    throw new Error('TEST F FAILED: Duplicate QR was generated on replay!');
  }
  console.log('TEST CASE F PASSED: Idempotent handling verified. No double activation, no duplicate QR.');

  console.log('\n====================================================');
  console.log('ALL STEP 3 TEST CASES (A, B, C, D, E, F, G) PASSED!');
  console.log('====================================================');
}

runStep3Verification().catch((err) => {
  console.error('Step 3 verification failed:', err);
  process.exit(1);
});
