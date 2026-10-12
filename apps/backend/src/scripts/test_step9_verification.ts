import 'dotenv/config';
/**
 * STEP 9 VERIFICATION SCRIPT: QR & AI Usage Enforcement
 * ReviewAI SaaS Platform
 * 
 * Verifies all requirements of Step 9:
 * A. QR usage increments exactly once.
 * B. AI usage increments exactly once.
 * C. QR quota reaches zero and next request is blocked.
 * D. AI quota reaches zero and next request is blocked.
 * E. Expired subscription blocks QR.
 * F. Expired subscription blocks AI.
 * G. Trial expiry blocks both.
 * H. Simultaneous requests cannot exceed quota (Race condition protection).
 * I. Failed AI generation does not incorrectly consume quota (Rollback on failure).
 * J. Multiple businesses remain isolated.
 * K. Direct API cannot bypass limits.
 * L. Dashboard usage matches actual database usage.
 */

import { supabaseAdmin } from '../config/supabase';
const supabase: any = supabaseAdmin;
import { entitlementService, normalizeBlockReason } from '../modules/subscription/entitlement';
import { QRService } from '../modules/qr/service';
import { ReviewService } from '../modules/review/service';
import { AIProviderFactory } from '../modules/review/ai/factory';
import { SubscriptionController } from '../modules/subscription/controller';
import { SubscriptionService } from '../modules/subscription/service';
import { QRScanRequest } from '../modules/qr/types';

async function runStep9Verification() {
  console.log('================================================================');
  console.log('🚀 STARTING STEP 9 VERIFICATION: QR & AI USAGE ENFORCEMENT');
  console.log('================================================================\n');

  // Initialize services
  const aiFactory = new AIProviderFactory({
    openai: process.env.OPENAI_API_KEY ? {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      organizationId: process.env.OPENAI_ORG_ID,
    } : undefined,
    gemini: process.env.GEMINI_API_KEY ? {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      organizationId: process.env.GEMINI_BASE_URL,
    } : undefined,
  });
  const qrService = new QRService(supabase);
  const reviewService = new ReviewService(supabase, aiFactory);
  const subscriptionService = new SubscriptionService(supabase, process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');
  const subscriptionController = new SubscriptionController(subscriptionService);

  // 1. Fetch businesses for test isolation
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, slug, owner_id')
    .is('deleted_at', null)
    .limit(10);

  if (!businesses || businesses.length === 0) {
    throw new Error('No businesses found in database to run tests.');
  }

  const bizA: any = businesses[0];
  console.log(`Primary Business A: "${bizA.name}" (${bizA.id})`);

  let bizB: any = businesses.find((b: any) => b.id !== bizA.id && b.owner_id === bizA.owner_id);
  if (!bizB) {
    const { data: newBiz } = await supabase
      .from('businesses')
      .insert({
        name: 'Step 9 Secondary Biz',
        slug: `step9-biz-b-${Date.now()}`,
        owner_id: bizA.owner_id,
        category: 'retail',
        status: 'active',
      })
      .select()
      .single();
    bizB = newBiz;
  }
  console.log(`Secondary Business B: "${bizB.name}" (${bizB.id})\n`);

  // Ensure active QR codes exist for bizA and bizB
  let { data: qrA } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('business_id', bizA.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!qrA) {
    const slugA = `test-step9-a-${Date.now().toString(36)}`;
    const { data: createdQrA } = await supabase
      .from('qr_codes')
      .insert({
        business_id: bizA.id,
        slug: slugA,
        label: 'Step 9 Test QR A',
        is_active: true,
      })
      .select()
      .single();
    qrA = createdQrA;
  }

  let { data: qrB } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('business_id', bizB.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!qrB) {
    const slugB = `test-step9-b-${Date.now().toString(36)}`;
    const { data: createdQrB } = await supabase
      .from('qr_codes')
      .insert({
        business_id: bizB.id,
        slug: slugB,
        label: 'Step 9 Test QR B',
        is_active: true,
      })
      .select()
      .single();
    qrB = createdQrB;
  }

  console.log(`Using QR Code A: slug="${qrA.slug}"`);
  console.log(`Using QR Code B: slug="${qrB.slug}"\n`);

  // -------------------------------------------------------------
  // TEST A: QR usage increments exactly once
  // -------------------------------------------------------------
  console.log('--- TEST A: QR usage increments exactly once ---');
  // Activate fresh Base plan for bizA
  await entitlementService.activatePlan({
    businessId: bizA.id,
    ownerId: bizA.owner_id,
    planId: 'base',
    durationMonths: 1,
    qrQuota: 300,
    aiQuota: 150,
  });

  const entBeforeA = await entitlementService.getBusinessEntitlement(bizA.id);
  const scanData: QRScanRequest = {
    ip_address: '192.168.1.100',
    user_agent: 'Step9TestAgent/1.0',
    device_type: 'mobile',
  };

  const scanRes = await qrService.handleScan(qrA.slug, scanData);
  if (!scanRes || !scanRes.scan_id) {
    throw new Error('TEST A FAILED: handleScan did not return a valid scan_id');
  }

  const entAfterA = await entitlementService.getBusinessEntitlement(bizA.id);
  console.log(`QR Usage: Before=${entBeforeA.used_qr}, After=${entAfterA.used_qr}, Remaining=${entAfterA.remaining_qr}`);

  if (entAfterA.used_qr !== entBeforeA.used_qr + 1) {
    throw new Error(`TEST A FAILED: Expected used_qr to increment by 1, got before=${entBeforeA.used_qr}, after=${entAfterA.used_qr}`);
  }
  console.log('>>> TEST A PASSED: QR usage incremented exactly once.\n');

  // -------------------------------------------------------------
  // TEST B: AI usage increments exactly once
  // -------------------------------------------------------------
  console.log('--- TEST B: AI usage increments exactly once ---');
  const entBeforeB = await entitlementService.getBusinessEntitlement(bizA.id);

  // Generate an AI review using session created in Test A
  const aiRes = await reviewService.generateReview({
    session_id: scanRes.session_id,
    rating: 5,
    language: 'en',
  });

  if (!aiRes || !aiRes.generated_text) {
    throw new Error('TEST B FAILED: generateReview did not return generated text');
  }

  const entAfterB = await entitlementService.getBusinessEntitlement(bizA.id);
  console.log(`AI Usage: Before=${entBeforeB.used_ai}, After=${entAfterB.used_ai}, Remaining=${entAfterB.remaining_ai}`);

  if (entAfterB.used_ai !== entBeforeB.used_ai + 1) {
    throw new Error(`TEST B FAILED: Expected used_ai to increment by 1, got before=${entBeforeB.used_ai}, after=${entAfterB.used_ai}`);
  }
  console.log('>>> TEST B PASSED: AI usage incremented exactly once.\n');

  // -------------------------------------------------------------
  // TEST C: QR quota reaches zero and next request is blocked
  // -------------------------------------------------------------
  console.log('--- TEST C: QR quota reaches zero and next request is blocked ---');
  const { data: subC } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', bizA.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const metaC = (subC as any).metadata || {};
  await supabase
    .from('subscriptions')
    .update({
      metadata: {
        ...metaC,
        used_qr_quota: 300,
        remaining_qr_quota: 0,
        exhaustion_reason: 'QR_QUOTA_EXHAUSTED',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', (subC as any).id);

  let qrBlocked = false;
  let qrBlockReason = '';
  let qrBlockMessage = '';

  try {
    await qrService.handleScan(qrA.slug, { ip_address: '1.2.3.4' });
  } catch (err: any) {
    qrBlocked = true;
    qrBlockReason = err.code || err.details?.reason || '';
    qrBlockMessage = err.message || '';
  }

  console.log(`QR Quota 0 test: Blocked=${qrBlocked}, Code=${qrBlockReason}, Message="${qrBlockMessage}"`);
  if (!qrBlocked) {
    throw new Error('TEST C FAILED: Expected handleScan to be blocked when QR quota reaches zero');
  }
  if (qrBlockReason !== 'QR_QUOTA_EXHAUSTED') {
    throw new Error(`TEST C FAILED: Expected code QR_QUOTA_EXHAUSTED, got ${qrBlockReason}`);
  }
  if (qrBlockMessage !== 'Your QR scan quota has been exhausted.') {
    throw new Error(`TEST C FAILED: Expected exact message "Your QR scan quota has been exhausted.", got "${qrBlockMessage}"`);
  }
  console.log('>>> TEST C PASSED: QR quota exhaustion blocked with exact message.\n');

  // -------------------------------------------------------------
  // TEST D: AI quota reaches zero and next request is blocked
  // -------------------------------------------------------------
  console.log('--- TEST D: AI quota reaches zero and next request is blocked ---');
  // Reset QR, exhaust AI
  await supabase
    .from('subscriptions')
    .update({
      metadata: {
        ...metaC,
        used_qr_quota: 5,
        remaining_qr_quota: 295,
        used_ai_quota: 150,
        remaining_ai_quota: 0,
        exhaustion_reason: 'AI_QUOTA_EXHAUSTED',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', (subC as any).id);

  let aiBlocked = false;
  let aiBlockReason = '';
  let aiBlockMessage = '';

  try {
    await reviewService.generateReview({
      session_id: scanRes.session_id,
      rating: 4,
      language: 'en',
      variation: 1, // variation to bypass idempotency cache
    });
  } catch (err: any) {
    aiBlocked = true;
    aiBlockReason = err.code || '';
    aiBlockMessage = err.message || '';
  }

  console.log(`AI Quota 0 test: Blocked=${aiBlocked}, Code=${aiBlockReason}, Message="${aiBlockMessage}"`);
  if (!aiBlocked) {
    throw new Error('TEST D FAILED: Expected generateReview to be blocked when AI quota reaches zero');
  }
  if (aiBlockReason !== 'AI_QUOTA_EXHAUSTED') {
    throw new Error(`TEST D FAILED: Expected code AI_QUOTA_EXHAUSTED, got ${aiBlockReason}`);
  }
  if (aiBlockMessage !== 'Your AI generation quota has been exhausted.') {
    throw new Error(`TEST D FAILED: Expected exact message "Your AI generation quota has been exhausted.", got "${aiBlockMessage}"`);
  }
  console.log('>>> TEST D PASSED: AI quota exhaustion blocked with exact message.\n');

  // -------------------------------------------------------------
  // TEST E: Expired subscription blocks QR
  // -------------------------------------------------------------
  console.log('--- TEST E: Expired subscription blocks QR ---');
  const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await supabase
    .from('subscriptions')
    .update({
      status: 'expired',
      current_period_end: pastDate,
      metadata: {
        ...metaC,
        used_qr_quota: 5,
        remaining_qr_quota: 295,
        used_ai_quota: 5,
        remaining_ai_quota: 145,
        exhaustion_reason: 'SUBSCRIPTION_EXPIRED',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', (subC as any).id);

  let qrExpiryBlocked = false;
  let qrExpiryCode = '';
  let qrExpiryMessage = '';

  try {
    await qrService.handleScan(qrA.slug, { ip_address: '1.2.3.5' });
  } catch (err: any) {
    qrExpiryBlocked = true;
    qrExpiryCode = err.code || '';
    qrExpiryMessage = err.message || '';
  }

  console.log(`QR Expired Sub test: Blocked=${qrExpiryBlocked}, Code=${qrExpiryCode}, Message="${qrExpiryMessage}"`);
  if (!qrExpiryBlocked) {
    throw new Error('TEST E FAILED: QR scan not blocked on expired subscription');
  }
  if (qrExpiryMessage !== 'Your subscription has expired.') {
    throw new Error(`TEST E FAILED: Expected message "Your subscription has expired.", got "${qrExpiryMessage}"`);
  }
  console.log('>>> TEST E PASSED: Expired subscription blocks QR.\n');

  // -------------------------------------------------------------
  // TEST F: Expired subscription blocks AI
  // -------------------------------------------------------------
  console.log('--- TEST F: Expired subscription blocks AI ---');
  let aiExpiryBlocked = false;
  let aiExpiryCode = '';
  let aiExpiryMessage = '';

  try {
    await reviewService.generateReview({
      session_id: scanRes.session_id,
      rating: 5,
      language: 'en',
      variation: 2,
    });
  } catch (err: any) {
    aiExpiryBlocked = true;
    aiExpiryCode = err.code || '';
    aiExpiryMessage = err.message || '';
  }

  console.log(`AI Expired Sub test: Blocked=${aiExpiryBlocked}, Code=${aiExpiryCode}, Message="${aiExpiryMessage}"`);
  if (!aiExpiryBlocked) {
    throw new Error('TEST F FAILED: AI generation not blocked on expired subscription');
  }
  if (aiExpiryMessage !== 'Your subscription has expired.') {
    throw new Error(`TEST F FAILED: Expected message "Your subscription has expired.", got "${aiExpiryMessage}"`);
  }
  console.log('>>> TEST F PASSED: Expired subscription blocks AI.\n');

  // -------------------------------------------------------------
  // TEST G: Trial expiry blocks both
  // -------------------------------------------------------------
  console.log('--- TEST G: Trial expiry blocks both ---');
  await supabase
    .from('subscriptions')
    .update({
      plan_id: 'free_trial',
      status: 'expired',
      current_period_end: pastDate,
      trial_end: pastDate,
      metadata: {
        plan_id: 'free_trial',
        is_trial: true,
        allocated_qr_quota: 300,
        allocated_ai_quota: 150,
        used_qr_quota: 10,
        used_ai_quota: 5,
        remaining_qr_quota: 290,
        remaining_ai_quota: 145,
        exhaustion_reason: 'TRIAL_EXPIRED',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', (subC as any).id);

  let qrTrialBlocked = false;
  let qrTrialCode = '';
  try {
    await qrService.handleScan(qrA.slug, { ip_address: '1.2.3.6' });
  } catch (err: any) {
    qrTrialBlocked = true;
    qrTrialCode = err.code || '';
  }

  let aiTrialBlocked = false;
  let aiTrialCode = '';
  try {
    await reviewService.generateReview({
      session_id: scanRes.session_id,
      rating: 5,
      language: 'en',
      variation: 3,
    });
  } catch (err: any) {
    aiTrialBlocked = true;
    aiTrialCode = err.code || '';
  }

  console.log(`Trial Expired: QR Blocked=${qrTrialBlocked} (${qrTrialCode}), AI Blocked=${aiTrialBlocked} (${aiTrialCode})`);
  if (!qrTrialBlocked || qrTrialCode !== 'TRIAL_EXPIRED') {
    throw new Error(`TEST G FAILED: Expected QR to be blocked with TRIAL_EXPIRED, got ${qrTrialCode}`);
  }
  if (!aiTrialBlocked || aiTrialCode !== 'TRIAL_EXPIRED') {
    throw new Error(`TEST G FAILED: Expected AI to be blocked with TRIAL_EXPIRED, got ${aiTrialCode}`);
  }
  console.log('>>> TEST G PASSED: Trial expiry blocks both QR and AI.\n');

  // -------------------------------------------------------------
  // TEST H: Simultaneous requests cannot exceed quota
  // -------------------------------------------------------------
  console.log('--- TEST H: Simultaneous requests cannot exceed quota (Race condition protection) ---');
  // Re-activate active plan with total_qr = 10 and total_ai = 5
  await entitlementService.activatePlan({
    businessId: bizA.id,
    ownerId: bizA.owner_id,
    planId: 'base',
    durationMonths: 1,
    qrQuota: 10,
    aiQuota: 5,
  });

  const { data: subH } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', bizA.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Set used_qr to 9 (so EXACTLY 1 QR scan remains)
  await supabase
    .from('subscriptions')
    .update({
      metadata: {
        ...(subH as any).metadata,
        allocated_qr_quota: 10,
        total_qr_quota: 10,
        used_qr_quota: 9,
        remaining_qr_quota: 1,
        exhaustion_reason: null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', (subH as any).id);

  console.log('Fired 5 simultaneous QR scan requests when only 1 scan remains...');
  const qrPromises = [1, 2, 3, 4, 5].map(i =>
    qrService.handleScan(qrA.slug, { ip_address: `10.0.0.${i}`, user_agent: `RaceTester/${i}` })
  );

  const qrResults = await Promise.allSettled(qrPromises);
  const qrSuccesses = qrResults.filter(r => r.status === 'fulfilled');
  const qrFailures = qrResults.filter(r => r.status === 'rejected');

  console.log(`Simultaneous QR results: ${qrSuccesses.length} succeeded, ${qrFailures.length} rejected`);
  if (qrSuccesses.length !== 1) {
    throw new Error(`TEST H FAILED: Expected EXACTLY 1 successful QR scan, got ${qrSuccesses.length}`);
  }
  if (qrFailures.length !== 4) {
    throw new Error(`TEST H FAILED: Expected EXACTLY 4 rejected QR scans, got ${qrFailures.length}`);
  }

  const entAfterRaceQr = await entitlementService.getBusinessEntitlement(bizA.id);
  console.log(`Database state after QR race: used_qr=${entAfterRaceQr.used_qr}, total_qr=${entAfterRaceQr.total_qr_quota}`);
  if (entAfterRaceQr.used_qr !== 10) {
    throw new Error(`TEST H FAILED: used_qr exceeded total quota! Expected 10, got ${entAfterRaceQr.used_qr}`);
  }

  // Now test simultaneous AI requests: set used_ai to 4 (so EXACTLY 1 AI generation remains)
  const { data: subH2 } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', bizA.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  await supabase
    .from('subscriptions')
    .update({
      metadata: {
        ...(subH2 as any).metadata,
        allocated_qr_quota: 10,
        total_qr_quota: 10,
        used_qr_quota: 5,
        remaining_qr_quota: 5,
        allocated_ai_quota: 5,
        total_ai_quota: 5,
        used_ai_quota: 4,
        remaining_ai_quota: 1,
        exhaustion_reason: null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', (subH2 as any).id);

  // Create 5 separate scan sessions to avoid session-level idempotency dedup
  const sessions = await Promise.all([1, 2, 3, 4, 5].map(async (i) => {
    const { data: s, error: sErr } = await supabase
      .from('review_sessions')
      .insert({
        business_id: bizA.id,
        qr_code_id: qrA.id,
        scan_log_id: scanRes.scan_id,
        status: 'rating_selected',
        rating: 5,
        language: 'en',
      })
      .select('id')
      .single();
    if (sErr || !s) {
      throw new Error(`Failed to create test session: ${sErr?.message}`);
    }
    return (s as any).id;
  }));

  console.log('Fired 5 simultaneous AI generation requests when only 1 generation remains...');
  const aiPromises = sessions.map((sessId, idx) =>
    reviewService.generateReview({ session_id: sessId, rating: 5, language: 'en', variation: idx })
  );

  const aiResults = await Promise.allSettled(aiPromises);
  const aiSuccesses = aiResults.filter(r => r.status === 'fulfilled');
  const aiFailures = aiResults.filter(r => r.status === 'rejected');

  console.log(`Simultaneous AI results: ${aiSuccesses.length} succeeded, ${aiFailures.length} rejected`);
  if (aiSuccesses.length !== 1) {
    throw new Error(`TEST H FAILED: Expected EXACTLY 1 successful AI generation, got ${aiSuccesses.length}`);
  }
  if (aiFailures.length !== 4) {
    throw new Error(`TEST H FAILED: Expected EXACTLY 4 rejected AI generations, got ${aiFailures.length}`);
  }

  const entAfterRaceAi = await entitlementService.getBusinessEntitlement(bizA.id);
  console.log(`Database state after AI race: used_ai=${entAfterRaceAi.used_ai}, total_ai=${entAfterRaceAi.total_ai_quota}`);
  if (entAfterRaceAi.used_ai !== 5) {
    throw new Error(`TEST H FAILED: used_ai exceeded total quota! Expected 5, got ${entAfterRaceAi.used_ai}`);
  }
  console.log('>>> TEST H PASSED: Simultaneous requests correctly serialized, quota never exceeded.\n');

  // -------------------------------------------------------------
  // TEST I: Failed AI generation does not incorrectly consume quota
  // -------------------------------------------------------------
  console.log('--- TEST I: Failed AI generation does not consume quota ---');
  // Give 5 AI quota and set used_ai = 2
  const { data: subI } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', bizA.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  await supabase
    .from('subscriptions')
    .update({
      metadata: {
        ...(subI as any).metadata,
        allocated_ai_quota: 10,
        total_ai_quota: 10,
        used_ai_quota: 2,
        remaining_ai_quota: 8,
        exhaustion_reason: null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', (subI as any).id);

  const { data: failSession, error: failSessionErr } = await supabase
    .from('review_sessions')
    .insert({
      business_id: bizA.id,
      qr_code_id: qrA.id,
      scan_log_id: scanRes.scan_id,
      status: 'rating_selected',
      rating: 5,
      language: 'en',
    })
    .select('id')
    .single();

  if (failSessionErr || !failSession) {
    throw new Error(`Failed to create failSession: ${failSessionErr?.message}`);
  }

  const entBeforeFail = await entitlementService.getBusinessEntitlement(bizA.id);

  let simulationFailedAsExpected = false;
  try {
    await reviewService.generateReview({
      session_id: (failSession as any).id,
      rating: 5,
      language: 'en',
      simulatedError: 'timeout', // Forces 504 AI_TIMEOUT
    });
  } catch (err: any) {
    if (err.code === 'AI_TIMEOUT') {
      simulationFailedAsExpected = true;
    }
  }

  const entAfterFail = await entitlementService.getBusinessEntitlement(bizA.id);
  console.log(`Failed AI simulation: Threw AI_TIMEOUT=${simulationFailedAsExpected}`);
  console.log(`Used AI before=${entBeforeFail.used_ai}, after=${entAfterFail.used_ai}`);

  if (!simulationFailedAsExpected) {
    throw new Error('TEST I FAILED: Expected simulatedError to throw AI_TIMEOUT');
  }
  if (entAfterFail.used_ai !== entBeforeFail.used_ai) {
    throw new Error(`TEST I FAILED: Failed AI generation incorrectly consumed quota! Before=${entBeforeFail.used_ai}, After=${entAfterFail.used_ai}`);
  }
  console.log('>>> TEST I PASSED: Failed AI generation refunded/did not consume quota.\n');

  // -------------------------------------------------------------
  // TEST J: Multiple businesses remain isolated
  // -------------------------------------------------------------
  console.log('--- TEST J: Multiple businesses remain isolated ---');
  // Activate separate plan for bizB with 500 QR and 250 AI
  await entitlementService.activatePlan({
    businessId: bizB.id,
    ownerId: bizB.owner_id,
    planId: 'pro',
    durationMonths: 1,
    qrQuota: 500,
    aiQuota: 250,
  });

  const entBizBBefore = await entitlementService.getBusinessEntitlement(bizB.id);
  const entBizABefore = await entitlementService.getBusinessEntitlement(bizA.id);

  // Consume 1 QR on bizA
  await qrService.handleScan(qrA.slug, { ip_address: '8.8.8.8' });

  const entBizBAfter = await entitlementService.getBusinessEntitlement(bizB.id);
  const entBizAAfter = await entitlementService.getBusinessEntitlement(bizA.id);

  console.log(`Biz A used_qr: Before=${entBizABefore.used_qr}, After=${entBizAAfter.used_qr}`);
  console.log(`Biz B used_qr: Before=${entBizBBefore.used_qr}, After=${entBizBAfter.used_qr}`);

  if (entBizAAfter.used_qr !== entBizABefore.used_qr + 1) {
    throw new Error('TEST J FAILED: Biz A used_qr did not increment');
  }
  if (entBizBAfter.used_qr !== entBizBBefore.used_qr) {
    throw new Error('TEST J FAILED: Biz B quota was modified by Biz A operation!');
  }
  console.log('>>> TEST J PASSED: Multiple businesses strictly isolated.\n');

  // -------------------------------------------------------------
  // TEST K: Direct API cannot bypass limits
  // -------------------------------------------------------------
  console.log('--- TEST K: Direct API cannot bypass limits ---');
  // Exhaust bizB
  const { data: subK } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('business_id', bizB.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  await supabase
    .from('subscriptions')
    .update({
      metadata: {
        ...(subK as any).metadata,
        used_qr_quota: 500,
        remaining_qr_quota: 0,
        exhaustion_reason: 'QR_QUOTA_EXHAUSTED',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', (subK as any).id);

  let directApiBlocked = false;
  try {
    await qrService.handleScan(qrB.slug, { ip_address: '9.9.9.9' });
  } catch (err: any) {
    if (err.code === 'QR_QUOTA_EXHAUSTED' && err.statusCode === 403) {
      directApiBlocked = true;
    }
  }

  console.log(`Direct API call to handleScan: Blocked with 403=${directApiBlocked}`);
  if (!directApiBlocked) {
    throw new Error('TEST K FAILED: Direct API call bypassed QR quota limits');
  }
  console.log('>>> TEST K PASSED: Direct API strictly enforces limits.\n');

  // -------------------------------------------------------------
  // TEST L: Dashboard usage matches actual database usage
  // -------------------------------------------------------------
  console.log('--- TEST L: Dashboard usage matches actual database usage ---');
  const mockReqA = {
    user: { sub: bizA.owner_id, role: 'business_owner' },
    query: { business_id: bizA.id },
  } as any;

  let dashboardDataA: any = null;
  const mockResA = {
    json: (payload: any) => {
      dashboardDataA = payload.data;
    },
    status: () => mockResA,
  } as any;

  await subscriptionController.getStatus(mockReqA, mockResA, () => {});

  const currentEntA = await entitlementService.getBusinessEntitlement(bizA.id);
  console.log(`DB vs API: DB used_qr=${currentEntA.used_qr}, API used_qr=${dashboardDataA?.qr_scans?.used}`);
  console.log(`DB vs API: DB used_ai=${currentEntA.used_ai}, API used_ai=${dashboardDataA?.ai_generations?.used}`);

  if (dashboardDataA?.qr_scans?.used !== currentEntA.used_qr) {
    throw new Error(`TEST L FAILED: Dashboard QR (${dashboardDataA?.qr_scans?.used}) does not match DB (${currentEntA.used_qr})`);
  }
  if (dashboardDataA?.ai_generations?.used !== currentEntA.used_ai) {
    throw new Error(`TEST L FAILED: Dashboard AI (${dashboardDataA?.ai_generations?.used}) does not match DB (${currentEntA.used_ai})`);
  }
  console.log('>>> TEST L PASSED: Dashboard usage matches database state exactly.\n');

  console.log('================================================================');
  console.log('🎉 ALL TESTS (A through L) PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runStep9Verification().catch(err => {
  console.error('\n❌ STEP 9 VERIFICATION FAILED:', err);
  process.exit(1);
});
