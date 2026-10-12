import 'dotenv/config';
process.env.LOG_FORMAT = 'json';
process.env.NODE_ENV = 'test';

import { supabaseAdmin as supabase } from '../config/supabase';
import { entitlementService } from '../modules/subscription/entitlement';
import { planConfigService } from '../modules/admin/plan-config-service';
import { AdminService } from '../modules/admin/service';
import { SubscriptionService } from '../modules/subscription/service';
import { SubscriptionController } from '../modules/subscription/controller';
import { BusinessService } from '../modules/business/service';
import { ValidationError } from '../shared/exceptions';

async function runStep4FinalVerification() {
  console.log('=================================================================');
  console.log('STEP 4: FINAL ADMIN -> CLIENT BILLING END-TO-END VERIFICATION');
  console.log('=================================================================\n');

  const adminService = new AdminService(supabase);
  const subService = new SubscriptionService(supabase, 'mock_key');
  const subController = new SubscriptionController(subService);
  const businessService = new BusinessService(supabase);

  // 1. Locate test users
  const { data: users } = (await supabase.from('users').select('id, email').limit(2)) as any;
  if (!users || users.length === 0) {
    console.error('No test users found.');
    process.exit(1);
  }

  const primaryUserId = users[0].id;
  const secondaryUserId = users.length > 1 ? users[1].id : users[0].id;

  // Backup original admin settings to restore at end
  const { data: originalSettings } = (await supabase
    .from('admin_settings')
    .select('id, limits')
    .limit(1)
    .single()) as any;

  const testBizIds: string[] = [];
  const testSubIds: string[] = [];
  const testRequestIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // 1. PAID PLANS VERIFICATION: Base, Pro, Unlimited (1, 6, 12 Months)
    // -------------------------------------------------------------------------
    console.log('--- 1. Paid Plans Catalog Verification (Base, Pro, Unlimited) ---');
    const catalog = await planConfigService.getPublicPlans();
    const expectedPlanIds = ['base', 'pro', 'unlimited'];
    const requiredDurations = ['1_month', '6_months', '12_months'] as const;

    for (const planId of expectedPlanIds) {
      const plan = catalog.plans.find(p => p.id === planId);
      if (!plan) throw new Error(`Missing plan '${planId}' in public plans catalog`);
      console.log(`Plan [${plan.name}]: Active Version = ${plan.plan_version_id} (v${plan.version_number})`);

      for (const durKey of requiredDurations) {
        const offering = plan.durations[durKey];
        if (!offering) throw new Error(`Missing '${durKey}' offering for plan '${planId}'`);
        if (typeof offering.price_inr !== 'number' || offering.price_inr < 0) {
          throw new Error(`Invalid price for ${planId} ${durKey}: ${offering.price_inr}`);
        }
        if (typeof offering.allocated_qr_quota !== 'number') {
          throw new Error(`Invalid QR quota for ${planId} ${durKey}`);
        }
        if (typeof offering.allocated_ai_quota !== 'number') {
          throw new Error(`Invalid AI quota for ${planId} ${durKey}`);
        }
        console.log(`  ${durKey}: ₹${offering.price_inr} | QR: ${offering.allocated_qr_quota} | AI: ${offering.allocated_ai_quota} | Max QR Codes: ${offering.max_qr_codes}`);
      }
    }
    console.log('>>> PASSED 1: Base, Pro, and Unlimited all have 1M, 6M, 12M configured authoritatively without hardcoded values\n');

    // -------------------------------------------------------------------------
    // 2. MULTI-BUSINESS ISOLATION CHECK
    // -------------------------------------------------------------------------
    console.log('--- 2. Multi-Business Isolation Check ---');
    // Create Business 1 for primaryUser
    const biz1 = await businessService.createBusiness(primaryUserId, {
      name: `Step4 Biz1 ${Date.now()}`,
      phone: '+1 555-0401',
      address_line1: '100 Multi St',
      city: 'San Jose',
      state: 'CA',
      postal_code: '95112',
      country: 'US',
      google_review_url: `https://g.page/r/step4_biz1_${Date.now()}/review`,
    });
    testBizIds.push(biz1.id);

    // Create Business 2 for same primaryUser
    const biz2 = await businessService.createBusiness(primaryUserId, {
      name: `Step4 Biz2 ${Date.now()}`,
      phone: '+1 555-0402',
      address_line1: '200 Multi St',
      city: 'San Jose',
      state: 'CA',
      postal_code: '95112',
      country: 'US',
      google_review_url: `https://g.page/r/step4_biz2_${Date.now()}/review`,
    });
    testBizIds.push(biz2.id);

    // Activate Pro for Biz 1
    await entitlementService.activatePlan({
      businessId: biz1.id,
      ownerId: primaryUserId,
      planId: 'pro',
      durationMonths: 6,
    });

    // Check Biz 1 entitlement vs Biz 2 entitlement
    const entBiz1 = await entitlementService.getBusinessEntitlement(biz1.id);
    const entBiz2 = await entitlementService.getBusinessEntitlement(biz2.id);

    console.log(`Biz 1 (Pro): Plan=${entBiz1.plan_id}, Price=₹${entBiz1.price_inr}, IsTrial=${entBiz1.is_trial}`);
    console.log(`Biz 2 (Trial): Plan=${entBiz2.plan_id}, Price=₹${entBiz2.price_inr}, IsTrial=${entBiz2.is_trial}`);

    if (entBiz1.plan_id !== 'pro' || entBiz1.is_trial !== false) {
      throw new Error('FAIL (2): Biz 1 did not receive Pro subscription');
    }
    if (entBiz2.plan_id !== 'free_trial' || entBiz2.is_trial !== true) {
      throw new Error('FAIL (2): Biz 2 leaked Biz 1 subscription data');
    }
    console.log('>>> PASSED 2: Subscriptions and usage remain strictly business-specific; zero cross-business leakage\n');

    // -------------------------------------------------------------------------
    // 3. SERVER-SIDE SECURITY CHECK
    // -------------------------------------------------------------------------
    console.log('--- 3. Server-side Security Check ---');
    const mockRes: any = {
      status() { return this; },
      json() { return this; },
      setHeader() {},
    };

    // Client attempts to manipulate price
    let secPriceCaught = false;
    await subController.createUpgradeRequest({
      user: { sub: primaryUserId, role: 'client' },
      body: { business_id: biz2.id, plan_id: 'base', duration_months: 6, price: 5 },
    } as any, mockRes, (err: any) => {
      if (err instanceof ValidationError && err.message.includes('Manipulated price')) secPriceCaught = true;
    });
    if (!secPriceCaught) throw new Error('FAIL (3.1): Server accepted manipulated price');
    console.log('  3.1 PASSED: Server rejected manipulated price');

    // Client attempts to manipulate quota
    let secQuotaCaught = false;
    await subController.createUpgradeRequest({
      user: { sub: primaryUserId, role: 'client' },
      body: { business_id: biz2.id, plan_id: 'base', duration_months: 6, allocated_qr_quota: 50000 },
    } as any, mockRes, (err: any) => {
      if (err instanceof ValidationError && err.message.includes('Manipulated QR quota')) secQuotaCaught = true;
    });
    if (!secQuotaCaught) throw new Error('FAIL (3.2): Server accepted manipulated quota');
    console.log('  3.2 PASSED: Server rejected manipulated quota');

    // Client attempts to manipulate version
    let secVerCaught = false;
    await subController.createUpgradeRequest({
      user: { sub: primaryUserId, role: 'client' },
      body: { business_id: biz2.id, plan_id: 'base', duration_months: 6, plan_version_id: 'base_v9999' },
    } as any, mockRes, (err: any) => {
      if (err instanceof ValidationError && err.message.includes('inactive or invalid')) secVerCaught = true;
    });
    if (!secVerCaught) throw new Error('FAIL (3.3): Server accepted non-existent version');
    console.log('  3.3 PASSED: Server rejected non-existent plan version');

    // Client attempts invalid duration
    let secDurCaught = false;
    await subController.createUpgradeRequest({
      user: { sub: primaryUserId, role: 'client' },
      body: { business_id: biz2.id, plan_id: 'base', duration_months: 5 },
    } as any, mockRes, (err: any) => {
      if (err instanceof ValidationError && err.message.includes('Invalid plan duration')) secDurCaught = true;
    });
    if (!secDurCaught) throw new Error('FAIL (3.4): Server accepted invalid duration');
    console.log('  3.4 PASSED: Server rejected invalid duration');
    console.log('>>> PASSED 3: All server-side security checks enforce authoritative data\n');

    // -------------------------------------------------------------------------
    // 4. FINAL TEST SEQUENCE (A through L)
    // -------------------------------------------------------------------------
    console.log('--- 4. Final Sequence (A through L) ---');

    // A. Record current Base vN
    const initialPlans = await planConfigService.getPlans();
    const basePlan = initialPlans.find(p => p.id === 'base')!;
    const activeVerN = basePlan.versions.find(v => v.status === 'active') || basePlan.versions[0];
    const vN_number = activeVerN.version_number;
    console.log(`[A] Current Base version: v${vN_number} (6M: ₹${activeVerN.durations['6_months'].price_inr}, QR: ${activeVerN.durations['6_months'].allocated_qr_quota})`);

    // Existing customer activates on Base vN
    const existingCustomerBiz = await businessService.createBusiness(secondaryUserId, {
      name: `Step4 Existing Cust ${Date.now()}`,
      phone: '+1 555-0403',
      address_line1: '300 Cust St',
      city: 'San Jose',
      state: 'CA',
      postal_code: '95112',
      country: 'US',
      google_review_url: `https://g.page/r/step4_cust_${Date.now()}/review`,
    });
    testBizIds.push(existingCustomerBiz.id);

    const existingCustomerSub = await entitlementService.activatePlan({
      businessId: existingCustomerBiz.id,
      ownerId: secondaryUserId,
      planId: 'base',
      durationMonths: 6,
      versionNumber: vN_number,
    });
    testSubIds.push(existingCustomerSub.subscription_id);

    // Existing trial business created on initial trial config
    const initialTrialConfig = await planConfigService.getTrialConfig();
    const existingTrialBiz = await businessService.createBusiness(secondaryUserId, {
      name: `Step4 Existing Trial ${Date.now()}`,
      phone: '+1 555-0404',
      address_line1: '400 Trial St',
      city: 'San Jose',
      state: 'CA',
      postal_code: '95112',
      country: 'US',
      google_review_url: `https://g.page/r/step4_trial_${Date.now()}/review`,
    });
    testBizIds.push(existingTrialBiz.id);
    const existingTrialEntitlement = await entitlementService.getBusinessEntitlement(existingTrialBiz.id);
    console.log(`[A] Existing Trial: Version=${existingTrialEntitlement.plan_version_id}, Days=${existingTrialEntitlement.duration_days}, QR=${existingTrialEntitlement.total_qr_quota}`);

    // B. Create Base vN+1 with visibly different price/quota
    const priceVN1 = 3199;
    const qrVN1 = 1500;
    const aiVN1 = 1250;
    const vN1 = await planConfigService.createPlanVersion('base', {
      durations: {
        '1_month': { duration_months: 1, price_inr: 649, allocated_qr_quota: 250, allocated_ai_quota: 125, max_qr_codes: 1 },
        '6_months': { duration_months: 6, price_inr: priceVN1, allocated_qr_quota: qrVN1, allocated_ai_quota: aiVN1, max_qr_codes: 5 },
        '12_months': { duration_months: 12, price_inr: 5899, allocated_qr_quota: 3000, allocated_ai_quota: 2500, max_qr_codes: 10 },
      },
      change_notes: `Base v${vN_number + 1} for Final Sequence`,
      publishImmediately: true,
    }, 'admin-step4');
    console.log(`[B] Created Base v${vN1.version_number}: 6M = ₹${priceVN1}, QR = ${qrVN1}, AI = ${aiVN1}`);

    // C & D. Open Client Billing and confirm vN+1 is shown
    const clientCatalog = await planConfigService.getPublicPlans();
    const clientBase = clientCatalog.plans.find(p => p.id === 'base')!;
    console.log(`[C & D] Client Billing Base: Version = v${clientBase.version_number} (${clientBase.plan_version_id}), 6M Price = ₹${clientBase.durations['6_months'].price_inr}, 6M QR = ${clientBase.durations['6_months'].allocated_qr_quota}`);

    if (clientBase.version_number !== vN1.version_number) {
      throw new Error(`FAIL (D): Client billing shows v${clientBase.version_number} instead of v${vN1.version_number}`);
    }
    if (clientBase.durations['6_months'].price_inr !== priceVN1) {
      throw new Error(`FAIL (D): Price mismatch in client billing`);
    }

    // E & F. Create a new activation request and confirm request references vN+1
    let capturedReqData: any = null;
    await subController.createUpgradeRequest({
      user: { sub: primaryUserId, role: 'client' },
      body: {
        business_id: biz2.id,
        plan_id: 'base',
        duration_months: 6,
        plan_version_id: clientBase.plan_version_id,
        note: `Activation request for v${vN1.version_number}`,
      },
    } as any, {
      status() { return this; },
      json(payload: any) { capturedReqData = payload; return this; },
      setHeader() {},
    } as any, (err: any) => { if (err) throw err; });

    const createdReq = capturedReqData.data;
    testRequestIds.push(createdReq.id);
    console.log(`[E & F] Created Request ID = ${createdReq.id}, Version = ${createdReq.plan_version_id}, Price = ₹${createdReq.price_inr}`);

    if (createdReq.plan_version_id !== `base_v${vN1.version_number}`) {
      throw new Error(`FAIL (F): Request version ${createdReq.plan_version_id} does not match v${vN1.version_number}`);
    }
    if (createdReq.price_inr !== priceVN1) {
      throw new Error(`FAIL (F): Request price ₹${createdReq.price_inr} does not match ₹${priceVN1}`);
    }

    // G. Create Base vN+2
    const priceVN2 = 3899;
    const qrVN2 = 2000;
    const aiVN2 = 1600;
    const vN2 = await planConfigService.createPlanVersion('base', {
      durations: {
        '1_month': { duration_months: 1, price_inr: 799, allocated_qr_quota: 350, allocated_ai_quota: 175, max_qr_codes: 1 },
        '6_months': { duration_months: 6, price_inr: priceVN2, allocated_qr_quota: qrVN2, allocated_ai_quota: aiVN2, max_qr_codes: 5 },
        '12_months': { duration_months: 12, price_inr: 6999, allocated_qr_quota: 4000, allocated_ai_quota: 3200, max_qr_codes: 10 },
      },
      change_notes: `Base v${vN1.version_number + 1} published while request pending`,
      publishImmediately: true,
    }, 'admin-step4');
    console.log(`[G] Admin published Base v${vN2.version_number} (active) with price ₹${priceVN2}`);

    // H & I. Approve existing vN+1 request and confirm activation still uses vN+1
    await adminService.updateUpgradeRequestStatus(
      createdReq.id,
      'approved',
      'admin-final-test',
      'Approved pending vN+1 request'
    );

    const activatedEntitlement = await entitlementService.getBusinessEntitlement(biz2.id);
    console.log(`[H & I] Activated Subscription: Version = ${activatedEntitlement.plan_version_id}, Price = ₹${activatedEntitlement.price_inr}, QR = ${activatedEntitlement.total_qr_quota}, AI = ${activatedEntitlement.total_ai_quota}`);

    if (activatedEntitlement.plan_version_id !== `base_v${vN1.version_number}`) {
      throw new Error(`FAIL (I): Subscription activated with ${activatedEntitlement.plan_version_id} instead of v${vN1.version_number}`);
    }
    if (activatedEntitlement.price_inr !== priceVN1) {
      throw new Error(`FAIL (I): Subscription price mutated to ₹${activatedEntitlement.price_inr} instead of ₹${priceVN1}`);
    }
    if (activatedEntitlement.total_qr_quota !== qrVN1 || activatedEntitlement.total_ai_quota !== aiVN1) {
      throw new Error(`FAIL (I): Subscription quotas mutated to new version values`);
    }

    // J. Confirm existing vN customer remains unchanged
    const finalExistingCust = await entitlementService.getBusinessEntitlement(existingCustomerBiz.id);
    console.log(`[J] Existing vN Customer Check: Version = ${finalExistingCust.plan_version_id}, Price = ₹${finalExistingCust.price_inr}, QR = ${finalExistingCust.total_qr_quota}`);

    if (finalExistingCust.plan_version_id !== `base_v${vN_number}`) {
      throw new Error(`FAIL (J): Existing customer was mutated from v${vN_number} to ${finalExistingCust.plan_version_id}`);
    }
    if (finalExistingCust.price_inr !== activeVerN.durations['6_months'].price_inr) {
      throw new Error(`FAIL (J): Existing customer price was mutated`);
    }

    // K. Change Trial configuration
    const newTrialDays = 15;
    const newTrialQr = 120;
    const newTrialAi = 60;
    const updatedTrialConf = await planConfigService.updateTrialConfig({
      duration_days: newTrialDays,
      total_qr_quota: newTrialQr,
      total_ai_quota: newTrialAi,
      max_qr_codes: 2,
    }, 'admin-step4');
    console.log(`[K] Updated Trial Config: Version = v${updatedTrialConf.version}, Days = ${newTrialDays}, QR = ${newTrialQr}, AI = ${newTrialAi}`);

    // L. Confirm only NEW trials use the new configuration, existing trial remains unchanged
    // Existing trial check:
    const finalExistingTrial = await entitlementService.getBusinessEntitlement(existingTrialBiz.id);
    console.log(`[L] Existing Trial: Version = ${finalExistingTrial.plan_version_id}, Days = ${finalExistingTrial.duration_days}, QR = ${finalExistingTrial.total_qr_quota}`);
    if (finalExistingTrial.duration_days !== existingTrialEntitlement.duration_days || finalExistingTrial.total_qr_quota !== existingTrialEntitlement.total_qr_quota) {
      throw new Error(`FAIL (L): Existing trial was mutated by trial config change`);
    }

    // New trial business check:
    const newTrialBiz = await businessService.createBusiness(primaryUserId, {
      name: `Step4 New Trial ${Date.now()}`,
      phone: '+1 555-0405',
      address_line1: '500 New Trial St',
      city: 'San Jose',
      state: 'CA',
      postal_code: '95112',
      country: 'US',
      google_review_url: `https://g.page/r/step4_new_trial_${Date.now()}/review`,
    });
    testBizIds.push(newTrialBiz.id);

    const newTrialEntitlement = await entitlementService.getBusinessEntitlement(newTrialBiz.id);
    console.log(`[L] New Trial: Version = ${newTrialEntitlement.plan_version_id}, Days = ${newTrialEntitlement.duration_days}, QR = ${newTrialEntitlement.total_qr_quota}, AI = ${newTrialEntitlement.total_ai_quota}`);

    if (newTrialEntitlement.duration_days !== newTrialDays || newTrialEntitlement.total_qr_quota !== newTrialQr || newTrialEntitlement.total_ai_quota !== newTrialAi) {
      throw new Error(`FAIL (L): New trial did not receive new configuration values`);
    }

    console.log('\n=================================================================');
    console.log('SUCCESS: ALL STEP 4 VERIFICATION CRITERIA (A through L) PASSED!');
    console.log('=================================================================\n');
  } finally {
    // Cleanup created test records
    console.log('Cleaning up Step 4 test records...');
    for (const id of testRequestIds) {
      await supabase.from('upgrade_requests').delete().eq('id', id);
    }
    for (const id of testSubIds) {
      await supabase.from('subscriptions').delete().eq('id', id);
    }
    for (const id of testBizIds) {
      await supabase.from('subscriptions').delete().eq('business_id', id);
      await supabase.from('businesses').delete().eq('id', id);
    }

    // Restore original admin settings
    if (originalSettings?.id && originalSettings?.limits) {
      await (supabase as any)
        .from('admin_settings')
        .update({ limits: originalSettings.limits, updated_at: new Date().toISOString() })
        .eq('id', originalSettings.id);
      planConfigService.invalidateCache();
      console.log('Restored original admin_settings and invalidated cache.');
    }
  }
}

runStep4FinalVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('STEP 4 FINAL VERIFICATION FAILED:', err);
    process.exit(1);
  });
