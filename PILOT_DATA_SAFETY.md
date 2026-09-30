# Pilot Data Safety - TASK 14
## STEP 22: Verify Data Protection, Backup, Retention, Privacy & Compliance

**Status**: VERIFICATION COMPLETE - **CONDITIONALLY READY** ⚠️
**Date**: 2026-09-12

---

## Executive Summary

**Pilot Data Safety**: ⚠️ **REQUIRES CONFIGURATION BEFORE PILOT**

The database schema implements comprehensive data protection through RLS, encryption at rest (Supabase), audit logging, and partitioned tables with retention policies. However, **backup verification, PII handling documentation, GDPR compliance procedures, and data export/deletion workflows need to be operationalized** before pilot launch.

---

## 1. Data Classification

### Data Categories

| Category | Tables | Sensitivity | Retention | Encryption |
|----------|--------|-------------|-----------|------------|
| **PII (Direct)** | `users` (email, name, avatar) | HIGH | Account lifetime + 30 days | At rest (Supabase) + TLS in transit |
| **PII (Indirect)** | `business_staff`, `audit_logs` (user_id, ip) | MEDIUM | 7 years (audit) / Account lifetime | At rest + TLS |
| **Business Confidential** | `businesses` (google_review_url, settings), `subscriptions` (stripe_ids) | HIGH | Account lifetime | At rest + TLS |
| **Customer Analytics** | `scan_logs`, `review_sessions`, `generated_reviews` | LOW | 2 years (partitioned) | At rest + TLS |
| **Aggregated Analytics** | `daily_analytics`, `business_analytics`, `qr_code_analytics` | LOW | 2 years (partitioned) | At rest + TLS |
| **Operational** | `api_logs`, `email_logs`, `webhook_events`, `background_jobs` | LOW | 1-2 years (partitioned) | At rest + TLS |
| **Secrets** | `users` (password_hash, tokens), `api_keys` (key_hash) | CRITICAL | Rotated/Revoked | Bcrypt hash + At rest |

### PII Inventory

| Table | PII Fields | Legal Basis | User Consent |
|-------|------------|-------------|--------------|
| `users` | email, full_name, avatar_url, ip (last_login) | Contract (ToS) | Registration |
| `business_staff` | user_id, email (via join) | Legitimate interest | Invitation acceptance |
| `audit_logs` | user_id, ip_address, user_agent | Legal obligation (security) | Implied by usage |
| `scan_logs` | ip_address, user_agent, country, city | Legitimate interest (analytics) | Implied by QR scan |
| `review_sessions` | language, rating, metadata (utm) | Contract (service) | Implied by flow start |
| `generated_reviews` | generated_text, edited_text | Contract (service) | Customer authorship |

---

## 2. Data Protection Implementation

### Database-Level Protection

| Protection | Implementation | Status |
|------------|----------------|--------|
| Encryption at Rest | Supabase managed (AES-256) | ✅ |
| Encryption in Transit | TLS 1.2+ enforced | ✅ |
| Row Level Security | All 22 tables enabled | ✅ |
| Column-Level Encryption | Not implemented | ⚠️ Not needed for pilot |
| Data Masking | Not implemented | ⚠️ Not needed for pilot |

### Application-Level Protection

| Protection | Implementation | Status |
|------------|----------------|--------|
| Password Hashing | bcrypt (cost 12) | ✅ |
| Token Hashing | bcrypt for API keys | ✅ |
| JWT Signing | RS256 (asymmetric) | ✅ |
| Input Validation | Zod schemas on all endpoints | ✅ |
| SQL Injection Prevention | Parameterized queries (Supabase client) | ✅ |
| XSS Prevention | React auto-escape + CSP (disabled dev) | ⚠️ CSP needs config |

### Network Protection

| Protection | Implementation | Status |
|------------|----------------|--------|
| Database Access | Supabase connection pooling (PgBouncer) | ✅ |
| API Rate Limiting | express-rate-limit (100/15min) + auth limits | ✅ |
| CORS | Configured with specific origin | ✅ |
| Security Headers | Helmet.js (CSP disabled for dev) | ⚠️ Needs production config |

---

## 3. Backup & Recovery

### Supabase Managed Backups

| Feature | Configuration | Status |
|---------|---------------|--------|
| Point-in-Time Recovery (PITR) | Enabled by default (7 days on Pro) | ✅ |
| Daily Full Backups | Automatic | ✅ |
| Backup Retention | 7 days (Pro), 30 days (Enterprise) | ✅ |
| Cross-region Replication | Available on Enterprise | ⚠️ Not configured |
| Backup Encryption | AES-256 | ✅ |

### Partition Retention Policies

```sql
-- From migration 001_initial_schema.sql

-- scan_logs: 24 months (2 years)
-- review_sessions: 24 months (2 years)
-- audit_logs: 84 months (7 years) - compliance requirement
-- daily_analytics: 24 months
-- business_analytics: 24 months
-- qr_code_analytics: 24 months
-- api_logs: 24 months
-- email_logs: 18 months

-- Auto-cleanup function: drop_old_partitions(retention_months)
-- Runs monthly via pg_cron (needs configuration)
```

### Recovery Procedures

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Accidental row deletion | < 1 hour | < 1 hour | PITR to before deletion |
| Table corruption | < 4 hours | < 1 hour | PITR or full restore |
| Full database loss | < 24 hours | < 24 hours | Full restore from daily backup |
| Schema migration failure | < 30 min | 0 | Manual rollback + PITR if data affected |

### Backup Verification Gap

| Check | Status | Action Required |
|-------|--------|-----------------|
| Test restore performed | ❌ | **Must test before pilot** |
| Restore time measured | ❌ | Document for runbook |
| Cross-region restore tested | ❌ | Not required for pilot |
| Backup integrity verified | ❌ | Add to pre-pilot checklist |

---

## 4. Data Retention & Deletion

### Automated Retention (Database)

| Table | Retention | Mechanism | Status |
|-------|-----------|-----------|--------|
| `scan_logs` | 24 months | Monthly partition drop | ✅ Function exists, needs pg_cron |
| `review_sessions` | 24 months | Monthly partition drop | ✅ Function exists, needs pg_cron |
| `audit_logs` | 84 months (7 years) | Monthly partition drop | ✅ Function exists, needs pg_cron |
| `daily_analytics` | 24 months | Monthly partition drop | ✅ Function exists, needs pg_cron |
| `business_analytics` | 24 months | Monthly partition drop | ✅ Function exists, needs pg_cron |
| `qr_code_analytics` | 24 months | Monthly partition drop | ✅ Function exists, needs pg_cron |
| `api_logs` | 24 months | Monthly partition drop | ✅ Function exists, needs pg_cron |
| `email_logs` | 18 months | Monthly partition drop | ✅ Function exists, needs pg_cron |

### Manual Deletion Workflows

| Workflow | Implementation | Status |
|----------|----------------|--------|
| User account deletion | `deleted_at` soft delete + cascade | ✅ Schema supports |
| Business deletion | `deleted_at` soft delete + cascade | ✅ Schema supports |
| Right to be forgotten (GDPR) | Not implemented | ❌ **Gap** |
| Data export (GDPR) | Not implemented | ❌ **Gap** |
| Subscription cancellation cleanup | Stripe webhook + soft delete | ✅ Partial |

### GDPR Compliance Gaps

| Requirement | Current | Gap |
|-------------|---------|-----|
| Data portability (export) | ❌ | Need API endpoint |
| Right to erasure | ❌ | Need deletion workflow |
| Data processing records | ⚠️ | Partial via audit_logs |
| DPA with subprocessors | ⚠️ | Stripe, Supabase, AI providers |
| Privacy policy | ❌ | Not in codebase |
| Cookie consent | N/A | No cookies used (JWT in header) |

---

## 5. Data Access Controls

### Application Access (Service Role)

| Role | Tables | Operations | Justification |
|------|--------|------------|---------------|
| `service_role` | All | ALL | Backend API operations |
| `anon` | `qr_codes` (select), `scan_logs` (insert) | Limited | Public QR scan flow |

### Admin Access

| Role | Tables | Operations |
|------|--------|------------|
| `admin` (user role) | All analytics/admin tables | SELECT |
| `admin` (user role) | `users`, `businesses`, `upgrade_requests` | ALL |

### Business User Access (RLS)

| Table | Owner | Admin | Manager | Member | Viewer |
|-------|-------|-------|---------|--------|--------|
| `businesses` | CRUD | R | R | R | R |
| `business_staff` | CRUD | R | R | - | - |
| `qr_codes` | CRUD | CRUD | CRUD | R | R |
| `scan_logs` | R | R | R | R | R |
| `review_sessions` | R | R | R | R | R |
| `generated_reviews` | R | R | R | R | R |
| `subscriptions` | R | R | - | - | - |
| `invoices` | R | R | - | - | - |
| `usage_logs` | R | R | - | - | - |
| `audit_logs` | R | R | - | - | - |
| `api_keys` | CRUD | CRUD | - | - | - |
| `webhook_events` | R | R | - | - | - |

---

## 6. Audit Trail & Compliance

### Audit Log Coverage

| Action Type | Logged | Fields Captured |
|-------------|--------|-----------------|
| Business CRUD | ✅ | user_id, business_id, action, old/new values, IP, UA |
| Staff management | ✅ | Same |
| QR code CRUD | ✅ | Same |
| Review flow | ✅ | Session progression, generation, edits |
| Subscription changes | ✅ | Plan changes, cancellations, Stripe events |
| Auth events | ✅ | Login, register, password change, email verify |
| Admin actions | ✅ | Business status, user roles, settings |
| API key management | ✅ | Create, revoke, usage |
| Webhook delivery | ✅ | Status, retries, responses |

### Audit Log Integrity

| Property | Implementation |
|----------|----------------|
| Immutability | `SECURITY DEFINER` function, no UPDATE/DELETE policies for users |
| Tamper evidence | Append-only, partitioned, 7-year retention |
| Completeness | Exception handling in `log_audit_action` never fails main operation |
| Attribution | `auth.uid()` captures authenticated user |
| Context | IP address, user agent captured via `current_setting()` |

### Compliance Frameworks

| Framework | Applicability | Status |
|-----------|---------------|--------|
| GDPR | EU customers | ⚠️ Partial - gaps in export/deletion |
| CCPA | California customers | ⚠️ Same as GDPR |
| SOC 2 Type II | Future | Not started |
| PCI DSS | Not applicable (Stripe handles) | N/A |
| HIPAA | Not applicable | N/A |

---

## 7. Data Processing Agreements (DPAs)

### Subprocessors Requiring DPAs

| Subprocessor | Purpose | DPA Status | Data Shared |
|--------------|---------|------------|-------------|
| Supabase | Database, Auth, Storage | ✅ Standard DPA | All application data |
| Stripe | Payments, Billing | ✅ Standard DPA | Business info, payment data |
| OpenAI | AI review generation | ⚠️ Need to sign | Review content (no PII) |
| Google (Gemini) | AI review generation | ⚠️ Need to sign | Review content (no PII) |
| Resend | Transactional email | ⚠️ Need to sign | Email, name, business info |
| Vercel | Frontend hosting | ✅ Standard DPA | No PII (static assets) |
| Railway/Render | Backend hosting | ⚠️ Need to verify | Application logs |

### Data Processing Records (ROPA)

Need to document:
- [ ] Categories of personal data processed
- [ ] Purposes of processing
- [ ] Legal bases
- [ ] Recipients/subprocessors
- [ ] Retention periods
- [ ] Technical/organizational measures
- [ ] International transfers

---

## 8. Incident Response

### Data Breach Procedures

| Phase | Action | Owner | Timeline |
|-------|--------|-------|----------|
| Detection | Monitoring alerts (Sentry, uptime) | On-call | Immediate |
| Containment | Revoke compromised credentials, isolate | Backend lead | < 1 hour |
| Assessment | Determine scope, data affected | Security lead | < 4 hours |
| Notification | GDPR: 72 hours to authority | Legal/Founder | < 72 hours |
| Notification | Affected users | Legal/Founder | Without undue delay |
| Remediation | Fix vulnerability, rotate secrets | Engineering | ASAP |
| Post-mortem | Document, improve | Team | < 2 weeks |

### Breach Scenarios

| Scenario | Likelihood | Impact | Detection |
|----------|------------|--------|-----------|
| Supabase credential leak | Low | Critical | Audit log, unusual queries |
| Stripe webhook secret leak | Low | High | Stripe dashboard alerts |
| JWT secret compromise | Low | Critical | Unusual auth patterns |
| API key exposure | Medium | Medium | Usage anomaly, audit log |
| SQL injection | Very Low | High | WAF, error monitoring |
| Insider threat | Low | High | Audit log review |

---

## 9. Pilot-Specific Data Safety

### Pilot Data Handling

| Aspect | Policy |
|--------|--------|
| Pilot data separation | Use separate Supabase project for pilot |
| Pilot data retention | Delete pilot project after pilot concludes (or export first) |
| Pilot participant consent | Explicit opt-in via pilot agreement |
| Pilot data export | Provide CSV/JSON export on request |
| Pilot feedback data | Store in `audit_logs` + separate feedback table (not yet implemented) |

### Pilot Data Risks

| Risk | Mitigation |
|------|------------|
| Pilot data mixed with production | Separate Supabase project |
| Pilot data retained indefinitely | Automated project deletion post-pilot |
| PII exposure in pilot | Minimize PII collection, pseudonymize where possible |
| AI provider data leakage | Use enterprise agreements, zero-retention APIs |

---

## 10. Secrets Management

### Current State

| Secret | Storage | Rotation | Access |
|--------|---------|----------|--------|
| `JWT_SECRET` | `.env` / Platform secrets | Manual | Backend only |
| `JWT_REFRESH_SECRET` | `.env` / Platform secrets | Manual | Backend only |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` / Platform secrets | Manual | Backend only |
| `STRIPE_SECRET_KEY` | `.env` / Platform secrets | Via Stripe Dashboard | Backend only |
| `STRIPE_WEBHOOK_SECRET` | `.env` / Platform secrets | Via Stripe Dashboard | Backend only |
| `OPENAI_API_KEY` | `.env` / Platform secrets | Via OpenAI Dashboard | Backend only |
| `GEMINI_API_KEY` | `.env` / Platform secrets | Via Google Cloud | Backend only |
| `RESEND_API_KEY` | `.env` / Platform secrets | Via Resend Dashboard | Backend only |

### Production Requirements

- [ ] All secrets in platform secret manager (not `.env`)
- [ ] Automated rotation for JWT secrets (quarterly)
- [ ] Audit trail for secret access
- [ ] Separate secrets per environment (dev/staging/prod)

---

## 11. Security Testing

### Completed

| Test | Result |
|------|--------|
| SQL injection attempt | Blocked (parameterized queries) |
| XSS in review content | Mitigated (React auto-escape) |
| Auth bypass | Blocked (JWT + RLS) |
| Business data isolation | Verified (RLS + service layer) |
| Subscription limit enforcement | Verified (service layer) |
| Rate limiting | Verified (429 responses) |

### Needed Before Production

| Test | Priority |
|------|----------|
| Penetration test | High |
| Dependency vulnerability scan | High |
| Load test with data volume | Medium |
| Chaos engineering (DB failover) | Medium |
| GDPR compliance audit | High |

---

## 12. Pilot Data Safety Checklist

### Pre-Pilot (Required)

- [ ] **Separate Supabase project** for pilot environment
- [ ] **Test backup restore** from pilot project
- [ ] **Configure pg_cron** for partition maintenance
- [ ] **Document data export procedure** for pilot participants
- [ ] **Document data deletion procedure** for pilot participants
- [ ] **Sign DPAs** with OpenAI, Gemini, Resend
- [ ] **Privacy policy** published and linked
- [ ] **Pilot agreement** includes data handling terms
- [ ] **Secrets rotated** from development values

### Post-Pilot

- [ ] Export pilot participant data on request
- [ ] Delete pilot Supabase project
- [ ] Rotate all secrets used during pilot
- [ ] Document lessons learned
- [ ] Update retention policies based on pilot data volume

---

## 13. Data Export/Deletion Implementation (Gap)

### Required API Endpoints for GDPR

```typescript
// Proposed: apps/backend/src/modules/privacy/routes.ts

// GET /privacy/export - Download all user data
// DELETE /privacy/account - Delete account and all data
// POST /privacy/forget - Right to erasure (business + user data)
```

### Implementation Approach

```typescript
// PrivacyService.ts
class PrivacyService {
  async exportUserData(userId: string): Promise<ExportPackage> {
    // Collect from: users, business_staff, businesses (owned),
    // subscriptions, audit_logs, review_sessions (via business)
    // Return structured JSON + CSV
  }

  async deleteUserAccount(userId: string): Promise<void> {
    // Soft delete: users.deleted_at = now()
    // Cascade: business_staff, owned businesses (soft delete)
    // Anonymize: audit_logs (set user_id=null, keep action)
    // Preserve: Aggregated analytics (no PII)
  }

  async deleteBusinessData(businessId: string, userId: string): Promise<void> {
    // Verify ownership
    // Soft delete business
    // Anonymize related analytics
    // Cancel subscription
  }
}
```

---

## 14. Conclusion

**Pilot Data Safety: ⚠️ CONDITIONALLY READY**

### Strengths
1. ✅ Comprehensive RLS on all 22 tables
2. ✅ Encryption at rest (Supabase) and in transit (TLS)
3. ✅ Immutable audit logging (7-year retention)
4. ✅ Partitioned tables with automated retention functions
5. ✅ Supabase PITR backups (7-day recovery)
6. ✅ Bcrypt password hashing, RS256 JWT
7. ✅ No direct PII in customer-facing review flow

### Critical Gaps for Pilot
1. **Backup restore not tested** - Must verify before pilot
2. **pg_cron not configured** - Partition cleanup won't run automatically
3. **GDPR export/deletion not implemented** - Need for pilot participant rights
4. **DPAs not signed** with AI/email providers
5. **Privacy policy not published**

### Minimum for Pilot Launch

| Task | Effort | Owner |
|------|--------|-------|
| Provision pilot Supabase project | 30 min | DevOps |
| Test PITR restore on pilot project | 1 hour | DevOps |
| Configure pg_cron for partition maintenance | 30 min | DevOps |
| Implement data export endpoint | 4 hours | Backend |
| Implement account deletion endpoint | 4 hours | Backend |
| Sign DPAs with subprocessors | 2 hours | Legal/Founder |
| Publish privacy policy | 1 hour | Founder |

**Time to Pilot-Ready Data Safety**: ~12-14 hours

---

## Next Task: TASK 15 - Final Pilot Readiness Report