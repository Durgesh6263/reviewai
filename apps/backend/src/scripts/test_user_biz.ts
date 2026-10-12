import { entitlementService } from '../modules/subscription/entitlement';
import { subscriptionController } from '../modules/subscription/controller';
import { adminService } from '../modules/admin/service';
import { qrService } from '../modules/qr/service';
import { reviewService } from '../modules/review/service';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function testUser() {
  const userId = '43c94316-cbfa-4599-8ed9-ff52dec73f23';

  const { data: userBusinesses } = await supabase
    .from('businesses')
    .select('id, name, slug, status, owner_id')
    .eq('owner_id', userId);

  console.log('=== BUSINESSES OWNED BY USER ===');
  for (const b of (userBusinesses || [])) {
    const { data: qrs } = await supabase
      .from('qr_codes')
      .select('id, slug, is_active')
      .eq('business_id', b.id);

    console.log(`\n-----------------------------------------`);
    console.log(`Business: ${b.name} (slug: ${b.slug}) [${b.id}]`);
    console.log(`QR codes:`, qrs);

    // 1. Client Billing perspective
    const ent = await entitlementService.getBusinessEntitlement(b.id);
    console.log('Billing/Entitlement View:', {
      plan_name: ent.plan_name,
      status: ent.status,
      is_trial: ent.is_trial,
      is_expired: ent.is_expired,
      is_ai_allowed: ent.is_ai_allowed,
      is_qr_allowed: ent.is_qr_allowed,
      ai_limit: ent.monthly_ai_quota,
      ai_used: ent.current_month_ai_used,
      ai_remaining: ent.current_month_ai_remaining,
      exhaustion_reason: ent.exhaustion_reason,
    });

    // 2. Public QR scan check
    const canQr = await entitlementService.canUseService(b.id, 'qr_scan');
    console.log('Public QR scan check:', canQr);

    // 3. AI generation check
    const canAi = await entitlementService.canUseService(b.id, 'ai_generation');
    console.log('AI generation check:', canAi);

    // 4. Test actual reviewService.checkReviewGenerationLimit
    try {
      await (reviewService as any).checkReviewGenerationLimit(b.id);
      console.log('checkReviewGenerationLimit: ALLOWED');
    } catch (err: any) {
      console.log('checkReviewGenerationLimit: BLOCKED ->', err.message, err.code);
    }
  }
}

testUser().catch(console.error);
