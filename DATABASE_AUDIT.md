# Database Schema, Indexes, Constraints, RLS Audit

## Overview
Review of 3 migration files:
1. `001_initial_schema.sql` - Core schema (13 tables)
2. `002_admin_tables.sql` - Analytics & admin tables (7 tables)
3. `003_upgrade_requests.sql` - Upgrade requests table

---

## Schema Issues & Observations

### 1. **Missing Indexes on Partitioned Tables** (Critical)
**Files:** `001_initial_schema.sql` lines 436-449, 443-449, 473-479

**Problem:** Indexes on partitioned tables (scan_logs, review_sessions, audit_logs) are only COMMENTS, not actual CREATE INDEX statements. PostgreSQL does NOT automatically create indexes on partitions.

**Impact:** Query performance will be severely degraded on partitioned tables.

**Fix Required:** Create indexes on each partition or use a trigger/function to auto-create indexes on new partitions. The `create_future_partitions()` function (lines 1278-1352) creates indexes on new partitions, but existing partitions may be missing them.

### 2. **BRIN Indexes Not Created on Partitions** (High)
**Files:** Same as above, lines 441, 449, 479

**Problem:** BRIN indexes for time-series queries are only commented. These are essential for scan_logs.scanned_at, review_sessions.started_at, audit_logs.created_at queries.

### 3. **Missing Composite Indexes for Common Query Patterns** (Medium)

| Table | Missing Index | Query Pattern |
|-------|--------------|---------------|
| scan_logs | (business_id, scanned_at DESC) | Dashboard analytics date range |
| review_sessions | (business_id, status, started_at) | Active sessions, funnel queries |
| review_sessions | (qr_code_id, status) | QR code analytics |
| generated_reviews | (business_id, created_at DESC) | Recent reviews |
| audit_logs | (business_id, action, created_at) | Business audit trail |
| api_logs | (business_id, created_at DESC) | Business API monitoring |

### 4. **Foreign Key Missing: review_sessions → scan_logs** (Low)
**File:** `001_initial_schema.sql` line 184 has `scan_log_id uuid NOT NULL REFERENCES scan_logs(id)`

But line 139 has `session_id uuid` with comment "FK added after review_sessions creation" - the FK is added at line 221-223. This is a circular reference resolved correctly.

### 5. **NOT NULL Constraints on Optional Fields** (Medium)
- `businesses.phone` - should be nullable (currently is)
- `businesses.website_url` - should be nullable (currently is)
- `businesses.address` - jsonb, should allow null (currently does)
- `qr_codes.label` - nullable, good
- `scan_logs.ip_address` - inet nullable, good
- `scan_logs.referrer` - text nullable, good

### 6. **CHECK Constraints**
**Good:** session_status enum, rating CHECK (1-5), subscription_status enum, etc.
**Missing:** 
- `businesses.settings` - should validate JSON structure
- `qr_codes.design` - should validate JSON structure
- `generated_reviews.token_usage` - should validate JSON structure

### 7. **Partition Strategy**
**Good:** Monthly partitions for high-volume tables
**Concern:** 
- scan_logs: 13 months pre-created, but `create_future_partitions()` only creates 2 months ahead
- Need pg_cron job scheduled for monthly partition maintenance
- Retention: scan_logs 24 months, audit_logs 84 months (7 years) - good

---

## RLS Policy Issues

### 1. **Public QR Code Read Policy Too Broad** (High)
**File:** `001_initial_schema.sql` lines 681-684
```sql
CREATE POLICY "Public can read active QR codes by slug"
    ON qr_codes FOR SELECT
    USING (is_active = true);
```
**Problem:** Allows ANYONE to read ALL active QR codes (including business_id, design, etc.) - not just by slug.

**Fix:** Should restrict to specific slug or use a function with SECURITY DEFINER.

### 2. **Service Role Bypasses All RLS** (By Design)
**Files:** Multiple - lines 690-692, 720-728, 756-759, etc.
```sql
CREATE POLICY "Service role can insert scan logs"
    ON scan_logs FOR INSERT
    WITH CHECK (true);
```
**Note:** This is intentional for backend operations but means service role has full access. Ensure service role key is protected.

### 3. **Business Staff Policy Allows All Roles for SELECT** (Medium)
**File:** `001_initial_schema.sql` lines 631-633
```sql
CREATE POLICY "Users can view their own staff memberships"
    ON business_staff FOR SELECT
    USING (user_id = auth.uid());
```
**Good:** Users can only see their own memberships.

### 4. **Analytics Tables RLS** (Medium)
**File:** `002_admin_tables.sql`
- `daily_analytics`: Business owners + staff with manager+ roles
- `business_analytics` & `qr_code_analytics`: Admin only
- This separation is correct.

### 5. **Missing RLS on upgrade_requests for business staff** (Low)
**File:** `003_upgrade_requests.sql` lines 67-74
Only owner_id and admin can view. Staff with 'admin' role on business should also be able to view.

---

## Constraints & Data Integrity

### 1. **Unique Constraints**
✅ users.email, businesses.slug, qr_codes.slug
✅ business_staff (business_id, user_id)
✅ upgrade_requests (business_id, requested_plan) WHERE status='pending'
✅ daily_analytics (business_id, date)

### 2. **Check Constraints**
✅ Enums enforced via types
✅ rating BETWEEN 1 AND 5
✅ subscription_status, billing_cycle, etc.

### 3. **Cascade Deletes**
✅ businesses → qr_codes, scan_logs, review_sessions, generated_reviews, subscriptions, etc.
✅ qr_codes → scan_logs, review_sessions
⚠️ users → businesses (SET NULL on owner_id) - business becomes orphaned if owner deleted
   - Consider: RESTRICT or transfer ownership before delete

---

## Functions & Triggers

### 1. **Security Definer Functions** (Good)
- `log_audit_action()` - SECURITY DEFINER, captures auth.uid(), client_ip, user_agent
- `ingest_scan_log()` - SECURITY DEFINER, validates QR code active
- `start_review_session()` - SECURITY DEFINER, creates session + links scan_log
- `update_upgrade_request_with_subscription()` - SECURITY DEFINER, FOR UPDATE locking

### 2. **Trigger Functions for Auto-Aggregation** (Excellent)
- `update_daily_analytics_on_scan()` - AFTER INSERT on scan_logs
- `update_daily_analytics_on_session()` - AFTER UPDATE on review_sessions
- `update_business_qr_analytics()` - AFTER INSERT/UPDATE on scan_logs & review_sessions
- These maintain pre-aggregated tables for fast dashboard queries

### 3. **Partition Maintenance Functions** (Good)
- `create_future_partitions()` - creates next 2 months of partitions
- `drop_old_partitions()` - retention cleanup
- Need pg_cron scheduling

---

## Views

### 1. **business_analytics_summary** (line 1448)
**Issue:** Uses `COUNT(DISTINCT ...)` which is slow on large tables. Should use pre-aggregated `daily_analytics` instead.

### 2. **business_stats & qr_code_stats** (002_admin_tables.sql lines 298-351)
**Issue:** Same - uses raw table scans. Should use pre-aggregated tables.

### 3. **subscription_usage_current** (line 1471)
Good - uses usage_logs with current period filter.

---

## Missing Features / Recommendations

### 1. **Visitor Identification for Analytics** (Critical for Analytics Audit)
**Problem:** `scan_logs` has no visitor identifier (cookie, fingerprint, IP hash)
**Impact:** Cannot calculate unique visitors, repeat visitor rate
**Fix:** Add `visitor_hash` column (SHA256 of IP+UA or client-generated fingerprint)

### 2. **Session-Funnel Alignment** (High)
**Problem:** `review_sessions.started_at` vs `scan_logs.scanned_at` can differ
**Fix:** Add `session_started_at` to scan_logs or use single event timestamp

### 3. **Missing Index on scan_logs.session_id** (Medium)
Line 139: `session_id uuid` - no index mentioned for partition tables
Needed for JOIN scan_logs → review_sessions

### 4. **Soft Delete Consistency** (Low)
Most tables have `deleted_at` but `qr_codes`, `scan_logs`, `review_sessions`, `generated_reviews` don't
- These use partition strategy + cascading deletes instead
- Consider adding `deleted_at` for consistency if needed

### 5. **Audit Logs Missing user_name/user_email Columns** (Medium)
**File:** `003_upgrade_requests.sql` line 188-198 uses:
```sql
(SELECT name FROM users WHERE id = p_admin_id) as user_name
```
But `audit_logs` table (001 line 326-338) doesn't have these columns - only `user_id`, `metadata`.
**Fix:** Either add columns or store in metadata JSON.

---

## Summary: Priority Fixes

| Priority | Issue | File | Line |
|----------|-------|------|------|
| Critical | Missing indexes on partitioned tables | 001 | 436-479 |
| Critical | Public QR code read policy too broad | 001 | 681-684 |
| Critical | No visitor identification in scan_logs | 001 | 135-149 |
| High | Missing composite indexes | 001 | - |
| High | BRIN indexes not created | 001 | 441,449,479 |
| Medium | Views use raw scans instead of pre-aggregated | 001, 002 | 1448, 298, 328 |
| Medium | audit_logs missing user_name/user_email | 003 | 188-198 |
| Low | Soft delete inconsistency | - | - |

---

## Compliance Notes
- ✅ 7-year audit log retention (84 months)
- ✅ PII handling: email, IP addresses stored
- ✅ Password hashing (bcrypt) in users.password_hash
- ✅ API key hashing (bcrypt) in api_keys.key_hash
- ⚠️ Consider: Data export/deletion for GDPR (no automated process visible)