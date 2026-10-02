import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { supabaseAdmin } from '../config/supabase';
import { BusinessService } from '../modules/business/service';
import { OnboardingService } from '../modules/onboarding/service';
import { QRService } from '../modules/qr/service';

async function runE2E() {
  console.log('=== STEP 72 E2E INTEGRATION TEST ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  const businessService = new BusinessService(supabaseAdmin);
  const onboardingService = new OnboardingService(supabaseAdmin);
  const qrService = new QRService(supabaseAdmin);

  // Fetch an existing business in DB
  const { data: rawBiz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, owner_id, settings')
    .limit(5);

  const existingBusinesses = (rawBiz || []) as any[];
  if (existingBusinesses.length === 0) {
    console.error('No existing businesses found in database to test against');
    process.exit(1);
  }

  const existingBiz: any = existingBusinesses[0];
  // Fetch users from DB
  const { data: rawUsers } = await supabaseAdmin.from('users').select('id, email').limit(5);
  const users = (rawUsers || []) as any[];
  const testUser = users.length > 0 ? users[0] : null;

  // 1. Direct Route Protection
  console.log('\n--- 1. Testing Direct URL Bypass Protection ---');
  const testNoBizUserId = '00000000-1111-2222-3333-444444444444';
  try {
    await onboardingService.updateStep(testNoBizUserId, 'qr_generation', {});
    assert(false, 'Should block direct URL bypass to later step without valid business');
  } catch (err: any) {
    assert(
      err.code === 'BUSINESS_REQUIRED' || err.statusCode === 403 || err.message?.includes('business'),
      `Direct URL bypass blocked with BUSINESS_REQUIRED (${err.message})`
    );
  }

  // 2. Duplicate Google Business Registration Block
  console.log('\n--- 2. Testing Duplicate Registration Block ---');
  // Use existing business place ID or URL
  const existingPlaceId = (existingBiz.settings as any)?.google_place_id || 'CYPgDr_K-_-bI';
  const duplicateUrl = `https://search.google.com/local/writereview?placeid=${existingPlaceId}`;

  const clientB_UserId = testUser ? testUser.id : existingBiz.owner_id;

  try {
    await businessService.createBusiness(clientB_UserId, {
      name: 'Duplicate Gym Inc',
      address: '123 Fake St, Metropolis, NY',
      phone: '+1 555-123-4567',
      google_review_url: duplicateUrl,
    } as any);
    assert(false, 'Should throw AppError on duplicate registration');
  } catch (err: any) {
    assert(err.statusCode === 409, `Response status is 409 Conflict (received: ${err.statusCode})`);
    assert(
      err.code === 'GOOGLE_BUSINESS_ALREADY_REGISTERED',
      `Error code is GOOGLE_BUSINESS_ALREADY_REGISTERED (${err.code})`
    );
    assert(
      err.message === 'This Google Business is already registered with ReviewAI.',
      `User-friendly message returned (${err.message})`
    );
    assert(
      err.details?.existing_account && err.details.existing_account.includes('***'),
      `Masked email returned in response: ${err.details?.existing_account}`
    );
  }

  // 3. QR Generation Block for Duplicate Blocked User
  console.log('\n--- 3. Testing QR Generation Protection ---');
  try {
    await qrService.createQRCode(existingBiz.id, clientB_UserId, 'owner', {
      qr_type: 'google_review',
    } as any);
    assert(false, 'Should block QR generation for duplicate blocked user');
  } catch (err: any) {
    assert(
      err.code === 'DUPLICATE_BUSINESS_BLOCKED' || err.statusCode === 403 || err.message?.includes('duplicate') || err.message?.includes('Access denied'),
      `QR Generation blocked with DUPLICATE_BUSINESS_BLOCKED (${err.message})`
    );
  }

  // 4. Verify Original Owner Is Completely Intact
  console.log('\n--- 4. Testing Original Business Owner Integrity ---');
  const { data: intactBiz, error: intactErr } = await supabaseAdmin
    .from('businesses')
    .select('id, name, owner_id')
    .eq('id', existingBiz.id)
    .single();

  assert(!intactErr && intactBiz && (intactBiz as any).owner_id === existingBiz.owner_id, 'Original owner and business unaffected');

  // Clean up test onboarding record for clientB
  await supabaseAdmin.from('onboarding_progress').delete().eq('user_id', clientB_UserId);

  console.log(`\n=== E2E SUMMARY: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

runE2E().catch(err => {
  console.error('E2E test error:', err);
  process.exit(1);
});
