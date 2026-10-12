import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const { data: businesses, error: bErr } = await supabase
    .from('businesses')
    .select('id, name, slug, status, owner_id');
  if (bErr) {
    console.error('Error fetching businesses:', bErr);
    return;
  }
  console.log('--- BUSINESSES ---');
  console.log(businesses);

  const { data: subs, error: sErr } = await supabase
    .from('subscriptions')
    .select('id, business_id, status, plan_id, trial_start, trial_end, current_period_start, current_period_end, metadata');
  if (sErr) {
    console.error('Error fetching subscriptions:', sErr);
    return;
  }
  console.log('\n--- SUBSCRIPTIONS ---');
  for (const s of (subs || [])) {
    console.log(`\nSub ID: ${s.id} | Biz ID: ${s.business_id} | Status: ${s.status} | Plan: ${s.plan_id}`);
    console.log('Metadata:', JSON.stringify(s.metadata, null, 2));
  }
}

main().catch(console.error);
