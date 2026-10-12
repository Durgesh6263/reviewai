-- ============================================================================
-- Migration: 013_qr_performance_indexes.sql
-- Description: Indexes for instant QR public landing page resolution (< 500ms)
-- ============================================================================

-- Index on qr_codes.slug for fast candidate slug lookup
CREATE INDEX IF NOT EXISTS idx_qr_codes_slug ON qr_codes (slug);

-- Index on businesses.slug for fallback slug resolution
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses (slug);

-- Index on subscriptions.business_id for fast server-side entitlement checks
CREATE INDEX IF NOT EXISTS idx_subscriptions_business_id ON subscriptions (business_id);

-- Composite index on scan_logs for fast debouncing without table scans
CREATE INDEX IF NOT EXISTS idx_scan_logs_qr_ip_scanned_at ON scan_logs (qr_code_id, ip_address, scanned_at DESC);
