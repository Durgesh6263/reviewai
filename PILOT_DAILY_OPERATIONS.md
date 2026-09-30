# PILOT DAILY OPERATIONS

## Overview

This document describes the operational monitoring workflow for ReviewAI pilot businesses (Step 31).

The daily health dashboard provides a 24-hour operational snapshot for internal admin use. It covers system health, customer-flow health, AI reliability, business activity, feedback, and subscription state.

> **Critical Limitation**: Operational monitoring can identify ReviewAI-side events and failures. It **cannot verify** whether a customer actually submitted or published a Google review. 'Google Review Page Opens' means the customer opened the Google Review URL. It does **not** imply verified review publication on Google.

## Admin Access

All monitoring endpoints are admin-only. Access is enforced server-side via role-based authorization middleware.

- GET /api/v1/admin/daily-health   — Admin: 200, Owner: 403, Unauthenticated: 401
- GET /api/v1/admin/incidents      — Admin: 200, Owner: 403, Unauthenticated: 401
- GET /api/v1/admin/incidents/:id  — Admin: 200, Owner: 403, Unauthenticated: 401
- PATCH /api/v1/admin/incidents/:id — Admin: 200, Owner: 403, Unauthenticated: 401

## Incident Severity Definitions

- INFO: Non-critical, informational (unknown QR slug, minor notice)
- WARNING: Degraded behavior, non-blocking (slow QR lookup, usage near limit)
- ERROR: Operational failure for a specific request (AI timeout, DB query failure)
- CRITICAL: Systemic blocker affecting all customers (AI service down, DB unavailable, auth system failure)

CRITICAL is reserved for genuine systemic blockers only. Customer abandonment, low ratings, or low activity are NEVER CRITICAL.

## Business Attention List Rules

A business is flagged for operational attention when it meets at least one objective technical criterion:
- Valid Google Review URL not configured
- No active QR code generated
- Unresolved private feedback items
- Recent operational errors linked to the business

NOT attention reasons: low activity, low ratings, customer abandonment.

## Privacy Rules

Incident messages and admin notes are sanitized before storage:
- Bearer tokens -> Bearer [REDACTED]
- api_key=, secret=, token=, password=, auth= params -> {key}=[REDACTED]
- Long hex hashes (32+ chars) -> [REDACTED_HASH]
- Messages truncated to 300 characters

Never stored: passwords, JWT tokens, API keys, full request headers, customer review content.

## Data Retention

Incidents are retained in-memory only (process lifetime, max 200 incidents). They are not persisted to the database. On process restart, all incidents are cleared. This is a known limitation.

## Known Limitations

1. Incident log is in-memory only — cleared on process restart.
2. Previous-period comparison is approximate due to deduplication.
3. Google Review verification is impossible from ReviewAI's side.
4. ai_failure_rate_pct is null when zero AI generations AND zero failures (prevents 0/0).
5. Customer abandonment is not an incident.
6. No real-time alerting — admins must check the dashboard manually.
