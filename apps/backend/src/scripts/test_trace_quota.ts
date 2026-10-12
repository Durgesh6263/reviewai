import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { createClient } from '@supabase/supabase-js';
import { entitlementService } from '../modules/subscription/entitlement';
import { reviewService } from '../modules/review/service';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, slug, status, owner_id');

  console.log(`Checking ${businesses?.length} businesses...\n`);

  for (const b of (businesses || [])) {
    const ent = await entitlementService.getBusinessEntitlement(b.id);
    const canAi = await entitlementService.canUseService(b.id, 'ai_generation');
    const canQr = await entitlementService.canUseService(b.id, 'qr_scan');

    // Check if there is any mismatch: e.g., remaining_ai > 0 but canAi.allowed is false!
    const isMismatch = (ent.remaining_ai > 0 || ent.current_month_ai_remaining > 0) && !canAi.allowed;

    if (isMismatch || ent.is_trial || b.slug === 'the-fitness-world' || b.name.toLowerCase().includes('fitness')) {
      console.log(`=== Business: ${b.name} (${b.slug}) [${b.id}] ===`);
      console.log(`Plan: ${ent.plan_name} | Status: ${ent.status} | IsTrial: ${ent.is_trial} | IsExpired: ${ent.is_expired}`);
      console.log(`AI Allowed: ${ent.is_ai_allowed} | QR Allowed: ${ent.is_qr_allowed}`);
      console.log(`AI Limit: ${ent.monthly_ai_quota} | AI Used: ${ent.current_month_ai_used} | AI Remaining: ${ent.current_month_ai_remaining}`);
      console.log(`Total AI Quota: ${ent.total_ai_quota} | Used AI: ${ent.used_ai} | Remaining AI: ${ent.remaining_ai}`);
      console.log(`canUseService(ai_generation): allowed=${canAi.allowed}, reason=${canAi.reason}, message=${canAi.message}`);
      console.log(`canUseService(qr_scan): allowed=${canQr.allowed}, reason=${canQr.reason}, message=${canQr.message}`);
      console.log(`Entitlement Block Reason: ${ent.block_reason}`);
      console.log(`Exhaustion Reason: ${ent.exhaustion_reason}`);
      console.log('Features:', JSON.stringify(ent.features));
      console.log('--------------------------------------------------\n');
    }
  }
}

main().catch(console.error);
