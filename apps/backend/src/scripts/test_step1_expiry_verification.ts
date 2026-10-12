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
  console.log(' STEP 1: VERIFY QR AUTOMATICALLY BECOMES INVALID AFTER EXPIRY   ');
  console.log('================================================================\n');

  const qrService = new QRService(supabase);
  const qrController = new QRController(qrService);
  const aiFactory = new AIProviderFactory({});
  const reviewService = new ReviewService(supabase, aiFactory);

  // Helper to execute getBusinessByQRSlug
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

  // 1. VERIFY CURRENT STATE
  console.log('--- 1. CURRENT ACCOUNT STATE INSPECTION ---');
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('email', 'devanshi@gmail.com');

  if (uErr || !users || users.length === 0) {
    throw new Error('User devanshi@gmail.com not found');
  }
  const user = users[0];
  console.log(`User: ${user.email} (ID: ${user.id})`);

  const { data: businesses, error: bErr } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .eq('name', 'Trial Client A');

  if (bErr || !businesses || businesses.length === 0) {
    throw new Error('Business "Trial Client A" not found');
  }
  const business = businesses[0];
  console.log(`Business: "${business.name}" (ID: ${business.id}, Slug: ${business.slug})`);

  const { data: qrsInitial, error: qErr } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('business_id', business.id);

  if (qErr || !qrsInitial || qrsInitial.length === 0) {
    throw new Error('No QR code found for business');
  }
  const targetQR = qrsInitial[0];
  const qrId = targetQR.id;
  const qrSlug = targetQR.slug;
  const publicQRUrl = `http://127.0.0.1:3000/r/${qrSlug}`;

  const { data: currentSubs } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false });

  const activeSub = currentSubs?.[0];
  if (!activeSub) throw new Error('No subscription found');

  const entBaseline = await entitlementService.getBusinessEntitlement(business.id);
  console.log(`Subscription Status: ${activeSub.status}`);
  console.log(`Plan ID: ${activeSub.plan_id}`);
  console.log(`Current Period End: ${activeSub.current_period_end}`);
  console.log(`Entitlement Status: ${entBaseline.status}`);
  console.log(`Existing QR ID: ${qrId}`);
  console.log(`Existing QR Slug: ${qrSlug}`);
  console.log(`Existing QR Public URL: ${publicQRUrl}`);

  // 2. OPEN SAME QR URL BEFORE EXPIRY SIMULATION
  console.log('\n--- 2. OPEN SAME QR URL BEFORE EXPIRY SIMULATION ---');
  const routeBefore = await callGetBusinessByQRSlug(qrSlug);
  console.log(`Public QR Route Controller Status: ${routeBefore.status}`);
  assert.strictEqual(routeBefore.status, 200, 'QR should be accessible before expiry');

  let httpBeforeOk = false;
  try {
    const httpRes = await axios.get(publicQRUrl, { timeout: 5000 });
    const body = typeof httpRes.data === 'string' ? httpRes.data : JSON.stringify(httpRes.data);
    httpBeforeOk = httpRes.status === 200 && (body.includes('Trial Client A') || body.includes('review'));
    console.log(`HTTP GET ${publicQRUrl} Status: ${httpRes.status}, Review Page Loaded: ${httpBeforeOk}`);
  } catch (err: any) {
    console.log(`HTTP GET warning: ${err.message}`);
  }

  const scanCountBefore = (await supabase.from('scan_logs').select('id', { count: 'exact' }).eq('business_id', business.id)).count || 0;
  const sessionCountBefore = (await supabase.from('review_sessions').select('id', { count: 'exact' }).eq('business_id', business.id)).count || 0;
  console.log(`Scan logs count baseline: ${scanCountBefore}`);
  console.log(`Review sessions count baseline: ${sessionCountBefore}`);

  // 3. SAFELY SIMULATE EXPIRY ONLY FOR THIS TEST ACCOUNT
  console.log('\n--- 3. SIMULATING SUBSCRIPTION EXPIRY ---');
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day in past

  const { error: updateErr } = await supabase
    .from('subscriptions')
    .update({
      current_period_end: pastDate,
      status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('id', activeSub.id);

  if (updateErr) throw new Error('Failed to update subscription expiry: ' + updateErr.message);

  await supabase
    .from('businesses')
    .update({
      trial_ends_at: pastDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', business.id);

  console.log(`Subscription expiry updated to timestamp in past: ${pastDate}`);
  console.log(`[Integrity Check] NO manual toggle on qr_codes.is_active was performed.`);

  // 4. RE-CHECK AUTHORITATIVE ENTITLEMENT
  console.log('\n--- 4. RE-CHECK AUTHORITATIVE ENTITLEMENT ---');
  const entAfter = await entitlementService.getBusinessEntitlement(business.id);
  const qrCheckAfter = await entitlementService.canUseService(business.id, 'qr_scan');
  const aiCheckAfter = await entitlementService.canUseService(business.id, 'ai_generation');

  console.log(`Re-resolved Subscription Status: ${entAfter.status}`);
  console.log(`QR Service Allowed: ${qrCheckAfter.allowed} (reason: ${qrCheckAfter.reason})`);
  console.log(`AI Service Allowed: ${aiCheckAfter.allowed} (reason: ${aiCheckAfter.reason})`);

  assert.strictEqual(entAfter.status.toLowerCase(), 'expired', 'Subscription must be EXPIRED');
  assert.strictEqual(qrCheckAfter.allowed, false, 'QR service must be BLOCKED');
  assert.strictEqual(qrCheckAfter.reason, 'SUBSCRIPTION_EXPIRED', 'Reason must be SUBSCRIPTION_EXPIRED');
  assert.strictEqual(aiCheckAfter.allowed, false, 'AI service must be BLOCKED');

  // 5. OPEN EXACT SAME QR URL AFTER EXPIRY
  console.log('\n--- 5. OPEN EXACT SAME QR URL AFTER EXPIRY ---');
  const routeAfter = await callGetBusinessByQRSlug(qrSlug);
  console.log(`Public QR Route Controller Status: ${routeAfter.status}, Code: ${routeAfter.code}`);
  assert.strictEqual(routeAfter.status, 403, 'Public QR route must return 403 Forbidden');
  assert.strictEqual(routeAfter.code, 'SUBSCRIPTION_EXPIRED', 'Code must be SUBSCRIPTION_EXPIRED');

  // Check HTTP public endpoint
  let httpAfterShowsLocked = false;
  try {
    const httpResAfter = await axios.get(publicQRUrl, { timeout: 5000 });
    const body = typeof httpResAfter.data === 'string' ? httpResAfter.data : JSON.stringify(httpResAfter.data);
    httpAfterShowsLocked = body.includes('Subscription Expired') || body.includes('SUBSCRIPTION_EXPIRED');
    console.log(`HTTP GET ${publicQRUrl} Status: ${httpResAfter.status}, Expired UI Shown: ${httpAfterShowsLocked}`);
  } catch (err: any) {
    console.log(`HTTP GET status: ${err.response?.status || 500}`);
  }

  // 6. VERIFY NO SESSIONS CREATED, NO USAGE INCREMENTED, APIS BLOCKED
  console.log('\n--- 6. VERIFY GUARDS & DIRECT API REJECTIONS ---');
  // Attempt 1: Direct POST /r/:slug/scan
  let scanAttemptRejected = false;
  try {
    await qrService.handleScan(qrSlug, {
      ip_address: '127.0.0.1',
      user_agent: 'TestAgent-Expired-Verify',
    });
  } catch (err: any) {
    scanAttemptRejected = true;
    console.log(`handleScan direct call rejected: ${err.message} (status: ${err.statusCode}, code: ${err.code})`);
    assert.strictEqual(err.statusCode, 403);
    assert.strictEqual(err.code, 'SUBSCRIPTION_EXPIRED');
  }
  assert.strictEqual(scanAttemptRejected, true, 'Scan must be rejected');

  // Attempt 2: Direct POST /review/sessions/start
  let sessionAttemptRejected = false;
  try {
    await reviewService.createSession({
      business_id: business.id,
      qr_code_id: qrId,
      customer_fingerprint: 'expired-test-fp',
    });
  } catch (err: any) {
    sessionAttemptRejected = true;
    console.log(`createSession direct call rejected: ${err.message} (status: ${err.statusCode}, code: ${err.code})`);
    assert.strictEqual(err.statusCode, 403);
    assert.strictEqual(err.code, 'SUBSCRIPTION_EXPIRED');
  }
  assert.strictEqual(sessionAttemptRejected, true, 'Review session creation must be rejected');

  // Verify scan logs count and review sessions count did NOT increment
  const scanCountAfter = (await supabase.from('scan_logs').select('id', { count: 'exact' }).eq('business_id', business.id)).count || 0;
  const sessionCountAfter = (await supabase.from('review_sessions').select('id', { count: 'exact' }).eq('business_id', business.id)).count || 0;
  console.log(`Scan logs count after attempt: ${scanCountAfter} (delta: ${scanCountAfter - scanCountBefore})`);
  console.log(`Review sessions count after attempt: ${sessionCountAfter} (delta: ${sessionCountAfter - sessionCountBefore})`);
  assert.strictEqual(scanCountAfter, scanCountBefore, 'Scan logs must NOT increment');
  assert.strictEqual(sessionCountAfter, sessionCountBefore, 'Review sessions must NOT be created');

  // 7. CONFIRM QR RECORD ITSELF IS NOT DELETED
  console.log('\n--- 7. CONFIRM QR RECORD PRESERVATION IN DATABASE ---');
  const { data: qrPreserved, error: qPresError } = await supabase
    .from('qr_codes')
    .select('id, slug, business_id, is_active')
    .eq('id', qrId)
    .single();

  if (qPresError || !qrPreserved) {
    throw new Error('CRITICAL FAILURE: QR record was deleted!');
  }
  console.log(`Preserved QR Record in DB: ID=${qrPreserved.id}, Slug=${qrPreserved.slug}, BusinessID=${qrPreserved.business_id}`);
  assert.strictEqual(qrPreserved.id, qrId, 'QR ID must match original');
  assert.strictEqual(qrPreserved.slug, qrSlug, 'QR slug must match original');

  console.log('\n================================================================');
  console.log(' ALL STEP 1 EXPIRY VERIFICATION CHECKS PASSED!                  ');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('\n❌ STEP 1 VERIFICATION FAILED:', err);
  process.exit(1);
});
