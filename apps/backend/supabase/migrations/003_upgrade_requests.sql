-- ============================================================================
-- ReviewAI - Upgrade Requests Migration
-- Supabase PostgreSQL Migration
-- Version: 1.2.0
-- ============================================================================

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- UPGRADE REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS upgrade_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_plan VARCHAR(50) NOT NULL CHECK (requested_plan IN ('starter', 'professional', 'enterprise')),
    current_plan VARCHAR(50) NOT NULL DEFAULT 'free' CHECK (current_plan IN ('free', 'starter', 'professional', 'enterprise')),
    message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'approved', 'rejected', 'cancelled')),
    reason TEXT,
    admin_notes TEXT,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE upgrade_requests IS 'Business owner upgrade requests - admin review required, no payment integration';
COMMENT ON COLUMN upgrade_requests.business_id IS 'Business requesting the upgrade';
COMMENT ON COLUMN upgrade_requests.owner_id IS 'Business owner who created the request';
COMMENT ON COLUMN upgrade_requests.requested_plan IS 'Plan being requested (starter, professional, enterprise)';
COMMENT ON COLUMN upgrade_requests.current_plan IS 'Business current plan at time of request';
COMMENT ON COLUMN upgrade_requests.message IS 'Optional message from business owner';
COMMENT ON COLUMN upgrade_requests.reason IS 'Optional reason for rejection/cancellation';
COMMENT ON COLUMN upgrade_requests.admin_notes IS 'Internal admin notes';
COMMENT ON COLUMN upgrade_requests.reviewed_by IS 'Admin who reviewed the request';
COMMENT ON COLUMN upgrade_requests.reviewed_at IS 'When the request was reviewed';
COMMENT ON COLUMN upgrade_requests.status IS 'Request status: pending, contacted, approved, rejected, cancelled';
COMMENT ON COLUMN upgrade_requests.created_at IS 'When the request was created';
COMMENT ON COLUMN upgrade_requests.updated_at IS 'When the request was last updated';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_upgrade_requests_business_id ON upgrade_requests(business_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_owner_id ON upgrade_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_status ON upgrade_requests(status);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_created_at ON upgrade_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_reviewed_by ON upgrade_requests(reviewed_by);

-- Prevent duplicate pending requests for same business+plan
CREATE UNIQUE INDEX IF NOT EXISTS idx_upgrade_requests_unique_pending
ON upgrade_requests(business_id, requested_plan)
WHERE status = 'pending';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Business owners can view their own requests
CREATE POLICY "Business owners can view own upgrade requests"
    ON upgrade_requests FOR SELECT
    USING (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- Business owners can create requests
CREATE POLICY "Business owners can create upgrade requests"
    ON upgrade_requests FOR INSERT
    WITH CHECK (
        owner_id = auth.uid()
    );

-- Admins can do everything
CREATE POLICY "Admins can manage all upgrade requests"
    ON upgrade_requests FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- Service role can do everything (for server-side operations)
CREATE POLICY "Service role can manage upgrade requests"
    ON upgrade_requests FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- FUNCTIONS FOR ATOMIC UPGRADE REQUEST PROCESSING
-- ============================================================================

-- Function to atomically update upgrade request and subscription
-- Uses FOR UPDATE lock to prevent race conditions
CREATE OR REPLACE FUNCTION update_upgrade_request_with_subscription(
    p_request_id UUID,
    p_status VARCHAR(20),
    p_admin_id UUID,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_request RECORD;
    v_business_id UUID;
    v_requested_plan VARCHAR(50);
    v_current_plan VARCHAR(50);
    v_old_status VARCHAR(20);
    v_subscription_id UUID;
    v_stripe_subscription_id VARCHAR(255);
BEGIN
    -- Validate status
    IF p_status NOT IN ('approved', 'rejected', 'contacted', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status: %', p_status;
    END IF;

    -- Lock the upgrade request row to prevent concurrent modifications
    SELECT *
    INTO v_request
    FROM upgrade_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Upgrade request not found: %', p_request_id;
    END IF;

    v_old_status := v_request.status;
    v_business_id := v_request.business_id;
    v_requested_plan := v_request.requested_plan;
    v_current_plan := v_request.current_plan;

    -- Prevent duplicate status changes
    IF v_old_status = p_status THEN
        RAISE EXCEPTION 'Request already has status: %', p_status;
    END IF;

    -- Only allow transitions from pending
    IF v_old_status != 'pending' THEN
        RAISE EXCEPTION 'Cannot update request with status: %', v_old_status;
    END IF;

    -- Update the upgrade request
    UPDATE upgrade_requests
    SET
        status = p_status,
        admin_notes = p_admin_notes,
        reviewed_by = p_admin_id,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;

    -- If approved, also update the subscription
    IF p_status = 'approved' THEN
        -- Lock the subscription row
        SELECT id, stripe_subscription_id, plan
        INTO v_subscription_id, v_stripe_subscription_id, v_current_plan
        FROM subscriptions
        WHERE business_id = v_business_id
        FOR UPDATE;

        IF FOUND THEN
            -- Update subscription plan
            UPDATE subscriptions
            SET
                plan = v_requested_plan,
                status = CASE
                    WHEN status IN ('incomplete', 'incomplete_expired', 'canceled', 'unpaid') THEN 'active'
                    ELSE status
                END,
                updated_at = NOW()
            WHERE id = v_subscription_id;

            -- Log audit trail for subscription change
            INSERT INTO audit_logs (action, resource_type, resource_id, user_id, user_name, user_email, details, old_values, new_values)
            VALUES (
                'subscription_plan_changed',
                'subscription',
                v_subscription_id,
                p_admin_id,
                (SELECT name FROM users WHERE id = p_admin_id),
                (SELECT email FROM users WHERE id = p_admin_id),
                'Admin approved upgrade request and updated subscription plan',
                jsonb_build_object('plan', v_current_plan, 'status', (SELECT status FROM subscriptions WHERE id = v_subscription_id)),
                jsonb_build_object('plan', v_requested_plan, 'status', 'active')
            );
        ELSE
            -- Create new subscription if none exists
            INSERT INTO subscriptions (business_id, owner_id, plan, status, monthly_price, features)
            SELECT
                v_business_id,
                v_request.owner_id,
                v_requested_plan,
                'active',
                CASE v_requested_plan
                    WHEN 'starter' THEN 2900
                    WHEN 'professional' THEN 7900
                    WHEN 'enterprise' THEN 19900
                    ELSE 0
                END,
                jsonb_build_object(
                    'max_businesses', CASE v_requested_plan WHEN 'enterprise' THEN 999 ELSE 1 END,
                    'max_qr_codes', CASE v_requested_plan WHEN 'enterprise' THEN 999 ELSE 5 END,
                    'max_scans_per_month', CASE v_requested_plan WHEN 'enterprise' THEN 999999 ELSE 10000 END,
                    'ai_reviews_per_month', CASE v_requested_plan WHEN 'enterprise' THEN 999999 ELSE 100 END,
                    'custom_domains', v_requested_plan = 'enterprise',
                    'white_label', v_requested_plan = 'enterprise',
                    'api_access', v_requested_plan IN ('professional', 'enterprise'),
                    'priority_support', v_requested_plan IN ('professional', 'enterprise')
                )
            RETURNING id INTO v_subscription_id;

            -- Log audit trail for new subscription
            INSERT INTO audit_logs (action, resource_type, resource_id, user_id, user_name, user_email, details, new_values)
            VALUES (
                'subscription_created_from_upgrade',
                'subscription',
                v_subscription_id,
                p_admin_id,
                (SELECT name FROM users WHERE id = p_admin_id),
                (SELECT email FROM users WHERE id = p_admin_id),
                'Admin approved upgrade request and created new subscription',
                jsonb_build_object('plan', v_requested_plan, 'status', 'active')
            );
        END IF;
    END IF;

    -- Log audit trail for upgrade request status change
    INSERT INTO audit_logs (action, resource_type, resource_id, user_id, user_name, user_email, details, old_values, new_values)
    VALUES (
        'upgrade_request_status_changed',
        'upgrade_request',
        p_request_id,
        p_admin_id,
        (SELECT name FROM users WHERE id = p_admin_id),
        (SELECT email FROM users WHERE id = p_admin_id),
        'Admin ' || p_status || ' upgrade request for ' || v_business_id,
        jsonb_build_object('status', v_old_status, 'requested_plan', v_requested_plan, 'current_plan', v_current_plan),
        jsonb_build_object('status', p_status, 'admin_notes', p_admin_notes)
    );
END;
$$;

-- ============================================================================
-- TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_upgrade_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_upgrade_requests_updated_at ON upgrade_requests;
CREATE TRIGGER trigger_update_upgrade_requests_updated_at
    BEFORE UPDATE ON upgrade_requests
    FOR EACH ROW EXECUTE FUNCTION update_upgrade_requests_updated_at();

-- ============================================================================
-- GRANTS FOR SERVICE ROLE
-- ============================================================================

GRANT ALL ON upgrade_requests TO service_role;
GRANT EXECUTE ON FUNCTION update_upgrade_request_with_subscription TO service_role;
GRANT EXECUTE ON FUNCTION update_upgrade_requests_updated_at TO service_role;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================