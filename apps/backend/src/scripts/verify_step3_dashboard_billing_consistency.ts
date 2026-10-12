/**
 * STEP 3 VERIFICATION SUITE — FINAL DASHBOARD + BILLING STATE CONSISTENCY
 * 
 * Verifies all 8 required scenarios from Step 3:
 * A. Active paid + quota available
 * B. Active paid + QR quota exhausted
 * C. Active paid + AI quota exhausted
 * D. Paid subscription expired
 * E. Active free trial
 * F. Free trial expired
 * G. Expired -> successfully renewed
 * H. Multiple businesses with different entitlement states
 * 
 * Asserts Dashboard, Billing, and public QR always agree on the authoritative entitlement state.
 */

import 'dotenv/config';
import assert from 'assert';
import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { QRService } from '../modules/qr/service';
import { QRController } from '../modules/qr/controller';
import { SubscriptionController } from '../modules/subscription/controller';

async function runStep3Verification() {
  console.log('================================================================');
  console.log(' STEP 3: DASHBOARD + BILLING STATE CONSISTENCY VERIFICATION     ');
  console.log('================================================================\n');

  const qrService = new QRService(supabase);
  const qrController = new QRController(qrService);
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
      await supabase.from('scan_logs').delete().eq('business_id', bId);
      await supabase.from('qr_codes').delete().eq('business_id', bId);
      await supabase.from('subscriptions').delete().eq('business_id', bId);
      await supabase.from('businesses').delete().eq('id', bId);
    }
  };

  // Helper to fetch server-authoritative /subscription/status response
  const callGetStatus = async (businessId?: string): Promise<any> => {
    let responseData: any = null;
    const mockReq = {
      user: { sub: userId, role: 'client' },
      query: businessId ? { business_id: businessId } : {},
      headers: {},
    } as any;
    const mockRes = {
      setHeader: () => {},
      json: (d: any) => {
        responseData = d?.data || d;
      },
    } as any;

    await subscriptionController.getStatus(mockReq, mockRes, (err: any) => {
      if (err) throw err;
    });
    return responseData;
  };

  // Helper to test public QR access
  const callGetBusinessByQRSlug = async (slug: string): Promise<{ status: number; code?: string }> => {
    let responseStatus = 200;
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
        return { json: () => {} };
      },
      json: () => {},
    } as any;

    await qrController.getBusinessByQRSlug(mockReq, mockRes, (err: any) => {
      caughtError = err;
      if (err) responseStatus = err.statusCode || 500;
    });

    return { status: responseStatus, code: caughtError?.code };
  };

  try {
    // -------------------------------------------------------------------------
    // SCENARIO A: Active paid + quota available
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO A: Active paid + quota available ---');
    const bizA = await createTestBusiness('Biz A Active Paid', 'biz-a');
    const qrA = await createTestQR(bizA.id, 'Biz A QR');

    await entitlementService.activatePlan({
      businessId: bizA.id,
      ownerId: userId,
      planId: 'base',
      durationMonths: 6,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
    });

    const statusA = await callGetStatus(bizA.id);
    const qrResA = await callGetBusinessByQRSlug(qrA.slug);

    // Dashboard Assertions
    assert.strictEqual(statusA.is_blocked, false, 'Dashboard must not be blocked');
    assert.strictEqual(statusA.is_active, true, 'Dashboard must show active state');
    assert.strictEqual(statusA.is_expired, false, 'Dashboard must not be expired');
    assert.strictEqual(statusA.exhaustion_reason, null, 'No exhaustion reason');

    // Billing Assertions
    assert.strictEqual(statusA.status, 'ACTIVE', 'Billing status must be ACTIVE');
    assert.strictEqual(statusA.is_trial, false, 'Must not be trial');
    assert.strictEqual(statusA.plan.name, 'Base', 'Plan name must be Base');
    assert(statusA.qr_scans.remaining > 0, 'QR quota remaining');
    assert(statusA.ai_generations.remaining > 0, 'AI quota remaining');

    // Public QR Assertion
    assert.strictEqual(qrResA.status, 200, 'Public QR route must return 200 OK');
    console.log('✔ SCENARIO A PASSED: Dashboard, Billing, and QR all agree on ACTIVE paid status.\n');

    // -------------------------------------------------------------------------
    // SCENARIO B: Active paid + QR quota exhausted
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO B: Active paid + QR quota exhausted ---');
    await supabase.from('subscriptions').update({
      metadata: {
        plan_id: 'base',
        plan_name: 'Base',
        duration_months: 6,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_month_qr_used: 200,
        current_month_ai_used: 10,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    }).eq('business_id', bizA.id);

    const statusB = await callGetStatus(bizA.id);
    const qrResB = await callGetBusinessByQRSlug(qrA.slug);
    const aiCheckB = await entitlementService.canUseService(bizA.id, 'ai_generation');

    // Dashboard Assertions
    assert.strictEqual(statusB.is_blocked, false, 'Dashboard must NOT lock the entire account');
    assert.strictEqual(statusB.is_expired, false, 'Dashboard must NOT say subscription expired');
    assert.strictEqual(statusB.is_active, true, 'Subscription itself remains active');
    assert.strictEqual(statusB.exhaustion_reason, 'QR_QUOTA_EXHAUSTED', 'Clearly indicates QR quota exhausted');

    // Billing Assertions
    assert.strictEqual(statusB.status, 'ACTIVE', 'Billing retains ACTIVE plan status');
    assert.strictEqual(statusB.is_expired, false, 'Billing is_expired must be false');
    assert.strictEqual(statusB.qr_scans.remaining, 0, 'QR remaining must be 0');
    assert(statusB.ai_generations.remaining > 0, 'AI remaining must be available');

    // QR & AI Assertions
    assert.strictEqual(qrResB.status, 403, 'Public QR route must be blocked');
    assert.strictEqual(qrResB.code, 'QR_QUOTA_EXHAUSTED', 'Reason is QR_QUOTA_EXHAUSTED');
    assert.strictEqual(aiCheckB.allowed, true, 'AI service remains independent and ALLOWED');
    console.log('✔ SCENARIO B PASSED: QR quota exhaustion clearly differentiated from subscription expiry.\n');

    // -------------------------------------------------------------------------
    // SCENARIO C: Active paid + AI quota exhausted
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO C: Active paid + AI quota exhausted ---');
    await supabase.from('subscriptions').update({
      metadata: {
        plan_id: 'base',
        plan_name: 'Base',
        duration_months: 6,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_month_qr_used: 10,
        current_month_ai_used: 100,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    }).eq('business_id', bizA.id);

    const statusC = await callGetStatus(bizA.id);
    const qrResC = await callGetBusinessByQRSlug(qrA.slug);
    const aiCheckC = await entitlementService.canUseService(bizA.id, 'ai_generation');

    // Dashboard Assertions
    assert.strictEqual(statusC.is_blocked, false, 'Dashboard must NOT lock the entire account');
    assert.strictEqual(statusC.is_expired, false, 'Dashboard must NOT say subscription expired');
    assert.strictEqual(statusC.exhaustion_reason, 'AI_QUOTA_EXHAUSTED', 'Clearly indicates AI quota exhausted');

    // Billing Assertions
    assert.strictEqual(statusC.status, 'ACTIVE', 'Billing retains ACTIVE plan status');
    assert.strictEqual(statusC.ai_generations.remaining, 0, 'AI remaining must be 0');
    assert(statusC.qr_scans.remaining > 0, 'QR remaining must be available');

    // QR & AI Assertions
    assert.strictEqual(qrResC.status, 200, 'Public QR route must remain ALLOWED');
    assert.strictEqual(aiCheckC.allowed, false, 'AI service must be BLOCKED');
    assert.strictEqual(aiCheckC.reason, 'AI_QUOTA_EXHAUSTED');
    console.log('✔ SCENARIO C PASSED: AI quota exhaustion clearly differentiated, QR remains functional.\n');

    // -------------------------------------------------------------------------
    // SCENARIO D: Paid subscription expired
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO D: Paid subscription expired ---');
    const expiredEnd = new Date(Date.now() - 5 * 86400000).toISOString();
    await supabase.from('subscriptions').upsert({
      business_id: bizA.id,
      owner_id: userId,
      plan_id: 'base',
      status: 'expired',
      price_cents: 249900,
      currency: 'INR',
      billing_cycle: 'monthly',
      current_period_start: new Date(Date.now() - 35 * 86400000).toISOString(),
      current_period_end: expiredEnd,
      metadata: {
        plan_id: 'base',
        plan_name: 'Base',
        duration_months: 6,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        current_month_qr_used: 10,
        current_month_ai_used: 5,
      },
    }, { onConflict: 'business_id' });

    const statusD = await callGetStatus(bizA.id);
    const qrResD = await callGetBusinessByQRSlug(qrA.slug);

    // Dashboard Assertions
    assert.strictEqual(statusD.is_blocked, true, 'Dashboard must be blocked (Access Locked)');
    assert.strictEqual(statusD.is_expired, true, 'is_expired must be true');
    assert.strictEqual(statusD.is_active, false, 'is_active must be false');
    assert(statusD.block_message.includes('expired'), 'Block message must state subscription expired');

    // Billing Assertions
    assert.strictEqual(statusD.status, 'EXPIRED', 'Billing status must be EXPIRED');
    assert.strictEqual(statusD.is_trial, false, 'Not a trial');
    assert.strictEqual(statusD.is_expired, true, 'Billing is_expired must be true');

    // Public QR Assertion
    assert.strictEqual(qrResD.status, 403, 'Public QR route must be BLOCKED');
    assert.strictEqual(qrResD.code, 'SUBSCRIPTION_EXPIRED');
    console.log('✔ SCENARIO D PASSED: Paid subscription expired correctly locks Dashboard, Billing, and QR.\n');

    // -------------------------------------------------------------------------
    // SCENARIO E: Active free trial
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO E: Active free trial ---');
    const bizE = await createTestBusiness('Biz E Active Trial', 'biz-e');
    const qrE = await createTestQR(bizE.id, 'Biz E QR');

    const trialStartE = new Date().toISOString();
    const trialEndE = new Date(Date.now() + 12 * 86400000).toISOString();

    await supabase.from('subscriptions').upsert({
      business_id: bizE.id,
      owner_id: userId,
      plan_id: 'free_trial',
      status: 'trialing',
      price_cents: 0,
      currency: 'INR',
      billing_cycle: 'monthly',
      current_period_start: trialStartE,
      current_period_end: trialEndE,
      trial_start: trialStartE,
      trial_end: trialEndE,
      metadata: {
        plan_id: 'free_trial',
        is_trial: true,
        duration_days: 14,
        allocated_qr_quota: 100,
        allocated_ai_quota: 50,
      },
    }, { onConflict: 'business_id' });

    const statusE = await callGetStatus(bizE.id);
    const qrResE = await callGetBusinessByQRSlug(qrE.slug);

    // Dashboard Assertions
    assert.strictEqual(statusE.is_blocked, false, 'Dashboard must not be blocked for active trial');
    assert.strictEqual(statusE.is_active, true, 'Active trial is active');
    assert.strictEqual(statusE.is_trial, true, 'is_trial must be true');

    // Billing Assertions
    assert.strictEqual(statusE.status, 'FREE_TRIAL', 'Billing status must be FREE_TRIAL');
    assert.strictEqual(statusE.is_trial, true, 'is_trial must be true');
    assert.strictEqual(statusE.is_expired, false, 'is_expired must be false');

    // Public QR Assertion
    assert.strictEqual(qrResE.status, 200, 'Public QR must be accessible');
    console.log('✔ SCENARIO E PASSED: Active trial displays Free Trial / Trial Active, never Active Paid.\n');

    // -------------------------------------------------------------------------
    // SCENARIO F: Free trial expired
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO F: Free trial expired ---');
    const trialStartF = new Date(Date.now() - 20 * 86400000).toISOString();
    const trialEndF = new Date(Date.now() - 6 * 86400000).toISOString();

    await supabase.from('subscriptions').upsert({
      business_id: bizE.id,
      owner_id: userId,
      plan_id: 'free_trial',
      status: 'expired',
      price_cents: 0,
      currency: 'INR',
      billing_cycle: 'monthly',
      current_period_start: trialStartF,
      current_period_end: trialEndF,
      trial_start: trialStartF,
      trial_end: trialEndF,
      metadata: {
        plan_id: 'free_trial',
        is_trial: true,
        duration_days: 14,
        allocated_qr_quota: 100,
        allocated_ai_quota: 50,
      },
    }, { onConflict: 'business_id' });

    const statusF = await callGetStatus(bizE.id);
    const qrResF = await callGetBusinessByQRSlug(qrE.slug);

    // Dashboard Assertions
    assert.strictEqual(statusF.is_blocked, true, 'Dashboard must be blocked (Access Locked)');
    assert.strictEqual(statusF.is_active, false, 'is_active must be false');
    assert.strictEqual(statusF.exhaustion_reason, 'TRIAL_EXPIRED');

    // Billing Assertions
    assert.strictEqual(statusF.status, 'EXPIRED', 'Billing status must be EXPIRED');
    assert.strictEqual(statusF.is_trial, true, 'Must identify as trial');
    assert.strictEqual(statusF.is_expired, true, 'Must identify as expired');

    // Public QR Assertion
    assert.strictEqual(qrResF.status, 403, 'Public QR must be BLOCKED');
    assert.strictEqual(qrResF.code, 'TRIAL_EXPIRED');
    console.log('✔ SCENARIO F PASSED: Expired trial displays Trial Expired, blocks QR, never shows paid active.\n');

    // -------------------------------------------------------------------------
    // SCENARIO G: Expired -> successfully renewed
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO G: Expired -> successfully renewed ---');
    // Renew bizE with paid Pro plan
    await entitlementService.activatePlan({
      businessId: bizE.id,
      ownerId: userId,
      planId: 'pro',
      durationMonths: 6,
      price: 4999,
      qrQuota: 1000,
      aiQuota: 500,
      assignedBy: 'renewal_payment',
    });

    const statusG = await callGetStatus(bizE.id);
    const qrResG = await callGetBusinessByQRSlug(qrE.slug);

    // Dashboard Assertions
    assert.strictEqual(statusG.is_blocked, false, 'Dashboard must be UNLOCKED immediately');
    assert.strictEqual(statusG.is_active, true, 'is_active must be true');
    assert.strictEqual(statusG.is_expired, false, 'is_expired must be false');

    // Billing Assertions
    assert.strictEqual(statusG.status, 'ACTIVE', 'Billing status must be ACTIVE');
    assert.strictEqual(statusG.is_trial, false, 'No longer trial');
    assert.strictEqual(statusG.plan.name, 'Pro', 'Plan name is Pro');

    // Public QR Assertion
    assert.strictEqual(qrResG.status, 200, 'Public QR immediately operational');
    console.log('✔ SCENARIO G PASSED: Successful renewal immediately restores Dashboard, Billing, and QR.\n');

    // -------------------------------------------------------------------------
    // SCENARIO H: Multiple businesses with different entitlement states
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO H: Multiple businesses with different entitlement states ---');
    // bizA is expired
    // bizE is active Pro
    // Both owned by same userId
    const statusBizA = await callGetStatus(bizA.id);
    const statusBizE = await callGetStatus(bizE.id);

    assert.strictEqual(statusBizA.is_blocked, true, 'Biz A must report blocked');
    assert.strictEqual(statusBizA.status, 'EXPIRED', 'Biz A status must be EXPIRED');

    assert.strictEqual(statusBizE.is_blocked, false, 'Biz E must report active');
    assert.strictEqual(statusBizE.status, 'ACTIVE', 'Biz E status must be ACTIVE');

    console.log('✔ SCENARIO H PASSED: Multiple businesses under one user remain completely isolated in Dashboard & Billing.\n');

    console.log('================================================================');
    console.log(' ALL 8 SCENARIOS VERIFIED SUCCESSFULLY WITH 100% CONSISTENCY!   ');
    console.log('================================================================');
  } finally {
    await cleanup();
  }
}

runStep3Verification().catch((err) => {
  console.error('\n❌ STEP 3 VERIFICATION FAILED:', err);
  process.exit(1);
});
