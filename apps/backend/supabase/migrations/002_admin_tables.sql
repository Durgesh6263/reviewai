-- ============================================================================
-- ReviewAI - Admin Tables & Analytics Migration
-- Supabase PostgreSQL Migration
-- Version: 1.1.0
-- ============================================================================

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure 'completed' exists in session_status enum
DO $$ BEGIN
    ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'completed';
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN undefined_object THEN null;
END $$;

-- ============================================================================
-- ANALYTICS TABLES (for pre-aggregated data)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- daily_analytics - Pre-aggregated daily metrics per business
-- ----------------------------------------------------------------------------
CREATE TABLE daily_analytics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    date date NOT NULL,
    scans integer NOT NULL DEFAULT 0,
    sessions_started integer NOT NULL DEFAULT 0,
    reviews_generated integer NOT NULL DEFAULT 0,
    reviews_edited integer NOT NULL DEFAULT 0,
    google_redirects integer NOT NULL DEFAULT 0,
    new_users integer NOT NULL DEFAULT 0,
    new_businesses integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(business_id, date)
);

COMMENT ON TABLE daily_analytics IS 'Pre-aggregated daily analytics per business for fast dashboard queries';

-- ----------------------------------------------------------------------------
-- business_analytics - Pre-aggregated metrics per business (for admin leaderboards)
-- ----------------------------------------------------------------------------
CREATE TABLE business_analytics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    date date NOT NULL,
    scans integer NOT NULL DEFAULT 0,
    reviews integer NOT NULL DEFAULT 0,
    conversions integer NOT NULL DEFAULT 0,
    conversion_rate numeric(5,2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(business_id, date)
);

COMMENT ON TABLE business_analytics IS 'Pre-aggregated daily analytics per business for admin leaderboards';

-- ----------------------------------------------------------------------------
-- qr_code_analytics - Pre-aggregated metrics per QR code (for admin leaderboards)
-- ----------------------------------------------------------------------------
CREATE TABLE qr_code_analytics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code_id uuid NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    date date NOT NULL,
    scans integer NOT NULL DEFAULT 0,
    reviews integer NOT NULL DEFAULT 0,
    conversions integer NOT NULL DEFAULT 0,
    conversion_rate numeric(5,2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(qr_code_id, date)
);

COMMENT ON TABLE qr_code_analytics IS 'Pre-aggregated daily analytics per QR code for admin leaderboards';

-- ============================================================================
-- ADMIN TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- admin_settings - Global platform settings (single row)
-- ----------------------------------------------------------------------------
CREATE TABLE admin_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    general jsonb NOT NULL DEFAULT '{}',
    email jsonb NOT NULL DEFAULT '{}',
    security jsonb NOT NULL DEFAULT '{}',
    integrations jsonb NOT NULL DEFAULT '{}',
    features jsonb NOT NULL DEFAULT '{}',
    limits jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE admin_settings IS 'Global platform settings - single row, upsert on update';

-- Ensure only one row exists
CREATE UNIQUE INDEX admin_settings_single_row ON admin_settings ((true));

-- ----------------------------------------------------------------------------
-- background_jobs - Background job tracking
-- ----------------------------------------------------------------------------
CREATE TABLE background_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    payload jsonb NOT NULL DEFAULT '{}',
    result jsonb,
    error text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE background_jobs IS 'Background job tracking for admin monitoring';

CREATE INDEX idx_background_jobs_status ON background_jobs(status) WHERE status IN ('pending', 'running');
CREATE INDEX idx_background_jobs_name ON background_jobs(name);
CREATE INDEX idx_background_jobs_created_at ON background_jobs(created_at DESC);

-- ----------------------------------------------------------------------------
-- api_logs - API call logging (for monitoring)
-- ----------------------------------------------------------------------------
CREATE TABLE api_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    method varchar(10) NOT NULL,
    path varchar(500) NOT NULL,
    status_code integer NOT NULL,
    response_time_ms integer NOT NULL,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
    ip_address inet,
    user_agent text,
    request_size integer,
    response_size integer,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE api_logs IS 'API call logs for monitoring and debugging';

-- ----------------------------------------------------------------------------
-- email_logs - Email delivery logging
-- ----------------------------------------------------------------------------
CREATE TABLE email_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type varchar(50) NOT NULL,
    to_email varchar(255) NOT NULL,
    from_email varchar(255) NOT NULL,
    subject varchar(500),
    status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked')),
    provider varchar(50),
    provider_message_id varchar(255),
    error_message text,
    business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}',
    sent_at timestamptz,
    delivered_at timestamptz,
    opened_at timestamptz,
    clicked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE email_logs IS 'Email delivery logs for monitoring';

-- ============================================================================
-- VIEWS FOR ADMIN DASHBOARD
-- ============================================================================

-- ----------------------------------------------------------------------------
-- business_stats - Aggregated business statistics view
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW business_stats AS
SELECT
    b.id as business_id,
    COALESCE(SUM(sl.scans), 0) as total_scans,
    COALESCE(SUM(rs.reviews), 0) as total_reviews,
    CASE
        WHEN COALESCE(SUM(sl.scans), 0) > 0
        THEN ROUND(COALESCE(SUM(rs.reviews), 0)::numeric / COALESCE(SUM(sl.scans), 0) * 100, 2)
        ELSE 0
    END as conversion_rate
FROM businesses b
LEFT JOIN (
    SELECT qc.business_id, COUNT(*) as scans
    FROM qr_codes qc
    JOIN scan_logs sl ON sl.qr_code_id = qc.id
    GROUP BY qc.business_id
) sl ON sl.business_id = b.id
LEFT JOIN (
    SELECT qc.business_id, COUNT(*) as reviews
    FROM qr_codes qc
    JOIN review_sessions rs ON rs.qr_code_id = qc.id
    WHERE rs.status::text IN ('redirected', 'completed')
    GROUP BY qc.business_id
) rs ON rs.business_id = b.id
WHERE b.deleted_at IS NULL
GROUP BY b.id;

-- ----------------------------------------------------------------------------
-- qr_code_stats - Aggregated QR code statistics view
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW qr_code_stats AS
SELECT
    qc.id as qr_code_id,
    COALESCE(SUM(sl.scans), 0) as total_scans,
    COALESCE(SUM(rs.reviews), 0) as total_reviews,
    CASE
        WHEN COALESCE(SUM(sl.scans), 0) > 0
        THEN ROUND(COALESCE(SUM(rs.reviews), 0)::numeric / COALESCE(SUM(sl.scans), 0) * 100, 2)
        ELSE 0
    END as conversion_rate
FROM qr_codes qc
LEFT JOIN (
    SELECT qr_code_id, COUNT(*) as scans
    FROM scan_logs
    GROUP BY qr_code_id
) sl ON sl.qr_code_id = qc.id
LEFT JOIN (
    SELECT qr_code_id, COUNT(*) as reviews
    FROM review_sessions
    WHERE status::text IN ('redirected', 'completed')
    GROUP BY qr_code_id
) rs ON rs.qr_code_id = qc.id
WHERE qc.is_active = true
GROUP BY qc.id;

-- ============================================================================
-- FUNCTIONS FOR ADMIN
-- ============================================================================

-- ----------------------------------------------------------------------------
-- get_database_size - Returns database size in bytes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_database_size()
RETURNS TABLE (size bigint) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT pg_database_size(current_database()) as size;
END;
$$;

-- ----------------------------------------------------------------------------
-- get_storage_used - Returns Supabase storage used in bytes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_storage_used()
RETURNS TABLE (size bigint) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT COALESCE(SUM(size), 0) as size
    FROM storage.objects;
END;
$$;

-- ----------------------------------------------------------------------------
-- refresh_analytics_views - Refresh materialized views (if using materialized views)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_analytics_partitions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    NULL;
END;
$$;

-- ============================================================================
-- TRIGGERS FOR AUTO-AGGREGATION
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Trigger function: Update daily_analytics on scan_logs insert
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_daily_analytics_on_scan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO daily_analytics (business_id, date, scans)
    VALUES (NEW.business_id, NEW.scanned_at::date, 1)
    ON CONFLICT (business_id, date)
    DO UPDATE SET scans = daily_analytics.scans + 1, updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_daily_analytics_on_scan
    AFTER INSERT ON scan_logs
    FOR EACH ROW EXECUTE FUNCTION update_daily_analytics_on_scan();

-- ----------------------------------------------------------------------------
-- Trigger function: Update daily_analytics on review_sessions status change
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_daily_analytics_on_session()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_business_id uuid;
BEGIN
    -- Get business_id from session
    v_business_id := NEW.business_id;

    IF v_business_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Update daily_analytics based on status transition
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        CASE NEW.status
            WHEN 'language_selected' THEN
                INSERT INTO daily_analytics (business_id, date, sessions_started)
                VALUES (v_business_id, NEW.started_at::date, 1)
                ON CONFLICT (business_id, date)
                DO UPDATE SET sessions_started = daily_analytics.sessions_started + 1, updated_at = now();

            WHEN 'review_generated' THEN
                INSERT INTO daily_analytics (business_id, date, reviews_generated)
                VALUES (v_business_id, NEW.started_at::date, 1)
                ON CONFLICT (business_id, date)
                DO UPDATE SET reviews_generated = daily_analytics.reviews_generated + 1, updated_at = now();

            WHEN 'review_edited' THEN
                INSERT INTO daily_analytics (business_id, date, reviews_edited)
                VALUES (v_business_id, NEW.started_at::date, 1)
                ON CONFLICT (business_id, date)
                DO UPDATE SET reviews_edited = daily_analytics.reviews_edited + 1, updated_at = now();

            WHEN 'redirected' THEN
                INSERT INTO daily_analytics (business_id, date, google_redirects)
                VALUES (v_business_id, NEW.started_at::date, 1)
                ON CONFLICT (business_id, date)
                DO UPDATE SET google_redirects = daily_analytics.google_redirects + 1, updated_at = now();
        END CASE;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_daily_analytics_on_session
    AFTER UPDATE ON review_sessions
    FOR EACH ROW EXECUTE FUNCTION update_daily_analytics_on_session();

-- ----------------------------------------------------------------------------
-- Trigger function: Update business_analytics and qr_code_analytics
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_business_qr_analytics()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_business_id uuid;
    v_qr_code_id uuid;
    v_date date;
    v_scans integer;
    v_reviews integer;
    v_conversions integer;
    v_rate numeric;
BEGIN
    IF TG_TABLE_NAME = 'scan_logs' THEN
        v_business_id := NEW.business_id;
        v_qr_code_id := NEW.qr_code_id;
        v_date := NEW.scanned_at::date;

        -- Update business_analytics
        INSERT INTO business_analytics (business_id, date, scans)
        VALUES (v_business_id, v_date, 1)
        ON CONFLICT (business_id, date)
        DO UPDATE SET scans = business_analytics.scans + 1, updated_at = now();

        -- Update qr_code_analytics
        INSERT INTO qr_code_analytics (qr_code_id, business_id, date, scans)
        VALUES (v_qr_code_id, v_business_id, v_date, 1)
        ON CONFLICT (qr_code_id, date)
        DO UPDATE SET scans = qr_code_analytics.scans + 1, updated_at = now();

    ELSIF TG_TABLE_NAME = 'review_sessions' AND NEW.status::text IN ('redirected', 'completed') AND OLD.status IS DISTINCT FROM NEW.status THEN
        v_business_id := NEW.business_id;
        v_qr_code_id := NEW.qr_code_id;
        v_date := NEW.started_at::date;

        -- Update business_analytics
        INSERT INTO business_analytics (business_id, date, reviews, conversions)
        VALUES (v_business_id, v_date, 1, 1)
        ON CONFLICT (business_id, date)
        DO UPDATE SET
            reviews = business_analytics.reviews + 1,
            conversions = business_analytics.conversions + 1,
            conversion_rate = CASE
                WHEN (SELECT scans FROM business_analytics WHERE business_id = v_business_id AND date = v_date) > 0
                THEN ROUND((business_analytics.reviews + 1)::numeric / (SELECT scans FROM business_analytics WHERE business_id = v_business_id AND date = v_date) * 100, 2)
                ELSE 0
            END,
            updated_at = now();

        -- Update qr_code_analytics
        INSERT INTO qr_code_analytics (qr_code_id, business_id, date, reviews, conversions)
        VALUES (v_qr_code_id, v_business_id, v_date, 1, 1)
        ON CONFLICT (qr_code_id, date)
        DO UPDATE SET
            reviews = qr_code_analytics.reviews + 1,
            conversions = qr_code_analytics.conversions + 1,
            conversion_rate = CASE
                WHEN (SELECT scans FROM qr_code_analytics WHERE qr_code_id = v_qr_code_id AND date = v_date) > 0
                THEN ROUND((qr_code_analytics.reviews + 1)::numeric / (SELECT scans FROM qr_code_analytics WHERE qr_code_id = v_qr_code_id AND date = v_date) * 100, 2)
                ELSE 0
            END,
            updated_at = now();
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_business_analytics_on_scan
    AFTER INSERT ON scan_logs
    FOR EACH ROW EXECUTE FUNCTION update_business_qr_analytics();

CREATE TRIGGER trigger_update_business_analytics_on_session
    AFTER UPDATE ON review_sessions
    FOR EACH ROW EXECUTE FUNCTION update_business_qr_analytics();

-- ============================================================================
-- RLS POLICIES FOR NEW TABLES
-- ============================================================================

-- Enable RLS
ALTER TABLE daily_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_code_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- daily_analytics - Business owners and admins can view
CREATE POLICY "Business owners and admins can view daily analytics"
    ON daily_analytics FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM businesses b
            WHERE b.id = daily_analytics.business_id
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

CREATE POLICY "Service role can manage daily analytics"
    ON daily_analytics FOR ALL
    USING (true)
    WITH CHECK (true);

-- business_analytics - Admins only
CREATE POLICY "Admins can view business analytics"
    ON business_analytics FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage business analytics"
    ON business_analytics FOR ALL
    USING (true)
    WITH CHECK (true);

-- qr_code_analytics - Admins only
CREATE POLICY "Admins can view QR code analytics"
    ON qr_code_analytics FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage QR code analytics"
    ON qr_code_analytics FOR ALL
    USING (true)
    WITH CHECK (true);

-- admin_settings - Admins only
CREATE POLICY "Admins can view admin settings"
    ON admin_settings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Admins can update admin settings"
    ON admin_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- background_jobs - Admins only
CREATE POLICY "Admins can view background jobs"
    ON background_jobs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage background jobs"
    ON background_jobs FOR ALL
    USING (true)
    WITH CHECK (true);

-- api_logs - Admins only
CREATE POLICY "Admins can view API logs"
    ON api_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage API logs"
    ON api_logs FOR ALL
    USING (true)
    WITH CHECK (true);

-- email_logs - Admins only
CREATE POLICY "Admins can view email logs"
    ON email_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage email logs"
    ON email_logs FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- GRANTS FOR SERVICE ROLE
-- ============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================