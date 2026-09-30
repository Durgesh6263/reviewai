/**
 * Supabase Client Configuration
 * ReviewAI SaaS Platform
 * Provides typed Supabase clients for backend operations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@reviewai/types';

import { env } from './env';

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

/**
 * Service role client - full admin access, bypasses RLS
 * Used for backend operations that need elevated privileges
 */
export const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'reviewai-backend',
      },
    },
  }
);

/**
 * Create a Supabase client with user's access token
 * Used for operations that should respect RLS policies
 */
export function createUserClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Client-Info': 'reviewai-backend-user',
      },
    },
  });
}

/**
 * Create a Supabase client for public/anon operations
 * Used for public endpoints like QR code scanning
 */
export const supabaseAnon: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'reviewai-backend-anon',
      },
    },
  }
);

/**
 * Health check for Supabase connection
 */
export async function checkSupabaseHealth(): Promise<{ healthy: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const { error } = await supabaseAdmin.from('users').select('id').limit(1).single();
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { healthy: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Type-safe wrapper for common operations
 */
export const db = {
  users: supabaseAdmin.from('users'),
  businesses: supabaseAdmin.from('businesses'),
  businessStaff: supabaseAdmin.from('business_staff'),
  qrCodes: supabaseAdmin.from('qr_codes'),
  scanLogs: supabaseAdmin.from('scan_logs'),
  reviewSessions: supabaseAdmin.from('review_sessions'),
  generatedReviews: supabaseAdmin.from('generated_reviews'),
  subscriptions: supabaseAdmin.from('subscriptions'),
  invoices: supabaseAdmin.from('invoices'),
  usageLogs: supabaseAdmin.from('usage_logs'),
  auditLogs: supabaseAdmin.from('audit_logs'),
  apiKeys: supabaseAdmin.from('api_keys'),
  webhookEvents: supabaseAdmin.from('webhook_events'),
} as const;