-- ============================================================================
-- Migration: 005_pilot_insights_indexes.sql
-- Description: Composite index for fast lookup of earliest review session
--              started_at per business for Step 28A pilot insights reliability.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_review_sessions_biz_started_at 
ON review_sessions (business_id, started_at ASC);

COMMENT ON INDEX idx_review_sessions_biz_started_at IS 'Optimizes pilot insights MIN(started_at) and range queries per business';
