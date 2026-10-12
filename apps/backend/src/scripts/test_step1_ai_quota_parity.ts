import assert from 'assert';
import { entitlementService, calculateUsagePeriod } from '../modules/subscription/entitlement';
import { AdminService } from '../modules/admin/service';
import { reviewService } from '../modules/review/service';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
const adminService = new AdminService(supabase);

async function runStep1Tests() {
  console.log('================================================================');
  console.log('STEP 1 — AI QUOTA USAGE MISMATCH VERIFICATION SUITE');
  console.log('================================================================\n');

  // ----------------------------------------------------------------
  // TEST A: Trial limit 30, used 0 -> remaining 30, AI allowed
  // ----------------------------------------------------------------
  console.log('--- TEST A: Trial limit 30, used 0 -> remaining 30, AI allowed ---');
  const mockSubA = {
    id: 'mock-sub-a',
    business_id: 'mock-biz-a',
    plan_id: 'free_trial',
    status: 'trialing',
    created_at: new Date().toISOString(),
    trial_start: new Date().toISOString(),
    trial_end: new Date(Date.now() + 10 * 86400000).toISOString(),
    metadata: {
      allocated_ai_quota: 30,
      allocated_qr_quota: 40,
      used_ai_quota: 0,
      used_qr_quota: 0,
      current_month_ai_used: 0,
      current_month_qr_used: 0,
    },
  };
  const entA = entitlementService.parseSubscriptionRecord(mockSubA);
  assert.strictEqual(entA.monthly_ai_quota, 30, 'Test A: Monthly AI limit must be 30');
  assert.strictEqual(entA.current_month_ai_used, 0, 'Test A: Used AI must be 0');
  assert.strictEqual(entA.current_month_ai_remaining, 30, 'Test A: Remaining AI must be 30');
  assert.strictEqual(entA.is_ai_allowed, true, 'Test A: AI must be allowed');
  assert.strictEqual(entA.block_reason, null, 'Test A: Block reason must be null');
  console.log('✔ TEST A PASSED: Trial 0/30 used -> 30 remaining, AI allowed\n');

  // ----------------------------------------------------------------
  // TEST B: One successful generation -> used 1, remaining 29
  // ----------------------------------------------------------------
  console.log('--- TEST B: One successful generation -> used 1, remaining 29 ---');
  const mockSubB = {
    ...mockSubA,
    metadata: {
      ...mockSubA.metadata,
      used_ai_quota: 1,
      current_month_ai_used: 1,
    },
  };
  const entB = entitlementService.parseSubscriptionRecord(mockSubB);
  assert.strictEqual(entB.monthly_ai_quota, 30, 'Test B: Monthly AI limit must be 30');
  assert.strictEqual(entB.current_month_ai_used, 1, 'Test B: Used AI must be 1');
  assert.strictEqual(entB.current_month_ai_remaining, 29, 'Test B: Remaining AI must be 29');
  assert.strictEqual(entB.is_ai_allowed, true, 'Test B: AI must be allowed');
  assert.strictEqual(entB.block_reason, null, 'Test B: Block reason must be null');
  console.log('✔ TEST B PASSED: 1/30 used -> 29 remaining, AI allowed\n');

  // ----------------------------------------------------------------
  // TEST C: Failed generation -> usage does not increase incorrectly
  // ----------------------------------------------------------------
  console.log('--- TEST C: Failed generation -> refunded, usage does not increase ---');
  // Create an ephemeral test business & subscription to test atomic CAS consume & rollback
  const tempBizId = crypto.randomUUID();
  const tempSubId = crypto.randomUUID();
  const { error: insBizErr } = await supabase.from('businesses').insert({
    id: tempBizId,
    name: 'Temporary Test Business',
    slug: `temp-test-${Date.now()}`,
    owner_id: '43c94316-cbfa-4599-8ed9-ff52dec73f23',
    status: 'active',
    google_review_url: 'https://g.page/r/test-review',
  });
  assert(!insBizErr, `Failed to insert temp business: ${insBizErr?.message}`);

  const { error: insSubErr } = await supabase.from('subscriptions').insert({
    id: tempSubId,
    business_id: tempBizId,
    owner_id: '43c94316-cbfa-4599-8ed9-ff52dec73f23',
    plan_id: 'free_trial',
    status: 'trialing',
    price_cents: 0,
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 10 * 86400000).toISOString(),
    metadata: {
      allocated_ai_quota: 30,
      allocated_qr_quota: 40,
      used_ai_quota: 5,
      current_month_ai_used: 5,
      remaining_ai_quota: 25,
      remaining_qr_quota: 40,
      current_period_index: 0,
    },
  });
  assert(!insSubErr, `Failed to insert temp subscription: ${insSubErr?.message}`);

  try {
    const beforeEnt = await entitlementService.getBusinessEntitlement(tempBizId);
    assert.strictEqual(beforeEnt.current_month_ai_used, 5, 'Baseline used AI must be 5');

    // 1. Consume 1 unit for in-flight generation
    const consumeRes = await entitlementService.consumeServiceQuota(tempBizId, 'ai_generation', 1);
    assert.strictEqual(consumeRes.success, true, 'Consume quota must succeed');
    assert.strictEqual(consumeRes.remaining_ai, 24, 'Remaining AI after consume must be 24');

    // 2. Simulate failure during AI provider generation -> refund
    const refundSuccess = await entitlementService.refundServiceQuota(tempBizId, 'ai_generation', 1);
    assert.strictEqual(refundSuccess, true, 'Refund must succeed');

    const afterRefundEnt = await entitlementService.getBusinessEntitlement(tempBizId);
    assert.strictEqual(afterRefundEnt.current_month_ai_used, 5, 'After refund, used AI must roll back to 5');
    assert.strictEqual(afterRefundEnt.current_month_ai_remaining, 25, 'After refund, remaining AI must roll back to 25');
    console.log('✔ TEST C PASSED: Failed generation refunded successfully, usage was not inflated\n');

    // ----------------------------------------------------------------
    // TEST D: Used equals limit -> AI blocked
    // ----------------------------------------------------------------
    console.log('--- TEST D: Used equals limit -> AI blocked ---');
    // Consume remaining 25 units to reach limit (30/30)
    const consumeAll = await entitlementService.consumeServiceQuota(tempBizId, 'ai_generation', 25);
    assert.strictEqual(consumeAll.success, true, 'Consuming to limit must succeed');
    assert.strictEqual(consumeAll.remaining_ai, 0, 'Remaining must be 0');

    const exhaustedEnt = await entitlementService.getBusinessEntitlement(tempBizId);
    assert.strictEqual(exhaustedEnt.current_month_ai_used, 30, 'Used must be 30');
    assert.strictEqual(exhaustedEnt.current_month_ai_remaining, 0, 'Remaining must be 0');
    assert.strictEqual(exhaustedEnt.is_ai_allowed, false, 'AI must NOT be allowed');
    assert.strictEqual(exhaustedEnt.exhaustion_reason, 'AI_QUOTA_EXHAUSTED', 'Reason must be AI_QUOTA_EXHAUSTED');

    const canUseCheck = await entitlementService.canUseService(tempBizId, 'ai_generation');
    assert.strictEqual(canUseCheck.allowed, false, 'canUseService must reject exhausted quota');
    assert.strictEqual(canUseCheck.reason, 'AI_QUOTA_EXHAUSTED', 'canUseService reason must be AI_QUOTA_EXHAUSTED');

    // Attempting to consume beyond limit must fail
    const overConsume = await entitlementService.consumeServiceQuota(tempBizId, 'ai_generation', 1);
    assert.strictEqual(overConsume.allowed, false, 'Over-consumption must be blocked');
    assert.strictEqual(overConsume.reason, 'AI_QUOTA_EXHAUSTED', 'Over-consumption reason must be AI_QUOTA_EXHAUSTED');
    console.log('✔ TEST D PASSED: 30/30 used strictly blocks AI access with AI_QUOTA_EXHAUSTED\n');

    // ----------------------------------------------------------------
    // TEST E: Used below limit -> AI is not blocked
    // ----------------------------------------------------------------
    console.log('--- TEST E: Used below limit -> AI is not blocked ---');
    // Refund 1 unit back so used is 29 / 30
    const refundOne = await entitlementService.refundServiceQuota(tempBizId, 'ai_generation', 1);
    assert.strictEqual(refundOne, true, 'Refund 1 unit must succeed');

    const belowLimitEnt = await entitlementService.getBusinessEntitlement(tempBizId);
    assert.strictEqual(belowLimitEnt.current_month_ai_used, 29, 'Used must be 29');
    assert.strictEqual(belowLimitEnt.current_month_ai_remaining, 1, 'Remaining must be 1');
    assert.strictEqual(belowLimitEnt.is_ai_allowed, true, 'AI must be allowed when below limit');
    assert.strictEqual(belowLimitEnt.exhaustion_reason, null, 'Exhaustion reason must be cleared');

    const canUseBelow = await entitlementService.canUseService(tempBizId, 'ai_generation');
    assert.strictEqual(canUseBelow.allowed, true, 'canUseService must allow when remaining > 0');
    console.log('✔ TEST E PASSED: Used below limit (29/30) is not blocked and clears exhaustion reason\n');

  } finally {
    // Cleanup temporary test data
    await supabase.from('subscriptions').delete().eq('id', tempSubId);
    await supabase.from('businesses').delete().eq('id', tempBizId);
  }

  // ----------------------------------------------------------------
  // TEST F: New monthly period -> usage follows existing reset rules
  // ----------------------------------------------------------------
  console.log('--- TEST F: New monthly period -> usage resets per rules ---');
  const period1Start = new Date('2026-10-01T00:00:00Z');
  const period1End = new Date('2026-10-31T23:59:59Z');
  const period2Date = new Date('2026-11-05T12:00:00Z');
  const expiryDate = new Date('2027-04-01T00:00:00Z');

  const paidSubForReset = {
    id: 'mock-paid-reset',
    business_id: 'mock-biz-reset',
    plan_id: 'base',
    status: 'active',
    current_period_start: period1Start.toISOString(),
    current_period_end: expiryDate.toISOString(),
    created_at: period1Start.toISOString(),
    metadata: {
      plan_name: 'Base',
      monthly_ai_quota: 150,
      monthly_qr_quota: 300,
      current_month_ai_used: 150, // exhausted in Period 1
      current_month_qr_used: 200,
      current_period_index: 0, // Period 1
    },
  };

  const period2Ent = entitlementService.parseSubscriptionRecord(paidSubForReset, period2Date);
  assert.strictEqual(period2Ent.current_period_index, 1, 'Period index must be 1 in second month');
  assert.strictEqual(period2Ent.current_month_ai_used, 0, 'New monthly period must reset used AI to 0');
  assert.strictEqual(period2Ent.current_month_ai_remaining, 150, 'New monthly period must restore remaining AI to limit');
  assert.strictEqual(period2Ent.is_ai_allowed, true, 'AI must be allowed in new monthly period');
  assert.strictEqual(period2Ent.exhaustion_reason, null, 'Exhaustion reason must be null in new period');
  console.log('✔ TEST F PASSED: New monthly period resets usage to 0 and restores full quota\n');

  // ----------------------------------------------------------------
  // TEST G: Admin and client show identical usage for the same business/period
  // ----------------------------------------------------------------
  console.log('--- TEST G: Admin and client show identical usage for the same business/period ---');
  const testBizIds = [
    { id: '88d2da14-f37b-46b9-95af-51379d92fd6a', name: 'the hven cafe' },
    { id: '26f4fed2-a4e6-49bb-831f-86adba4f7663', name: 'Test' },
  ];

  const adminUsageList = await adminService.getUserWiseUsage({});
  const adminSubsStats = await adminService.getSubscriptionStats({});

  for (const { id, name } of testBizIds) {
    const clientEnt = await entitlementService.getBusinessEntitlement(id);

    // 1. Locate in Admin User-Wise Usage
    let adminUsageBiz: any = null;
    for (const u of adminUsageList) {
      const match = u.businesses.find(b => b.id === id);
      if (match) {
        adminUsageBiz = match;
        break;
      }
    }
    assert(adminUsageBiz, `Business ${name} must be found in Admin Usage`);

    // 2. Locate in Admin Subscriptions Stats
    let adminSubBiz: any = null;
    for (const u of adminSubsStats.user_subscriptions) {
      const match = (u.businesses || []).find((b: any) => b.id === id);
      if (match) {
        adminSubBiz = match;
        break;
      }
    }
    assert(adminSubBiz, `Business ${name} must be found in Admin Subscriptions`);

    // Verify EXACT Parity across all three surfaces
    assert.strictEqual(adminUsageBiz.monthly_ai_limit, clientEnt.monthly_ai_quota, `${name}: Admin Usage limit must match Client Entitlement`);
    assert.strictEqual(adminSubBiz.monthly_ai_limit, clientEnt.monthly_ai_quota, `${name}: Admin Subs limit must match Client Entitlement`);

    assert.strictEqual(adminUsageBiz.ai_used, clientEnt.current_month_ai_used, `${name}: Admin Usage used must match Client Entitlement`);
    assert.strictEqual(adminSubBiz.ai_used, clientEnt.current_month_ai_used, `${name}: Admin Subs used must match Client Entitlement`);

    assert.strictEqual(adminUsageBiz.ai_remaining, clientEnt.current_month_ai_remaining, `${name}: Admin Usage remaining must match Client Entitlement`);
    assert.strictEqual(adminSubBiz.ai_remaining, clientEnt.current_month_ai_remaining, `${name}: Admin Subs remaining must match Client Entitlement`);

    console.log(`✔ Parity verified for "${name}" (${id}):`);
    console.log(`  - Limit:     Client ${clientEnt.monthly_ai_quota} == Admin Usage ${adminUsageBiz.monthly_ai_limit} == Admin Subs ${adminSubBiz.monthly_ai_limit}`);
    console.log(`  - Used:      Client ${clientEnt.current_month_ai_used} == Admin Usage ${adminUsageBiz.ai_used} == Admin Subs ${adminSubBiz.ai_used}`);
    console.log(`  - Remaining: Client ${clientEnt.current_month_ai_remaining} == Admin Usage ${adminUsageBiz.ai_remaining} == Admin Subs ${adminSubBiz.ai_remaining}`);
  }
  console.log('✔ TEST G PASSED: Client Billing, Entitlement, Admin Usage, and Admin Subscriptions agree 100%\n');

  // ----------------------------------------------------------------
  // AFFECTED ACCOUNT VERIFICATION (43c94316-cbfa-4599-8ed9-ff52dec73f23)
  // ----------------------------------------------------------------
  console.log('--- AFFECTED ACCOUNT VERIFICATION (User 43c94316-cbfa-4599-8ed9-ff52dec73f23) ---');
  const userId = '43c94316-cbfa-4599-8ed9-ff52dec73f23';
  const { data: userBusinesses } = await supabase
    .from('businesses')
    .select('id, name, slug, status, created_at')
    .eq('owner_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  console.log(`User owns ${userBusinesses?.length || 0} active/registered businesses:`);
  for (const b of (userBusinesses || [])) {
    const ent = await entitlementService.getBusinessEntitlement(b.id);
    const canAi = await entitlementService.canUseService(b.id, 'ai_generation');
    console.log(`- Business: "${b.name}" [${b.id}]`);
    console.log(`  Plan: ${ent.plan_name} (${ent.status})`);
    console.log(`  Monthly AI Quota: ${ent.monthly_ai_quota}`);
    console.log(`  Current Month Used: ${ent.current_month_ai_used}`);
    console.log(`  Remaining AI: ${ent.current_month_ai_remaining}`);
    console.log(`  Exhaustion Reason: ${ent.exhaustion_reason || 'NONE'}`);
    console.log(`  AI Generation Permitted: ${canAi.allowed}`);
  }

  console.log('\n================================================================');
  console.log('ALL STEP 1 TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runStep1Tests().catch((err) => {
  console.error('\n❌ STEP 1 TEST FAILURE:', err);
  process.exit(1);
});
