import { entitlementService } from '../modules/subscription/entitlement';
import { AdminService } from '../modules/admin/service';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
const adminService = new AdminService(supabase);

async function main() {
  const adminSubs = await adminService.getSubscriptionStats({});
  console.log('\n=== Admin Subscription Stats for user ===');
  for (const u of (adminSubs.user_subscriptions || [])) {
    if (u.user_id === '43c94316-cbfa-4599-8ed9-ff52dec73f23') {
      console.log('User overall subscription stats:', {
        user_name: u.user_name,
        email: u.email,
        plan: u.plan,
        subscription_status: u.subscription_status,
        monthly_ai_limit: u.monthly_ai_limit,
        ai_used: u.ai_used,
        ai_remaining: u.ai_remaining,
        ai_usage_percent: u.ai_usage_percent
      });
      for (const b of (u.businesses || [])) {
        console.log('Admin sub biz detail:', {
          id: b.id,
          name: b.name,
          plan: b.plan,
          status: b.status,
          monthly_ai_limit: b.monthly_ai_limit,
          ai_used: b.ai_used,
          ai_remaining: b.ai_remaining,
          ai_usage_percent: b.ai_usage_percent
        });
      }
    }
  }
}

main().catch(console.error);
