# Error Handling Verification Audit

## Overview
Audit of error handling across all major flows in the ReviewAI SaaS platform, covering backend controllers, services, middleware, and frontend API client.

---

## 1. Global Error Handling (Backend)

### Express Error Handler
**File:** `apps/backend/src/shared/exceptions/index.ts:108-132`

```typescript
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void
```

**Behavior:**
- Catches all errors passed via `next(error)`
- `AppError` instances: Returns structured error with statusCode, code, message, details
- Unknown errors: Logs to console, returns 500 INTERNAL_ERROR
- No stack traces exposed to clients in production

**Coverage:** ✅ All routes use global error handler via `app.use(errorHandler)` in `src/index.ts:205`

### Health Check Endpoints
**File:** `apps/backend/src/index.ts:92-116`

- `/health` - Full health check with DB status
- `/health/ready` - Readiness probe (503 if DB unhealthy)
- `/health/live` - Liveness probe

---

## 2. Authentication Flow Error Handling

### Register (`POST /auth/register`)
**Controller:** `auth/controller.ts:29-37`
**Service:** `auth/service.ts:36-88`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Email already registered | `ConflictError` | 409 | `CONFLICT` |
| DB insert fails | `AppError` | 500 | `USER_CREATION_FAILED` |
| Validation error (Zod) | `AppError` | 400 | `VALIDATION_ERROR` |

**Frontend Handling:** `api-client.ts:303-308` → throws `ApiError` with status/code

### Login (`POST /auth/login`)
**Controller:** `auth/controller.ts:43-52`
**Service:** `auth/service.ts:93-142`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Invalid email/password | `AuthenticationError` | 401 | `UNAUTHORIZED` |
| Account locked (5 failed attempts) | `AuthenticationError` | 401 | `UNAUTHORIZED` |
| User deleted | `AuthenticationError` | 401 | `UNAUTHORIZED` |

**Security:** Tracks failed attempts in `login_attempts` table, locks after 5 attempts in 15 min

### Refresh Token (`POST /auth/refresh`)
**Controller:** `auth/controller.ts:58-66`
**Service:** `auth/service.ts:147-193`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Invalid/expired token | `AuthenticationError` | 401 | `UNAUTHORIZED` |
| Wrong token type | `AuthenticationError` | 401 | `UNAUTHORIZED` |
| Token revoked/not in DB | `AuthenticationError` | 401 | `UNAUTHORIZED` |
| User not found/deleted | `AuthenticationError` | 401 | `UNAUTHORIZED` |

**Security:** Token rotation - old refresh token deleted, new one stored

### Forgot Password (`POST /auth/forgot-password`)
**Controller:** `auth/controller.ts:92-101`
**Service:** `auth/service.ts:215-240`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Email not found | **Success (200)** | 200 | - |
| DB error | `AppError` | 500 | - |

**Security:** Always returns success to prevent email enumeration

### Reset Password (`POST /auth/reset-password`)
**Controller:** `auth/controller.ts:107-115`
**Service:** `auth/service.ts:245-271`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Invalid/expired token | `ValidationError` | 400 | `VALIDATION_ERROR` |
| DB error | `AppError` | 500 | - |

**Security:** Revokes all refresh tokens on password reset

### Verify Email (`POST /auth/verify-email`)
**Controller:** `auth/controller.ts:121-129`
**Service:** `auth/service.ts:276-295`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Invalid token | `ValidationError` | 400 | `VALIDATION_ERROR` |

### Change Password (`POST /auth/change-password`)
**Controller:** `auth/controller.ts:135-149`
**Service:** `auth/service.ts:300-326`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Current password wrong | `AuthenticationError` | 401 | `UNAUTHORIZED` |
| User not found | `NotFoundError` | 404 | `NOT_FOUND` |

**Security:** Revokes all refresh tokens on password change

---

## 3. Business Management Flow Error Handling

### Create Business (`POST /businesses`)
**Controller:** `business/controller.ts:29-40`
**Service:** `business/service.ts:28-64`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Slug generation fails | `AppError` | 500 | `BUSINESS_CREATION_FAILED` |
| DB insert fails | `AppError` | 500 | `BUSINESS_CREATION_FAILED` |

**Authorization:** Only authenticated users (business_owner role)

### List Businesses (`GET /businesses`)
**Controller:** `business/controller.ts:46-57`
**Service:** `business/service.ts:216-262`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| DB query fails | `AppError` | 500 | `BUSINESS_LIST_FAILED` |

**Authorization:** Owner sees own businesses, staff sees assigned businesses, admin sees all

### Get Business (`GET /businesses/:id`)
**Controller:** `business/controller.ts:63-74`
**Service:** `business/service.ts:69-85`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Business not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Access denied | `AuthorizationError` | 403 | `FORBIDDEN` |

### Update Business (`PATCH /businesses/:id`)
**Controller:** `business/controller.ts:97-109`
**Service:** `business/service.ts:105-168`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Business not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Access denied (not owner/admin) | `AuthorizationError` | 403 | `FORBIDDEN` |
| DB update fails | `AppError` | 500 | `BUSINESS_UPDATE_FAILED` |

### Delete Business (`DELETE /businesses/:id`)
**Controller:** `business/controller.ts:133-144`
**Service:** `business/service.ts:185-211`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Business not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Not owner | `AuthorizationError` | 403 | `FORBIDDEN` |

**Note:** Soft delete (sets `deleted_at`, status=`suspended`)

### Public Business by Slug (`GET /r/:slug`)
**Controller:** `business/controller.ts:167-191`
**Service:** `business/service.ts:90-100`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Business not found | `AppError` | 404 | `BUSINESS_NOT_FOUND` |
| Business inactive/deleted | `AppError` | 404 | `BUSINESS_NOT_FOUND` |

**No auth required** - Public endpoint for QR landing page

---

## 4. QR Code Flow Error Handling

### Create QR Code (`POST /businesses/:businessId/qr-codes`)
**Controller:** `qr/controller.ts:29-41`
**Service:** `qr/service.ts:29-76`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Access denied | `AuthorizationError` | 403 | `FORBIDDEN` |
| QR already exists | `ConflictError` | 409 | `CONFLICT` |
| DB insert fails | `AppError` | 500 | `QR_CREATION_FAILED` |

**Business Rule:** Only one QR code per business (uses business slug)

### Scan QR Code (`POST /r/:slug/scan`) - PUBLIC
**Controller:** `qr/controller.ts:152-168`
**Service:** `qr/service.ts:250-319`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| QR code not found/inactive | `NotFoundError` | 404 | `NOT_FOUND` |
| Business not found/inactive | `NotFoundError` | 404 | `NOT_FOUND` |
| Scan limit exceeded (free/plan) | `AppError` | 403 | `QR_SCAN_LIMIT_EXCEEDED` |
| Scan log insert fails | `AppError` | 500 | `SCAN_LOG_FAILED` |
| Session start fails | `AppError` | 500 | `SESSION_START_FAILED` |

**Limit Check Logic:**
1. Get subscription for business
2. If no subscription → free limit (50 scans/30 days)
3. If subscription inactive → free limit on expired period
4. If active subscription → check `usage_logs` against plan limit
5. Enterprise = unlimited

**Public Endpoint:** No authentication required, uses rate limiting

### Get Business by QR Slug (`GET /r/:slug`) - PUBLIC
**Controller:** `qr/controller.ts:174-210`
**Service:** `qr/service.ts:106-117`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| QR not found/inactive | `AppError` | 404 | `QR_NOT_FOUND` |
| Business not found/inactive | `AppError` | 404 | `BUSINESS_NOT_FOUND` |

---

## 5. Review Generation Flow Error Handling

### Get Session (`GET /review/sessions/:sessionId`)
**Controller:** `review/controller.ts:28-36`
**Service:** `review/service.ts:31-43`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Session not found | `NotFoundError` | 404 | `NOT_FOUND` |

### Select Language (`POST /review/sessions/:sessionId/language`)
**Controller:** `review/controller.ts:56-64`
**Service:** `review/service.ts:73-101`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Session not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Invalid state transition | `ValidationError` | 400 | `VALIDATION_ERROR` |
| Unsupported language | `ValidationError` | 400 | `VALIDATION_ERROR` |
| DB update fails | `AppError` | 500 | `SESSION_UPDATE_FAILED` |

**Valid Transitions:** `started` → `language_selected`

### Select Rating (`POST /review/sessions/:sessionId/rating`)
**Controller:** `review/controller.ts:70-78`
**Service:** `review/service.ts:106-132`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Session not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Invalid state transition | `ValidationError` | 400 | `VALIDATION_ERROR` |
| Invalid rating (not 1-5) | `ValidationError` | 400 | `VALIDATION_ERROR` |
| DB update fails | `AppError` | 500 | `SESSION_UPDATE_FAILED` |

**Valid Transitions:** `language_selected` → `rating_selected`

### Generate Review (`POST /review/sessions/:sessionId/generate`)
**Controller:** `review/controller.ts:84-92`
**Service:** `review/service.ts:137-248`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Session not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Invalid state transition | `ValidationError` | 400 | `VALIDATION_ERROR` |
| Rating not selected | `ValidationError` | 400 | `VALIDATION_ERROR` |
| Regeneration limit exceeded (3) | `ValidationError` | 400 | `VALIDATION_ERROR` |
| Business not found | `AppError` | 500 | - |
| AI generation fails | `AppError` | 500 | - |
| DB insert/update fails | `AppError` | 500 | `REVIEW_CREATION_FAILED` / `REVIEW_REGENERATION_FAILED` |
| Generation limit exceeded | `AppError` | 403 | `REVIEW_GENERATION_LIMIT_EXCEEDED` |

**Limit Check:** Same pattern as QR scan limits (subscription-based)

**AI Provider Errors:** Wrapped in `AppError` by AI factory

### Edit Review (`PATCH /review/sessions/:sessionId/edit`)
**Controller:** `review/controller.ts:98-107`
**Service:** `review/service.ts:253-280`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Session not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Invalid state transition | `ValidationError` | 400 | `VALIDATION_ERROR` |
| Review not found | `NotFoundError` | 404 | `NOT_FOUND` |
| DB update fails | `AppError` | 500 | - |

**Valid Transitions:** `review_generated` → `review_edited`

### Regenerate Review (`POST /review/sessions/:sessionId/regenerate`)
**Controller:** `review/controller.ts:113-121`
**Service:** `review/service.ts:285-297`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Session not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Invalid state transition | `ValidationError` | 400 | `VALIDATION_ERROR` |
| (Delegates to generateReview) | Same as generate | | |

### Complete Review (`POST /review/sessions/:sessionId/complete`)
**Controller:** `review/controller.ts:127-135`
**Service:** `review/service.ts:302-345`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Session not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Invalid state transition | `ValidationError` | 400 | `VALIDATION_ERROR` |
| Review not generated | `ValidationError` | 400 | `VALIDATION_ERROR` |
| Google Review URL not configured | `AppError` | 500 | `GOOGLE_URL_MISSING` |
| DB update fails | `AppError` | 500 | - |

**Valid Transitions:** `review_generated` or `review_edited` → `redirected`

**Returns:** `{ redirect_url: string }` - Google Review URL

### Abandon Session (`POST /review/sessions/:sessionId/abandon`)
**Controller:** `review/controller.ts:141-149`
**Service:** `review/service.ts:350-364`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Session not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Already completed/abandoned | `ValidationError` | 400 | `VALIDATION_ERROR` |

---

## 6. Subscription Flow Error Handling

### Get Subscription (`GET /subscriptions/businesses/:businessId`)
**Controller:** `subscription/controller.ts:28-40`
**Service:** `subscription/service.ts:45-91`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Access denied (not owner) | `Error('FORBIDDEN')` | 500* | - |

**Note:** Controller uses `throw new Error('FORBIDDEN')` - caught by global handler as 500. Should be `AuthorizationError`.

### Create Subscription (`POST /subscriptions`)
**Controller:** `subscription/controller.ts:46-58`
**Service:** `subscription/service.ts:123-233`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Access denied | `Error('FORBIDDEN')` | 500* | - |
| Subscription exists | `ConflictError` | 409 | `CONFLICT` |
| Business not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Stripe customer creation fails | `AppError` | 500 | - |
| Stripe subscription creation fails | `AppError` | 500 | `SUBSCRIPTION_CREATION_FAILED` |

### Update Subscription (`PATCH /subscriptions/:subscriptionId`)
**Controller:** `subscription/controller.ts:64-78`
**Service:** `subscription/service.ts:238-292`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Access denied | `Error('FORBIDDEN')` | 500* | - |
| Subscription not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Free plan can't change plan | `ValidationError` | 400 | `VALIDATION_ERROR` |
| Stripe update fails | `AppError` | 500 | `SUBSCRIPTION_UPDATE_FAILED` |

### Cancel Subscription (`POST /subscriptions/:subscriptionId/cancel`)
**Controller:** `subscription/controller.ts:84-98`
**Service:** `subscription/service.ts:297-331`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Access denied | `Error('FORBIDDEN')` | 500* | - |
| Subscription not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Free plan can't cancel | `ValidationError` | 400 | `VALIDATION_ERROR` |
| Stripe cancel fails | `AppError` | 500 | `SUBSCRIPTION_CANCEL_FAILED` |

### Create Checkout Session (`POST /subscriptions/checkout`)
**Controller:** `subscription/controller.ts:104-116`
**Service:** `subscription/service.ts:336-393`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Access denied | `Error('FORBIDDEN')` | 500* | - |
| Free plan | `ValidationError` | 400 | `VALIDATION_ERROR` |
| Subscription exists | `ConflictError` | 409 | `CONFLICT` |
| Stripe checkout fails | `AppError` | 500 | - |

### Create Billing Portal Session (`POST /subscriptions/billing-portal`)
**Controller:** `subscription/controller.ts:122-134`
**Service:** `subscription/service.ts:398-411`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AppError` | 401 | `NOT_AUTHENTICATED` |
| Access denied | `Error('FORBIDDEN')` | 500* | - |
| No billing account | `NotFoundError` | 404 | `NOT_FOUND` |
| Stripe portal fails | `AppError` | 500 | - |

---

## 7. Admin Flow Error Handling

### Admin Routes Protection
**File:** `src/index.ts:190-191`
```typescript
const adminAuthMiddleware = createAuthMiddleware(authService);
app.use(`${API_PREFIX}/admin`, adminAuthMiddleware.authenticate, adminAuthMiddleware.requireRole('admin'), adminRoutes);
```

**Protection:** Double auth - authenticate + requireRole('admin')

### Admin Controllers Pattern
**File:** `admin/controller.ts` - All methods use try/catch + `next(error)`

| Error Scenario | Error Type | Status | Code |
|----------------|------------|--------|------|
| Not authenticated | `AuthenticationError` | 401 | `UNAUTHORIZED` |
| Not admin | `AuthorizationError` | 403 | `FORBIDDEN` |
| Resource not found | `NotFoundError` | 404 | `NOT_FOUND` |
| Validation error | `ValidationError` | 400 | `VALIDATION_ERROR` |
| DB error | `AppError` | 500 | Various |

---

## 8. Frontend Error Handling

### API Client (`apps/frontend/src/lib/api-client.ts`)

**Token Management:**
- Stores tokens in localStorage (`auth_tokens`, `auth_user`)
- Auto-attaches Bearer token to requests
- Auto-refresh on 401 (non-auth endpoints)
- Clears auth and redirects to `/login` on refresh failure

**Error Class:** `ApiError` with status, code, details

**Response Handling:**
```typescript
const response = await this.client.get<T>(url, config);
return response.data; // Returns full response including success/data/message
```

**Frontend Usage Pattern:**
```typescript
try {
  const result = await api.post('/review/sessions/complete', { session_id });
  // result = { success: true, data: {...}, message: '...', meta: {...} }
  if (!result.success) {
    throw new Error(result.error || 'Request failed');
  }
  // Use result.data
} catch (error) {
  if (error instanceof ApiError) {
    // Handle specific status codes
    toast.error(error.message);
  }
}
```

### React Query Integration
**File:** `apps/frontend/src/lib/api-client.ts` - Returns raw axios response data
- TanStack Query handles caching, retries, loading states
- Error boundaries catch unhandled errors

### Toast Notifications
**Library:** `react-hot-toast`
- Used in QR flow pages for user-facing errors
- Example: `toast.error(error.response?.data?.message || 'Failed to complete review')`

---

## 9. Validation Error Handling

### Zod Schema Validation
**Middleware:** `auth/middleware.ts:166-186` - `validate(schema)`
**Usage:** All controllers use Zod schemas via validators

**Error Format:**
```typescript
{
  success: false,
  error: 'Validation failed',
  code: 'VALIDATION_ERROR',
  details: {
    fieldErrors: { field: ['error message'] },
    formErrors: ['error message']
  }
}
```

### Common Validation Errors
| Field | Validation | Error Message |
|-------|------------|---------------|
| email | valid email | "Invalid email format" |
| password | min 8 chars | "Password must be at least 8 characters" |
| slug | alphanumeric + hyphens | "Invalid slug format" |
| UUID | valid UUID v4 | "Invalid ID format" |
| rating | 1-5 integer | "Rating must be between 1 and 5" |

---

## 10. Database Error Handling

### Supabase Errors
Caught in service methods, wrapped in `AppError`:

```typescript
const { data, error } = await this.supabase.from('table')...;
if (error || !data) {
  throw new AppError('Operation failed', 500, 'OPERATION_FAILED');
}
```

### Common DB Error Codes Mapped
| Postgres Error | AppError Code |
|----------------|---------------|
| 23505 (unique_violation) | `CONFLICT` |
| 23503 (foreign_key_violation) | `VALIDATION_ERROR` / `NOT_FOUND` |
| 42P01 (undefined_table) | `INTERNAL_ERROR` |
| Connection errors | `SERVICE_UNAVAILABLE` |

---

## 11. AI Provider Error Handling

### AI Factory (`review/ai/factory.ts`)
- Returns provider based on config (OpenAI/Gemini)
- Handles provider initialization errors

### OpenAI Provider (`review/ai/openai.ts`)
**Errors:**
- API key invalid → `AuthenticationError` (401)
- Rate limited → `RateLimitError` (429) with retry-after
- Model error → `AppError` (500)
- Timeout → `ServiceUnavailableError` (503)

### Gemini Provider (`review/ai/gemini.ts`)
Similar error handling to OpenAI

### Service Integration (`review/service.ts:173-182`)
```typescript
const aiProvider = this.aiFactory.getProvider(REVIEW_CONSTANTS.DEFAULT_AI_PROVIDER);
const aiResult = await aiProvider.generateReview({...});
```

**Fallback:** If provider returns no tokenUsage, estimates from text length

---

## 12. Webhook Error Handling (Stripe)

### Stripe Webhook Handler
**File:** `subscription/service.ts:606-622`

```typescript
async handleWebhookEvent(event: Stripe.Event): Promise<void>
```

**Events Handled:**
- `customer.subscription.created` → `syncSubscriptionFromStripe`
- `customer.subscription.updated` → `syncSubscriptionFromStripe`
- `customer.subscription.deleted` → `handleSubscriptionDeleted`
- `invoice.payment_succeeded` → `handlePaymentSucceeded`
- `invoice.payment_failed` → `handlePaymentFailed`

**Error Handling:**
- Sync failures logged but don't throw (webhook must return 2xx)
- Stripe retries on non-2xx responses
- Idempotency via event ID tracking (not shown, should be added)

---

## 13. Rate Limiting

### Global Rate Limiter
**File:** `src/index.ts:79-86`
```typescript
const globalLimiter = rateLimit({
  windowMs: 15 minutes,
  max: 100 requests,
  message: { success: false, error: 'Too many requests...' }
});
```

### Auth-Specific Rate Limiter
**File:** `auth/middleware.ts:138-161` - `authRateLimit(maxAttempts=5, windowMs=15min)`
- In-memory Map (not suitable for multi-instance)
- Returns 429 with `Retry-After` header

### Subscription/Usage Limits
Enforced in services (`qr/service.ts`, `review/service.ts`) via DB queries

---

## 14. Error Handling Gaps & Recommendations

### Critical Issues

| Issue | Location | Recommendation |
|-------|----------|----------------|
| `throw new Error('FORBIDDEN')` in subscription controller | `subscription/controller.ts:176, 181` | Use `AuthorizationError` |
| No idempotency key for Stripe webhooks | `subscription/service.ts:606` | Add webhook event tracking table |
| In-memory rate limiting (auth) | `auth/middleware.ts:139` | Use Redis for multi-instance |
| AI generation blocks request | `review/service.ts:176` | Move to async job queue |

### High Priority

| Issue | Location | Recommendation |
|-------|----------|----------------|
| No structured logging correlation IDs | All services | Add requestId to all logs |
| No circuit breaker for AI providers | `review/ai/*.ts` | Add resilience patterns |
| No dead letter queue for failed webhooks | `subscription/service.ts` | Store failed events for retry |
| Health checks don't verify Redis/queue | `src/index.ts:92-116` | Add dependency checks |

### Medium Priority

| Issue | Location | Recommendation |
|-------|----------|----------------|
| Error codes not fully typed | `shared/exceptions/index.ts` | Use `ERROR_CODES` enum consistently |
| Frontend doesn't handle all error codes | `api-client.ts` | Add error code handling per flow |
| No error boundary for React Query | Frontend | Add QueryClient error boundary |
| Missing request timeout for AI calls | `review/ai/*.ts` | Add 30s timeout with fallback |

### Low Priority

| Issue | Location | Recommendation |
|-------|----------|----------------|
| Magic strings for error codes | Controllers | Use `ERROR_CODES` constants |
| Duplicate error handling logic | All controllers | Extract to base controller class |
| No error metrics/alerting | - | Add Prometheus metrics for error rates |

---

## 15. Error Code Reference

### Standard HTTP + AppError Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Authentication required/invalid |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |
| `BAD_REQUEST` | 400 | Malformed request |

### Business-Specific Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `QR_SCAN_LIMIT_EXCEEDED` | 403 | Plan scan limit reached |
| `REVIEW_GENERATION_LIMIT_EXCEEDED` | 403 | Plan generation limit reached |
| `GOOGLE_URL_MISSING` | 500 | Business missing Google Review URL |
| `SESSION_UPDATE_FAILED` | 500 | DB error updating session |
| `USER_CREATION_FAILED` | 500 | DB error creating user |
| `BUSINESS_CREATION_FAILED` | 500 | DB error creating business |
| `QR_CREATION_FAILED` | 500 | DB error creating QR code |
| `SUBSCRIPTION_CREATION_FAILED` | 500 | Stripe/DB error creating subscription |
| `NOT_AUTHENTICATED` | 401 | Missing user in authenticated request |

---

## 16. Testing Error Flows

### Missing Test Coverage
- No integration tests for error scenarios
- No unit tests for error handler
- No contract tests for API error responses

### Recommended Test Cases
1. Auth: Invalid token, expired token, revoked token, missing token
2. Auth: Rate limiting on login/register
3. Business: Access denied (staff vs owner vs admin)
4. QR: Scan limit exceeded (free, starter, pro, enterprise)
5. Review: Invalid state transitions at each step
6. Review: AI provider failures (timeout, rate limit, auth error)
7. Subscription: Stripe webhook signature verification
8. Subscription: Plan downgrade/upgrade proration
9. Admin: Non-admin access attempts
10. Global: Malformed JSON, oversized payloads

---

## Summary

### ✅ Strengths
- Consistent `AppError` hierarchy with typed codes
- Global error handler with proper status codes
- Zod validation on all endpoints
- JWT auth with refresh rotation
- Subscription limit enforcement with clear errors
- Public endpoints properly secured (rate limited)
- Frontend auto-refresh with redirect on failure
- Health check endpoints for orchestration

### ⚠️ Areas for Improvement
1. **Fix `throw new Error('FORBIDDEN')`** in subscription controller (returns 500 instead of 403)
2. **Add Redis-backed rate limiting** for multi-instance deployments
3. **Implement async job queue** for AI generation (currently blocks request)
4. **Add idempotency** for Stripe webhooks
5. **Add circuit breakers** for external AI APIs
6. **Structured logging** with correlation IDs
7. **Error monitoring/alerting** (Sentry, Datadog, etc.)
8. **Integration tests** for error flows

---

## Next Steps

1. Fix subscription controller FORBIDDEN errors
2. Add Redis for rate limiting and job queue
3. Implement BullMQ/pg-boss for async AI generation
4. Add webhook idempotency table
5. Set up error monitoring (Sentry)
6. Add integration tests for critical error paths