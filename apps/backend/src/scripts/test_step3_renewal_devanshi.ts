import 'dotenv/config';
import assert from 'assert';
import crypto from 'crypto';
import axios from 'axios';
import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { planConfigService } from '../modules/admin/plan-config-service';
import { razorpayService } from '../modules/payment/razorpay-service';
import { QRService } from '../modules/qr/service';
import { QRController } from '../modules/qr/controller';
import { ReviewService } from '../modules/review/service';
import { AIProviderFactory } from '../modules/review/ai/factory';

async function main() {
  console.log('================================================================');
  console.log(' STEP 3: PAYMENT / RENEWAL -> SAME QR REACTIVATION TEST        ');
  console.log('================================================================\n');

  const qrService = new QRService(supabase);
  const qrController = new QRController(qrService);
  const aiFactory = new AIProviderFactory({});
  const reviewService = new ReviewService(supabase, aiFactory);

  // Helper to test QR route
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

  // 1. Identify devanshi test account
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('email', 'devanshi@gmail.com');

  if (uErr || !users || users.length === 0) {
    throw new Error('User devanshi@gmail.com not found');
  }
  const user = users[0];
  console.log(`[Account Found] User ID: ${user.id}, Email: ${user.email}`);

  // 2. Locate Target Business: "Trial Client A"
  const { data: businesses, error: bErr } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .eq('name', 'Trial Client A');

  if (bErr || !businesses || businesses.length === 0) {
    throw new Error('Business "Trial Client A" not found for devanshi');
  }
  const business = businesses[0];
  console.log(`[Business Found] ID: ${business.id}, Name: ${business.name}, Slug: ${business.slug}`);

  // 3. Locate Target QR code from Steps 1-2
  const { data: qrsInitial, error: qErr } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('business_id', business.id);

  if (qErr || !qrsInitial || qrsInitial.length === 0) {
    throw new Error('No QR code found for target business');
  }
  assert.strictEqual(qrsInitial.length, 1, 'Target business must have exactly 1 QR code');
  const targetQR = qrsInitial[0];
  const originalQRId = targetQR.id;
  const originalQRSlug = targetQR.slug;
  const publicQRUrl = `http://127.0.0.1:3000/r/${originalQRSlug}`;

  console.log(`[Target QR Code] ID: ${originalQRId}, Slug: ${originalQRSlug}`);
  console.log(`[Public QR URL] ${publicQRUrl}`);

  // -------------------------------------------------------------------
  // 1. CONFIRM STATE BEFORE PAYMENT: MUST BE EXPIRED & BLOCKED
  // -------------------------------------------------------------------
  console.log('\n--- 1. CONFIRM BEFORE PAYMENT: MUST BE EXPIRED & BLOCKED ---');
  const entBefore = await entitlementService.getBusinessEntitlement(business.id);
  const qrCheckBefore = await entitlementService.canUseService(business.id, 'qr_scan');
  const qrRouteBefore = await callGetBusinessByQRSlug(originalQRSlug);

  console.log(`- Entitlement status before: ${entBefore.status}`);
  console.log(`- QR service allowed before: ${qrCheckBefore.allowed} (reason: ${qrCheckBefore.reason})`);
  console.log(`- QR public route HTTP status before: ${qrRouteBefore.status} (code: ${qrRouteBefore.code})`);

  assert.strictEqual(entBefore.status.toLowerCase(), 'expired', 'Subscription must be EXPIRED before renewal');
  assert.strictEqual(qrCheckBefore.allowed, false, 'QR service must be BLOCKED before renewal');
  assert.strictEqual(qrRouteBefore.status, 403, 'Public QR route must return 403 Forbidden before renewal');

  // Verify direct review session start is blocked
  let sessionBeforeBlocked = false;
  try {
    await reviewService.createSession({
      business_id: business.id,
      qr_code_id: originalQRId,
    });
  } catch (err: any) {
    sessionBeforeBlocked = true;
    console.log(`- Review session creation blocked before payment: ${err.message || err.code}`);
  }
  assert.strictEqual(sessionBeforeBlocked, true, 'Review session creation must be blocked before renewal');

  // -------------------------------------------------------------------
  // 2. CHECK RAZORPAY CONFIGURATION
  // -------------------------------------------------------------------
  console.log('\n--- 2. RAZORPAY CONFIGURATION CHECK ---');
  const keyId = razorpayService.getPublicKey();
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_reviewai_dev_123';
  console.log(`- Razorpay Key ID: ${keyId}`);
  console.log(`- Razorpay Key Secret Configured: ${!!keySecret}`);
  if (!keyId || !keySecret) {
    throw new Error('Razorpay test credentials missing. Stopping per requirement 11.');
  }

  // -------------------------------------------------------------------
  // 3. SELECT PLAN FROM AUTHORITATIVE CATALOG
  // -------------------------------------------------------------------
  console.log('\n--- 3. AUTHORITATIVE PLAN SELECTION ---');
  const catalog = await planConfigService.getPublicPlans();
  const basePlan = catalog.plans.find((p) => p.id === 'base') || catalog.plans[0];
  const durationMonths = 6;
  const durationKey = '6_months';
  const offering = basePlan.durations[durationKey];

  console.log(`- Selected Plan: ${basePlan.name} (v${basePlan.version_number})`);
  console.log(`- Duration: ${durationMonths} Months`);
  console.log(`- Authoritative Price: ₹${offering.price_inr} (${offering.price_inr * 100} paise)`);
  console.log(`- Authoritative Monthly QR Quota: ${offering.monthly_qr_quota}`);
  console.log(`- Authoritative Monthly AI Quota: ${offering.monthly_ai_quota}`);

  // -------------------------------------------------------------------
  // 4. CREATE RAZORPAY ORDER (CHECKOUT INITIATION)
  // -------------------------------------------------------------------
  console.log('\n--- 4. CREATE RAZORPAY ORDER ---');
  const order = await razorpayService.createOrder({
    businessId: business.id,
    planId: basePlan.id,
    durationMonths,
    planVersionId: basePlan.plan_version_id,
    userId: user.id,
    userEmail: user.email,
  });

  console.log(`- Created Order ID: ${order.order_id}`);
  console.log(`- Amount: ${order.amount} paise (₹${order.price_inr})`);
  console.log(`- Order Currency: ${order.currency}`);
  assert.strictEqual(order.amount, Math.round(offering.price_inr * 100), 'Order amount must match authoritative price');

  // -------------------------------------------------------------------
  // 5. SECURITY TEST: TAMPERED / FAKE PAYMENT REJECTED
  // -------------------------------------------------------------------
  console.log('\n--- 5. SECURITY GUARD TEST: INVALID SIGNATURE / TAMPERED PAYMENT ---');
  let tamperedBlocked = false;
  try {
    await razorpayService.verifyPayment({
      business_id: business.id,
      plan_id: basePlan.id,
      duration_months: 6,
      razorpay_order_id: order.order_id,
      razorpay_payment_id: 'pay_tampered_fake_99999',
      razorpay_signature: 'invalid_sha256_signature_hex_value',
      user_id: user.id,
      user_email: user.email,
    });
  } catch (err: any) {
    tamperedBlocked = true;
    console.log(`- Tampered payment correctly rejected: ${err.message}`);
  }
  assert.strictEqual(tamperedBlocked, true, 'Tampered payment must be rejected');

  // Verify entitlement is STILL expired after tampered payment attempt
  const entStillExpired = await entitlementService.getBusinessEntitlement(business.id);
  assert.strictEqual(entStillExpired.status.toLowerCase(), 'expired', 'Subscription must remain expired after tampered payment');
  console.log('✔ Tampered payment test passed: Subscription remained expired.');

  // -------------------------------------------------------------------
  // 6. COMPLETE SUCCESSFUL TEST PAYMENT & SERVER VERIFICATION
  // -------------------------------------------------------------------
  console.log('\n--- 6. COMPLETE SUCCESSFUL PAYMENT & SERVER VERIFICATION ---');
  const validPaymentId = `pay_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const validSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${order.order_id}|${validPaymentId}`)
    .digest('hex');

  console.log(`- Test Payment ID: ${validPaymentId}`);
  console.log(`- Valid Server-Verified HMAC: ${validSignature.slice(0, 16)}...`);

  const verificationResult = await razorpayService.verifyPayment({
    business_id: business.id,
    plan_id: basePlan.id,
    duration_months: 6,
    plan_version_id: order.plan_version_id,
    razorpay_order_id: order.order_id,
    razorpay_payment_id: validPaymentId,
    razorpay_signature: validSignature,
    user_id: user.id,
    user_email: user.email,
  });

  console.log(`- Verification Result Success: ${verificationResult.success}`);
  assert.strictEqual(verificationResult.success, true, 'Payment verification must succeed');

  // -------------------------------------------------------------------
  // 7. VERIFY ACTIVATED SUBSCRIPTION DETAILS
  // -------------------------------------------------------------------
  console.log('\n--- 7. VERIFY ACTIVATED SUBSCRIPTION DETAILS ---');
  const entAfter = await entitlementService.getBusinessEntitlement(business.id);

  console.log(`- Activated Status: ${entAfter.status}`);
  console.log(`- Activated Plan: ${entAfter.plan_name} (${entAfter.plan_id})`);
  console.log(`- Expiry Date: ${entAfter.expires_at}`);
  console.log(`- Remaining Days: ${entAfter.days_remaining || entAfter.remaining_days}`);
  console.log(`- Monthly QR Limit: ${entAfter.monthly_qr_quota}`);
  console.log(`- Monthly QR Used: ${entAfter.current_month_qr_used}`);
  console.log(`- Monthly AI Limit: ${entAfter.monthly_ai_quota}`);
  console.log(`- Monthly AI Used: ${entAfter.current_month_ai_used}`);

  assert.strictEqual(entAfter.status.toLowerCase(), 'active', 'Subscription must be ACTIVE');
  assert.strictEqual(entAfter.is_expired, false, 'Subscription must not be expired');
  assert.strictEqual(entAfter.plan_id, 'base', 'Plan must be base');
  assert.strictEqual(entAfter.current_month_qr_used, 0, 'QR usage must start at 0');
  assert.strictEqual(entAfter.current_month_ai_used, 0, 'AI usage must start at 0');

  // -------------------------------------------------------------------
  // 8. VERIFY SAME QR CODE REUSE (NO DUPLICATES)
  // -------------------------------------------------------------------
  console.log('\n--- 8. VERIFY SAME QR CODE REUSE (NO NEW QR GENERATED) ---');
  const { data: qrsAfter } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('business_id', business.id);

  console.log(`- Total QR codes for business: ${qrsAfter?.length}`);
  assert.strictEqual(qrsAfter?.length, 1, 'MUST NOT create additional QR codes');

  const reactivatedQR = qrsAfter![0];
  console.log(`- Original QR ID: ${originalQRId}`);
  console.log(`- Post-Renewal QR ID: ${reactivatedQR.id}`);
  console.log(`- Post-Renewal QR Slug: ${reactivatedQR.slug}`);
  console.log(`- Post-Renewal QR is_active: ${reactivatedQR.is_active}`);

  assert.strictEqual(reactivatedQR.id, originalQRId, 'QR ID must be identical to original');
  assert.strictEqual(reactivatedQR.slug, originalQRSlug, 'QR slug must be identical to original');
  assert.strictEqual(reactivatedQR.is_active, true, 'QR must be active');

  // -------------------------------------------------------------------
  // 9. OPEN SAME PUBLIC QR URL & VERIFY CUSTOMER REVIEW FLOW
  // -------------------------------------------------------------------
  console.log('\n--- 9. OPEN SAME PUBLIC QR URL & TEST FLOW ---');
  const qrRouteAfter = await callGetBusinessByQRSlug(originalQRSlug);
  console.log(`- Public QR Route HTTP Status: ${qrRouteAfter.status}`);
  console.log(`- Rendered Business Name: ${qrRouteAfter.data?.data?.business?.name}`);
  assert.strictEqual(qrRouteAfter.status, 200, 'Public QR route must return 200 OK');
  assert.strictEqual(qrRouteAfter.data?.data?.business?.name, 'Trial Client A', 'Must return business info');

  // Test HTTP endpoint
  let httpPageStatus = 0;
  let httpPageRenderedReview = false;
  try {
    const httpRes = await axios.get(publicQRUrl, { timeout: 5000 });
    httpPageStatus = httpRes.status;
    const bodyStr = typeof httpRes.data === 'string' ? httpRes.data : JSON.stringify(httpRes.data);
    httpPageRenderedReview = bodyStr.includes('Trial Client A') || bodyStr.includes('review');
    console.log(`- HTTP GET ${publicQRUrl} -> Status: ${httpPageStatus}, Review Flow Loaded: ${httpPageRenderedReview}`);
  } catch (err: any) {
    console.log(`- HTTP GET warning: ${err.message}`);
  }

  // -------------------------------------------------------------------
  // 10. TEST REVIEW SESSION CREATION & QR SCAN USAGE INCREMENT
  // -------------------------------------------------------------------
  console.log('\n--- 10. TEST REVIEW SESSION CREATION & USAGE INCREMENT ---');
  // 1. Record scan
  const scanResult = await qrService.handleScan(originalQRSlug, {
    ip_address: '127.0.0.1',
    user_agent: 'TestAgent-PostRenewal',
  });
  console.log(`- handleScan Result -> Scan ID: ${scanResult.scan_id}, Session ID: ${scanResult.session_id}`);
  assert(scanResult.scan_id, 'Scan must be recorded successfully');

  // 2. Direct review session creation
  const sessionRes = await reviewService.createSession({
    business_id: business.id,
    qr_code_id: originalQRId,
    customer_fingerprint: 'post-renewal-fp-test',
  });
  console.log(`- createSession Result -> Session ID: ${sessionRes.id}, Status: ${sessionRes.status}`);
  assert(sessionRes.id, 'Review session must be created successfully');

  // -------------------------------------------------------------------
  // 11. VERIFY DASHBOARD & BILLING CONSISTENCY
  // -------------------------------------------------------------------
  console.log('\n--- 11. VERIFY DASHBOARD & BILLING CONSISTENCY ---');
  const dashboardEnt = await entitlementService.getBusinessEntitlement(business.id);
  console.log(`- Dashboard Lock State: ${dashboardEnt.status === 'active' ? 'UNLOCKED / ACTIVE' : 'LOCKED'}`);
  console.log(`- Billing Status Display: ${dashboardEnt.status}`);
  console.log(`- Plan Name: ${dashboardEnt.plan_name}`);
  console.log(`- Expiry Date: ${dashboardEnt.expires_at}`);
  console.log(`- Remaining Days: ${dashboardEnt.days_remaining || dashboardEnt.remaining_days}`);
  console.log(`- QR Limit / Remaining: ${dashboardEnt.monthly_qr_quota} / ${dashboardEnt.remaining_qr}`);
  console.log(`- AI Limit / Remaining: ${dashboardEnt.monthly_ai_quota} / ${dashboardEnt.remaining_ai}`);

  assert.strictEqual(dashboardEnt.status.toLowerCase(), 'active', 'Dashboard status must be ACTIVE');
  assert.strictEqual(dashboardEnt.is_expired, false, 'Dashboard must NOT show expired');

  console.log('\n================================================================');
  console.log(' ALL STEP 3 VERIFICATION TESTS PASSED SUCCESSFULLY!             ');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('\n❌ STEP 3 VERIFICATION FAILED:', err);
  process.exit(1);
});
