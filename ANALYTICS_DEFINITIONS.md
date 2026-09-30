# ReviewAI Analytics Definitions & Customer Funnel Specification

**Document Version:** 1.0 (Pilot Launch Verified)  
**Status:** Active Canonical Specification  
**Target:** 5–10 Business Pilot Measurement  

---

## 1. Core Principle & Critical Semantic Boundary

> ### ⚠️ MANDATORY PRODUCT RULE
> **"Google Review Page Opens ≠ Google Review Submissions"**
> 
> ReviewAI records when a customer clicks to open a business's Google Review URL (redirect event).  
> **ReviewAI does NOT have access to determine whether the customer submitted, published, or completed the review on Google.**  
> Google does not provide an external webhook, callback, or public verification API for user-published reviews.  
> 
> - **Permitted metric names:** "Google Review Page Opens", "Google Page Opens", "Redirected to Google".  
> - **Forbidden metric names:** "Google Reviews Received", "Google Review Conversion", "Published Reviews", "Reviews Submitted to Google".

---

## 2. Event Inventory & Definitions

| Event Name | Database / Storage Location | Trigger Point | Identifiers Present | Timestamp Field | Context & Metadata | Scope |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **QR Scan** | `scan_logs` table | Customer scans physical QR code or opens direct slug link | `qr_code_id`, `business_id`, `id` | `scanned_at` | IP address (hashed/debounced), User Agent, Device Type, Browser, OS | Customer-facing |
| **Review Session Started** | `review_sessions` table | Public review page initializes session | `id` (`session_id`), `business_id`, `qr_code_id`, `scan_log_id` | `started_at` | Language, Initial Rating (default 5) | Customer-facing |
| **Rating Selected** | `review_sessions.rating` | Customer taps 1–5 stars | `session_id`, `business_id` | Updated in session | `rating` (1–5) | Customer-facing |
| **Tags Selected** | `review_sessions.metadata->'tags'` | Customer selects 1–3 experience highlights (for 4–5 star ratings) | `session_id`, `business_id` | Updated in session | Array of selected strings (e.g., `["Friendly Staff", "Clean Environment"]`) | Customer-facing |
| **AI Review Generated** | `generated_reviews` table | Server successfully produces review suggestion (AI or verified fallback) | `id`, `session_id`, `business_id` | `created_at` | `language`, `rating`, `ai_provider`, `model`, `generation_time_ms`, `token_usage` | Internal / Product |
| **AI Regeneration** | `generated_reviews.regeneration_count` | Customer clicks "Regenerate" to request alternate wording (max 5) | `session_id`, `business_id` | `updated_at` | Incremented `regeneration_count` | Internal / Product |
| **Review Edited** | `generated_reviews.edited_text` & `review_sessions.status = 'review_edited'` | Customer personalizes or edits suggested review text in textarea (on blur or copy) | `session_id`, `business_id` | Updated in review record | `edited_text`, `final_text` | Customer-facing |
| **Review Copied** | `review_sessions.metadata->'copied_at'` | Customer clicks "Copy Review" button to copy text to clipboard | `session_id`, `business_id` | `copied_at` | `copy_count` | Customer-facing |
| **Google Review Page Opened** | `review_sessions.status = 'redirected'` & `metadata->'google_redirected_at'` | Customer clicks "Proceed to Google Reviews" or completes step 5 | `session_id`, `business_id` | `google_redirected_at` / `completed_at` | `redirect_url` (Business Google Review URL) | Customer-facing |
| **Private Feedback Started** | `review_sessions.metadata->'feedback_started_at'` | Customer selects 1–3 stars; private management feedback form displays | `session_id`, `business_id` | `feedback_started_at` | Rating (1–3) | Customer-facing |
| **Private Feedback Submitted** | `pilot_feedback` table & `review_sessions.metadata->'feedback_submitted_at'` | Customer submits constructive thoughts directly to management | `session_id`, `business_id` | `created_at` | `feedback_text`, `rating` | Internal (Private to Owner) |
| **Private Feedback Skipped** | `review_sessions.metadata->'feedback_skipped_at'` | Customer rating 1–3 stars chooses "Or proceed to Google Reviews anyway" | `session_id`, `business_id` | `feedback_skipped_at` | Rating (1–3) | Customer-facing |

---

## 3. Product Funnel Specification

ReviewAI models customer conversion strictly within its own boundaries:

```
[1] QR Scan
      ↓ (Scan → Session %)
[2] Review Session Started
      ↓ (Session → Rating %)
[3] Rating Selected (1-5 Stars)
      ├─ Rating 4-5 Stars ─────────────────────────┐
      │     ↓                                      │
      │   Tags Selected (1-3 highlights)           │
      │     ↓                                      │
      │   AI Review Generated                      │
      │     ↓                                      │
      │   Review Edited (Optional)                 │
      │     ↓                                      │
      │   Review Copied (Clipboard)                │
      │     ↓                                      │
      │   Google Review Page Opened                │
      │                                            │
      └─ Rating 1-3 Stars ─────────────────────────┤
            ↓                                      │
          Private Feedback Started                 │
            ├─ Feedback Submitted (Private)        │
            └─ Feedback Skipped ───────────────────┘
                  ↓
                Google Review Page Opened (Customer choice respected)
```

### Funnel Metrics Formulas

1. **Scan → Session Conversion Rate:**  
   $$\text{Conversion} = \left(\frac{\text{Review Sessions Started}}{\text{Total QR Scans}}\right) \times 100$$

2. **Session → AI Generation Rate:**  
   $$\text{Conversion} = \left(\frac{\text{AI Reviews Generated}}{\text{Review Sessions Started}}\right) \times 100$$

3. **AI Generation → Copy Rate:**  
   $$\text{Conversion} = \left(\frac{\text{Review Copied Sessions}}{\text{AI Reviews Generated}}\right) \times 100$$

4. **Copy → Google Page Open Rate:**  
   $$\text{Conversion} = \left(\frac{\text{Google Review Page Opens}}{\text{Review Copied Sessions}}\right) \times 100$$

---

## 4. Multi-Tenant Business Isolation

- **Server-Side Enforcement:** Every analytics request (`/analytics/overview`, `/analytics`, `/analytics/sessions-chart`, `/analytics/recent-feedback`, `/analytics/recent-activity`) verifies that the authenticated user (`req.user.sub`) is either the owner or an authorized staff member of the requested business.
- **Access Violation:** If an owner of Business A attempts to request analytics for Business B by manipulating query parameters or URL paths, the API throws `AuthorizationError` (HTTP 403 Forbidden).
- **Default Scoping:** When querying without a specific business ID, the API returns aggregate data strictly for businesses owned by or staffed by the requesting user.

---

## 5. Duplicate Protection & Idempotency

- **QR Scan Debounce:** Scans from the same client IP and QR slug within 60 seconds are recognized as browser reloads/refreshes and deduplicated to prevent artificial inflation.
- **Session Caching:** The client review form persists `reviewai_session_${slug}` in browser `sessionStorage`. Reloading the page resumes the existing session rather than creating duplicate sessions.
- **Single Redirect Navigation:** The "Open Google Reviews" handler enforces ref-level and state locks (`isRedirectingRef`) to ensure double-clicks cannot trigger duplicate redirects or log multiple events.

---

## 6. AI Generation & Subscription Usage Consistency

- **Successful Generation Only:** Subscription usage counters (`review_generations`) are incremented if and only if the AI service (or deterministic fallback) returns a complete, usable review suggestion and persists the record.
- **Failures & Rate Limits:** If an AI provider fails, network connectivity drops, or a subscription rate limit is exceeded, usage counters are NOT charged.
- **Regenerations:** Each explicit user click on "Regenerate" consumes 1 generation quota (up to a session safety limit of 5 regenerations per session).

---

## 7. Safari ITP, Mobile Lifecycles & Analytics Transport Reliability

When a customer copies a review or clicks "Open Google Reviews", external navigation can cause mobile browsers to freeze or terminate the ReviewAI tab:

1. **Non-Blocking Execution:** Customer navigation to Google is **never** blocked or awaited on an analytics network request. Navigation opens immediately in the synchronous user-gesture event loop tick, preventing iOS Safari from blocking the popup.
2. **Surviving Page Unload:** Event tracking for `review_copied` and `google_review_page_opened` uses `fetch(..., { keepalive: true })` with fallback to `navigator.sendBeacon`. Both APIs instruct the user-agent to transmit the payload in the background even if the page is suspended or unloaded.
3. **Copy Debounce (Idempotency):** Rapid duplicate taps on "Copy" or dual-transport retries within 3 seconds are debounced on the server, ensuring `copy_count` reflects authentic customer actions without inflation.
4. **Graceful Degradation:** If an ad blocker (e.g. uBlock, Brave Shields) or strict Safari ITP blocks beacon delivery, the customer experience is unaffected: Google navigation continues smoothly with zero errors shown.
5. **Technical Limitations:** 100% analytics delivery cannot be guaranteed across all web clients due to aggressive mobile OS task-killing, offline network drops immediately upon redirect, and client-side privacy extensions.

---

## 8. Pilot Business Success & Retention Insights Definitions (Step 28)

ReviewAI provides an internal Admin Pilot Insights module (`/admin/pilot-insights`) to monitor the onboarding, activation, and customer usage of the first 5–10 business pilots.

### 8.1 Core Principles
- **No Numerical "Scores":** ReviewAI does not compute arbitrary performance or quality scores.
- **No Business Ranking:** Businesses are never sorted or ranked by "best to worst".
- **Strict Operational States:** States are deterministically computed based on setup completion and customer traffic.

### 8.2 Operational Activation Statuses
1. **`NOT SET UP`**: Required onboarding configuration is incomplete.
   - *Criteria:* Missing business name, missing/invalid Google Review URL, or 0 active QR codes generated.
2. **`READY`**: Setup is complete, but no customer activity has been recorded yet.
   - *Criteria:* Business name, valid Google Review URL, and at least 1 active QR code exist, but 0 QR scans and 0 review sessions have been initiated.
3. **`ACTIVE`**: Configuration is complete and real customer traffic exists.
   - *Criteria:* Setup complete and $\ge 1$ QR scan or review session recorded.
4. **`NEEDS ATTENTION`**: Operational blocker or customer friction detected.
   - *Criteria:* One or more unresolved private negative feedback items pending review (`open_feedback_count > 0`), or the business was deactivated.

### 8.3 Operational Milestones
Seven objective milestones track each pilot business's journey:
1. **Setup Completed:** Valid profile, Google destination URL, and active QR code.
2. **QR Code Generated:** Physical or digital QR code created in system.
3. **First QR Scan:** Earliest successfully created customer review session associated with the business's public ReviewAI QR/customer flow (`review_sessions.started_at`).
   - *Signal Reliability:* `first_qr_scan` is derived from the earliest successfully created customer review session associated with the business. `scan_logs` remain available for scan analytics and device reporting, but are not the sole source for the first-activity milestone.
   - *Semantic Boundary:* This is a server-observed customer-flow milestone. It does NOT mean Google review submitted, Google review published, or analytics beacon successfully delivered. (Note: Offline QR usage cannot reach ReviewAI without network connectivity).
4. **First Review Session:** Earliest review flow session started in `review_sessions`.
5. **First AI Review Generated:** Earliest AI-assisted review created in `generated_reviews`.
6. **First Review Copied:** Earliest customer clipboard copy action recorded.
7. **First Google Review Page Open:** Earliest redirect to the configured Google Review destination.

### 8.4 Re-Emphasized Semantic Rule
> **"Google Review Page Opens are NOT verified Google Review submissions."**
> 
> ReviewAI records when a customer opens the configured Google Review URL. ReviewAI cannot verify whether the customer completed and published the review on Google. Metric labels must strictly remain "Google Review Page Opens".

---

## 9. Pilot Launch Control Center & Incident Monitoring

### 9.1 Purpose
The Pilot Launch Control Center (`/admin/pilot`) provides the ReviewAI engineering and operations team with a single, consolidated dashboard to monitor the first 5–10 real pilot businesses, inspect customer-flow health, track feedback and subscription states, and rapidly identify operational problems before they impact users.

### 9.2 Admin Security & Access Control
- **Strict Role Gate:** Access is strictly restricted to users with the `admin` role.
- **Server-Side Enforcement:** The backend endpoint `GET /api/v1/admin/pilot` enforces `requireRole('admin')` through `authService.verifyAccessToken(...)` and database role checks. Non-admin business owners receive `HTTP 403 Forbidden`; unauthenticated requests receive `HTTP 401 Unauthorized`.
- **Tenant Isolation:** Cross-tenant ID manipulation is impossible because aggregation queries operate strictly across administrative domains with zero customer/owner query parameter leakage.

### 9.3 Operational Metrics Monitored
The Control Center surfaces concise operational KPIs across five operational domains:
1. **Businesses:** Total pilot businesses, setup complete, active, inactive, and needs attention.
2. **Customer Activity:** Total QR scans, review sessions initiated, AI review generations, review copies, Google review page opens, and private negative feedback submissions.
3. **System Health & Incidents:** Recent operational error count, AI generation failures, authorization failures, and customer-flow failures.
4. **Customer Feedback:** Open feedback items requiring review, items currently being reviewed, and resolved items.
5. **Subscriptions:** Free tier businesses, Paid/active subscriptions, and pending upgrade requests.

### 9.4 Objective "Needs Attention" Rules
ReviewAI uses deterministic, objective conditions to flag businesses needing administrative follow-up. Zero arbitrary scoring or performance rankings are used:
- **Condition 1 (Incomplete Onboarding Setup):** Missing Google destination URL or inactive QR code (`setup_completed === false`).
- **Condition 2 (Unresolved Customer Friction):** One or more unresolved private negative feedback submissions pending review (`open_feedback_count > 0`).
- **Condition 3 (Repeated Operational Errors):** Three or more recent operational system errors associated with the business (`recent_error_count >= 3`).
- **Condition 4 (Subscription / Status Inconsistency):** Business account is marked inactive (`is_active === false`).

*Deterministic Invariant:* Low or zero customer activity does NOT indicate poor performance or "Needs Attention". A newly onboarded business with zero scans is classified as `READY`, never penalized.

### 9.5 Operational Error Taxonomy & Deduplication
To prevent log flooding and make incident detection actionable, operational errors are normalized into nine categories:
- `AUTH`: Authentication failures, expired tokens, or login rejections.
- `AUTHORIZATION`: Unauthorized role or tenant access attempts (HTTP 403).
- `DATABASE`: Connection dropouts, query failures, or Supabase timeouts.
- `AI`: External AI provider timeouts, rate limits, or parse errors.
- `CUSTOMER_FLOW`: Session creation failures, copy recording issues, or redirect errors.
- `QR`: QR slug resolution failures or invalid QR parameter access.
- `SUBSCRIPTION`: Plan quota verification or upgrade request processing errors.
- `CONFIGURATION`: Missing environment variables or malformed business URLs.
- `UNKNOWN`: Unhandled runtime exceptions.

**Deduplication Window:** Errors matching the same `(category, message, route, business_id)` within a 15-minute sliding window are aggregated into a single incident entry with an incrementing `count`, `first_seen_at`, and `last_seen_at`.

### 9.6 Privacy & Masking Standards
- Operational error messages and route queries are sanitized in real time.
- All JWTs, Bearer tokens, API keys, passwords, authentication headers, and credit card patterns are masked with `[REDACTED]`.
- Customer private review feedback text and personal customer details are NEVER ingested or exposed in operational error logs.

### 9.7 Architectural & Operational Limitations
- **Offline QR Access:** Offline QR access requires internet connectivity because the QR code points to a web application hosted on ReviewAI infrastructure. This is an inherent web-routing characteristic, not a software bug or defect.
- **Google Submissions:** "Google Review Page Opens" indicates customer redirection to the business's Google Review URL. It does not verify that the customer completed or published the review on Google's external platform.



