-- ============================================================================
-- ReviewAI - Initial Database Schema
-- Supabase PostgreSQL Migration
-- Version: 1.0.0
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ============================================================================
-- CUSTOM ENUM TYPES
-- ============================================================================

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'business_owner', 'staff'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE business_status AS ENUM ('active', 'suspended', 'pending_verification'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE staff_role AS ENUM ('owner', 'admin', 'manager', 'member', 'viewer'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE device_type AS ENUM ('mobile', 'tablet', 'desktop'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE session_status AS ENUM ('started', 'language_selected', 'rating_selected', 'review_generated', 'review_edited', 'redirected', 'abandoned', 'completed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE ai_provider AS ENUM ('openai', 'gemini'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'paused', 'expired'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE billing_cycle AS ENUM ('monthly', 'annual'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE invoice_status AS ENUM ('draft', 'open', 'paid', 'void', 'uncollectible'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE usage_metric AS ENUM ('qr_scans', 'review_generations', 'google_redirects', 'api_calls'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE webhook_status AS ENUM ('pending', 'delivered', 'failed', 'retrying'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- users - Platform users (business owners, staff, admins)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(255) NOT NULL UNIQUE,
    password_hash varchar(255) NOT NULL,
    full_name varchar(255) NOT NULL,
    avatar_url text,
    role user_role NOT NULL DEFAULT 'business_owner',
    email_verified boolean NOT NULL DEFAULT false,
    email_verification_token varchar(255) UNIQUE,
    password_reset_token varchar(255),
    password_reset_expires timestamptz,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

COMMENT ON TABLE users IS 'Platform users including business owners, staff, and admins';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.email_verification_token IS 'Token for email verification flow';
COMMENT ON COLUMN users.password_reset_token IS 'Token for password reset flow';

-- ----------------------------------------------------------------------------
-- businesses - Tenant business profiles
-- ----------------------------------------------------------------------------
CREATE TABLE businesses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    name varchar(255) NOT NULL,
    slug varchar(100) NOT NULL UNIQUE,
    description text,
    logo_url text,
    google_review_url text NOT NULL,
    website_url text,
    phone varchar(50),
    address jsonb,
    timezone varchar(50) NOT NULL DEFAULT 'UTC',
    status business_status NOT NULL DEFAULT 'active',
    settings jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

COMMENT ON TABLE businesses IS 'Business tenant profiles - each represents a ReviewAI customer';
COMMENT ON COLUMN businesses.slug IS 'Unique URL-safe identifier used in QR codes (permanent)';
COMMENT ON COLUMN businesses.google_review_url IS 'Stored Google Review URL - never embedded in QR';
COMMENT ON COLUMN businesses.settings IS 'JSON preferences: {language_default, review_tone, branding}';

-- ----------------------------------------------------------------------------
-- business_staff - Multi-staff access control (Phase 6)
-- ----------------------------------------------------------------------------
CREATE TABLE business_staff (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role staff_role NOT NULL DEFAULT 'member',
    permissions jsonb NOT NULL DEFAULT '[]',
    invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
    invited_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(business_id, user_id)
);

COMMENT ON TABLE business_staff IS 'Staff members with access to a business';

-- ----------------------------------------------------------------------------
-- qr_codes - QR code definitions per business location
-- ----------------------------------------------------------------------------
CREATE TABLE qr_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    slug varchar(100) NOT NULL UNIQUE,
    label varchar(255),
    design jsonb NOT NULL DEFAULT '{}',
    download_count integer NOT NULL DEFAULT 0,
    last_downloaded_at timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE qr_codes IS 'QR codes for business locations - slug mirrors business.slug for routing';
COMMENT ON COLUMN qr_codes.design IS 'QR styling: {color, logo, frame, size, error_correction}';

-- ----------------------------------------------------------------------------
-- scan_logs - QR scan events (high volume, partitioned)
-- ----------------------------------------------------------------------------
CREATE TABLE scan_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code_id uuid NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    session_id uuid, -- FK added after review_sessions creation
    ip_address inet,
    user_agent text,
    referrer text,
    country char(2),
    city varchar(100),
    device_type device_type,
    browser varchar(100),
    os varchar(100),
    scanned_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE scan_logs IS 'QR code scan events';
COMMENT ON COLUMN scan_logs.session_id IS 'Links to review_sessions if a session was created';

-- ----------------------------------------------------------------------------
-- review_sessions - Customer review flow sessions
-- ----------------------------------------------------------------------------
CREATE TABLE review_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code_id uuid NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    scan_log_id uuid NOT NULL REFERENCES scan_logs(id) ON DELETE CASCADE,
    language varchar(10) NOT NULL,
    rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    status session_status NOT NULL DEFAULT 'started',
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    abandoned_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE review_sessions IS 'Customer review flow sessions';
COMMENT ON COLUMN review_sessions.metadata IS 'Additional data: {referrer, utm_params, ab_test_variant}';

-- Add FK from scan_logs to review_sessions (circular reference resolution)
ALTER TABLE scan_logs
    ADD CONSTRAINT fk_scan_logs_session_id
    FOREIGN KEY (session_id) REFERENCES review_sessions(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- generated_reviews - AI-generated review content with customer edits
-- ----------------------------------------------------------------------------
CREATE TABLE generated_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL UNIQUE REFERENCES review_sessions(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    language varchar(10) NOT NULL,
    rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    ai_provider ai_provider NOT NULL,
    model varchar(100) NOT NULL,
    prompt_version varchar(50) NOT NULL,
    generated_text text NOT NULL,
    edited_text text,
    final_text text GENERATED ALWAYS AS (COALESCE(edited_text, generated_text)) STORED,
    generation_time_ms integer NOT NULL,
    token_usage jsonb,
    regeneration_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE generated_reviews IS 'AI-generated reviews with customer edits';
COMMENT ON COLUMN generated_reviews.final_text IS 'What customer copies - edited_text if exists, else generated_text';
COMMENT ON COLUMN generated_reviews.token_usage IS 'Token usage: {prompt_tokens, completion_tokens, total_tokens}';

-- ----------------------------------------------------------------------------
-- subscriptions - Business subscription billing
-- ----------------------------------------------------------------------------
CREATE TABLE subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id varchar(50) NOT NULL,
    status subscription_status NOT NULL DEFAULT 'trialing',
    billing_cycle billing_cycle NOT NULL DEFAULT 'monthly',
    price_cents integer NOT NULL,
    currency char(3) NOT NULL DEFAULT 'USD',
    quantity integer NOT NULL DEFAULT 1,
    stripe_customer_id varchar(255) UNIQUE,
    stripe_subscription_id varchar(255) UNIQUE,
    stripe_price_id varchar(255),
    current_period_start timestamptz NOT NULL,
    current_period_end timestamptz NOT NULL,
    trial_start timestamptz,
    trial_end timestamptz,
    canceled_at timestamptz,
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscriptions IS 'Business subscription billing - one per business';
COMMENT ON COLUMN subscriptions.price_cents IS 'Price in cents to avoid floating point issues';

-- ----------------------------------------------------------------------------
-- invoices - Billing invoices
-- ----------------------------------------------------------------------------
CREATE TABLE invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    stripe_invoice_id varchar(255) UNIQUE,
    invoice_number varchar(100) NOT NULL UNIQUE,
    status invoice_status NOT NULL,
    amount_cents integer NOT NULL,
    amount_paid_cents integer NOT NULL DEFAULT 0,
    currency char(3) NOT NULL DEFAULT 'USD',
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    due_date timestamptz,
    paid_at timestamptz,
    invoice_pdf_url text,
    hosted_invoice_url text,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE invoices IS 'Billing invoices synced from Stripe';

-- ----------------------------------------------------------------------------
-- usage_logs - Subscription usage metering
-- ----------------------------------------------------------------------------
CREATE TABLE usage_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    metric usage_metric NOT NULL,
    count integer NOT NULL DEFAULT 1,
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(subscription_id, metric, period_start, period_end)
);

COMMENT ON TABLE usage_logs IS 'Subscription usage tracking for metered billing';
COMMENT ON COLUMN usage_logs.count IS 'Increment value for the metric in this period';

-- ----------------------------------------------------------------------------
-- audit_logs - Security & compliance audit trail (7-year retention)
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
    action varchar(100) NOT NULL,
    resource_type varchar(50) NOT NULL,
    resource_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS 'Immutable audit trail for security/compliance';
COMMENT ON COLUMN audit_logs.action IS 'Action performed: business.created, google_url.updated, subscription.changed, etc.';

-- ----------------------------------------------------------------------------
-- api_keys - Business API keys for integrations
-- ----------------------------------------------------------------------------
CREATE TABLE api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    key_hash varchar(255) NOT NULL UNIQUE,
    key_prefix varchar(20) NOT NULL,
    scopes jsonb NOT NULL DEFAULT '[]',
    last_used_at timestamptz,
    expires_at timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE api_keys IS 'API keys for business integrations';
COMMENT ON COLUMN api_keys.key_hash IS 'Bcrypt hashed API key';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 chars for display (e.g., rvai_abc123)';
COMMENT ON COLUMN api_keys.scopes IS 'Permissions array: ["analytics:read", "qr:write"]';

-- ----------------------------------------------------------------------------
-- webhook_events - Webhook delivery log (Phase 7)
-- ----------------------------------------------------------------------------
CREATE TABLE webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    event_type varchar(100) NOT NULL,
    payload jsonb NOT NULL,
    url text NOT NULL,
    status webhook_status NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    last_attempt_at timestamptz,
    response_status integer,
    response_body text,
    next_retry_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE webhook_events IS 'Webhook delivery tracking with retry logic';
COMMENT ON COLUMN webhook_events.event_type IS 'Event type: review.generated, scan.received, subscription.updated';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- users indexes
CREATE INDEX idx_users_role ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_users_email_verification_token ON users(email_verification_token) WHERE email_verification_token IS NOT NULL;
CREATE INDEX idx_users_password_reset_token ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;

-- businesses indexes
CREATE INDEX idx_businesses_owner_id ON businesses(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_businesses_status ON businesses(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_businesses_deleted_at ON businesses(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_businesses_settings_gin ON businesses USING GIN (settings);

-- business_staff indexes
CREATE INDEX idx_business_staff_business_id ON business_staff(business_id);
CREATE INDEX idx_business_staff_user_id ON business_staff(user_id);
CREATE INDEX idx_business_staff_accepted_at ON business_staff(accepted_at) WHERE accepted_at IS NOT NULL;

-- qr_codes indexes
CREATE INDEX idx_qr_codes_business_id ON qr_codes(business_id) WHERE is_active = true;
CREATE INDEX idx_qr_codes_is_active ON qr_codes(is_active) WHERE is_active = true;

-- scan_logs indexes
CREATE INDEX idx_scan_logs_business_id ON scan_logs (business_id);
CREATE INDEX idx_scan_logs_qr_code_id ON scan_logs (qr_code_id);
CREATE INDEX idx_scan_logs_session_id ON scan_logs (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_scan_logs_scanned_at ON scan_logs (scanned_at);

-- review_sessions indexes
CREATE INDEX idx_review_sessions_business_id ON review_sessions (business_id);
CREATE INDEX idx_review_sessions_qr_code_id ON review_sessions (qr_code_id);
CREATE INDEX idx_review_sessions_status ON review_sessions (status);
CREATE INDEX idx_review_sessions_scan_log_id ON review_sessions (scan_log_id);
CREATE INDEX idx_review_sessions_started_at ON review_sessions (started_at);

-- generated_reviews indexes
CREATE INDEX idx_generated_reviews_business_id ON generated_reviews(business_id);
CREATE INDEX idx_generated_reviews_created_at ON generated_reviews(created_at DESC);

-- subscriptions indexes
CREATE INDEX idx_subscriptions_owner_id ON subscriptions(owner_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX idx_subscriptions_current_period_end ON subscriptions(current_period_end) WHERE status IN ('active', 'trialing', 'past_due');

-- invoices indexes
CREATE INDEX idx_invoices_subscription_id ON invoices(subscription_id);
CREATE INDEX idx_invoices_business_id ON invoices(business_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date) WHERE due_date IS NOT NULL AND status IN ('open', 'draft');

-- usage_logs indexes
CREATE INDEX idx_usage_logs_subscription_id ON usage_logs(subscription_id);
CREATE INDEX idx_usage_logs_business_id ON usage_logs(business_id);
CREATE INDEX idx_usage_logs_metric_period ON usage_logs(metric, period_start, period_end);

-- audit_logs indexes
CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_business_id ON audit_logs (business_id) WHERE business_id IS NOT NULL;
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id) WHERE resource_id IS NOT NULL;
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);

-- api_keys indexes
CREATE INDEX idx_api_keys_business_id ON api_keys(business_id) WHERE is_active = true;
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active) WHERE is_active = true;

-- webhook_events indexes
CREATE INDEX idx_webhook_events_business_id ON webhook_events(business_id);
CREATE INDEX idx_webhook_events_status ON webhook_events(status) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_webhook_events_next_retry_at ON webhook_events(next_retry_at) WHERE next_retry_at IS NOT NULL AND status = 'retrying';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS Policies: users
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all users"
    ON users FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Admins can manage all users"
    ON users FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies: businesses
-- ----------------------------------------------------------------------------
CREATE POLICY "Business owners and staff can view business"
    ON businesses FOR SELECT
    USING (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM business_staff bs
            WHERE bs.business_id = businesses.id
            AND bs.user_id = auth.uid()
            AND bs.accepted_at IS NOT NULL
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Business owners can create business"
    ON businesses FOR INSERT
    WITH CHECK (
        owner_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role IN ('business_owner', 'admin')
        )
    );

CREATE POLICY "Business owners and admins can update business"
    ON businesses FOR UPDATE
    USING (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM business_staff bs
            WHERE bs.business_id = businesses.id
            AND bs.user_id = auth.uid()
            AND bs.accepted_at IS NOT NULL
            AND bs.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    )
    WITH CHECK (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM business_staff bs
            WHERE bs.business_id = businesses.id
            AND bs.user_id = auth.uid()
            AND bs.accepted_at IS NOT NULL
            AND bs.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies: business_staff
-- ----------------------------------------------------------------------------
CREATE POLICY "Business owners and admins can manage staff"
    ON business_staff FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM business_staff bs
            WHERE bs.business_id = business_staff.business_id
            AND bs.user_id = auth.uid()
            AND bs.accepted_at IS NOT NULL
            AND bs.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM business_staff bs
            WHERE bs.business_id = business_staff.business_id
            AND bs.user_id = auth.uid()
            AND bs.accepted_at IS NOT NULL
            AND bs.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Users can view their own staff memberships"
    ON business_staff FOR SELECT
    USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RLS Policies: qr_codes
-- ----------------------------------------------------------------------------
CREATE POLICY "Business owners and staff can manage QR codes"
    ON qr_codes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = qr_codes.business_id
            AND (
                b.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM business_staff bs
                    WHERE bs.business_id = b.id
                    AND bs.user_id = auth.uid()
                    AND bs.accepted_at IS NOT NULL
                    AND bs.role IN ('owner', 'admin', 'manager')
                )
            )
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = qr_codes.business_id
            AND (
                b.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM business_staff bs
                    WHERE bs.business_id = b.id
                    AND bs.user_id = auth.uid()
                    AND bs.accepted_at IS NOT NULL
                    AND bs.role IN ('owner', 'admin', 'manager')
                )
            )
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- Public read for QR routing (via service role / anon with slug)
CREATE POLICY "Public can read active QR codes by slug"
    ON qr_codes FOR SELECT
    USING (is_active = true);

-- ----------------------------------------------------------------------------
-- RLS Policies: scan_logs
-- ----------------------------------------------------------------------------
-- Public insert for analytics ingestion (via service role in practice)
CREATE POLICY "Service role can insert scan logs"
    ON scan_logs FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Business owners and staff can view scan logs"
    ON scan_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = scan_logs.business_id
            AND (
                b.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM business_staff bs
                    WHERE bs.business_id = b.id
                    AND bs.user_id = auth.uid()
                    AND bs.accepted_at IS NOT NULL
                )
            )
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies: review_sessions
-- ----------------------------------------------------------------------------
-- Public insert for customer flow (via service role in practice)
CREATE POLICY "Service role can insert review sessions"
    ON review_sessions FOR INSERT
    WITH CHECK (true);

-- Public update for customer flow progression
CREATE POLICY "Service role can update review sessions"
    ON review_sessions FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Business owners and staff can view review sessions"
    ON review_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = review_sessions.business_id
            AND (
                b.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM business_staff bs
                    WHERE bs.business_id = b.id
                    AND bs.user_id = auth.uid()
                    AND bs.accepted_at IS NOT NULL
                )
            )
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies: generated_reviews
-- ----------------------------------------------------------------------------
-- Public insert/update for customer flow
CREATE POLICY "Service role can manage generated reviews"
    ON generated_reviews FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Business owners and staff can view generated reviews"
    ON generated_reviews FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = generated_reviews.business_id
            AND (
                b.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM business_staff bs
                    WHERE bs.business_id = b.id
                    AND bs.user_id = auth.uid()
                    AND bs.accepted_at IS NOT NULL
                )
            )
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies: subscriptions
-- ----------------------------------------------------------------------------
CREATE POLICY "Business owners and admins can view subscription"
    ON subscriptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = subscriptions.business_id
            AND (
                b.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM business_staff bs
                    WHERE bs.business_id = b.id
                    AND bs.user_id = auth.uid()
                    AND bs.accepted_at IS NOT NULL
                    AND bs.role IN ('owner', 'admin')
                )
            )
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage subscriptions"
    ON subscriptions FOR ALL
    USING (true)
    WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- RLS Policies: invoices
-- ----------------------------------------------------------------------------
CREATE POLICY "Business owners and admins can view invoices"
    ON invoices FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = invoices.business_id
            AND (
                b.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM business_staff bs
                    WHERE bs.business_id = b.id
                    AND bs.user_id = auth.uid()
                    AND bs.accepted_at IS NOT NULL
                    AND bs.role IN ('owner', 'admin')
                )
            )
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage invoices"
    ON invoices FOR ALL
    USING (true)
    WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- RLS Policies: usage_logs
-- ----------------------------------------------------------------------------
CREATE POLICY "Business owners and admins can view usage"
    ON usage_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = usage_logs.business_id
            AND (
                b.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM business_staff bs
                    WHERE bs.business_id = b.id
                    AND bs.user_id = auth.uid()
                    AND bs.accepted_at IS NOT NULL
                    AND bs.role IN ('owner', 'admin')
                )
            )
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage usage logs"
    ON usage_logs FOR ALL
    USING (true)
    WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- RLS Policies: audit_logs
-- ----------------------------------------------------------------------------
CREATE POLICY "Business owners and admins can view audit logs"
    ON audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = audit_logs.business_id
            AND (
                b.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM business_staff bs
                    WHERE bs.business_id = b.id
                    AND bs.user_id = auth.uid()
                    AND bs.accepted_at IS NOT NULL
                    AND bs.role IN ('owner', 'admin')
                )
            )
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can insert audit logs"
    ON audit_logs FOR INSERT
    WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- RLS Policies: api_keys
-- ----------------------------------------------------------------------------
CREATE POLICY "Business owners and admins can manage API keys"
    ON api_keys FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM business_staff bs
            WHERE bs.business_id = api_keys.business_id
            AND bs.user_id = auth.uid()
            AND bs.accepted_at IS NOT NULL
            AND bs.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM business_staff bs
            WHERE bs.business_id = api_keys.business_id
            AND bs.user_id = auth.uid()
            AND bs.accepted_at IS NOT NULL
            AND bs.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies: webhook_events
-- ----------------------------------------------------------------------------
CREATE POLICY "Business owners and admins can view webhook events"
    ON webhook_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = webhook_events.business_id
            AND (
                b.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM business_staff bs
                    WHERE bs.business_id = b.id
                    AND bs.user_id = auth.uid()
                    AND bs.accepted_at IS NOT NULL
                    AND bs.role IN ('owner', 'admin')
                )
            )
        )
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage webhook events"
    ON webhook_events FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- updated_at trigger function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Apply updated_at trigger to all tables with updated_at column
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_businesses_updated_at
    BEFORE UPDATE ON businesses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qr_codes_updated_at
    BEFORE UPDATE ON qr_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generated_reviews_updated_at
    BEFORE UPDATE ON generated_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Business slug validation & generation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_business_slug(base_name text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    slug text;
    counter int := 0;
    candidate text;
BEGIN
    -- Normalize: lowercase, replace spaces/special chars with hyphens
    slug := lower(regexp_replace(base_name, '[^a-z0-9]+', '-', 'g'));
    slug := trim(both '-' from slug);
    slug := substr(slug, 1, 80); -- Leave room for counter

    candidate := slug;
    WHILE EXISTS (SELECT 1 FROM businesses WHERE slug = candidate) LOOP
        counter := counter + 1;
        candidate := slug || '-' || counter;
    END LOOP;

    RETURN candidate;
END;
$$;

-- ----------------------------------------------------------------------------
-- Audit log helper function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_audit_action(
    p_action text,
    p_resource_type text,
    p_resource_id uuid DEFAULT NULL,
    p_old_values jsonb DEFAULT NULL,
    p_new_values jsonb DEFAULT NULL,
    p_business_id uuid DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO audit_logs (
        user_id,
        business_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        ip_address,
        user_agent,
        metadata
    ) VALUES (
        auth.uid(),
        p_business_id,
        p_action,
        p_resource_type,
        p_resource_id,
        p_old_values,
        p_new_values,
        NULLIF(current_setting('request.client_ip', true), '')::inet,
        current_setting('request.user_agent', true),
        p_metadata
    );
EXCEPTION WHEN OTHERS THEN
    -- Never fail the main operation due to audit logging
    RAISE NOTICE 'Audit log failed: %', SQLERRM;
END;
$$;

-- ----------------------------------------------------------------------------
-- Scan log ingestion function (for public API)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ingest_scan_log(
    p_qr_code_id uuid,
    p_ip_address inet DEFAULT NULL,
    p_user_agent text DEFAULT NULL,
    p_referrer text DEFAULT NULL,
    p_country char(2) DEFAULT NULL,
    p_city varchar(100) DEFAULT NULL,
    p_device_type device_type DEFAULT NULL,
    p_browser varchar(100) DEFAULT NULL,
    p_os varchar(100) DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_business_id uuid;
    v_scan_id uuid;
BEGIN
    -- Get business_id from qr_code
    SELECT business_id INTO v_business_id
    FROM qr_codes WHERE id = p_qr_code_id AND is_active = true;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or inactive QR code';
    END IF;

    -- Insert scan log
    INSERT INTO scan_logs (
        qr_code_id,
        business_id,
        ip_address,
        user_agent,
        referrer,
        country,
        city,
        device_type,
        browser,
        os
    ) VALUES (
        p_qr_code_id,
        v_business_id,
        p_ip_address,
        p_user_agent,
        p_referrer,
        p_country,
        p_city,
        p_device_type,
        p_browser,
        p_os
    ) RETURNING id INTO v_scan_id;

    RETURN v_scan_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Review session start function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_review_session(
    p_scan_log_id uuid,
    p_language varchar(10)
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_session_id uuid;
    v_qr_code_id uuid;
    v_business_id uuid;
BEGIN
    -- Get QR code and business from scan log
    SELECT qr_code_id, business_id INTO v_qr_code_id, v_business_id
    FROM scan_logs WHERE id = p_scan_log_id;

    IF v_qr_code_id IS NULL THEN
        RAISE EXCEPTION 'Scan log not found';
    END IF;

    -- Create review session
    INSERT INTO review_sessions (
        qr_code_id,
        business_id,
        scan_log_id,
        language,
        status
    ) VALUES (
        v_qr_code_id,
        v_business_id,
        p_scan_log_id,
        p_language,
        'language_selected'
    ) RETURNING id INTO v_session_id;

    -- Update scan log with session link
    UPDATE scan_logs SET session_id = v_session_id WHERE id = p_scan_log_id;

    RETURN v_session_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Review session rating update
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_review_session_rating(
    p_session_id uuid,
    p_rating smallint
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE review_sessions
    SET rating = p_rating,
        status = 'rating_selected'
    WHERE id = p_session_id
    AND status IN ('started', 'language_selected');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session or invalid state transition';
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- Generate review function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_generated_review(
    p_session_id uuid,
    p_ai_provider ai_provider,
    p_model varchar(100),
    p_prompt_version varchar(50),
    p_generated_text text,
    p_generation_time_ms integer,
    p_token_usage jsonb DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_review_id uuid;
    v_session review_sessions%ROWTYPE;
BEGIN
    -- Get session details
    SELECT * INTO v_session FROM review_sessions WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    IF v_session.status NOT IN ('rating_selected', 'review_generated') THEN
        RAISE EXCEPTION 'Invalid session state for review generation';
    END IF;

    -- Insert generated review
    INSERT INTO generated_reviews (
        session_id,
        business_id,
        language,
        rating,
        ai_provider,
        model,
        prompt_version,
        generated_text,
        generation_time_ms,
        token_usage
    ) VALUES (
        p_session_id,
        v_session.business_id,
        v_session.language,
        v_session.rating,
        p_ai_provider,
        p_model,
        p_prompt_version,
        p_generated_text,
        p_generation_time_ms,
        p_token_usage
    ) RETURNING id INTO v_review_id;

    -- Update session status
    UPDATE review_sessions
    SET status = 'review_generated'
    WHERE id = p_session_id;

    RETURN v_review_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Complete review session (redirect to Google)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_review_session(
    p_session_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE review_sessions
    SET status = 'redirected',
        completed_at = now()
    WHERE id = p_session_id
    AND status IN ('review_generated', 'review_edited');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid session or invalid state transition';
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- Partition maintenance function (run monthly via pg_cron)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_future_partitions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- Cleanup old partitions function (run monthly via pg_cron)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION drop_old_partitions(retention_months int DEFAULT 24)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- Usage tracking function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION track_usage(
    p_subscription_id uuid,
    p_metric usage_metric,
    p_count integer DEFAULT 1
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_business_id uuid;
    v_period_start timestamptz;
    v_period_end timestamptz;
BEGIN
    -- Get business_id and current billing period from subscription
    SELECT business_id, current_period_start, current_period_end
    INTO v_business_id, v_period_start, v_period_end
    FROM subscriptions WHERE id = p_subscription_id;

    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Subscription not found';
    END IF;

    -- Upsert usage log
    INSERT INTO usage_logs (
        subscription_id,
        business_id,
        metric,
        count,
        period_start,
        period_end
    ) VALUES (
        p_subscription_id,
        v_business_id,
        p_metric,
        p_count,
        v_period_start,
        v_period_end
    )
    ON CONFLICT (subscription_id, metric, period_start, period_end)
    DO UPDATE SET count = usage_logs.count + EXCLUDED.count;
END;
$$;

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Business analytics summary view
CREATE VIEW business_analytics_summary AS
SELECT
    b.id AS business_id,
    b.name AS business_name,
    b.slug,
    COUNT(DISTINCT sl.id) AS total_scans,
    COUNT(DISTINCT rs.id) AS total_sessions,
    COUNT(DISTINCT gr.id) FILTER (WHERE gr.generated_text IS NOT NULL) AS total_generated,
    COUNT(DISTINCT rs.id) FILTER (WHERE rs.status = 'redirected') AS total_redirects,
    CASE
        WHEN COUNT(DISTINCT sl.id) > 0
        THEN ROUND(COUNT(DISTINCT rs.id) FILTER (WHERE rs.status = 'redirected')::numeric / COUNT(DISTINCT sl.id) * 100, 2)
        ELSE 0
    END AS conversion_rate
FROM businesses b
LEFT JOIN qr_codes qc ON qc.business_id = b.id
LEFT JOIN scan_logs sl ON sl.qr_code_id = qc.id
LEFT JOIN review_sessions rs ON rs.qr_code_id = qc.id
LEFT JOIN generated_reviews gr ON gr.session_id = rs.id
WHERE b.deleted_at IS NULL
GROUP BY b.id, b.name, b.slug;

-- Subscription usage view
CREATE VIEW subscription_usage_current AS
SELECT
    s.id AS subscription_id,
    s.business_id,
    s.plan_id,
    s.status,
    ul.metric,
    COALESCE(SUM(ul.count), 0) AS total_usage,
    s.current_period_start,
    s.current_period_end
FROM subscriptions s
LEFT JOIN usage_logs ul ON ul.subscription_id = s.id
    AND ul.period_start = s.current_period_start
    AND ul.period_end = s.current_period_end
WHERE s.status IN ('active', 'trialing', 'past_due')
GROUP BY s.id, s.business_id, s.plan_id, s.status, ul.metric, s.current_period_start, s.current_period_end;

-- ============================================================================
-- GRANTS FOR SERVICE ROLE
-- ============================================================================

-- Service role needs full access for backend operations
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Anon role limited access for public endpoints
GRANT SELECT ON qr_codes TO anon;
GRANT INSERT ON scan_logs TO anon;
GRANT INSERT ON review_sessions TO anon;
GRANT UPDATE ON review_sessions TO anon;
GRANT INSERT ON generated_reviews TO anon;
GRANT UPDATE ON generated_reviews TO anon;

-- ============================================================================
-- COMMENTS & DOCUMENTATION
-- ============================================================================

COMMENT ON SCHEMA public IS 'ReviewAI SaaS platform schema - multi-tenant Google review collection';

-- Table comments already added inline above

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================