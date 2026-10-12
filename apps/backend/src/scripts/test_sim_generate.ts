import { entitlementService } from '../modules/subscription/entitlement';
import { ReviewService } from '../modules/review/service';
import { AIProviderFactory } from '../modules/review/ai/factory';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const aiFactory = new AIProviderFactory({});
const reviewService = new ReviewService(supabase, aiFactory);

async function testGenerate() {
  const bizIds = [
    { name: 'the-fitness-world', id: 'a3536170-6699-4816-aa79-6cc7c2351a49' },
    { name: 'the-hven-cafe', id: '88d2da14-f37b-46b9-95af-51379d92fd6a' },
    { name: 'Test (Trial 0/30)', id: '26f4fed2-a4e6-49bb-831f-86adba4f7663' },
  ];

  for (const b of bizIds) {
    console.log(`\n========================================`);
    console.log(`Testing Business: ${b.name} [${b.id}]`);

    // Check entitlement first
    const ent = await entitlementService.getBusinessEntitlement(b.id);
    console.log(`Entitlement Status: ${ent.status}, Plan: ${ent.plan_name}, IsTrial: ${ent.is_trial}, IsExpired: ${ent.is_expired}`);
    console.log(`Monthly AI Limit: ${ent.monthly_ai_limit}, Used AI: ${ent.used_ai}, Remaining AI: ${ent.remaining_ai}`);
    console.log(`Exhaustion Reason: ${ent.exhaustion_reason}`);

    // Check canUseService
    const canAi = await entitlementService.canUseService(b.id, 'ai_generation');
    console.log(`canUseService(ai_generation): allowed=${canAi.allowed}, reason=${canAi.reason}, message=${canAi.message}`);

    // Create session
    try {
      const session = await reviewService.createSession({
        business_id: b.id,
        qr_code_id: 'test-qr',
        rating: 5,
        language: 'en',
      });
      console.log(`Session created: id=${session.id}, biz_id=${session.business_id}`);

      // Call generateReview
      const result = await reviewService.generateReview({
        session_id: session.id,
        business_id: b.id,
        rating: 5,
        language: 'en',
      });
      console.log(`generateReview SUCCESS: generated_text="${result.generated_text?.slice(0, 50)}..."`);
    } catch (err: any) {
      console.log(`generateReview FAILED: status=${err.statusCode || err.status}, code=${err.code}, message="${err.message}"`);
    }
  }
}

testGenerate().catch(console.error);
