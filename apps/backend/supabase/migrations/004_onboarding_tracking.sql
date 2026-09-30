-- ============================================================================
-- ReviewAI - Onboarding Tracking Migration
-- Supabase PostgreSQL Migration
-- Version: 1.0.0
-- Adds onboarding progress tracking for pilot users
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ONBOARDING ENUM TYPES
-- ============================================================================

CREATE TYPE onboarding_step AS ENUM (
    'welcome',
    'business_info',
    'google_config',
    'experience_tags',
    'qr_generation',
    'qr_test',
    'dashboard_tour',
    'completed'
);

CREATE TYPE pilot_feedback_category AS ENUM (
    'signup',
    'business_setup',
    'google_config',
    'tags',
    'qr_design',
    'qr_test',
    'dashboard',
    'overall'
);

-- ============================================================================
-- ONBOARDING PROGRESS TABLE
-- ============================================================================

CREATE TABLE onboarding_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
    current_step onboarding_step NOT NULL DEFAULT 'welcome',
    completed_steps onboarding_step[] NOT NULL DEFAULT '{}',
    step_data jsonb NOT NULL DEFAULT '{}',
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    is_pilot_user boolean NOT NULL DEFAULT false,
    pilot_cohort varchar(50),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

COMMENT ON TABLE onboarding_progress IS 'Tracks user onboarding progress through the wizard steps';
COMMENT ON COLUMN onboarding_progress.current_step IS 'Current step user is on';
COMMENT ON COLUMN onboarding_progress.completed_steps IS 'Array of completed step identifiers';
COMMENT ON COLUMN onboarding_progress.step_data IS 'JSON data collected at each step: {business_info: {...}, google_config: {...}, tags: [...], qr_design: {...}}';
COMMENT ON COLUMN onboarding_progress.is_pilot_user IS 'Flag for pilot program participants';
COMMENT ON COLUMN onboarding_progress.pilot_cohort IS 'Cohort identifier for A/B testing (e.g., "pilot-2024-q1")';

-- ============================================================================
-- PILOT FEEDBACK TABLE
-- ============================================================================

CREATE TABLE pilot_feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
    category pilot_feedback_category NOT NULL,
    rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    feedback_text text,
    step_context onboarding_step,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pilot_feedback IS 'Collects feedback from pilot users during onboarding';
COMMENT ON COLUMN pilot_feedback.category IS 'Which part of onboarding this feedback relates to';
COMMENT ON COLUMN pilot_feedback.step_context IS 'Onboarding step when feedback was submitted';

-- ============================================================================
-- PILOT USER FLAG ON USERS TABLE
-- ============================================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_pilot_user boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS pilot_cohort varchar(50),
ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

COMMENT ON COLUMN users.is_pilot_user IS 'Flag for pilot program participants';
COMMENT ON COLUMN users.pilot_cohort IS 'Cohort identifier for pilot users';
COMMENT ON COLUMN users.onboarding_completed_at IS 'Timestamp when user completed onboarding';

-- ============================================================================
-- PILOT LIMITS ON BUSINESSES TABLE
-- ============================================================================

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS is_pilot_business boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS pilot_limits jsonb NOT NULL DEFAULT '{"max_qr_codes": 3, "max_scans_per_month": 100, "max_staff": 1}';

COMMENT ON COLUMN businesses.is_pilot_business IS 'Flag for businesses created during pilot';
COMMENT ON COLUMN businesses.pilot_limits IS 'Pilot-specific limits: {max_qr_codes, max_scans_per_month, max_staff}';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_onboarding_progress_user_id ON onboarding_progress(user_id);
CREATE INDEX idx_onboarding_progress_current_step ON onboarding_progress(current_step);
CREATE INDEX idx_onboarding_progress_is_pilot ON onboarding_progress(is_pilot_user) WHERE is_pilot_user = true;
CREATE INDEX idx_onboarding_progress_completed_at ON onboarding_progress(completed_at) WHERE completed_at IS NOT NULL;

CREATE INDEX idx_pilot_feedback_user_id ON pilot_feedback(user_id);
CREATE INDEX idx_pilot_feedback_category ON pilot_feedback(category);
CREATE INDEX idx_pilot_feedback_created_at ON pilot_feedback(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_feedback ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS Policies: onboarding_progress
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own onboarding progress"
    ON onboarding_progress FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own onboarding progress"
    ON onboarding_progress FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own onboarding progress"
    ON onboarding_progress FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all onboarding progress"
    ON onboarding_progress FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage onboarding progress"
    ON onboarding_progress FOR ALL
    USING (true)
    WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- RLS Policies: pilot_feedback
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can insert own pilot feedback"
    ON pilot_feedback FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own pilot feedback"
    ON pilot_feedback FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Admins can view all pilot feedback"
    ON pilot_feedback FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Service role can manage pilot feedback"
    ON pilot_feedback FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- updated_at trigger for onboarding_progress
CREATE TRIGGER update_onboarding_progress_updated_at
    BEFORE UPDATE ON onboarding_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get or create onboarding progress for user
CREATE OR REPLACE FUNCTION get_or_create_onboarding_progress(p_user_id uuid)
RETURNS onboarding_progress LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_progress onboarding_progress;
BEGIN
    SELECT * INTO v_progress FROM onboarding_progress WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        INSERT INTO onboarding_progress (user_id, current_step, completed_steps, step_data)
        VALUES (p_user_id, 'welcome', '{}', '{}')
        RETURNING * INTO v_progress;
    END IF;

    RETURN v_progress;
END;
$$;

-- Update onboarding step
CREATE OR REPLACE FUNCTION update_onboarding_step(
    p_user_id uuid,
    p_step onboarding_step,
    p_step_data jsonb DEFAULT '{}'
)
RETURNS onboarding_progress LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_progress onboarding_progress;
    v_completed onboarding_step[];
BEGIN
    SELECT * INTO v_progress FROM onboarding_progress WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        INSERT INTO onboarding_progress (user_id, current_step, completed_steps, step_data)
        VALUES (p_user_id, p_step, '{}', p_step_data)
        RETURNING * INTO v_progress;
    ELSE
        -- Add previous step to completed if moving forward
        v_completed := v_progress.completed_steps;
        IF v_progress.current_step != p_step THEN
            v_completed := array_append(v_completed, v_progress.current_step);
        END IF;

        UPDATE onboarding_progress
        SET current_step = p_step,
            completed_steps = v_completed,
            step_data = step_data || p_step_data,
            updated_at = now()
        WHERE user_id = p_user_id
        RETURNING * INTO v_progress;
    END IF;

    RETURN v_progress;
END;
$$;

-- Complete onboarding
CREATE OR REPLACE FUNCTION complete_onboarding(p_user_id uuid)
RETURNS onboarding_progress LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_progress onboarding_progress;
BEGIN
    UPDATE onboarding_progress
    SET current_step = 'completed',
        completed_steps = array_append(completed_steps, current_step),
        completed_at = now(),
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_progress;

    -- Also update users table
    UPDATE users
    SET onboarding_completed_at = now()
    WHERE id = p_user_id;

    RETURN v_progress;
END;
$$;

-- Submit pilot feedback
CREATE OR REPLACE FUNCTION submit_pilot_feedback(
    p_user_id uuid,
    p_business_id uuid,
    p_category pilot_feedback_category,
    p_rating smallint,
    p_feedback_text text DEFAULT NULL,
    p_step_context onboarding_step DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'
)
RETURNS pilot_feedback LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_feedback pilot_feedback;
BEGIN
    INSERT INTO pilot_feedback (
        user_id,
        business_id,
        category,
        rating,
        feedback_text,
        step_context,
        metadata
    ) VALUES (
        p_user_id,
        p_business_id,
        p_category,
        p_rating,
        p_feedback_text,
        p_step_context,
        p_metadata
    ) RETURNING * INTO v_feedback;

    RETURN v_feedback;
END;
$$;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Onboarding funnel view for analytics
CREATE VIEW onboarding_funnel AS
SELECT
    current_step,
    COUNT(*) as user_count,
    COUNT(*) FILTER (WHERE is_pilot_user) as pilot_count,
    COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed_count
FROM onboarding_progress
GROUP BY current_step
ORDER BY
    CASE current_step
        WHEN 'welcome' THEN 1
        WHEN 'business_info' THEN 2
        WHEN 'google_config' THEN 3
        WHEN 'experience_tags' THEN 4
        WHEN 'qr_generation' THEN 5
        WHEN 'qr_test' THEN 6
        WHEN 'dashboard_tour' THEN 7
        WHEN 'completed' THEN 8
    END;

-- Pilot feedback summary
CREATE VIEW pilot_feedback_summary AS
SELECT
    category,
    step_context,
    COUNT(*) as feedback_count,
    ROUND(AVG(rating)::numeric, 2) as avg_rating,
    COUNT(*) FILTER (WHERE rating <= 2) as negative_count,
    COUNT(*) FILTER (WHERE rating >= 4) as positive_count
FROM pilot_feedback
GROUP BY category, step_context
ORDER BY category, step_context;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT ALL ON onboarding_progress TO service_role;
GRANT ALL ON pilot_feedback TO service_role;
GRANT SELECT ON onboarding_funnel TO service_role;
GRANT SELECT ON pilot_feedback_summary TO service_role;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================