-- ============================================================================
-- ReviewAI - Migration 010: Plan Versioning, Total Quotas & Atomic Entitlement
-- Supabase PostgreSQL Migration
-- Version: 2.0.0
-- ============================================================================

-- 1. Ensure subscriptions table supports plan versioning and total non-resetting quotas
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_version_id VARCHAR(100);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS duration_months INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price_inr INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS total_qr_quota INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS total_ai_quota INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS used_qr INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS used_ai INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS exhaustion_reason VARCHAR(100);

-- 2. Drop legacy single-subscription-per-business restriction if present
-- to allow preserving complete historical records across renewals/upgrades
DO $$
BEGIN
    ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_business_id_key;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- 3. Create partial unique index ensuring at most one ACTIVE or TRIALING subscription per business
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_unique
ON subscriptions (business_id)
WHERE status IN ('active', 'trialing');

-- 4. Create index on status and end_date for fast entitlement and expiry lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_end_date
ON subscriptions (business_id, status, current_period_end);

-- 5. Backfill first-class columns from existing metadata where present
UPDATE subscriptions
SET 
    plan_version_id = COALESCE(plan_version_id, metadata->>'plan_version_id', 'v1'),
    duration_months = COALESCE(duration_months, (metadata->>'duration_months')::integer, 6),
    price_inr = COALESCE(price_inr, (metadata->>'price_inr')::integer, price_cents / 100),
    total_qr_quota = COALESCE(total_qr_quota, (metadata->>'allocated_qr_quota')::integer, (metadata->>'total_qr_quota')::integer, 900),
    total_ai_quota = COALESCE(total_ai_quota, (metadata->>'allocated_ai_quota')::integer, (metadata->>'total_ai_quota')::integer, 450),
    used_qr = COALESCE(used_qr, (metadata->>'used_qr_quota')::integer, (metadata->>'used_qr')::integer, 0),
    used_ai = COALESCE(used_ai, (metadata->>'used_ai_quota')::integer, (metadata->>'used_ai')::integer, 0),
    start_date = COALESCE(start_date, current_period_start, trial_start, created_at),
    end_date = COALESCE(end_date, current_period_end, trial_end),
    exhaustion_reason = COALESCE(exhaustion_reason, metadata->>'exhaustion_reason')
WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb;
