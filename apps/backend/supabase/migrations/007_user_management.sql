-- ============================================================================
-- ReviewAI - Migration 007: User / Client Management & Account Status
-- ============================================================================

-- 1. Add account_status column to users table
DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status varchar(20) NOT NULL DEFAULT 'active';
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- 2. Add check constraint for valid status values
DO $$ BEGIN
    ALTER TABLE users ADD CONSTRAINT check_user_account_status CHECK (account_status IN ('active', 'deactivated'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Create indexes for high performance user-level queries
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_business_id ON review_sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_generated_reviews_business_id ON generated_reviews(business_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_business_id ON scan_logs(business_id);
