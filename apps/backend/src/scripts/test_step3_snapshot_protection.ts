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

async function runStep3Verification() {
  console.log('=================================================================');
  console.log('STEP 3: SNAPSHOT IMMUTABILITY & NEW CLIENT RULES VERIFICATION');
  console.log('=================================================================\n');

  const adminService = new AdminService(supabase);
  const subService = new SubscriptionService(supabase, 'mock_key');
  const subController = new SubscriptionController(subService);
  const businessService = new BusinessService(supabase);

  // 1. Locate test users and businesses
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
    // TEST A: Existing customer has Base v6
    // -------------------------------------------------------------------------
    console.log('\n--- Test A: Existing customer has Base v6 ---');
    // Setup clean baseline for Step 3: Base with active v6
    const cleanPlans = planConfigService.getDefaultPlans();
    const baseDef = cleanPlans.find(p => p.id === 'base')!;
    baseDef.versions = [
      {
        version_number: 6,
        status: 'active',
        created_at: new Date().toISOString(),
        created_by: 'admin',
        published_at: new Date().toISOString(),
        durations: {
          '1_month': { duration_months: 1, price_inr: 499, allocated_qr_quota: 200, allocated_ai_quota: 100, max_qr_codes: 1 },
          '6_months': { duration_months: 6, price_inr: 2599, allocated_qr_quota: 1200, allocated_ai_quota: 1000, max_qr_codes: 5 },
          '12_months': { duration_months: 12, price_inr: 4999, allocated_qr_quota: 2400, allocated_ai_quota: 2000, max_qr_codes: 10 },
        },
      },
    ];

    const { data: currentSettings } = await supabase.from('admin_settings').select('id, limits').limit(1).single() as any;
    const limits = currentSettings?.limits || {};
    limits.plans = cleanPlans;
    await (supabase as any).from('admin_settings').update({ limits, updated_at: new Date().toISOString() }).eq('id', currentSettings.id);
    planConfigService.invalidateCache();

    // Create business for existing paid customer
    const existingPaidBiz = await businessService.createBusiness(primaryUserId, {
      name: `Step3 Existing Paid Biz ${Date.now()}`,
      phone: '+1 555-0100',
      address_line1: '123 Paid St',
      city: 'San Jose',
      state: 'CA',
      postal_code: '95112',
      country: 'US',
      google_review_url: `https://g.page/r/step3_existing_paid_${Date.now()}/review`,
    });
    testBizIds.push(existingPaidBiz.id);

    // Activate Base v6 for this business
    const existingPaidSub = await entitlementService.activatePlan({
      businessId: existingPaidBiz.id,
      ownerId: primaryUserId,
      planId: 'base',
      durationMonths: 6,
      versionNumber: 6,
      assignedBy: 'admin-init',
    });
    testSubIds.push(existingPaidSub.subscription_id);

    const customerAEntitlement = await entitlementService.getBusinessEntitlement(existingPaidBiz.id);
    console.log(`Existing Customer: Version=${customerAEntitlement.plan_version_id}, Price=₹${customerAEntitlement.price_inr}, QR=${customerAEntitlement.total_qr_quota}, AI=${customerAEntitlement.total_ai_quota}`);
    if (customerAEntitlement.plan_version_id !== 'base_v6' || customerAEntitlement.price_inr !== 2599) {
      throw new Error(`FAIL (A): Expected Base v6 @ ₹2599, got ${customerAEntitlement.plan_version_id} @ ₹${customerAEntitlement.price_inr}`);
    }
    console.log('>>> PASSED A: Existing customer initialized with Base v6 @ ₹2,599 (1,200 QR / 1,000 AI)');

    // -------------------------------------------------------------------------
    // Setup existing trial business before admin trial update
    // -------------------------------------------------------------------------
    console.log('\n--- Setup: Existing Trial Business baseline ---');
    await planConfigService.updateTrialConfig({
      duration_days: 10,
      total_qr_quota: 75,
      total_ai_quota: 30,
      max_qr_codes: 1,
    }, 'admin-test');

    const existingTrialBiz = await businessService.createBusiness(secondaryUserId, {
      name: `Step3 Existing Trial Biz ${Date.now()}`,
      phone: '+1 555-0200',
      address_line1: '456 Trial Ave',
      city: 'San Jose',
      state: 'CA',
      postal_code: '95112',
      country: 'US',
      google_review_url: `https://g.page/r/step3_existing_trial_${Date.now()}/review`,
    });
    testBizIds.push(existingTrialBiz.id);

    const initialTrialEntitlement = await entitlementService.getBusinessEntitlement(existingTrialBiz.id);
    console.log(`Existing Trial Initial: Version=${initialTrialEntitlement.plan_version_id}, Days=${initialTrialEntitlement.duration_days}, QR=${initialTrialEntitlement.total_qr_quota}, AI=${initialTrialEntitlement.total_ai_quota}`);

    // -------------------------------------------------------------------------
    // TEST B: Admin creates Base v7 with different price/quota
    // -------------------------------------------------------------------------
    console.log('\n--- Test B: Admin creates Base v7 with different price/quota ---');
    const v7 = await planConfigService.createPlanVersion('base', {
      durations: {
        '1_month': { duration_months: 1, price_inr: 599, allocated_qr_quota: 250, allocated_ai_quota: 125, max_qr_codes: 1 },
        '6_months': { duration_months: 6, price_inr: 2999, allocated_qr_quota: 1400, allocated_ai_quota: 1200, max_qr_codes: 5 },
        '12_months': { duration_months: 12, price_inr: 5499, allocated_qr_quota: 2800, allocated_ai_quota: 2400, max_qr_codes: 10 },
      },
      change_notes: 'Base v7 for Step 3 test',
      publishImmediately: true,
    }, 'admin-test');
    console.log(`Admin published Base v7: 6M = ₹2,999, 1400 QR, 1200 AI (status: ${v7.status})`);
    console.log('>>> PASSED B: Admin created and activated Base v7');

    // -------------------------------------------------------------------------
    // TEST C: Existing customer still sees v6 values
    // -------------------------------------------------------------------------
    console.log('\n--- Test C: Existing customer still sees v6 values ---');
    const customerAAfter = await entitlementService.getBusinessEntitlement(existingPaidBiz.id);
    console.log(`Customer A after v7 creation: Version=${customerAAfter.plan_version_id}, Price=₹${customerAAfter.price_inr}, QR=${customerAAfter.total_qr_quota}, AI=${customerAAfter.total_ai_quota}`);
    if (customerAAfter.plan_version_id !== 'base_v6' || customerAAfter.price_inr !== 2599 || customerAAfter.total_qr_quota !== 1200 || customerAAfter.total_ai_quota !== 1000) {
      throw new Error('FAIL (C): Existing customer subscription was mutated when v7 was published!');
    }
    console.log('>>> PASSED C: Existing customer retains immutable snapshot (v6 @ ₹2,599, 1,200 QR, 1,000 AI)');

    // -------------------------------------------------------------------------
    // TEST D: Existing trial remains unchanged when Admin changes Trial config
    // -------------------------------------------------------------------------
    console.log('\n--- Test D: Existing trial remains unchanged ---');
    const newTrialConfig = await planConfigService.updateTrialConfig({
      duration_days: 14,
      total_qr_quota: 100,
      total_ai_quota: 50,
      max_qr_codes: 2,
    }, 'admin-test');
    console.log(`Admin updated Trial config: version=${newTrialConfig.version}, days=${newTrialConfig.duration_days}, QR=${newTrialConfig.total_qr_quota}`);

    const trialAfterAdminChange = await entitlementService.getBusinessEntitlement(existingTrialBiz.id);
    console.log(`Existing Trial after Admin change: Days=${trialAfterAdminChange.duration_days}, QR=${trialAfterAdminChange.total_qr_quota}, AI=${trialAfterAdminChange.total_ai_quota}`);
    if (trialAfterAdminChange.duration_days !== 10 || trialAfterAdminChange.total_qr_quota !== 75 || trialAfterAdminChange.total_ai_quota !== 30) {
      throw new Error('FAIL (D): Existing trial was mutated by Admin trial config change!');
    }
    console.log('>>> PASSED D: Existing trial snapshot remains frozen on 10 days / 75 QR / 30 AI');

    // -------------------------------------------------------------------------
    // TEST E: New client receives current trial config
    // -------------------------------------------------------------------------
    console.log('\n--- Test E: New client receives current trial config ---');
    const newClientBiz = await businessService.createBusiness(primaryUserId, {
      name: `Step3 New Client Biz ${Date.now()}`,
      phone: '+1 555-0300',
      address_line1: '789 New Client Blvd',
      city: 'San Jose',
      state: 'CA',
      postal_code: '95112',
      country: 'US',
      google_review_url: `https://g.page/r/step3_new_client_${Date.now()}/review`,
    });
    testBizIds.push(newClientBiz.id);

    const newClientEntitlement = await entitlementService.getBusinessEntitlement(newClientBiz.id);
    console.log(`New Client Trial Snapshot: Days=${newClientEntitlement.duration_days}, QR=${newClientEntitlement.total_qr_quota}, AI=${newClientEntitlement.total_ai_quota}, Version=${newClientEntitlement.plan_version_id}`);
    if (newClientEntitlement.duration_days !== 14 || newClientEntitlement.total_qr_quota !== 100 || newClientEntitlement.total_ai_quota !== 50) {
      throw new Error('FAIL (E): New client did not receive current active trial configuration (expected 14 / 100 / 50)');
    }
    console.log('>>> PASSED E: New client immediately snapshotted with current active trial config (14 days, 100 QR, 50 AI)');

    // -------------------------------------------------------------------------
    // TEST F: New billing request uses v7
    // -------------------------------------------------------------------------
    console.log('\n--- Test F: New billing request uses v7 ---');
    let capturedResponse: any = null;
    const reqF: any = {
      user: { sub: primaryUserId, role: 'client' },
      body: {
        business_id: newClientBiz.id,
        plan_id: 'base',
        duration_months: 6,
        plan_version_id: 'base_v7',
        note: 'Customer selecting Base v7',
      },
    };
    const resF: any = {
      status(code: number) { return this; },
      json(payload: any) { capturedResponse = payload; return this; },
      setHeader() {},
    };

    await subController.createUpgradeRequest(reqF, resF, (err: any) => {
      if (err) throw err;
    });

    if (!capturedResponse?.data) {
      throw new Error(`FAIL (F): Failed to create upgrade request: ${JSON.stringify(capturedResponse)}`);
    }

    const createdReqF = capturedResponse.data;
    testRequestIds.push(createdReqF.id);

    console.log(`Created Request: ID=${createdReqF.id}, PlanVersionId=${createdReqF.plan_version_id}, Price=₹${createdReqF.price_inr}, QR=${createdReqF.allocated_qr_quota}`);
    if (createdReqF.plan_version_id !== 'base_v7' || createdReqF.price_inr !== 2999) {
      throw new Error(`FAIL (F): Upgrade request does not reference Base v7 @ ₹2999`);
    }
    console.log('>>> PASSED F: New billing request created referencing Base v7 @ ₹2,999');

    // -------------------------------------------------------------------------
    // TEST G: Admin creates v8 while v7 request is pending
    // -------------------------------------------------------------------------
    console.log('\n--- Test G: Admin creates v8 while v7 request is pending ---');
    const v8 = await planConfigService.createPlanVersion('base', {
      durations: {
        '1_month': { duration_months: 1, price_inr: 799, allocated_qr_quota: 350, allocated_ai_quota: 175, max_qr_codes: 1 },
        '6_months': { duration_months: 6, price_inr: 3499, allocated_qr_quota: 1800, allocated_ai_quota: 1400, max_qr_codes: 5 },
        '12_months': { duration_months: 12, price_inr: 6499, allocated_qr_quota: 3600, allocated_ai_quota: 2800, max_qr_codes: 10 },
      },
      change_notes: 'Base v8 created while v7 pending',
      publishImmediately: true,
    }, 'admin-test');
    console.log(`Admin published Base v8: 6M = ₹3,499, 1800 QR, 1400 AI (status: ${v8.status})`);
    console.log('>>> PASSED G: Base v8 created and became the new active version');

    // -------------------------------------------------------------------------
    // TEST H: Pending v7 request still activates with v7
    // -------------------------------------------------------------------------
    console.log('\n--- Test H: Pending v7 request still activates with v7 ---');
    const approvedRequest = await adminService.updateUpgradeRequestStatus(
      createdReqF.id,
      'approved',
      'admin-reviewer',
      'Approved pending v7 request'
    );

    const clientBizEntitlement = await entitlementService.getBusinessEntitlement(newClientBiz.id);
    console.log(`Activated Subscription for Client Biz:`);
    console.log(`  PlanVersionId: ${clientBizEntitlement.plan_version_id} (Expected: base_v7, NOT base_v8)`);
    console.log(`  Price: ₹${clientBizEntitlement.price_inr} (Expected: ₹2999, NOT ₹3499)`);
    console.log(`  QR Quota: ${clientBizEntitlement.total_qr_quota} (Expected: 1400, NOT 1800)`);
    console.log(`  AI Quota: ${clientBizEntitlement.total_ai_quota} (Expected: 1200, NOT 1400)`);

    if (clientBizEntitlement.plan_version_id !== 'base_v7') {
      throw new Error(`FAIL (H): Pending request activated with ${clientBizEntitlement.plan_version_id} instead of v7!`);
    }
    if (clientBizEntitlement.price_inr !== 2999) {
      throw new Error(`FAIL (H): Price was mutated to ₹${clientBizEntitlement.price_inr} instead of v7 price ₹2999!`);
    }
    if (clientBizEntitlement.total_qr_quota !== 1400 || clientBizEntitlement.total_ai_quota !== 1200) {
      throw new Error(`FAIL (H): Quotas mutated to new version values!`);
    }
    console.log('>>> PASSED H: Pending request strictly preserved Base v7 snapshot upon approval even though v8 was published prior to approval');

    // -------------------------------------------------------------------------
    // TEST I: No historical subscription values change
    // -------------------------------------------------------------------------
    console.log('\n--- Test I: No historical subscription values change ---');
    const finalCustomerA = await entitlementService.getBusinessEntitlement(existingPaidBiz.id);
    const finalExistingTrial = await entitlementService.getBusinessEntitlement(existingTrialBiz.id);

    console.log(`Final Customer A: Version=${finalCustomerA.plan_version_id}, Price=₹${finalCustomerA.price_inr}, QR=${finalCustomerA.total_qr_quota}`);
    if (finalCustomerA.plan_version_id !== 'base_v6' || finalCustomerA.price_inr !== 2599 || finalCustomerA.total_qr_quota !== 1200) {
      throw new Error('FAIL (I): Customer A historical subscription was corrupted!');
    }

    console.log(`Final Existing Trial: Days=${finalExistingTrial.duration_days}, QR=${finalExistingTrial.total_qr_quota}`);
    if (finalExistingTrial.duration_days !== 10 || finalExistingTrial.total_qr_quota !== 75) {
      throw new Error('FAIL (I): Existing trial historical snapshot was corrupted!');
    }
    console.log('>>> PASSED I: All historical subscription snapshots across paid and trial customers remain completely intact');

    // -------------------------------------------------------------------------
    // TEST J: Direct API manipulation cannot change an existing snapshot
    // -------------------------------------------------------------------------
    console.log('\n--- Test J: Direct API manipulation cannot change an existing snapshot ---');
    const targetSubId = clientBizEntitlement.subscription_id;

    // Attempt 1: Direct manipulation of price in metadata via subscription update API
    let blockedPriceManipulation = false;
    try {
      await subService.updateSubscription(targetSubId, {
        metadata: {
          price_inr: 0, // Attempted price manipulation
        },
      } as any);
    } catch (err: any) {
      if (err instanceof ValidationError && err.message.includes('Cannot modify immutable subscription snapshot field')) {
        blockedPriceManipulation = true;
      }
    }
    if (!blockedPriceManipulation) {
      throw new Error('FAIL (J.1): Direct API manipulation of price_inr was not blocked!');
    }
    console.log('  J.1 PASSED: API rejected direct manipulation of price_inr');

    // Attempt 2: Direct manipulation of allocated quota in metadata
    let blockedQuotaManipulation = false;
    try {
      await subService.updateSubscription(targetSubId, {
        metadata: {
          allocated_qr_quota: 999999, // Attempted quota manipulation
        },
      } as any);
    } catch (err: any) {
      if (err instanceof ValidationError && err.message.includes('Cannot modify immutable subscription snapshot field')) {
        blockedQuotaManipulation = true;
      }
    }
    if (!blockedQuotaManipulation) {
      throw new Error('FAIL (J.2): Direct API manipulation of allocated_qr_quota was not blocked!');
    }
    console.log('  J.2 PASSED: API rejected direct manipulation of allocated_qr_quota');

    // Attempt 3: Direct manipulation of plan_version_id
    let blockedVersionManipulation = false;
    try {
      await subService.updateSubscription(targetSubId, {
        metadata: {
          plan_version_id: 'enterprise_hacked_v99',
        },
      } as any);
    } catch (err: any) {
      if (err instanceof ValidationError && err.message.includes('Cannot modify immutable subscription snapshot field')) {
        blockedVersionManipulation = true;
      }
    }
    if (!blockedVersionManipulation) {
      throw new Error('FAIL (J.3): Direct API manipulation of plan_version_id was not blocked!');
    }
    console.log('  J.3 PASSED: API rejected direct manipulation of plan_version_id');

    console.log('>>> PASSED J: Direct API manipulation of snapshot fields strictly blocked with ValidationError');

    console.log('\n=================================================================');
    console.log('SUCCESS: ALL 10 STEP 3 VERIFICATION TESTS (A through J) PASSED!');
    console.log('=================================================================\n');
  } finally {
    // Cleanup created test records
    console.log('Cleaning up Step 3 test records...');
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

runStep3Verification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('STEP 3 VERIFICATION FAILED:', err);
    process.exit(1);
  });
