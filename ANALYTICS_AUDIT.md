# Analytics Metric Correctness Audit

## Issues Found

### 1. **Unique Visitors Calculation is Incorrect** (Critical)
**File:** `src/modules/analytics/service.ts:246`
```typescript
const uniqueVisitors = new Set(scans?.map(s => s.id) || []).size;
```
**Problem:** Uses scan log ID as visitor identifier. Each scan gets a unique ID, so this equals total scans, not unique visitors.
**Fix:** Use IP hashing, device fingerprinting, or session-based identification.

### 2. **Conversion Rate Formula is Wrong** (High)
**Current:** `totalGoogleRedirects / totalScans * 100`
**Should be:** `totalGoogleRedirects / totalSessionsStarted * 100` (session-to-redirect conversion)
**OR track funnel:** Scans → Sessions → Generated → Redirects

### 3. **Abandonment Rate Calculation is Misleading** (Medium)
**Current:** `(totalSessionsStarted - totalGoogleRedirects) / totalSessionsStarted * 100`
**Issue:** Includes sessions that are still in progress. Should only count completed/abandoned sessions.

### 4. **Date Filtering Inconsistency** (High)
- Scans filtered by `created_at`
- Sessions filtered by `started_at`  
- Reviews filtered by `created_at`
**Problem:** Different date fields can cause mismatch in same period. Should align on a common time dimension.

### 5. **Daily Trends Grouping Only Implements 'day'** (Medium)
**File:** `calculateDailyTrends` (line 392-417)
- Ignores `groupBy` parameter for 'week' and 'month'
- Always groups by day regardless of filter

### 6. **Rating Distribution Source** (Low)
**Current:** Uses `sessions?.rating` 
**Should use:** `generated_reviews.rating` (actual submitted reviews) for accuracy

### 7. **Session Duration Calculation Edge Cases** (Medium)
**File:** Lines 118-126
- Uses `completed_at` but sessions can be abandoned
- No handling for sessions stuck in progress
- Should use `abandoned_at` for abandoned sessions

### 8. **Realtime Metrics Window Alignment** (Low)
- Uses 60-minute sliding window
- Queries use `gte` on timestamps but no upper bound (now)
- Could include future timestamps if clock skew

### 9. **QR Code Unique Visitors Same Issue** (Critical)
**File:** Line 436
```typescript
const uniqueVisitors = new Set(dayScans.map(s => s.id)).size;
```
Same problem - uses scan ID instead of visitor identifier.

### 10. **Country/City Stats Conversion Rate** (Medium)
**File:** Lines 274-275
```typescript
conversion_rate: data.scans > 0 ? Math.round((data.redirects / data.scans) * 10000) / 100 : 0,
```
Same issue - uses scans as denominator instead of sessions.

## Recommended Fixes

1. **Add visitor identification** to scan_logs table (IP hash, user agent hash, or fingerprint)
2. **Fix conversion funnel metrics** - track: scans → sessions → generated → redirects
3. **Implement proper groupBy logic** for week/month in daily trends
4. **Align date filtering** on common dimension (e.g., event date)
5. **Use review ratings** instead of session ratings for distribution
6. **Handle abandoned sessions** in duration calculation
7. **Add upper bound** to realtime window queries

## Data Model Notes

Tables involved:
- `scan_logs` - QR code scans
- `review_sessions` - Review generation sessions
- `generated_reviews` - AI-generated reviews

Current RLS policies should allow business owners to query their own analytics.