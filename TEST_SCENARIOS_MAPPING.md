# End-to-End Customer Flow Test Scenarios Mapping
## STEP 22 - TASK 1: Complete End-to-End Customer Flow Test (16 Scenarios)

**Status**: VERIFICATION IN PROGRESS
**Date**: 2026-09-12

---

## Canonical 11-Step Customer Journey (Implemented)

| Step | Page | Backend Endpoint | Status |
|------|------|------------------|--------|
| 1. Scan QR | `/r/[slug]` | `POST /r/:slug/scan` | ✅ Implemented |
| 2. Business Identified | `/r/[slug]` | `GET /r/:slug` | ✅ Implemented |
| 3. Language Selection | `/review/language` | `PATCH /sessions/:id/language` | ✅ Implemented |
| 4. Rating Selection | `/review/rating` | `PATCH /sessions/:id/rating` | ✅ Implemented |
| 5. AI Generation | `/review/generate` | `POST /reviews/generate` | ✅ Implemented |
| 6. Review Edit | `/review/edit` | `PATCH /reviews/:sessionId` | ✅ Implemented |
| 7. Regenerate (max 5) | `/review/generate` | `POST /reviews/:sessionId/regenerate` | ✅ Implemented |
| 8. Complete/Redirect | `/review/complete` | `POST /sessions/:id/complete` | ✅ Implemented |
| 9. Abandon | (auto) | `POST /sessions/:id/abandon` | ✅ Implemented |
| 10. Flow Step Check | (all pages) | `GET /sessions/:id/flow-step` | ✅ Implemented |

---

## 16 Test Scenarios Mapping

### ⭐ Scenarios 1-5: 5-Star Through 1-Star Paths (Happy Paths)

| Scenario | Rating | Language | Expected Flow | Backend Verification |
|----------|--------|----------|---------------|---------------------|
| **SC-01** | ⭐⭐⭐⭐⭐ (5) | English | Full flow → redirect | `rating=5` in `review_sessions`, `generated_reviews.rating=5` |
| **SC-02** | ⭐⭐⭐⭐ (4) | Spanish | Full flow → redirect | `rating=4`, `language=es` |
| **SC-03** | ⭐⭐⭐ (3) | French | Full flow → redirect | `rating=3`, `language=fr` |
| **SC-04** | ⭐⭐ (2) | German | Full flow → redirect | `rating=2`, `language=de` |
| **SC-05** | ⭐ (1) | Portuguese | Full flow → redirect | `rating=1`, `language=pt` |

**Verification Points for Each:**
- [ ] Session status transitions: `started → language_selected → rating_selected → review_generated → review_edited → redirected`
- [ ] AI prompt includes correct rating (★ visual for 4-5, ☆ for 1-3)
- [ ] `generated_reviews.final_text` = `COALESCE(edited_text, generated_text)`
- [ ] `completeReview()` returns `business.google_review_url` from DB
- [ ] Usage tracked: `review_generations +1`, `google_redirects +1`
- [ ] Session `completed_at` timestamp set

---

### 🌐 Scenarios 6-8: Language Edge Cases (Unicode/CJK)

| Scenario | Language | Code | Test Focus | Backend Verification |
|----------|----------|------|------------|---------------------|
| **SC-06** | Hinglish | `hinglish` | Code-switched Hindi/English, Devanagari + Latin | `language=hinglish`, prompt uses Hinglish instructions |
| **SC-07** | Chinese (Simplified) | `zh` | CJK characters, 4000 char limit in UTF-8 | `language=zh`, token estimation handles multi-byte |
| **SC-08** | Korean | `ko` | Hangul syllables, proper line breaking | `language=ko`, character counter counts graphemes |

**Verification Points:**
- [ ] All 11 languages in `REVIEW_CONSTANTS.SUPPORTED_LANGUAGES` (types.ts:15-26)
- [ ] AI provider prompt templates handle each language correctly
- [ ] Frontend displays native language names (हिंग्लिश, 中文, 한국어)
- [ ] Character counter: 4000 limit applies to Unicode code points
- [ ] No encoding issues in DB (utf8mb4 / PostgreSQL UTF-8)

---

### 🔄 Scenarios 9-10: Regeneration Limits

| Scenario | Action | Expected Behavior | Backend Verification |
|----------|--------|-------------------|---------------------|
| **SC-09** | Regenerate 5 times | All 5 succeed, counter shows 1-5 | `regeneration_count` increments 0→5, `edited_text` reset each time |
| **SC-10** | Attempt 6th regeneration | **400 ValidationError** "Maximum regenerations (5) reached" | `existingReview.regeneration_count >= MAX_REGENERATIONS` throws |

**Code Location:** `ReviewService.generateReview()` lines 155-163
```typescript
if (existingReview && existingReview.regeneration_count >= REVIEW_CONSTANTS.MAX_REGENERATIONS) {
  throw new ValidationError(`Maximum regenerations (${REVIEW_CONSTANTS.MAX_REGENERATIONS}) reached`);
}
```
**Constant:** `MAX_REGENERATIONS = 5` in types.ts

---

### ✏️ Scenarios 11-12: Edit Validation

| Scenario | Input | Expected Behavior | Backend Verification |
|----------|-------|-------------------|---------------------|
| **SC-11** | Empty review | **400 ValidationError** "Review text cannot be empty" | Frontend validates min 10 chars before API call |
| **SC-12** | 4001 characters | **400 ValidationError** "Review exceeds 4000 characters" | Frontend validates max 4000 chars, backend re-validates |

**Frontend Validation** (edit/page.tsx):
- Min 10 characters required
- Max 4000 characters enforced
- Character counter shows warning at 90% (3600 chars)

**Backend Note:** Currently no explicit length validation in `updateReview()` - relies on frontend + DB constraint. **Recommendation**: Add server-side validation.

---

### ⚠️ Scenarios 13-15: Error Conditions

| Scenario | Error Condition | Expected Behavior | Backend Verification |
|----------|-----------------|-------------------|---------------------|
| **SC-13** | AI provider failure | Fallback to secondary provider, or graceful error with retry button | `AIProviderFactory` has fallback logic; `generateReview` catches and returns error toast |
| **SC-14** | Subscription limit exceeded (Free at 50) | **403 REVIEW_GENERATION_LIMIT_EXCEEDED** with upgrade prompt | `checkReviewGenerationLimit()` in service.ts lines 413-495 |
| **SC-15** | Invalid state transitions | **400 ValidationError** "Invalid session state for X" | `isValidStatusTransition()` in types.ts validates all transitions |

**SC-13 AI Failure Details:**
- OpenAI primary, Gemini fallback via factory
- Error handling in controller.ts wraps service calls
- Frontend shows "Retry" button on generation failure

**SC-14 Limit Check Flow:**
```typescript
// Free plan: counts generated_reviews in last 30 days
// Paid plans: uses usage_logs with current_period_start/end
// Throws AppError(403, 'REVIEW_GENERATION_LIMIT_EXCEEDED')
```

**SC-15 State Machine Validation:**
```typescript
// Valid transitions enforced by isValidStatusTransition()
started → language_selected → rating_selected → review_generated → review_edited → redirected
                    ↘ abandoned (from any pre-redirected state)
```

---

### 📱 Scenario 16: QR Code Edge Cases

| Scenario | Condition | Expected Behavior | Backend Verification |
|----------|-----------|-------------------|---------------------|
| **SC-16a** | Inactive business | **404** "Business not found or inactive" | `getQRCodeBySlug` checks `business.status = 'active' AND deleted_at IS NULL` |
| **SC-16b** | Inactive QR code | **404** "QR code not found or inactive" | `qr_codes.is_active = true` required in query |
| **SC-16c** | Invalid slug | **404** "QR code not found" | `getQRCodeBySlug` returns null → NotFoundError |

**Code Location:** `QRController.getQRCodeBySlug()` → `QRService.getQRCodeBySlug()`
```sql
SELECT qc.*, b.name, b.slug, b.logo_url, b.google_review_url, b.settings, b.status
FROM qr_codes qc
JOIN businesses b ON b.id = qc.business_id
WHERE qc.slug = $1 AND qc.is_active = true AND b.deleted_at IS NULL AND b.status = 'active'
```

---

## Test Execution Checklist

### Pre-Test Setup
- [ ] Test business created with Free plan (50 generations limit)
- [ ] Test business created with Starter plan (500 limit)
- [ ] Google Review URL configured for test businesses
- [ ] QR codes generated and active
- [ ] OpenAI API key configured (Gemini as fallback)

### Test Data Requirements
| Data | Values |
|------|--------|
| Business slugs | `test-5star`, `test-4star`, `test-hinglish`, `test-chinese`, `test-korean`, `test-regen`, `test-limits`, `test-qr-edge` |
| Languages to test | `en`, `es`, `fr`, `de`, `pt`, `hinglish`, `zh`, `ko`, `hi`, `it`, `ja` |
| Ratings to test | 1, 2, 3, 4, 5 |

### Automated Test Script (Pseudo-code)

```typescript
// For each scenario, verify:
async function runScenario(scenario) {
  // 1. POST /r/:slug/scan → session_id
  // 2. PATCH /sessions/:id/language → language
  // 3. PATCH /sessions/:id/rating → rating
  // 4. POST /reviews/generate → generated_review
  // 5. (Optional) PATCH /reviews/:sessionId → edited_text
  // 6. (Optional) POST /reviews/:sessionId/regenerate (up to 5x)
  // 7. POST /sessions/:id/complete → redirect_url
  // 8. Verify redirect_url === business.google_review_url
  // 9. Verify session.status === 'redirected', completed_at set
  // 10. Verify usage_logs incremented
}
```

---

## Known Gaps / Items to Fix Before Pilot

| Gap | Severity | Scenario Impact |
|-----|----------|-----------------|
| Backend edit validation missing (min 10, max 4000) | Medium | SC-11, SC-12 |
| Character counter counts code points not graphemes | Low | SC-07, SC-08 |
| No automated test suite exists | High | All scenarios |
| AI fallback not fully tested | Medium | SC-13 |
| Private feedback endpoints missing (frontend expects) | Medium | Dashboard only |

---

## Verification Results (To Be Filled During Testing)

| Scenario | Pass/Fail | Notes |
|----------|-----------|-------|
| SC-01: 5-star English | ⬜ | |
| SC-02: 4-star Spanish | ⬜ | |
| SC-03: 3-star French | ⬜ | |
| SC-04: 2-star German | ⬜ | |
| SC-05: 1-star Portuguese | ⬜ | |
| SC-06: Hinglish | ⬜ | |
| SC-07: Chinese (CJK) | ⬜ | |
| SC-08: Korean (Hangul) | ⬜ | |
| SC-09: 5 Regenerations | ⬜ | |
| SC-10: 6th Regeneration Blocked | ⬜ | |
| SC-11: Empty Edit Blocked | ⬜ | |
| SC-12: 4001 Char Edit Blocked | ⬜ | |
| SC-13: AI Failure Handling | ⬜ | |
| SC-14: Subscription Limit | ⬜ | |
| SC-15: Invalid Transitions | ⬜ | |
| SC-16: QR Edge Cases | ⬜ | |

---

## Next Steps After TASK 1

1. **TASK 2**: Verify customer authorship - ensure AI never impersonates, customer must approve/edit
2. **TASK 3**: Security audit - all 50+ endpoints checked for auth, validation, RLS
3. **TASK 4**: AI cost protection - rate limits, token budgets, abuse detection