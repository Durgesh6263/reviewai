-- ============================================================================
-- ReviewAI - Migration 011: Subscription Snapshot Immutability Protection
-- Supabase PostgreSQL Migration
-- Version: 2.1.0
-- ============================================================================

-- Function to protect historical subscription snapshots from direct manipulation
CREATE OR REPLACE FUNCTION trg_protect_subscription_snapshots()
RETURNS TRIGGER AS $$
DECLARE
    old_history_len INTEGER := 0;
    new_history_len INTEGER := 0;
BEGIN
    -- Determine length of history array to distinguish renewals/activations from in-place edits
    IF OLD.metadata IS NOT NULL AND OLD.metadata ? 'history' THEN
        old_history_len := jsonb_array_length(OLD.metadata->'history');
    END IF;

    IF NEW.metadata IS NOT NULL AND NEW.metadata ? 'history' THEN
        new_history_len := jsonb_array_length(NEW.metadata->'history');
    END IF;

    -- If a new plan activation or renewal occurs, the old subscription state was archived into history
    IF new_history_len > old_history_len THEN
        RETURN NEW;
    END IF;

    -- For in-place updates (quota deduction, cancellation, status changes), snapshot fields are IMMUTABLE:
    -- 1. Plan Version Protection
    IF OLD.plan_version_id IS NOT NULL AND NEW.plan_version_id IS DISTINCT FROM OLD.plan_version_id THEN
        RAISE EXCEPTION 'SNAPSHOT_IMMUTABILITY_VIOLATION: plan_version_id cannot be modified on an existing subscription.';
    END IF;

    -- 2. Quota Protection (allocated total quotas cannot be modified)
    IF OLD.total_qr_quota IS NOT NULL AND NEW.total_qr_quota IS DISTINCT FROM OLD.total_qr_quota THEN
        RAISE EXCEPTION 'SNAPSHOT_IMMUTABILITY_VIOLATION: total_qr_quota cannot be modified on an existing subscription.';
    END IF;

    IF OLD.total_ai_quota IS NOT NULL AND NEW.total_ai_quota IS DISTINCT FROM OLD.total_ai_quota THEN
        RAISE EXCEPTION 'SNAPSHOT_IMMUTABILITY_VIOLATION: total_ai_quota cannot be modified on an existing subscription.';
    END IF;

    -- 3. Price Protection
    IF OLD.price_inr IS NOT NULL AND NEW.price_inr IS DISTINCT FROM OLD.price_inr THEN
        RAISE EXCEPTION 'SNAPSHOT_IMMUTABILITY_VIOLATION: price_inr cannot be modified on an existing subscription.';
    END IF;

    -- 4. Duration Protection
    IF OLD.duration_months IS NOT NULL AND NEW.duration_months IS DISTINCT FROM OLD.duration_months THEN
        RAISE EXCEPTION 'SNAPSHOT_IMMUTABILITY_VIOLATION: duration_months cannot be modified on an existing subscription.';
    END IF;

    -- 5. Start Date Protection
    IF OLD.start_date IS NOT NULL AND NEW.start_date IS DISTINCT FROM OLD.start_date THEN
        RAISE EXCEPTION 'SNAPSHOT_IMMUTABILITY_VIOLATION: start_date cannot be modified on an existing subscription.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to subscriptions table
DROP TRIGGER IF EXISTS trg_subscriptions_snapshot_protection ON subscriptions;
CREATE TRIGGER trg_subscriptions_snapshot_protection
BEFORE UPDATE ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION trg_protect_subscription_snapshots();
