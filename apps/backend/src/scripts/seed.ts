/**
 * Database Seed Script for Development / Local Testing
 * 
 * SAFETY GUARD:
 * Seed execution is strictly prohibited in production environments.
 * It must never insert demo or fake review/business data into a live production database.
 */

import { supabaseAdmin } from '../config/supabase';

async function runSeed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ CRITICAL SAFETY ERROR: Database seed script is blocked in PRODUCTION.');
    console.error('Demo data must never be inserted into production databases.');
    process.exit(1);
  }

  console.log('🌱 Starting development seed...');
  console.log('✅ Environment verified as non-production (NODE_ENV != production).');

  // Verify Supabase connection
  const { data: _healthCheck, error } = await supabaseAdmin.from('users').select('id').limit(1);
  if (error && error.code !== 'PGRST116') {
    console.error('❌ Database connection error during seed check:', error.message);
    process.exit(1);
  }

  console.log('ℹ️ Development seed complete. No mock or demo review records were forced.');
}

runSeed().catch((err) => {
  console.error('Seed script encountered an error:', err);
  process.exit(1);
});
