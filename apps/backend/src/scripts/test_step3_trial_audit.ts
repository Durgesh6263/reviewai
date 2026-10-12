import 'dotenv/config';
process.env.LOG_FORMAT = 'json';
process.env.NODE_ENV = 'test';

import { supabaseAdmin as supabase } from '../config/supabase';
import { createClient } from '@supabase/supabase-js';
import { entitlementService } from '../modules/subscription/entitlement';
import { planConfigService } from '../modules/admin/plan-config-service';
import { BusinessService } from '../modules/business/service';

async function runStep3TrialAuditVerification() {
  console.log('=================================================================');
  console.log('STEP 3: FREE TRIAL CONFIGURATION AUDIT VERIFICATION');
  console.log('=================================================================\n');

  const businessService = new BusinessService(supabase);

  // 1. Locate test user
  const { data: users } = (await supabase.from('users').select('id, email, role').limit(2)) as any;
  if (!users || users.length === 0) {
    console.error('No test users found.');
    process.exit(1);
  }

  const primaryUserId = users[0].id;
  const adminTestId = primaryUserId;

  // Backup original admin settings to restore at end
  const { data: originalSettings } = (await supabase
    .from('admin_settings')
    .select('id, limits')
    .limit(1)
    .single()) as any;

  const testBizIds: string[] = [];

  try {
    const createTestBiz = (name: string) => {
      const ts = Date.now() + Math.floor(Math.random() * 1000);
      return businessService.createBusiness(primaryUserId, {
        name,
        phone: '+1 555-0199',
        address_line1: '100 Audit Way',
        city: 'San Jose',
        state: 'CA',
        postal_code: '95112',
        country: 'US',
        google_review_url: `https://g.page/r/test_${ts}/review`,
      });
    };

    console.log('--- Setting up test businesses ---');
    const timestamp = Date.now();
    const [bizTrial1, bizTrial2, bizExpired, bizPaid] = await Promise.all([
      createTestBiz(`Audit Active Trial 1 ${timestamp}`),
      createTestBiz(`Audit Active Trial 2 ${timestamp}`),
      createTestBiz(`Audit Expired Trial ${timestamp}`),
      createTestBiz(`Audit Paid Client ${timestamp}`),
    ]);
    testBizIds.push(bizTrial1.id, bizTrial2.id, bizExpired.id, bizPaid.id);

    // Initial Trial Config: 14 days / 100 QR / 50 AI
    await planConfigService.updateTrialConfig({
      duration_days: 14,
      total_qr_quota: 100,
      total_ai_quota: 50,
      max_qr_codes: 1,
      enabled: true,
    }, adminTestId);

    // Provision 2 active trial businesses
    await entitlementService.provisionTrialSubscription(bizTrial1.id, primaryUserId);
    await entitlementService.provisionTrialSubscription(bizTrial2.id, primaryUserId);

    // Provision 1 expired trial
    const pastStart = new Date(Date.now() - 30 * 86400000).toISOString();
    const pastEnd = new Date(Date.now() - 16 * 86400000).toISOString();
    await supabase.from('subscriptions').upsert({
      business_id: bizExpired.id,
      owner_id: primaryUserId,
      plan_id: 'free_trial',
      status: 'expired',
      billing_cycle: 'monthly',
      price_cents: 0,
      currency: 'INR',
      current_period_start: pastStart,
      current_period_end: pastEnd,
      trial_start: pastStart,
      trial_end: pastEnd,
      metadata: {
        plan_id: 'free_trial',
        duration_days: 14,
        allocated_qr_quota: 100,
        allocated_ai_quota: 50,
        used_qr_quota: 20,
        used_ai_quota: 10,
        remaining_qr_quota: 0,
        remaining_ai_quota: 0,
        exhaustion_reason: 'TRIAL_EXPIRED',
      },
    }, { onConflict: 'business_id' });

    // Provision 1 paid subscription (Base 6 months)
    await entitlementService.activatePlan({
      businessId: bizPaid.id,
      ownerId: primaryUserId,
      planId: 'base',
      durationMonths: 6,
    });
    const paidInitial = await entitlementService.getBusinessEntitlement(bizPaid.id);

    console.log(`Setup complete: 2 active trials, 1 expired trial, 1 paid client.\n`);

    const { count: expectedActiveCount } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .or('plan_id.eq.free_trial,plan_id.eq.free,status.eq.trialing')
      .eq('status', 'trialing');

    console.log(`Active trials in system before update: ${expectedActiveCount} (including our 2 newly provisioned active trials)`);

    // -------------------------------------------------------------------------
    // A. Admin changes Trial duration
    // -------------------------------------------------------------------------
    console.log('--- TEST A: Admin changes Trial duration ---');
    const updateResultA = await planConfigService.updateTrialConfig({
      duration_days: 21,
    }, adminTestId);
    console.log(`Trial duration changed to: ${updateResultA.duration_days} days (Version: v${updateResultA.version})`);
    if (updateResultA.duration_days !== 21) {
      throw new Error(`TEST A FAILED: Duration was not updated to 21`);
    }
    console.log('✓ TEST A PASSED: Admin successfully updated trial duration to 21 days');

    // -------------------------------------------------------------------------
    // B. Audit record is created
    // -------------------------------------------------------------------------
    console.log('\n--- TEST B: Audit record is created ---');
    const { data: auditLogs, error: auditErr } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('resource_type', 'trial_config')
      .order('created_at', { ascending: false })
      .limit(1);

    if (auditErr || !auditLogs || auditLogs.length === 0) {
      throw new Error(`TEST B FAILED: No audit log found for trial_config: ${auditErr?.message}`);
    }
    const auditA = auditLogs[0];
    console.log(`Audit Record Created: ID = ${auditA.id}, Action = ${auditA.action}, Resource = ${auditA.resource_type}`);
    if (auditA.action !== 'TRIAL_CONFIG_CHANGED') {
      throw new Error(`TEST B FAILED: Expected action TRIAL_CONFIG_CHANGED, got ${auditA.action}`);
    }
    console.log('✓ TEST B PASSED: Audit record successfully created in audit_logs table');

    // -------------------------------------------------------------------------
    // C. Previous values are correct
    // -------------------------------------------------------------------------
    console.log('\n--- TEST C: Previous values are correct ---');
    console.log(`Old Values: duration_days = ${auditA.old_values?.duration_days}, total_qr = ${auditA.old_values?.total_qr_quota}, total_ai = ${auditA.old_values?.total_ai_quota}`);
    if (auditA.old_values?.duration_days !== 14 || auditA.old_values?.total_qr_quota !== 100 || auditA.old_values?.total_ai_quota !== 50) {
      throw new Error(`TEST C FAILED: Previous values mismatch: got ${JSON.stringify(auditA.old_values)}`);
    }
    console.log('✓ TEST C PASSED: Previous values accurately captured (14 days, 100 QR, 50 AI)');

    // -------------------------------------------------------------------------
    // D. New values are correct
    // -------------------------------------------------------------------------
    console.log('\n--- TEST D: New values are correct ---');
    console.log(`New Values: duration_days = ${auditA.new_values?.duration_days}, version = ${auditA.new_values?.version}`);
    if (auditA.new_values?.duration_days !== 21 || auditA.new_values?.version !== updateResultA.version) {
      throw new Error(`TEST D FAILED: New values mismatch: got ${JSON.stringify(auditA.new_values)}`);
    }
    if (!auditA.metadata?.affected_fields?.includes('duration_days')) {
      throw new Error(`TEST D FAILED: Affected fields does not include duration_days: ${JSON.stringify(auditA.metadata?.affected_fields)}`);
    }
    console.log(`Affected Fields: ${JSON.stringify(auditA.metadata?.affected_fields)}`);
    console.log('✓ TEST D PASSED: New values and affected fields are correct');

    // -------------------------------------------------------------------------
    // E. Admin identity is recorded
    // -------------------------------------------------------------------------
    console.log('\n--- TEST E: Admin identity is recorded ---');
    const recordedAdmin = auditA.metadata?.admin_id || auditA.user_id;
    console.log(`Recorded Admin ID: ${recordedAdmin}`);
    if (recordedAdmin !== adminTestId) {
      throw new Error(`TEST E FAILED: Expected admin ID ${adminTestId}, got ${recordedAdmin}`);
    }
    console.log('✓ TEST E PASSED: Admin identity accurately recorded');

    // -------------------------------------------------------------------------
    // F. Timestamp is recorded
    // -------------------------------------------------------------------------
    console.log('\n--- TEST F: Timestamp is recorded ---');
    const auditTime = new Date(auditA.created_at || auditA.metadata?.timestamp).getTime();
    const timeDiffMs = Math.abs(Date.now() - auditTime);
    console.log(`Audit Timestamp: ${auditA.created_at} (${timeDiffMs}ms ago)`);
    if (isNaN(auditTime) || timeDiffMs > 60000) {
      throw new Error(`TEST F FAILED: Timestamp invalid or too old: ${auditA.created_at}`);
    }
    console.log('✓ TEST F PASSED: Precise timestamp correctly recorded');

    // -------------------------------------------------------------------------
    // G. Affected active-trial count is correct
    // -------------------------------------------------------------------------
    console.log('\n--- TEST G: Affected active-trial count is correct ---');
    const affectedCount = auditA.metadata?.affected_active_trials;
    console.log(`Recorded Affected Active Trials: ${affectedCount} (Expected: ${expectedActiveCount})`);
    console.log(`Audit Summary: "${auditA.metadata?.summary}"`);
    if (affectedCount !== expectedActiveCount || affectedCount < 2) {
      throw new Error(`TEST G FAILED: Expected ${expectedActiveCount} affected active trials, got ${affectedCount}`);
    }
    console.log(`✓ TEST G PASSED: Affected active trial count is exactly ${expectedActiveCount} (expired trial excluded)`);

    // -------------------------------------------------------------------------
    // H. Multiple consecutive changes create separate history records
    // -------------------------------------------------------------------------
    console.log('\n--- TEST H: Multiple consecutive changes create separate history records ---');
    // Change 2: Adjust QR and AI quotas
    console.log('Applying Change 2: 75 QR / 35 AI...');
    await planConfigService.updateTrialConfig({
      total_qr_quota: 75,
      total_ai_quota: 35,
    }, adminTestId);

    // Change 3: Adjust max QR codes
    console.log('Applying Change 3: max_qr_codes = 3...');
    await planConfigService.updateTrialConfig({
      max_qr_codes: 3,
    }, adminTestId);

    const history = await planConfigService.getTrialConfigHistory();
    console.log(`Total Trial History Records retrieved: ${history.length}`);
    if (history.length < 3) {
      throw new Error(`TEST H FAILED: Expected at least 3 history records, got ${history.length}`);
    }

    const latest = history[0];
    const second = history[1];
    const third = history[2];

    console.log(`History 1 (Latest): Version = ${latest.version}, Affected = ${JSON.stringify(latest.affected_fields)}`);
    console.log(`History 2: Version = ${second.version}, Affected = ${JSON.stringify(second.affected_fields)}`);
    console.log(`History 3: Version = ${third.version}, Affected = ${JSON.stringify(third.affected_fields)}`);

    if (latest.version <= second.version || second.version <= third.version) {
      throw new Error(`TEST H FAILED: Version numbers are not strictly increasing: ${latest.version}, ${second.version}, ${third.version}`);
    }
    console.log('✓ TEST H PASSED: Multiple consecutive changes generated separate chronological history records');

    // -------------------------------------------------------------------------
    // I. Client cannot create/modify audit records
    // -------------------------------------------------------------------------
    console.log('\n--- TEST I: Client cannot create/modify audit records ---');
    // Simulate non-admin client using anon key
    const anonClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    // Attempt to tamper with / update audit log as client
    const { data: updateTamper, error: updateTamperErr } = await anonClient
      .from('audit_logs')
      .update({ action: 'MALICIOUS_TAMPER' })
      .eq('id', auditA.id)
      .select();

    console.log(`Client update audit log attempt: error = ${updateTamperErr?.message || 'none'}, modified rows = ${updateTamper?.length || 0}`);
    if (updateTamper && updateTamper.length > 0) {
      throw new Error(`TEST I FAILED: Client was able to update an audit log record!`);
    }

    // Attempt to delete audit log as client
    const { data: deleteTamper, error: deleteTamperErr } = await anonClient
      .from('audit_logs')
      .delete()
      .eq('id', auditA.id)
      .select();

    console.log(`Client delete audit log attempt: error = ${deleteTamperErr?.message || 'none'}, modified rows = ${deleteTamper?.length || 0}`);
    if (deleteTamper && deleteTamper.length > 0) {
      throw new Error(`TEST I FAILED: Client was able to delete an audit log record!`);
    }

    // Verify audit record is completely intact
    const { data: verifyIntact } = await supabase
      .from('audit_logs')
      .select('action')
      .eq('id', auditA.id)
      .single();

    if (!verifyIntact || verifyIntact.action !== 'TRIAL_CONFIG_CHANGED') {
      throw new Error(`TEST I FAILED: Audit record was tampered with!`);
    }
    console.log('✓ TEST I PASSED: Client is strictly prohibited from modifying or deleting audit records (RLS enforced)');

    // -------------------------------------------------------------------------
    // J. Paid subscription changes are not affected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST J: Paid subscription changes are not affected ---');
    const paidAfter = await entitlementService.getBusinessEntitlement(bizPaid.id);
    console.log(`Paid Business after all trial changes:
      Plan: ${paidAfter.plan_id} (Expected: ${paidInitial.plan_id})
      Total QR: ${paidAfter.total_qr_quota} (Expected: ${paidInitial.total_qr_quota})
      Total AI: ${paidAfter.total_ai_quota} (Expected: ${paidInitial.total_ai_quota})
      Duration: ${paidAfter.duration_months}m (Expected: ${paidInitial.duration_months}m)
      Status: ${paidAfter.status} (Expected: ${paidInitial.status})
    `);

    if (
      paidAfter.plan_id !== paidInitial.plan_id ||
      paidAfter.total_qr_quota !== paidInitial.total_qr_quota ||
      paidAfter.total_ai_quota !== paidInitial.total_ai_quota ||
      paidAfter.duration_months !== paidInitial.duration_months ||
      paidAfter.status !== paidInitial.status
    ) {
      throw new Error(`TEST J FAILED: Paid subscription was mutated by trial configuration updates!`);
    }
    console.log('✓ TEST J PASSED: Paid subscriptions remain 100% unaffected');

    console.log('\n=================================================================');
    console.log('ALL TESTS A THROUGH J PASSED PERFECTLY!');
    console.log('=================================================================\n');

  } catch (error) {
    console.error('VERIFICATION FAILED:', error);
    process.exit(1);
  } finally {
    console.log('Cleaning up test data...');
    for (const bizId of testBizIds) {
      await supabase.from('subscriptions').delete().eq('business_id', bizId);
      await supabase.from('businesses').delete().eq('id', bizId);
    }

    if (originalSettings?.limits) {
      await supabase
        .from('admin_settings')
        .update({ limits: originalSettings.limits, updated_at: new Date().toISOString() })
        .eq('id', originalSettings.id);
      planConfigService.invalidateCache();
      console.log('Admin settings restored to original state.');
    }
  }
}

runStep3TrialAuditVerification().catch(err => {
  console.error('Fatal error in script:', err);
  process.exit(1);
});
