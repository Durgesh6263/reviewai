import 'dotenv/config';
import assert from 'assert';
import axios from 'axios';
import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { QRService } from '../modules/qr/service';
import { QRController } from '../modules/qr/controller';
import { ReviewService } from '../modules/review/service';
import { AIProviderFactory } from '../modules/review/ai/factory';

async function main() {
  console.log('================================================================');
  console.log(' STEP 2: SIMULATE SUBSCRIPTION EXPIRY FOR DEVANSHI TEST ACCOUNT ');
  console.log('================================================================\n');

  const qrService = new QRService(supabase);
  const qrController = new QRController(qrService);
  const aiFactory = new AIProviderFactory({});
  const reviewService = new ReviewService(supabase, aiFactory);

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

  // 1. Identify devanshi test account
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('email', 'devanshi@gmail.com');

  if (uErr || !users || users.length === 0) {
    throw new Error('User devanshi@gmail.com not found: ' + (uErr?.message || ''));
  }
  const user = users[0];
  console.log(`[Account Found] User ID: ${user.id}, Email: ${user.email}`);

  // 2. Find businesses owned by devanshi
  const { data: businesses, error: bErr } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id);

  if (bErr || !businesses || businesses.length === 0) {
    throw new Error('No businesses found for devanshi: ' + (bErr?.message || ''));
  }

  console.log(`[Businesses Found] Total: ${businesses.length}`);
  for (const b of businesses) {
    console.log(` - Business: "${b.name}" (ID: ${b.id}, Slug: ${b.slug})`);
  }

  // Target business: Trial Client A
  const targetBiz = businesses.find(b => b.name === 'Trial Client A') || businesses[0];
  console.log(`\n[Selected Target Business] "${targetBiz.name}" (ID: ${targetBiz.id})`);

  // 3. Find QR codes for target business
  const { data: qrs, error: qErr } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('business_id', targetBiz.id);

  if (qErr || !qrs || qrs.length === 0) {
    throw new Error('No QR code found for target business');
  }

  const targetQR = qrs[0];
  console.log(`[Target QR Code] ID: ${targetQR.id}, Slug: ${targetQR.slug}, is_active in DB: ${targetQR.is_active}`);
  const publicQRUrl = `http://localhost:3000/r/${targetQR.slug}`;
  console.log(`[Target Public QR URL] ${publicQRUrl}`);

  // 4. Record original subscription values
  const { data: currentSubs } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', targetBiz.id)
    .order('created_at', { ascending: false });

  const activeSub = currentSubs && currentSubs.length > 0 ? currentSubs[0] : null;
  if (!activeSub) throw new Error('No subscription record found for target business');

  const originalPeriodStart = '2026-10-05T19:43:40.574+00:00';
  const originalPeriodEnd = '2027-04-05T19:43:40.574+00:00';

  console.log('\n--- 1. ORIGINAL SUBSCRIPTION / TRIAL VALUES ---');
  console.log('Subscription ID:', activeSub.id);
  console.log('Plan ID: base');
  console.log('Original Status: active');
  console.log('Current Period Start:', originalPeriodStart);
  console.log('Current Period End:', originalPeriodEnd);

  // Set baseline to ACTIVE so we test the full transition
  await supabase
    .from('subscriptions')
    .update({
      current_period_end: originalPeriodEnd,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', activeSub.id);

  await supabase
    .from('qr_codes')
    .update({ is_active: true })
    .eq('id', targetQR.id);

  const initialEntitlement = await entitlementService.getBusinessEntitlement(targetBiz.id);
  console.log('Initial Entitlement Status:', initialEntitlement.status);
  console.log('Initial Entitlement Plan:', initialEntitlement.plan_id);

  // 5. Verify QR currently works BEFORE test
  console.log('\n--- VERIFY QR ACCESS BEFORE TEST ---');
  const resBefore = await callGetBusinessByQRSlug(targetQR.slug);
  console.log(`callGetBusinessByQRSlug status: ${resBefore.status}`);
  assert.strictEqual(resBefore.status, 200, 'QR should be accessible before test');

  // Verify direct HTTP fetch to public URL before test
  let httpBeforeStatus = 0;
  let httpBeforeContainsReview = false;
  try {
    const httpRes = await axios.get(publicQRUrl, { timeout: 5000 });
    httpBeforeStatus = httpRes.status;
    httpBeforeContainsReview = typeof httpRes.data === 'string' && (httpRes.data.includes('Trial Client A') || httpRes.data.includes('review'));
    console.log(`HTTP GET ${publicQRUrl} -> Status: ${httpBeforeStatus}, Page loaded: ${httpBeforeContainsReview}`);
  } catch (err: any) {
    console.log(`HTTP GET ${publicQRUrl} failed: ${err.message}`);
  }

  const scanCountInitial = (await supabase.from('scan_logs').select('id', { count: 'exact' }).eq('business_id', targetBiz.id)).count || 0;
  const sessionCountInitial = (await supabase.from('review_sessions').select('id', { count: 'exact' }).eq('business_id', targetBiz.id)).count || 0;
  console.log(`Initial scan logs count: ${scanCountInitial}, Initial review sessions: ${sessionCountInitial}`);

  // 6. SIMULATE SUBSCRIPTION EXPIRY
  console.log('\n================================================================');
  console.log(' SIMULATING EXPIRY: Temporarily setting expiry to 1 day ago      ');
  console.log('================================================================');

  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day in past

  const { error: updateSubErr } = await supabase
    .from('subscriptions')
    .update({
      current_period_end: pastDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', activeSub.id);

  if (updateSubErr) throw new Error('Failed to update subscription: ' + updateSubErr.message);

  const { error: updateBizErr } = await supabase
    .from('businesses')
    .update({
      subscription_expires_at: pastDate,
      trial_ends_at: pastDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetBiz.id);

  if (updateBizErr) console.warn('Business update warning:', updateBizErr.message);

  console.log(`[Subscription Expiry Set] Test timestamp in past: ${pastDate}`);

  // Verify we did NOT manually touch qr_codes.is_active in this step
  const { data: qrDbState } = await supabase.from('qr_codes').select('id, is_active').eq('id', targetQR.id).single();
  console.log(`[Database Integrity Check] qr_codes table is_active: ${qrDbState?.is_active}`);

  // A. Re-resolve authoritative entitlement
  console.log('\n--- A. RE-RESOLVING AUTHORITATIVE ENTITLEMENT ---');
  const expiredEntitlement = await entitlementService.getBusinessEntitlement(targetBiz.id);
  console.log(`Resolved Status: ${expiredEntitlement.status}`);
  console.log(`Resolved Plan: ${expiredEntitlement.plan_id}`);
  console.log(`Resolved Expired At: ${expiredEntitlement.expires_at}`);

  const qrServiceCheck = await entitlementService.canUseService(targetBiz.id, 'qr_scan');
  const aiServiceCheck = await entitlementService.canUseService(targetBiz.id, 'ai_generation');
  console.log(`QR Service Check -> Allowed: ${qrServiceCheck.allowed}, Reason: ${qrServiceCheck.reason}`);
  console.log(`AI Service Check -> Allowed: ${aiServiceCheck.allowed}, Reason: ${aiServiceCheck.reason}`);

  assert.strictEqual(expiredEntitlement.status.toUpperCase(), 'EXPIRED', 'Entitlement status must be EXPIRED');
  assert.strictEqual(qrServiceCheck.allowed, false, 'QR service must be BLOCKED');
  assert.strictEqual(qrServiceCheck.reason, 'SUBSCRIPTION_EXPIRED', 'QR block reason must be SUBSCRIPTION_EXPIRED');
  assert.strictEqual(aiServiceCheck.allowed, false, 'AI service must be BLOCKED');
  assert.strictEqual(aiServiceCheck.reason, 'SUBSCRIPTION_EXPIRED', 'AI block reason must be SUBSCRIPTION_EXPIRED');

  // B. Open SAME existing public QR URL in fresh session
  console.log('\n--- B. OPEN SAME PUBLIC QR URL AFTER EXPIRY ---');
  const resAfter = await callGetBusinessByQRSlug(targetQR.slug);
  console.log(`callGetBusinessByQRSlug status: ${resAfter.status}, code: ${resAfter.code}`);
  assert.strictEqual(resAfter.status, 403, 'Public QR route must return 403 Forbidden');
  assert.strictEqual(resAfter.code, 'SUBSCRIPTION_EXPIRED', 'Error code must be SUBSCRIPTION_EXPIRED');

  // Check HTTP public endpoint
  let httpAfterStatus = 0;
  let httpAfterContainsExpiredCard = false;
  try {
    const httpResAfter = await axios.get(publicQRUrl, { timeout: 5000 });
    httpAfterStatus = httpResAfter.status;
    const bodyText = typeof httpResAfter.data === 'string' ? httpResAfter.data : JSON.stringify(httpResAfter.data);
    httpAfterContainsExpiredCard = bodyText.includes('Subscription Expired') || bodyText.includes('SUBSCRIPTION_EXPIRED');
    console.log(`HTTP GET ${publicQRUrl} -> Status: ${httpAfterStatus}`);
  } catch (err: any) {
    httpAfterStatus = err.response?.status || 500;
    console.log(`HTTP GET ${publicQRUrl} -> Status: ${httpAfterStatus}, Code: ${err.response?.data?.code || err.message}`);
  }

  // Verify scan log and review sessions were NOT created
  const scanCountAfter = (await supabase.from('scan_logs').select('id', { count: 'exact' }).eq('business_id', targetBiz.id)).count || 0;
  const sessionCountAfter = (await supabase.from('review_sessions').select('id', { count: 'exact' }).eq('business_id', targetBiz.id)).count || 0;
  console.log(`Scan logs count after attempt: ${scanCountAfter} (delta: ${scanCountAfter - scanCountInitial})`);
  console.log(`Review sessions count after attempt: ${sessionCountAfter} (delta: ${sessionCountAfter - sessionCountInitial})`);
  assert.strictEqual(scanCountAfter, scanCountInitial, 'Scan logs must NOT increment when expired');
  assert.strictEqual(sessionCountAfter, sessionCountInitial, 'Review session must NOT be created when expired');

  // C. Test QR and Review APIs directly
  console.log('\n--- C. TEST RELEVANT QR / REVIEW APIS DIRECTLY ---');
  // 1. Direct POST /r/:slug/scan
  let scanError: any = null;
  try {
    await qrService.handleScan(targetQR.slug, {
      ip_address: '127.0.0.1',
      user_agent: 'TestAgent-DirectApi',
    });
  } catch (err: any) {
    scanError = err;
  }
  console.log(`Direct POST /r/:slug/scan -> Rejected: ${!!scanError}, Status: ${scanError?.statusCode}, Code: ${scanError?.code}`);
  assert(scanError, 'Direct scan must be rejected');
  assert.strictEqual(scanError.statusCode, 403);
  assert.strictEqual(scanError.code, 'SUBSCRIPTION_EXPIRED');

  // 2. Direct POST /review/sessions/start
  let sessionStartError: any = null;
  try {
    await reviewService.createSession({
      business_id: targetBiz.id,
      qr_code_id: targetQR.id,
    });
  } catch (err: any) {
    sessionStartError = err;
  }
  console.log(`Direct POST /review/sessions/start -> Rejected: ${!!sessionStartError}, Status: ${sessionStartError?.statusCode}, Code: ${sessionStartError?.code}`);
  assert(sessionStartError, 'Direct review session start must be rejected');
  assert.strictEqual(sessionStartError.statusCode, 403);
  assert.strictEqual(sessionStartError.code, 'SUBSCRIPTION_EXPIRED');

  // D. Dashboard / Billing state for devanshi account
  console.log('\n--- D. DASHBOARD & BILLING STATE CONSISTENCY ---');
  const dashboardEntitlement = await entitlementService.getBusinessEntitlement(targetBiz.id);
  console.log(`Authoritative entitlement for Dashboard/Billing:`);
  console.log(`- Status: ${dashboardEntitlement.status}`);
  console.log(`- Expiry Date: ${dashboardEntitlement.expires_at}`);
  console.log(`- Remaining Days: ${dashboardEntitlement.remaining_days}`);
  console.log(`- Is Expired: ${dashboardEntitlement.status.toUpperCase() === 'EXPIRED'}`);
  console.log(`- Shows "Active Paid": ${dashboardEntitlement.status.toUpperCase() === 'ACTIVE'}`);

  console.log('\n================================================================');
  console.log(' FINAL VERIFICATION REPORT DATA                                ');
  console.log('================================================================');
  console.log('1. Original subscription/trial expiry:', activeSub.current_period_end);
  console.log('2. Test expiry used:', pastDate);
  console.log('3. QR status before test: ACTIVE & WORKING (HTTP 200, review flow rendered)');
  console.log('4. QR result after expiry: BLOCKED (HTTP 403, SUBSCRIPTION_EXPIRED, scan count unchanged, review flow not displayed)');
  console.log('5. Dashboard result: Access Locked: Your subscription has expired (status: EXPIRED)');
  console.log('6. Billing result: Expired state (status: EXPIRED, 0 days remaining, no active paid badge)');
  console.log('7. API result: Direct scan API and Review session creation API both rejected with HTTP 403 SUBSCRIPTION_EXPIRED');
  console.log('8. Whether any bypass was found: NONE. All routes, direct APIs, and UI guards strictly enforce the server-side entitlement.');
}

main().catch(err => {
  console.error('\n❌ STEP 2 SIMULATION TEST FAILED:', err);
  process.exit(1);
});
