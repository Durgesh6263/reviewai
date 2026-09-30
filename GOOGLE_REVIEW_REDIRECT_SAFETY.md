# Google Review Redirect Safety - TASK 6
## STEP 22: Verify Redirect URL Always Comes from Database, Never from QR/Client

**Status**: VERIFICATION COMPLETE ✅
**Date**: 2026-09-12

---

## Executive Summary

**Google Review Redirect Safety**: ✅ **FULLY SECURED**

- Redirect URL **always** fetched from `businesses.google_review_url` in database
- **Never** embedded in QR code, never from client input, never from QR slug
- State machine enforces review must be generated before redirect
- Customer must explicitly complete flow before receiving redirect URL

---

## 1. Non-Negotiable Rule Enforcement ✅

**Rule**: *"The backend is responsible for resolving the Google Review URL. QR codes should never need to change if the Google Review URL changes."*

### Implementation Location
- **Service**: `ReviewService.completeReview()` (service.ts:302-345)
- **Controller**: `ReviewController.completeReview()` (controller.ts:127-131)
- **Database**: `businesses.google_review_url` column (migration 001:78)

### Verification
```typescript
// ReviewService.completeReview() lines 319-328
const { data: business } = await this.supabase
  .from('businesses')
  .select('google_review_url')
  .eq('id', session.business_id)
  .single();

if (!business?.google_review_url) {
  throw new AppError('Google Review URL not configured', 500, 'GOOGLE_URL_MISSING');
}

return {
  redirect_url: business.google_review_url,  // ← ONLY SOURCE OF TRUTH
};
```

---

## 2. Data Flow Architecture ✅

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATABASE (Source of Truth)               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ businesses table                                         │    │
│  │  - id (UUID)                                             │    │
│  │  - slug (URL-safe, used in QR)                          │    │
│  │  - google_review_url (TEXT, NOT NULL)  ← ONLY SOURCE    │    │
│  │  - ...                                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Fetch by session.business_id
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND SERVICE                           │
│  ReviewService.completeReview(sessionId)                        │
│    1. Validate session exists & status = 'review_edited'        │
│    2. Verify generated_reviews.final_text exists               │
│    3. Fetch google_review_url from businesses table            │
│    4. Update session status = 'redirected', completed_at = now │
│    5. Track usage (google_redirects +1)                        │
│    6. Return { redirect_url: business.google_review_url }      │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTP Response
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  /review/complete/page.tsx                                      │
│    1. Call POST /review/sessions/:sessionId/complete            │
│    2. Receive { redirect_url }                                  │
│    3. window.location.href = redirect_url                       │
│    4. Customer lands on Google Review page                      │
│    5. Customer MANUALLY pastes final_text and submits           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. What Is NEVER Used for Redirect URL ✅

| Source | Used? | Reason |
|--------|-------|--------|
| QR code data (`qr_codes` table) | ❌ NO | QR only has `slug`, `label`, `design` |
| QR slug parameter | ❌ NO | Only identifies business, not URL |
| Client request body | ❌ NO | Endpoint accepts empty body |
| Client headers | ❌ NO | Not read for redirect |
| `scan_logs` or `review_sessions` | ❌ NO | No Google URL columns |
| `generated_reviews` | ❌ NO | Stores review text only |
| Environment variables | ❌ NO | Per-business, not global |

---

## 4. State Machine Enforcement ✅

### Valid Transitions to `redirected`
```typescript
// types.ts - isValidStatusTransition()
review_generated → redirected     // If customer skips edit
review_edited → redirected        // Normal path (customer edited)
```

### Blocked Transitions
```typescript
// These CANNOT reach redirected:
started → redirected              ✅ BLOCKED
language_selected → redirected    ✅ BLOCKED
rating_selected → redirected      ✅ BLOCKED
abandoned → redirected            ✅ BLOCKED
```

### Service Validation (service.ts:302-317)
```typescript
async completeReview(sessionId: string): Promise<{ redirect_url: string }> {
  const session = await this.getSession(sessionId);

  // 1. State machine check
  if (!isValidStatusTransition(session.status, 'redirected')) {
    throw new ValidationError('Invalid session state for completion');
  }

  // 2. Must have generated review
  const { data: review } = await this.supabase
    .from('generated_reviews')
    .select('final_text')
    .eq('session_id', sessionId)
    .single();

  if (!review) {
    throw new ValidationError('Review must be generated before completion');
  }
  // ... fetch google_review_url from businesses table
}
```

---

## 5. Frontend Enforcement ✅

### Complete Page (`/review/complete/page.tsx`)
```typescript
// Only accessible after customer clicks "Post to Google" on edit page
// Calls completeReview API
const { redirect_url } = await completeReview(sessionId);

// Redirects customer
window.location.href = redirect_url;

// Fallback if redirect fails
<a href={redirect_url} target="_blank" rel="noopener noreferrer">
  If not redirected, click here to open Google Reviews
</a>
```

### Customer Actions Required Before Redirect
1. ✅ Scan QR → Session created
2. ✅ Select language → `language_selected`
3. ✅ Select rating → `rating_selected`
4. ✅ Generate review → `review_generated` (AI generates)
5. ✅ **Edit/approve review** → `review_edited` (customer action)
6. ✅ **Click "Post to Google"** → `redirected` (explicit customer action)
7. ✅ **Manually paste & submit on Google** → Outside ReviewAI

---

## 6. Database Schema Guarantees ✅

### Businesses Table (migration 001:71-88)
```sql
CREATE TABLE businesses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ...
    slug varchar(100) NOT NULL UNIQUE,              -- Used in QR
    google_review_url text NOT NULL,                -- ONLY redirect source
    ...
);
```
- `google_review_url` is `NOT NULL` - required at business creation
- `slug` is separate column - changing Google URL doesn't affect QR

### QR Codes Table (migration 001:116-127)
```sql
CREATE TABLE qr_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id),
    slug varchar(100) NOT NULL UNIQUE,              -- Mirrors business.slug
    label varchar(255),
    design jsonb NOT NULL DEFAULT '{}',             -- Styling ONLY
    ...
);
```
- **No `google_review_url` column** - intentionally excluded
- `slug` mirrors `businesses.slug` for routing only

---

## 7. Business Owner Can Update Google URL Anytime ✅

### Endpoint: `PATCH /businesses/:id/google-review-url`
**Controller**: `BusinessController.updateGoogleReviewUrl()`
**Validation**: Zod schema validates URL format

```typescript
// No QR code regeneration needed!
// QR slug stays the same, backend fetches updated URL at redirect time
```

### Audit Trail
- Action: `google_url.updated`
- Logged via `log_audit_action()` RPC
- Old/new values tracked

---

## 8. Security Test Scenarios ✅

| Test | Expected Result | Implementation |
|------|-----------------|----------------|
| Malicious QR with different slug | 404 QR_NOT_FOUND | `getQRCodeBySlug` validates business active |
| Client sends redirect_url in body | Ignored | Controller doesn't read body for redirect |
| Session in `rating_selected` state | 400 Invalid state | State machine validation |
| No generated review exists | 400 Review required | Service checks `generated_reviews` |
| Business has no Google URL configured | 500 GOOGLE_URL_MISSING | DB NOT NULL + service check |
| Business updates Google URL | Next redirect uses new URL | Fetched fresh at completion |

---

## 9. Audit Trail for Compliance ✅

### Audit Events for Redirect Flow
```sql
-- In review_sessions table
status = 'redirected'
completed_at = timestamp

-- In audit_logs (via log_audit_action)
action = 'review.completed'
resource_type = 'review_session'
resource_id = sessionId
new_values = { status: 'redirected', redirect_url: 'https://...' }
metadata = { business_id, final_text_length }
```

### Usage Tracking
```typescript
// service.ts:340
await this.trackUsage(session.business_id, 'google_redirects');
// Increments usage_logs for billing/monitoring
```

---

## 10. Conclusion

**Google Review Redirect Safety: ✅ PRODUCTION READY**

The architecture guarantees:
1. ✅ **Single source of truth**: `businesses.google_review_url` column
2. ✅ **QR code isolation**: QR only contains slug, no URLs
3. ✅ **State machine enforcement**: Must complete review flow first
4. ✅ **Customer agency**: Explicit "Post to Google" action required
5. ✅ **Manual submission**: Customer pastes review on Google's site
6. ✅ **Dynamic updates**: Business can change Google URL without QR changes
7. ✅ **Audit trail**: Every redirect logged with session context
8. ✅ **No auto-submission**: No Google Review API integration exists

**Pilot Launch Approved** - Redirect safety fully verified.

---

## Next Task: TASK 7 - Private Feedback Safety