# Performance Audit: Dashboard Queries, QR Page Loading, AI Generation

## Overview
Analysis of backend database queries and performance patterns across key user flows.

---

## 1. Dashboard Queries (Business Analytics)

### Current Implementation Issues

**File:** `src/modules/analytics/service.ts` - `getBusinessAnalytics()`

**Problem 1: Multiple Sequential Queries**
```typescript
// Lines 52-101: 3 separate queries executed sequentially
const { data: scans } = await this.supabase.from('scan_logs')...
const { data: sessions } = await this.supabase.from('review_sessions')...
const { data: reviews } = await this.supabase.from('generated_reviews')...
```
**Impact:** 3 round-trips to database, no parallelization.

**Problem 2: No Index Utilization for Date Ranges**
Queries filter by `created_at` / `started_at` on partitioned tables but no guarantee partition indexes exist (see Database Audit).

**Problem 3: In-Memory Aggregation of Large Datasets**
Lines 104-176: All filtering, grouping, and aggregation done in Node.js memory after fetching ALL rows in date range.
- For 365 days with high volume: could fetch 100k+ rows
- Memory pressure on Node.js process

**Problem 4: Daily Trends Calculation Inefficiency**
Lines 385-417: `calculateDailyTrends()` iterates all days in range, then filters arrays for each day - O(n×d) complexity.

### Recommended Optimizations

1. **Use Pre-Aggregated Tables** (`daily_analytics`, `business_analytics`)
   - Query single table instead of 3 raw tables
   - Already maintained by triggers

2. **Parallelize Independent Queries**
   ```typescript
   const [scansResult, sessionsResult, reviewsResult] = await Promise.all([
     this.supabase.from('scan_logs')...,
     this.supabase.from('review_sessions')...,
     this.supabase.from('generated_reviews')...
   ]);
   ```

3. **Push Aggregation to Database**
   - Use PostgreSQL `GROUP BY` with `date_trunc()`
   - Or query pre-aggregated `daily_analytics` table

4. **Add Pagination/Limit for Large Date Ranges**
   - Default 30 days, max 365 (already validated)

---

## 2. QR Page Loading (Public Scan Flow)

### Current Implementation

**File:** `src/modules/qr/service.ts` - `handleScan()` (lines 250-319)

**Flow:**
1. `getQRCodeBySlug()` - 1 query with JOIN to businesses
2. `checkQrScanLimit()` - 1-3 queries depending on subscription state
3. `supabase.rpc('ingest_scan_log')` - DB function call
4. `supabase.rpc('start_review_session')` - DB function call
5. Business info query - 1 query
6. Update download_count - 1 UPDATE

**Total: 5-7 database operations per scan**

### Performance Issues

**Issue 1: checkQrScanLimit() - Multiple Sequential Queries (Lines 512-593)**
```typescript
// Query 1: subscription
// Query 2: scan_logs count (if no subscription)
// Query 3: usage_logs (if subscription exists)
// Query 4: plan_configs
```
All sequential, could be 4 round-trips.

**Issue 2: No Caching for Business/Plan Limits**
- Business settings fetched every scan
- Plan limits could be cached in Redis/memory

**Issue 3: Update download_count on Every Scan (Lines 299-306)**
- Non-critical update blocks response
- Could be async/background

**Issue 4: RPC Function Overhead**
- `ingest_scan_log` and `start_review_session` are SECURITY DEFINER functions
- Additional function call overhead

### Recommended Optimizations

1. **Combine Limit Check into Single Query**
   - Use CTE or function to get subscription + usage + limits in one call

2. **Cache Plan Limits**
   - In-memory cache with TTL (plan configs rarely change)
   - Or add `max_qr_scans` column to subscriptions table

3. **Make Non-Critical Updates Async**
   - download_count increment → fire-and-forget
   - Or batch updates periodically

4. **Use Pre-Aggregated Usage from `usage_logs`**
   - Already maintained, just query it directly

5. **Consider Materialized Path for QR→Business**
   - QR slug is same as business slug (1:1 currently)
   - Could fetch business directly by slug

---

## 3. AI Generation Performance

### Current Implementation

**File:** `src/modules/review/service.ts` - `generateReview()` (lines 137-248)

**Flow:**
1. Get session - 1 query
2. `checkReviewGenerationLimit()` - similar to QR scan limit (1-4 queries)
3. Get existing review for regeneration count - 1 query
4. Get business for context - 1 query
5. Call AI Provider (OpenAI/Gemini) - **EXTERNAL API CALL**
6. Insert/update generated_reviews - 1 query
7. Update review_sessions status - 1 query
8. `trackUsage()` - 1 query + RPC call

**Total: 6-9 DB operations + 1 EXTERNAL API CALL**

### Performance Issues

**Issue 1: Synchronous External AI Call Blocks Request (Line 176)**
```typescript
const aiResult = await aiProvider.generateReview({...});
```
- OpenAI: ~2-5 seconds typical
- Gemini: ~1-3 seconds typical
- Entire HTTP request blocked during AI generation

**Issue 2: No Streaming/Progress Updates**
- Frontend shows spinner for full generation time
- No token-by-token streaming

**Issue 3: Regeneration Check Queries Existing Review (Lines 155-163)**
- Additional query before AI call

**Issue 4: Token Usage Estimation Fallback (Line 186)**
```typescript
const tokenUsage = aiResult.tokenUsage || this.estimateTokenUsage(generatedText);
```
- Rough estimation if provider doesn't return usage

### Recommended Optimizations

1. **Async Job Queue for AI Generation**
   - Return `session_id` immediately with status "generating"
   - Process AI generation in background worker (BullMQ, pg-boss, etc.)
   - Frontend polls `/sessions/:id` for completion
   - Or use Server-Sent Events / WebSockets for real-time updates

2. **Stream AI Response to Frontend**
   - Both OpenAI and Gemini support streaming
   - Update generated_reviews incrementally
   - Better perceived performance

3. **Cache Business Context**
   - Business name, settings cached per session
   - Reduce DB queries during generation

4. **Batch Usage Tracking**
   - Accumulate usage in memory, flush periodically
   - Or rely on trigger-based `usage_logs` (already exists)

5. **Add Request Timeout & Fallback**
   - Set timeout on AI calls (e.g., 30s)
   - Fallback to cached/generic review on timeout

---

## 4. Other Query Patterns

### Business List (src/modules/business/service.ts:205-251)
```typescript
// Single query with pagination - GOOD
// But: OR condition for staff memberships (line 221)
//      .or(`owner_id.eq.${userId},id.in.(${await this.getStaffBusinessIds(userId)})`)
```
**Issue:** `getStaffBusinessIds()` makes separate query, then embeds IDs in IN clause.
**Fix:** Use JOIN or subquery instead.

### Session Flow (review/service.ts)
Each step (language, rating, generate, edit, complete) does:
- Get session
- Validate transition
- Update session
- **Good:** Single query per step

---

## Summary: Priority Performance Fixes

| Priority | Component | Issue | Fix |
|----------|-----------|-------|-----|
| Critical | Dashboard Analytics | In-memory aggregation of raw tables | Use `daily_analytics` pre-aggregated table |
| Critical | QR Scan Flow | 5-7 sequential DB ops per scan | Combine limit check, async download_count |
| Critical | AI Generation | Blocking external API call | Async job queue + polling/SSE |
| High | Dashboard Analytics | No parallel query execution | `Promise.all()` for independent queries |
| High | QR Scan Limit Check | 4 sequential queries | Single combined query/CTE |
| Medium | Business List | N+1 query for staff business IDs | JOIN or subquery |
| Medium | AI Generation | No streaming support | Implement token streaming |
| Low | Session Stats | Multiple count queries | Combined aggregation query |

---

## Infrastructure Recommendations

1. **Add Redis Caching Layer**
   - Cache: Plan limits, business settings, subscription status
   - TTL: 5-15 minutes for limits, 1 hour for settings

2. **Implement Background Job Queue**
   - AI generation jobs
   - Usage tracking aggregation
   - Email/webhook delivery
   - Partition maintenance

3. **Database Connection Pooling**
   - Use PgBouncer (Supabase provides)
   - Configure pool size for expected concurrent users

4. **Monitoring**
   - Add query latency logging
   - Track AI generation duration
   - Alert on scan/redirect latency > 500ms