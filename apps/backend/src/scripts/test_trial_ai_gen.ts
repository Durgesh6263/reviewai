import { entitlementService } from '../modules/subscription/entitlement';
import { reviewService } from '../modules/review/service';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function testTrialAIGeneration() {
  // Let's find all businesses that have a free trial
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('*, businesses(*)')
    .eq('plan_id', 'free_trial');

  console.log(`Found ${subs?.length} free trial subscriptions.\n`);

  for (const s of (subs || [])) {
    const biz = s.businesses;
    if (!biz) continue;

    console.log(`--------------------------------------------------`);
    console.log(`Trial Biz: ${biz.name} (slug: ${biz.slug}) [${biz.id}]`);
    console.log(`Sub status: ${s.status}, sub ID: ${s.id}`);
    console.log(`Metadata: used_ai_quota=${s.metadata?.used_ai_quota}, remaining_ai_quota=${s.metadata?.remaining_ai_quota}`);

    const ent = await entitlementService.getBusinessEntitlement(biz.id);
    console.log(`Entitlement: monthly_ai_limit=${ent.monthly_ai_limit}, used_ai=${ent.used_ai}, remaining_ai=${ent.remaining_ai}, is_ai_allowed=${ent.is_ai_allowed}, exhaustion_reason=${ent.exhaustion_reason}`);

    const canAi = await entitlementService.canUseService(biz.id, 'ai_generation');
    console.log(`canUseService(ai_generation): allowed=${canAi.allowed}, reason=${canAi.reason}, message=${canAi.message}`);

    // Try starting a session and generating a review
    try {
      const session = await reviewService.createSession({
        business_id: biz.id,
        qr_code_id: 'test-qr',
        rating: 5,
        language: 'en',
      });
      console.log(`Session created: ${session.id}, biz_id in session: ${session.business_id}`);

      // Now test generateReview
      // (Using a dry run or checking if it would pass limit check)
      const canUse = await entitlementService.canUseService(session.business_id, 'ai_generation');
      console.log(`generateReview check: canUse=${canUse.allowed}, reason=${canUse.reason}`);
    } catch (err: any) {
      console.log(`Error in trial flow:`, err.message, err.code);
    }
  }
}

testTrialAIGeneration().catch(console.error);
