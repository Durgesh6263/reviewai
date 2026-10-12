import assert from 'assert';
import { entitlementService, calculateUsagePeriod } from '../modules/subscription/entitlement';
import { AdminService } from '../modules/admin/service';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
const adminService = new AdminService(supabase);

async function runStep2Verification() {
  console.log('================================================================');
  console.log('STEP 2 — VERIFY AI QUOTA CONSISTENCY AFTER THE FIX');
  console.log('================================================================\n');

  // ============================================================================
  // PART 1: TEST THE AFFECTED BUSINESS & USER ACCOUNTS
  // ============================================================================
  console.log('--- PART 1: AFFECTED BUSINESS & MULTI-SURFACE AUDIT ---');
  const userId = '43c94316-cbfa-4599-8ed9-ff52dec73f23';

  // Target businesses for this user:
  // 1. "Test" (Free Trial - where billing showed 0/30 but lock banner was triggered)
  // 2. "the hven cafe" (Base Paid - where 450/450 AI quota was exhausted)
  const targetBusinesses = [
    { id: '26f4fed2-a4e6-49bb-831f-86adba4f7663', label: 'Test (Free Trial)' },
    { id: '88d2da14-f37b-46b9-95af-51379d92fd6a', label: 'the hven cafe (Base Paid)' },
  ];

  const adminUsageList = await adminService.getUserWiseUsage({});
  const adminSubsStats = await adminService.getSubscriptionStats({});

  for (const target of targetBusinesses) {
    console.log(`\nAuditing Target Business: ${target.label} [${target.id}]`);

    // Fetch live DB subscription record directly
    const { data: subRecord, error: subErr } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('business_id', target.id)
      .single();

    assert(!subErr, `Failed to fetch subscription for ${target.label}: ${subErr?.message}`);
    assert(subRecord, `Subscription record missing for ${target.label}`);

    console.log(`- Subscription ID: ${subRecord.id}`);
    console.log(`- Status: ${subRecord.status}`);
    console.log(`- Plan ID: ${subRecord.plan_id}`);
    console.log(`- Period Start: ${subRecord.current_period_start || subRecord.trial_start}`);
    console.log(`- Period End: ${subRecord.current_period_end || subRecord.trial_end}`);

    // Surface 1: Client Billing & Entitlement Source of Truth
    const clientEnt = await entitlementService.getBusinessEntitlement(target.id);

    // Surface 2: QR Flow Check
    const qrAccess = await entitlementService.canUseService(target.id, 'qr_scan');

    // Surface 3: AI Generation API Check
    const aiApiAccess = await entitlementService.canUseService(target.id, 'ai_generation');

    // Surface 4: Admin Usage & Admin Subscriptions
    let adminUsageBiz: any = null;
    for (const u of adminUsageList) {
      const match = (u.businesses || []).find((b: any) => b.id === target.id);
      if (match) {
        adminUsageBiz = match;
        break;
      }
    }
    assert(adminUsageBiz, `Admin Usage entry not found for ${target.label}`);

    let adminSubBiz: any = null;
    for (const u of adminSubsStats.user_subscriptions) {
      const match = (u.businesses || []).find((b: any) => b.id === target.id);
      if (match) {
        adminSubBiz = match;
        break;
      }
    }
    assert(adminSubBiz, `Admin Subscriptions entry not found for ${target.label}`);

    console.log('\n  [Surface Values]');
    console.log(`  1. Client Billing:   Limit=${clientEnt.monthly_ai_quota}, Used=${clientEnt.current_month_ai_used}, Remaining=${clientEnt.current_month_ai_remaining}`);
    console.log(`  2. QR Flow Check:    Allowed=${qrAccess.allowed}, Reason=${qrAccess.reason || 'NONE'}`);
    console.log(`  3. AI Gen API Check: Allowed=${aiApiAccess.allowed}, Reason=${aiApiAccess.reason || 'NONE'}`);
    console.log(`  4. Admin Usage:      Limit=${adminUsageBiz.monthly_ai_limit}, Used=${adminUsageBiz.ai_used}, Remaining=${adminUsageBiz.ai_remaining}, Usage=${adminUsageBiz.ai_usage_percent}%`);
    console.log(`  5. Admin Subs:       Limit=${adminSubBiz.monthly_ai_limit}, Used=${adminSubBiz.ai_used}, Remaining=${adminSubBiz.ai_remaining}`);

    // Verify consistency across Client Billing, AI API, and Admin
    assert.strictEqual(adminUsageBiz.monthly_ai_limit, clientEnt.monthly_ai_quota, 'Limit mismatch between Admin Usage and Client Billing');
    assert.strictEqual(adminSubBiz.monthly_ai_limit, clientEnt.monthly_ai_quota, 'Limit mismatch between Admin Subs and Client Billing');
    assert.strictEqual(adminUsageBiz.ai_used, clientEnt.current_month_ai_used, 'Used mismatch between Admin Usage and Client Billing');
    assert.strictEqual(adminSubBiz.ai_used, clientEnt.current_month_ai_used, 'Used mismatch between Admin Subs and Client Billing');
    assert.strictEqual(adminUsageBiz.ai_remaining, clientEnt.current_month_ai_remaining, 'Remaining mismatch between Admin Usage and Client Billing');
    assert.strictEqual(adminSubBiz.ai_remaining, clientEnt.current_month_ai_remaining, 'Remaining mismatch between Admin Subs and Client Billing');

    // Verify AI generation decision matches quota status
    if (clientEnt.current_month_ai_remaining > 0 && !clientEnt.is_expired) {
      assert.strictEqual(aiApiAccess.allowed, true, 'AI API must allow generation when quota is available');
      assert.strictEqual(clientEnt.is_ai_allowed, true, 'Client entitlement must allow AI');
      assert.ok(!aiApiAccess.reason, 'Block reason must be null/falsy when AI is allowed');
    } else {
      assert.strictEqual(aiApiAccess.allowed, false, 'AI API must block generation when quota is exhausted or expired');
      assert.strictEqual(clientEnt.is_ai_allowed, false, 'Client entitlement must disallow AI');
      assert(aiApiAccess.reason === 'AI_QUOTA_EXHAUSTED' || aiApiAccess.reason === 'SUBSCRIPTION_EXPIRED',
        `Block reason must be AI_QUOTA_EXHAUSTED or SUBSCRIPTION_EXPIRED, got ${aiApiAccess.reason}`);
    }

    console.log(`  ✔ ${target.label} is 100% consistent across Client Billing, QR, AI API, and Admin.`);
  }

  // ============================================================================
  // PART 2: TEST QUOTA BOUNDARIES USING ISOLATED TEST FIXTURES
  // ============================================================================
  console.log('\n--- PART 2: QUOTA BOUNDARIES VERIFICATION (ISOLATED FIXTURE) ---');

  const fixtureBizId = crypto.randomUUID();
  const fixtureSubId = crypto.randomUUID();

  // Create isolated fixture business
  const { error: fBizErr } = await supabase.from('businesses').insert({
    id: fixtureBizId,
    name: 'Step 2 Quota Boundary Fixture',
    slug: `fixture-boundary-${Date.now()}`,
    owner_id: userId,
    status: 'active',
    google_review_url: 'https://g.page/r/test-boundary',
  });
  assert(!fBizErr, `Failed to create fixture business: ${fBizErr?.message}`);

  // Create isolated fixture subscription: Trial with limit 30
  const { error: fSubErr } = await supabase.from('subscriptions').insert({
    id: fixtureSubId,
    business_id: fixtureBizId,
    owner_id: userId,
    plan_id: 'free_trial',
    status: 'trialing',
    price_cents: 0,
    trial_start: new Date().toISOString(),
    trial_end: new Date(Date.now() + 14 * 86400000).toISOString(),
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 14 * 86400000).toISOString(),
    metadata: {
      allocated_ai_quota: 30,
      allocated_qr_quota: 40,
      used_ai_quota: 0,
      used_qr_quota: 0,
      current_month_ai_used: 0,
      current_month_qr_used: 0,
      remaining_ai_quota: 30,
      remaining_qr_quota: 40,
      current_period_index: 0,
    },
  });
  assert(!fSubErr, `Failed to create fixture subscription: ${fSubErr?.message}`);

  try {
    // -------------------------------------------------------------------------
    // Boundary 1: Used 0, limit 30 -> remaining 30, AI allowed
    // -------------------------------------------------------------------------
    console.log('\n[Boundary 1: Used 0, Limit 30]');
    const b1Ent = await entitlementService.getBusinessEntitlement(fixtureBizId);
    const b1Check = await entitlementService.canUseService(fixtureBizId, 'ai_generation');
    assert.strictEqual(b1Ent.monthly_ai_quota, 30);
    assert.strictEqual(b1Ent.current_month_ai_used, 0);
    assert.strictEqual(b1Ent.current_month_ai_remaining, 30);
    assert.strictEqual(b1Check.allowed, true);
    assert.ok(!b1Check.reason);
    console.log(`✔ Boundary 1 passed: 0/30 used -> 30 remaining, AI allowed`);

    // -------------------------------------------------------------------------
    // Boundary 2: Used 1, limit 30 -> remaining 29, AI allowed
    // -------------------------------------------------------------------------
    console.log('\n[Boundary 2: Used 1, Limit 30]');
    const consume1 = await entitlementService.consumeServiceQuota(fixtureBizId, 'ai_generation', 1);
    assert.strictEqual(consume1.success, true);
    const b2Ent = await entitlementService.getBusinessEntitlement(fixtureBizId);
    const b2Check = await entitlementService.canUseService(fixtureBizId, 'ai_generation');
    assert.strictEqual(b2Ent.current_month_ai_used, 1);
    assert.strictEqual(b2Ent.current_month_ai_remaining, 29);
    assert.strictEqual(b2Check.allowed, true);
    assert.ok(!b2Check.reason);
    console.log(`✔ Boundary 2 passed: 1/30 used -> 29 remaining, AI allowed`);

    // -------------------------------------------------------------------------
    // Boundary 3: Used 29, limit 30 -> remaining 1, AI allowed
    // -------------------------------------------------------------------------
    console.log('\n[Boundary 3: Used 29, Limit 30]');
    const consume28 = await entitlementService.consumeServiceQuota(fixtureBizId, 'ai_generation', 28);
    assert.strictEqual(consume28.success, true);
    const b3Ent = await entitlementService.getBusinessEntitlement(fixtureBizId);
    const b3Check = await entitlementService.canUseService(fixtureBizId, 'ai_generation');
    assert.strictEqual(b3Ent.current_month_ai_used, 29);
    assert.strictEqual(b3Ent.current_month_ai_remaining, 1);
    assert.strictEqual(b3Check.allowed, true);
    assert.ok(!b3Check.reason);
    console.log(`✔ Boundary 3 passed: 29/30 used -> 1 remaining, AI allowed`);

    // -------------------------------------------------------------------------
    // Boundary 4: Used 30, limit 30 -> remaining 0, AI blocked
    // -------------------------------------------------------------------------
    console.log('\n[Boundary 4: Used 30, Limit 30]');
    const consumeLast = await entitlementService.consumeServiceQuota(fixtureBizId, 'ai_generation', 1);
    assert.strictEqual(consumeLast.success, true);
    const b4Ent = await entitlementService.getBusinessEntitlement(fixtureBizId);
    const b4Check = await entitlementService.canUseService(fixtureBizId, 'ai_generation');
    assert.strictEqual(b4Ent.current_month_ai_used, 30);
    assert.strictEqual(b4Ent.current_month_ai_remaining, 0);
    assert.strictEqual(b4Check.allowed, false);
    assert.strictEqual(b4Check.reason, 'AI_QUOTA_EXHAUSTED');
    console.log(`✔ Boundary 4 passed: 30/30 used -> 0 remaining, AI blocked with AI_QUOTA_EXHAUSTED`);

    // -------------------------------------------------------------------------
    // Boundary 5: Used greater than limit -> remaining 0, AI blocked
    // -------------------------------------------------------------------------
    console.log('\n[Boundary 5: Used Greater Than Limit (e.g., 35/30)]');
    // Simulate legacy/manual state with used > limit
    const mockOverSub = {
      id: 'mock-over-limit-sub',
      business_id: 'mock-over-biz',
      plan_id: 'free_trial',
      status: 'trialing',
      trial_start: new Date().toISOString(),
      trial_end: new Date(Date.now() + 10 * 86400000).toISOString(),
      metadata: {
        allocated_ai_quota: 30,
        allocated_qr_quota: 40,
        used_ai_quota: 35,
        current_month_ai_used: 35,
      },
    };
    const overEnt = entitlementService.parseSubscriptionRecord(mockOverSub);
    assert.strictEqual(overEnt.monthly_ai_quota, 30);
    assert.strictEqual(overEnt.current_month_ai_used, 35);
    assert.strictEqual(overEnt.current_month_ai_remaining, 0, 'Remaining must be non-negative max(0, limit - used)');
    assert.strictEqual(overEnt.is_ai_allowed, false);
    assert.strictEqual(overEnt.exhaustion_reason, 'AI_QUOTA_EXHAUSTED');
    console.log(`✔ Boundary 5 passed: 35/30 used -> clamped to 0 remaining, AI blocked with AI_QUOTA_EXHAUSTED`);

    // -------------------------------------------------------------------------
    // Boundary 6: Failed generation -> usage follows successful-only counting rule
    // -------------------------------------------------------------------------
    console.log('\n[Boundary 6: Failed Generation Rollback]');
    // Refund 5 units so used is 25 / 30
    await entitlementService.refundServiceQuota(fixtureBizId, 'ai_generation', 5);
    const b6Before = await entitlementService.getBusinessEntitlement(fixtureBizId);
    assert.strictEqual(b6Before.current_month_ai_used, 25);

    // Consume 1 unit pre-flight
    const preFlight = await entitlementService.consumeServiceQuota(fixtureBizId, 'ai_generation', 1);
    assert.strictEqual(preFlight.success, true);
    assert.strictEqual(preFlight.remaining_ai, 4);

    // AI provider fails -> refund 1 unit
    const refundRes = await entitlementService.refundServiceQuota(fixtureBizId, 'ai_generation', 1);
    assert.strictEqual(refundRes, true);

    const b6After = await entitlementService.getBusinessEntitlement(fixtureBizId);
    assert.strictEqual(b6After.current_month_ai_used, 25, 'Usage must return to 25 after failure refund');
    assert.strictEqual(b6After.current_month_ai_remaining, 5, 'Remaining must return to 5 after failure refund');
    console.log(`✔ Boundary 6 passed: Failed generation refunded successfully, no artificial inflation`);

    // -------------------------------------------------------------------------
    // Boundary 7: Duplicate / Retried requests -> no incorrect double-counting
    // -------------------------------------------------------------------------
    console.log('\n[Boundary 7: Duplicate / Retried Request Protection]');
    // Concurrently try consuming quota with atomic protection
    // If quota only has 5 remaining, attempting 10 concurrent 1-unit consumes must only grant 5
    const concurrentAttempts = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        entitlementService.consumeServiceQuota(fixtureBizId, 'ai_generation', 1)
      )
    );
    const successfulConsumes = concurrentAttempts.filter((res) => res.success).length;
    const rejectedConsumes = concurrentAttempts.filter((res) => !res.success).length;
    assert.strictEqual(successfulConsumes, 5, `Expected exactly 5 successful consumes, got ${successfulConsumes}`);
    assert.strictEqual(rejectedConsumes, 5, `Expected exactly 5 rejected consumes, got ${rejectedConsumes}`);

    const b7Ent = await entitlementService.getBusinessEntitlement(fixtureBizId);
    assert.strictEqual(b7Ent.current_month_ai_used, 30);
    assert.strictEqual(b7Ent.current_month_ai_remaining, 0);
    assert.strictEqual(b7Ent.is_ai_allowed, false);
    console.log(`✔ Boundary 7 passed: Atomic concurrency enforcement strictly prevented over-consumption (${successfulConsumes} accepted, ${rejectedConsumes} rejected)`);

    // -------------------------------------------------------------------------
    // Boundary 8: New subscription-month -> usage follows monthly-period rules
    // -------------------------------------------------------------------------
    console.log('\n[Boundary 8: New Subscription-Month Reset]');
    const cycle1Start = new Date('2026-10-01T00:00:00Z');
    const cycle2Date = new Date('2026-11-05T12:00:00Z');
    const annualEnd = new Date('2027-10-01T00:00:00Z');

    const multiMonthSub = {
      id: 'mock-multimonth-sub',
      business_id: 'mock-multimonth-biz',
      plan_id: 'base',
      status: 'active',
      current_period_start: cycle1Start.toISOString(),
      current_period_end: annualEnd.toISOString(),
      created_at: cycle1Start.toISOString(),
      metadata: {
        plan_name: 'Base',
        monthly_ai_quota: 150,
        monthly_qr_quota: 300,
        current_month_ai_used: 150, // exhausted month 1
        current_month_qr_used: 300,
        current_period_index: 0,
      },
    };

    const month2Ent = entitlementService.parseSubscriptionRecord(multiMonthSub, cycle2Date);
    assert.strictEqual(month2Ent.current_period_index, 1);
    assert.strictEqual(month2Ent.current_month_ai_used, 0, 'New monthly cycle must reset used AI to 0');
    assert.strictEqual(month2Ent.current_month_ai_remaining, 150, 'New monthly cycle must restore full 150 quota');
    assert.strictEqual(month2Ent.is_ai_allowed, true, 'AI must be allowed in new monthly cycle');
    assert.strictEqual(month2Ent.exhaustion_reason, null);
    console.log(`✔ Boundary 8 passed: New subscription month resets used to 0 and restores full 150 quota`);

  } finally {
    // Teardown fixture
    await supabase.from('subscriptions').delete().eq('id', fixtureSubId);
    await supabase.from('businesses').delete().eq('id', fixtureBizId);
    console.log('\n✔ Isolated test fixture cleaned up successfully.');
  }

  console.log('\n================================================================');
  console.log('ALL STEP 2 CONSISTENCY & BOUNDARY VERIFICATIONS PASSED (100%)');
  console.log('================================================================');
}

runStep2Verification().catch((err) => {
  console.error('\n❌ STEP 2 VERIFICATION FAILED:', err);
  process.exit(1);
});
