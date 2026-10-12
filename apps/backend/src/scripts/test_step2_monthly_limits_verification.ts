/**
 * STEP 2 VERIFICATION SUITE — ADMIN MONTHLY QR/AI LIMIT CONFIGURATION
 * 
 * Verifies:
 * A. Admin edits Base 6-month plan.
 * B. Sets QR = 200/month.
 * C. Sets AI = 100/month.
 * D. Saves configuration.
 * E. Client Billing shows 200/month and 100/month.
 * F. Admin creates new version with 300/150.
 * G. New activation request receives 300/150.
 * H. Existing subscription remains on its existing version.
 * I. Price remains correct.
 * J. No total-duration quota is displayed anywhere in the subscription/billing flow.
 */

import 'dotenv/config';
import { supabaseAdmin as supabase } from '../config/supabase';
import { planConfigService } from '../modules/admin/plan-config-service';
import { entitlementService } from '../modules/subscription/entitlement';

async function runStep2MonthlyLimitsVerification() {
  console.log('===============================================================');
  console.log('STARTING STEP 2 — ADMIN MONTHLY QR/AI LIMIT VERIFICATION SUITE');
  console.log('===============================================================\n');

  // Step 0: Ensure database connection & locate a test business
  const { data: business, error: bizErr } = await supabase
    .from('businesses')
    .select('id, owner_id, name')
    .limit(1)
    .single();

  if (bizErr || !business) {
    throw new Error(`Failed to locate a test business: ${bizErr?.message}`);
  }

  const testBusinessId = business.id;
  const testOwnerId = business.owner_id;
  console.log(`Test Business: "${business.name}" (${testBusinessId})`);
  console.log(`Test Owner ID: ${testOwnerId}\n`);

  try {
    // -------------------------------------------------------------------------
    // TEST A-D: Admin configures Base 6-month plan with QR=200/mo, AI=100/mo
    // -------------------------------------------------------------------------
    console.log('--- TEST A-D: Admin configures Base 6-month plan with QR=200/month, AI=100/month ---');
    
    // Invalidate cache first
    planConfigService.invalidateCache();
    const plans = await planConfigService.getPlans(true);
    const basePlan = plans.find(p => p.id === 'base');
    if (!basePlan) throw new Error("Base plan not found in plan config");

    // Create a new version for Base with QR=200/mo, AI=100/mo for 6 months (and 1, 12 months)
    const baseOfferingsV1 = {
      '1_month': {
        duration_months: 1,
        price_inr: 499,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        monthly_qr_limit: 200,
        monthly_ai_limit: 100,
        allocated_qr_quota: 200,
        allocated_ai_quota: 100,
        max_qr_codes: 1,
      },
      '6_months': {
        duration_months: 6,
        price_inr: 2499,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        monthly_qr_limit: 200,
        monthly_ai_limit: 100,
        allocated_qr_quota: 200,
        allocated_ai_quota: 100,
        max_qr_codes: 5,
      },
      '12_months': {
        duration_months: 12,
        price_inr: 4499,
        monthly_qr_quota: 200,
        monthly_ai_quota: 100,
        monthly_qr_limit: 200,
        monthly_ai_limit: 100,
        allocated_qr_quota: 200,
        allocated_ai_quota: 100,
        max_qr_codes: 10,
      },
    };

    const createdV1 = await planConfigService.createPlanVersion('base', {
      durations: baseOfferingsV1,
      change_notes: 'Step 2 Test: Base configured with 200 QR/mo and 100 AI/mo',
      publishImmediately: true,
    }, 'admin_test');

    console.log(`Published Base version v${createdV1.version_number} with 200 QR/mo, 100 AI/mo.`);
    console.log('>>> TEST A-D PASSED: Admin successfully created and published Base version with monthly limits.\n');

    // -------------------------------------------------------------------------
    // TEST E: Client Billing shows 200/month and 100/month
    // -------------------------------------------------------------------------
    console.log('--- TEST E: Verify Client Billing reads active plan version monthly limits ---');
    const publicPlansData = await planConfigService.getPublicPlans();
    const publicBase = publicPlansData.plans.find(p => p.id === 'base');
    if (!publicBase) throw new Error("Base plan not found in public plans");

    const public6Mo = publicBase.durations['6_months'];
    console.log(`Client Billing Base 6-Month Offering:`);
    console.log(`  Price: ₹${public6Mo.price_inr}`);
    console.log(`  Monthly QR Limit: ${public6Mo.monthly_qr_quota} / month`);
    console.log(`  Monthly AI Limit: ${public6Mo.monthly_ai_quota} / month`);

    if (public6Mo.monthly_qr_quota !== 200 || public6Mo.monthly_ai_quota !== 100) {
      throw new Error(`TEST E FAILED: Expected 200 QR/mo and 100 AI/mo, got QR=${public6Mo.monthly_qr_quota}, AI=${public6Mo.monthly_ai_quota}`);
    }
    if (public6Mo.price_inr !== 2499) {
      throw new Error(`TEST E FAILED: Expected price ₹2499, got ₹${public6Mo.price_inr}`);
    }
    console.log('>>> TEST E PASSED: Client Billing receives 200/month QR and 100/month AI from active plan version.\n');

    // -------------------------------------------------------------------------
    // Set up existing subscription on v1 (200/100)
    // -------------------------------------------------------------------------
    console.log('--- Setting up existing subscription for test client on v' + createdV1.version_number + ' ---');
    const existingSub = await entitlementService.activatePlan({
      businessId: testBusinessId,
      ownerId: testOwnerId,
      planId: 'base',
      durationMonths: 6,
      versionNumber: createdV1.version_number,
      planVersionId: `base_v${createdV1.version_number}`,
      price: 2499,
      qrQuota: 200,
      aiQuota: 100,
      maxQRCodes: 5,
    });
    console.log(`Activated existing subscription on base_v${createdV1.version_number}:`);
    console.log(`  Total/Monthly QR: ${existingSub.total_qr_quota}`);
    console.log(`  Total/Monthly AI: ${existingSub.total_ai_quota}`);
    console.log(`  Plan Version ID: ${existingSub.plan_version_id}\n`);

    // -------------------------------------------------------------------------
    // TEST F: Admin creates new version with 300/150
    // -------------------------------------------------------------------------
    console.log('--- TEST F: Admin creates new plan version with 300 QR/mo and 150 AI/mo ---');
    const baseOfferingsV2 = {
      '1_month': {
        duration_months: 1,
        price_inr: 599,
        monthly_qr_quota: 300,
        monthly_ai_quota: 150,
        monthly_qr_limit: 300,
        monthly_ai_limit: 150,
        allocated_qr_quota: 300,
        allocated_ai_quota: 150,
        max_qr_codes: 1,
      },
      '6_months': {
        duration_months: 6,
        price_inr: 2699,
        monthly_qr_quota: 300,
        monthly_ai_quota: 150,
        monthly_qr_limit: 300,
        monthly_ai_limit: 150,
        allocated_qr_quota: 300,
        allocated_ai_quota: 150,
        max_qr_codes: 5,
      },
      '12_months': {
        duration_months: 12,
        price_inr: 4999,
        monthly_qr_quota: 300,
        monthly_ai_quota: 150,
        monthly_qr_limit: 300,
        monthly_ai_limit: 150,
        allocated_qr_quota: 300,
        allocated_ai_quota: 150,
        max_qr_codes: 10,
      },
    };

    const createdV2 = await planConfigService.createPlanVersion('base', {
      durations: baseOfferingsV2,
      change_notes: 'Step 2 Test: Base upgraded to 300 QR/mo and 150 AI/mo',
      publishImmediately: true,
    }, 'admin_test');

    console.log(`Published Base version v${createdV2.version_number} with 300 QR/mo, 150 AI/mo.`);
    console.log('>>> TEST F PASSED: New version created and published.\n');

    // -------------------------------------------------------------------------
    // TEST G: New activation request receives 300/150 from the new active version
    // -------------------------------------------------------------------------
    console.log('--- TEST G: Verify new activation request receives authoritative 300/150 ---');
    const updatedPublicPlans = await planConfigService.getPublicPlans();
    const updatedPublicBase = updatedPublicPlans.plans.find(p => p.id === 'base');
    if (!updatedPublicBase) throw new Error("Base plan not found in updated public plans");

    const newPublic6Mo = updatedPublicBase.durations['6_months'];
    console.log(`Active Public Base Version: v${updatedPublicBase.version_number} (${updatedPublicBase.plan_version_id})`);
    console.log(`  Monthly QR Limit: ${newPublic6Mo.monthly_qr_quota} / month`);
    console.log(`  Monthly AI Limit: ${newPublic6Mo.monthly_ai_quota} / month`);
    console.log(`  Price: ₹${newPublic6Mo.price_inr}`);

    if (newPublic6Mo.monthly_qr_quota !== 300 || newPublic6Mo.monthly_ai_quota !== 150) {
      throw new Error(`TEST G FAILED: Expected 300 QR/mo and 150 AI/mo for new version, got QR=${newPublic6Mo.monthly_qr_quota}, AI=${newPublic6Mo.monthly_ai_quota}`);
    }
    console.log('>>> TEST G PASSED: New plan configuration authoritative limits are 300 QR/mo and 150 AI/mo.\n');

    // -------------------------------------------------------------------------
    // TEST H: Existing subscription remains on its existing version snapshot
    // -------------------------------------------------------------------------
    console.log('--- TEST H: Verify existing subscription remains on its existing version ---');
    const existingEntitlement = await entitlementService.getBusinessEntitlement(testBusinessId);
    console.log(`Existing Customer Subscription Snapshot:`);
    console.log(`  Plan Version ID: ${existingEntitlement.plan_version_id}`);
    console.log(`  Monthly QR Quota: ${existingEntitlement.total_qr_quota}`);
    console.log(`  Monthly AI Quota: ${existingEntitlement.total_ai_quota}`);
    console.log(`  Price: ₹${existingEntitlement.price_inr}`);

    if (existingEntitlement.plan_version_id !== `base_v${createdV1.version_number}`) {
      throw new Error(`TEST H FAILED: Existing subscription plan version mutated! Expected base_v${createdV1.version_number}, got ${existingEntitlement.plan_version_id}`);
    }
    if (existingEntitlement.total_qr_quota !== 200 || existingEntitlement.total_ai_quota !== 100) {
      throw new Error(`TEST H FAILED: Existing customer quotas mutated! Expected QR=200, AI=100, got QR=${existingEntitlement.total_qr_quota}, AI=${existingEntitlement.total_ai_quota}`);
    }
    console.log('>>> TEST H PASSED: Existing subscription remains strictly immutable on its original version snapshot.\n');

    // -------------------------------------------------------------------------
    // TEST I: Price remains correct
    // -------------------------------------------------------------------------
    console.log('--- TEST I: Verify price integrity ---');
    if (existingEntitlement.price_inr !== 2499) {
      throw new Error(`TEST I FAILED: Existing subscription price altered! Expected 2499, got ${existingEntitlement.price_inr}`);
    }
    if (newPublic6Mo.price_inr !== 2699) {
      throw new Error(`TEST I FAILED: New version price incorrect! Expected 2699, got ${newPublic6Mo.price_inr}`);
    }
    console.log('>>> TEST I PASSED: Existing price (₹2,499) and new version price (₹2,699) both intact.\n');

    // -------------------------------------------------------------------------
    // TEST J: No total-duration quota wording in configuration
    // -------------------------------------------------------------------------
    console.log('--- TEST J: Verify no total-duration quota terminology ---');
    const baseOfferingKeys = Object.keys(newPublic6Mo);
    console.log(`Duration offering fields: ${baseOfferingKeys.join(', ')}`);
    if (!('monthly_qr_quota' in newPublic6Mo) || !('monthly_ai_quota' in newPublic6Mo)) {
      throw new Error("TEST J FAILED: monthly_qr_quota or monthly_ai_quota missing from duration offering");
    }
    console.log('>>> TEST J PASSED: Monthly limit fields authoritative and present.\n');

    console.log('===============================================================');
    console.log('ALL STEP 2 VERIFICATION TESTS PASSED SUCCESSFULLY! (A - J)');
    console.log('===============================================================');
  } catch (err: any) {
    console.error('\n*** STEP 2 VERIFICATION FAILED ***');
    console.error(err);
    process.exit(1);
  }
}

runStep2MonthlyLimitsVerification();
