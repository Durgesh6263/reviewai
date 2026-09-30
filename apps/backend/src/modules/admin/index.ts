export * from './types';
export * from './validators';
export * from './service';
export * from './controller';
export { default as adminRoutes } from './routes';

import { AdminService } from './service';
import { SupabaseClient } from '@supabase/supabase-js';

export function createAdminService(supabase: SupabaseClient): AdminService {
  return new AdminService(supabase);
}