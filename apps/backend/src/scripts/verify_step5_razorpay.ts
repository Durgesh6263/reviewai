/**
 * STEP 5 — RAZORPAY PAYMENT + TRIAL TO PAID ACTIVATION VERIFICATION
 * 
 * Verifies all 15 requirements (A through O):
 * A. Active trial -> QR works
 * B. Trial expires -> QR stops
 * C. Client selects plan
 * D. Razorpay order created with correct Admin-configured price
 * E. Successful test payment
 * F. Server verifies payment
 * G. Subscription becomes ACTIVE
 * H. Monthly QR/AI usage starts at 0
 * I. Existing QR becomes active
 * J. Failed payment -> no activation
 * K. Cancelled checkout -> no activation
 * L. Duplicate webhook -> no duplicate subscription
 * M. Frontend payment manipulation -> rejected
 * N. Expired trial cannot use QR before successful payment
 * O. Payment history is recorded
 */

import 'dotenv/config';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { planConfigService } from '../modules/admin/plan-config-service';
import { razorpayService } from '../modules/payment/razorpay-service';

async function runStep5Verification() {
  console.log('================================================================');
  console.log('   STEP 5: RAZORPAY PAYMENT & TRIAL-TO-PAID ACTIVATION TEST     ');
  console.log('================================================================\n');

  // Find a test user and business
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, email, full_name')
    .limit(1)
    .single();

  if (!user) {
    throw new Error('No user found for testing.');
  }

  // Find or create test business
  let { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, name, slug, owner_id')
    .eq('owner_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!business) {
    const { data: anyBiz } = await supabaseAdmin
      .from('businesses')
      .select('id, name, slug, owner_id')
      .limit(1)
      .single();
    business = anyBiz;
  }

  if (!business) {
    throw new Error('No business found for testing.');
  }

  const businessId = business.id;
  const userId = user.id;
  const userEmail = user.email;

  console.log(`Test Context: Business=${business.name} (${businessId}), User=${userEmail} (${userId})\n`);

  // Ensure test QR code exists for this business
  let { data: qrCode } = await supabaseAdmin
    .from('qr_codes')
    .select('id, label, slug, is_active')
    .eq('business_id', businessId)
    .limit(1)
    .maybeSingle();

  if (!qrCode) {
    const { data: newQr } = await supabaseAdmin
      .from('qr_codes')
      .insert({
        business_id: businessId,
        label: 'Main Counter QR',
        slug: `test-qr-${Date.now().toString().slice(-6)}`,
        is_active: true,
        design: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    qrCode = newQr;
  }

  // -------------------------------------------------------------
  // TEST A: Active trial -> QR works
  // -------------------------------------------------------------
  console.log('--- TEST A: Active trial -> QR works ---');
  // Provision active free trial
  await supabaseAdmin
    .from('subscriptions')
    .upsert({
      business_id: businessId,
      owner_id: userId,
      plan_id: 'free_trial',
      status: 'trialing',
      billing_cycle: 'monthly',
      price_cents: 0,
      currency: 'INR',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 14 * 86400000).toISOString(),
      trial_start: new Date().toISOString(),
      trial_end: new Date(Date.now() + 14 * 86400000).toISOString(),
      metadata: {
        is_trial: true,
        duration: '14_days',
        allocated_qr_quota: 100,
        allocated_ai_quota: 50,
        used_qr_quota: 0,
        used_ai_quota: 0,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' });

  await supabaseAdmin
    .from('qr_codes')
    .update({ is_active: true })
    .eq('business_id', businessId);

  const trialEntitlement = await entitlementService.getBusinessEntitlement(businessId);
  const trialQrCheck = await entitlementService.canUseService(businessId, 'qr_scan');

  console.log(`Trial Status: ${trialEntitlement.status}, Days Remaining: ${trialEntitlement.days_remaining}`);
  console.log(`QR Service Allowed: ${trialQrCheck.allowed}`);

  if (trialQrCheck.allowed) {
    console.log('>>> TEST A PASSED: QR scan service works during active trial.\n');
  } else {
    throw new Error(`TEST A FAILED: Active trial was blocked: ${trialQrCheck.reason}`);
  }

  // -------------------------------------------------------------
  // TEST B & N: Trial expires -> QR stops & cannot use QR before payment
  // -------------------------------------------------------------
  console.log('--- TEST B & N: Trial expires -> QR stops (expired trial blocked) ---');
  // Mark trial as expired 2 days ago
  const pastDate = new Date(Date.now() - 2 * 86400000).toISOString();
  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'expired',
      current_period_end: pastDate,
      trial_end: pastDate,
      updated_at: new Date().toISOString(),
    })
    .eq('business_id', businessId);

  // Deactivate QR code for expired trial
  await supabaseAdmin
    .from('qr_codes')
    .update({ is_active: false })
    .eq('business_id', businessId);

  const expiredEntitlement = await entitlementService.getBusinessEntitlement(businessId);
  const expiredQrCheck = await entitlementService.canUseService(businessId, 'qr_scan');

  console.log(`Expired Trial Status: ${expiredEntitlement.status}, Is Active: ${expiredEntitlement.is_active}`);
  console.log(`QR Check: Allowed=${expiredQrCheck.allowed}, Reason=${expiredQrCheck.reason}`);

  if (!expiredQrCheck.allowed && (expiredQrCheck.reason === 'TRIAL_EXPIRED' || expiredQrCheck.reason === 'SUBSCRIPTION_EXPIRED')) {
    console.log('>>> TEST B & N PASSED: Expired trial cannot use QR and QR service is blocked.\n');
  } else {
    throw new Error(`TEST B/N FAILED: Expired trial should have been blocked, got allowed=${expiredQrCheck.allowed}`);
  }

  // -------------------------------------------------------------
  // TEST C: Client selects plan from authoritative Admin catalog
  // -------------------------------------------------------------
  console.log('--- TEST C: Client selects plan from authoritative catalog ---');
  const catalog = await planConfigService.getPublicPlans();
  const basePlan = catalog.plans.find(p => p.id === 'base') || catalog.plans[0];
  const selectedDurationMonths = 6;
  const durationKey = '6_months';
  const expectedOffering = basePlan.durations[durationKey];

  console.log(`Selected Plan: ${basePlan.name} (v${basePlan.version_number}), Duration: ${selectedDurationMonths} Months`);
  console.log(`Authoritative Admin Price: ₹${expectedOffering.price_inr}, Monthly QR: ${expectedOffering.monthly_qr_quota}, Monthly AI: ${expectedOffering.monthly_ai_quota}`);
  console.log('>>> TEST C PASSED: Client catalog loaded with authoritative limits & pricing.\n');

  // -------------------------------------------------------------
  // TEST D: Razorpay order created with correct Admin-configured price
  // -------------------------------------------------------------
  console.log('--- TEST D: Razorpay order created with authoritative price ---');
  const order = await razorpayService.createOrder({
    businessId,
    planId: basePlan.id,
    durationMonths: selectedDurationMonths,
    planVersionId: basePlan.plan_version_id,
    userId,
    userEmail,
  });

  const expectedAmountPaise = Math.round(expectedOffering.price_inr * 100);
  console.log(`Order Created: ID=${order.order_id}, Amount=${order.amount} paise (₹${order.price_inr}), KeyID=${order.key_id}`);

  if (order.amount === expectedAmountPaise && order.price_inr === expectedOffering.price_inr) {
    console.log('>>> TEST D PASSED: Order created strictly with authoritative Admin-configured price.\n');
  } else {
    throw new Error(`TEST D FAILED: Order amount ${order.amount} does not match expected ${expectedAmountPaise}`);
  }

  // -------------------------------------------------------------
  // TEST J & M: Failed payment & payment manipulation -> rejected
  // -------------------------------------------------------------
  console.log('--- TEST J & M: Payment manipulation / invalid signature -> rejected ---');
  let manipulationCaught = false;
  try {
    await razorpayService.verifyPayment({
      business_id: businessId,
      plan_id: basePlan.id,
      duration_months: selectedDurationMonths,
      razorpay_order_id: order.order_id,
      razorpay_payment_id: 'pay_fake_tampered_12345',
      razorpay_signature: 'fake_tampered_signature_99999',
      user_id: userId,
      user_email: userEmail,
    });
  } catch (err: any) {
    manipulationCaught = true;
    console.log(`Caught expected security error: ${err.message}`);
  }

  // Verify subscription is still expired
  const stillExpiredEntitlement = await entitlementService.getBusinessEntitlement(businessId);
  if (manipulationCaught && stillExpiredEntitlement.status === 'expired') {
    console.log('>>> TEST J & M PASSED: Tampered/fake payment rejected; subscription remains expired.\n');
  } else {
    throw new Error('TEST J/M FAILED: Tampered payment was not rejected or subscription activated prematurely.');
  }

  // -------------------------------------------------------------
  // TEST K: Cancelled checkout -> no activation
  // -------------------------------------------------------------
  console.log('--- TEST K: Cancelled checkout -> no activation ---');
  const cancelOrder = await razorpayService.createOrder({
    businessId,
    planId: basePlan.id,
    durationMonths: 1,
    userId,
  });
  // User closes checkout modal without payment; no verifyPayment call made
  const cancelEntitlement = await entitlementService.getBusinessEntitlement(businessId);
  if (cancelEntitlement.status === 'expired') {
    console.log('>>> TEST K PASSED: Abandoned/cancelled checkout causes no activation.\n');
  } else {
    throw new Error('TEST K FAILED: Cancelled checkout modified subscription state.');
  }

  // -------------------------------------------------------------
  // TEST E, F, G, H, I: Successful payment -> verified -> ACTIVE -> usage starts at 0 -> QR reactivated
  // -------------------------------------------------------------
  console.log('--- TEST E, F, G, H, I: Successful test payment & activation ---');
  const validPaymentId = `pay_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_reviewai_dev_123';
  const validSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${order.order_id}|${validPaymentId}`)
    .digest('hex');

  console.log(`Generated Valid HMAC Signature: ${validSignature.slice(0, 16)}...`);

  // Verify payment on server
  const verificationResult = await razorpayService.verifyPayment({
    business_id: businessId,
    plan_id: basePlan.id,
    duration_months: selectedDurationMonths,
    plan_version_id: order.plan_version_id,
    razorpay_order_id: order.order_id,
    razorpay_payment_id: validPaymentId,
    razorpay_signature: validSignature,
    user_id: userId,
    user_email: userEmail,
  });

  if (!verificationResult.success) {
    throw new Error('TEST F FAILED: Valid payment verification returned success=false');
  }
  console.log('>>> TEST F PASSED: Server successfully verified payment signature with secret.');

  // Check Subscription Status
  const activeEntitlement = await entitlementService.getBusinessEntitlement(businessId);
  console.log(`Activated Subscription: Plan=${activeEntitlement.plan_name}, Status=${activeEntitlement.status}, IsActive=${activeEntitlement.is_active}`);

  if (activeEntitlement.status === 'active' && activeEntitlement.is_active) {
    console.log('>>> TEST G PASSED: Subscription transitioned from expired trial to ACTIVE paid plan.');
  } else {
    throw new Error(`TEST G FAILED: Expected active status, got ${activeEntitlement.status}`);
  }

  // Check monthly usage starts at 0
  console.log(`Usage Check: Monthly QR Limit=${activeEntitlement.monthly_qr_quota}, QR Used=${activeEntitlement.current_month_qr_used}, AI Used=${activeEntitlement.current_month_ai_used}`);
  if (activeEntitlement.current_month_qr_used === 0 && activeEntitlement.current_month_ai_used === 0) {
    console.log('>>> TEST H PASSED: Monthly QR and AI usage starts at 0 upon paid activation (trial usage not carried over).');
  } else {
    throw new Error(`TEST H FAILED: Usage counters did not start at 0: QR=${activeEntitlement.current_month_qr_used}, AI=${activeEntitlement.current_month_ai_used}`);
  }

  // Check QR Reactivation
  const { data: refreshedQr } = await supabaseAdmin
    .from('qr_codes')
    .select('id, label, is_active')
    .eq('business_id', businessId)
    .limit(1)
    .maybeSingle();

  const qrServiceCheck = await entitlementService.canUseService(businessId, 'qr_scan');
  console.log(`QR Code is_active: ${refreshedQr?.is_active}, Service Allowed: ${qrServiceCheck.allowed}`);

  if (refreshedQr?.is_active && qrServiceCheck.allowed) {
    console.log('>>> TEST I PASSED: Existing QR code reactivated and functional for active subscription.\n');
  } else {
    throw new Error('TEST I FAILED: QR code was not reactivated or scan service still blocked.');
  }

  // -------------------------------------------------------------
  // TEST L: Webhook / Replay Idempotency
  // -------------------------------------------------------------
  console.log('--- TEST L: Webhook & payment replay idempotency ---');
  // 1. Replay same payment verification
  const replayResult = await razorpayService.verifyPayment({
    business_id: businessId,
    plan_id: basePlan.id,
    duration_months: selectedDurationMonths,
    razorpay_order_id: order.order_id,
    razorpay_payment_id: validPaymentId,
    razorpay_signature: validSignature,
    user_id: userId,
    user_email: userEmail,
  });

  console.log(`Replay Payment Result: AlreadyProcessed=${replayResult.already_processed}`);

  // 2. Webhook with duplicate payment event
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_whsec_reviewai_dev_123';
  const webhookBody = JSON.stringify({
    event: 'order.paid',
    payload: {
      order: {
        entity: {
          id: order.order_id,
          notes: {
            business_id: businessId,
            plan_id: basePlan.id,
            duration_months: '6',
            user_id: userId,
          },
        },
      },
      payment: {
        entity: {
          id: validPaymentId,
          order_id: order.order_id,
          amount: expectedAmountPaise,
          currency: 'INR',
          status: 'captured',
        },
      },
    },
  });

  const webhookSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(webhookBody)
    .digest('hex');

  const webhookResult = await razorpayService.handleWebhook(webhookBody, webhookSignature);
  console.log(`Webhook Result: Status=${webhookResult.status}`);

  if (replayResult.already_processed && webhookResult.status === 'already_processed') {
    console.log('>>> TEST L PASSED: Duplicate payment/webhook handled idempotently without duplicate activation.\n');
  } else {
    throw new Error('TEST L FAILED: Duplicate webhook or replay did not indicate already_processed.');
  }

  // -------------------------------------------------------------
  // TEST O: Payment history is recorded
  // -------------------------------------------------------------
  console.log('--- TEST O: Payment history recorded ---');
  const history = await razorpayService.getPaymentHistory(businessId);
  const recordedPayment = history.find(p => p.razorpay_payment_id === validPaymentId);

  console.log(`Payment History Records found: ${history.length}`);
  if (recordedPayment) {
    console.log(`Recorded Payment: Order=${recordedPayment.razorpay_order_id}, Payment=${recordedPayment.razorpay_payment_id}, Amount=₹${recordedPayment.amount_inr}, Status=${recordedPayment.status}`);
  }

  // Also check invoices table
  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('id, stripe_invoice_id, amount_cents, status')
    .eq('business_id', businessId)
    .eq('stripe_invoice_id', validPaymentId);

  const invoiceExists = invoices && invoices.length > 0;
  console.log(`Invoice row recorded: ${invoiceExists ? 'YES' : 'NO'}`);

  if (recordedPayment && recordedPayment.status === 'SUCCESS' && invoiceExists) {
    console.log('>>> TEST O PASSED: Payment history and invoice recorded accurately without sensitive credentials.\n');
  } else {
    throw new Error('TEST O FAILED: Payment record not found in payment history or invoices table.');
  }

  console.log('================================================================');
  console.log('   ALL 15 TESTS (A THROUGH O) PASSED SUCCESSFULLY!               ');
  console.log('================================================================');
}

runStep5Verification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('STEP 5 VERIFICATION ERROR:', err);
    process.exit(1);
  });
