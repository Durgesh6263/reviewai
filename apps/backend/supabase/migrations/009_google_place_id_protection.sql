-- Migration 009: Business Onboarding & Google Business Duplicate Protection
-- ReviewAI SaaS Platform

-- 1. Ensure google_place_id column exists on businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(255);

-- 2. Populate google_place_id from settings where available
UPDATE businesses 
SET google_place_id = settings->>'google_place_id'
WHERE google_place_id IS NULL AND settings->>'google_place_id' IS NOT NULL;

-- 3. Create partial unique index on google_place_id for active businesses
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_google_place_id_unique
ON businesses (google_place_id)
WHERE google_place_id IS NOT NULL AND deleted_at IS NULL;
