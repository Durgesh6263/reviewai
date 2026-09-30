# Observability Logging - TASK 13
## STEP 22: Verify Structured Logging, Error Tracking, Request Correlation, Audit Trail

**Status**: VERIFICATION COMPLETE - **GAPS IDENTIFIED** ⚠️
**Date**: 2026-09-12

---

## Executive Summary

**Observability Logging**: ⚠️ **REQUIRES ENHANCEMENT BEFORE PRODUCTION**

The application has basic logging via Morgan (HTTP requests) and console.error (unhandled exceptions), with comprehensive audit logging via database RPC functions. However, it **lacks structured logging library, request ID correlation, error tracking service (Sentry), and metrics collection**. These are acceptable for pilot with manual monitoring but must be addressed for production launch.

---

## 1. Current Logging Implementation

### HTTP Request Logging (Morgan)

**Location**: `apps/backend/src/index.ts:75-76`

```typescript
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));
```

| Environment | Format | Output |
|-------------|--------|--------|
| Development | `dev` | `:method :url :status :response-time ms - :res[content-length]` |
| Production | `combined` | `:remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"` |

**Coverage**: All incoming HTTP requests logged to stdout.

**Gap**: No structured JSON format, no request ID, no correlation with downstream operations.

### Application Error Logging

**Location**: `apps/backend/src/shared/exceptions/index.ts:89-90`

```typescript
// Log unexpected errors (non-operational)
console.error('Unhandled error:', err);
```

**Coverage**: All non-operational errors (bugs, unexpected exceptions) logged to stderr with full stack trace.

**Gap**: No structured format, no context enrichment, no error tracking service integration.

### Audit Logging (Database - Comprehensive)

**Implementation**: `apps/backend/supabase/migrations/001_initial_schema.sql` - `log_audit_action()` RPC function

```sql
CREATE OR REPLACE FUNCTION log_audit_action(
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_old_values jsonb DEFAULT NULL,
  p_new_values jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO audit_logs (
    user_id, business_id, action, resource_type, resource_id,
    old_values, new_values, ip_address, user_agent
  ) VALUES (
    auth.uid(),
    (SELECT business_id FROM business_staff WHERE user_id = auth.uid() AND is_active = true LIMIT 1),
    p_action, p_resource_type, p_resource_id,
    p_old_values, p_new_values,
    current_setting('request.ip', true)::inet,
    current_setting('request.user_agent', true)
  );
EXCEPTION WHEN OTHERS THEN
  -- Never fail the main operation due to audit logging
  NULL;
END;
$$;
```

**Coverage**: All mutations across all modules logged to `audit_logs` table.

| Module | Actions Logged |
|--------|----------------|
| Business | created, updated, deleted, google_url_updated, status_changed |
| QR Code | created, updated, deleted, downloaded |
| Review | generated, edited, regenerated, completed, abandoned |
| Subscription | created, updated, canceled, checkout, billing_portal |
| Auth | login, register, logout, password_change, email_verify |
| Admin | business_status_changed, user_role_changed, etc. |

**Audit Log Schema** (`audit_logs` table):
```sql
- id: uuid (PK)
- user_id: uuid (FK → auth.users)
- business_id: uuid (FK → businesses)
- action: text (e.g., "business.updated")
- resource_type: text (e.g., "business")
- resource_id: uuid
- old_values: jsonb
- new_values: jsonb
- ip_address: inet
- user_agent: text
- created_at: timestamptz
```

**Partitions**: Monthly via pg_partman for performance.

---

## 2. Request Correlation

### Current State: **NO REQUEST ID CORRELATION** ❌

| Capability | Status | Implementation |
|------------|--------|----------------|
| Request ID generation | ❌ | Not implemented |
| Request ID in response headers | ❌ | Not implemented |
| Request ID in logs | ❌ | Not implemented |
| Cross-service correlation | ❌ | Not applicable (monolith) |
| Distributed tracing | ❌ | Not implemented |

### Required Implementation

```typescript
// middleware/request-id.ts (proposed)
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
```

```typescript
// logger.ts (proposed) - Structured logger with request context
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'reviewai-backend',
    environment: process.env.NODE_ENV || 'development',
  },
});

export const createChildLogger = (requestId: string) => 
  logger.child({ requestId });

export default logger;
```

---

## 3. Structured Logging

### Current State: **NO STRUCTURED LOGGING LIBRARY** ❌

| Feature | Current | Required |
|---------|---------|----------|
| JSON output | ❌ | ✅ Pino/Winston |
| Log levels | ❌ (console.log/error only) | ✅ trace, debug, info, warn, error, fatal |
| Context enrichment | ❌ | ✅ child loggers |
| Pretty printing (dev) | ❌ | ✅ pino-pretty |
| Log rotation | ❌ | ✅ External (Loki, Datadog) |
| Sampling | ❌ | ✅ For high-volume |

### Recommended Implementation

```typescript
// shared/logger/index.ts (proposed)
import pino from 'pino';
import { Request } from 'express';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
  } : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'reviewai-backend',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version,
  },
});

export function getRequestLogger(req: Request) {
  return logger.child({
    requestId: req.requestId,
    userId: req.user?.sub,
    businessId: req.businessAccess?.business_id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
}

// Usage in controllers:
const log = getRequestLogger(req);
log.info({ endpoint: '/api/v1/businesses' }, 'Creating business');
log.error({ err: error }, 'Failed to create business');
```

---

## 4. Error Tracking

### Current State: **NO ERROR TRACKING SERVICE** ❌

| Service | Status | Integration |
|---------|--------|-------------|
| Sentry | ❌ | Not configured |
| Rollbar | ❌ | Not configured |
| Bugsnag | ❌ | Not configured |
| DataDog APM | ❌ | Not configured |
| New Relic | ❌ | Not configured |

### Required: Sentry Integration (Recommended)

```typescript
// shared/error-tracking/sentry.ts (proposed)
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  integrations: [
    nodeProfilingIntegration(),
    new Sentry.Integrations.Express({ app }),
  ],
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
  beforeSend(event, hint) {
    // Filter out operational errors (4xx)
    const error = hint.originalException;
    if (error instanceof AppError && error.statusCode < 500) {
      return null; // Don't send to Sentry
    }
    return event;
  },
});

// Error handler wrapper
export const sentryErrorHandler = Sentry.errorHandler();
```

---

## 5. Metrics Collection

### Current State: **NO METRICS COLLECTION** ❌

| Metric Type | Current | Required |
|-------------|---------|----------|
| Request rate | ❌ | ✅ Prometheus/DataDog |
| Response latency | ❌ | ✅ Histograms |
| Error rate | ❌ | ✅ Counter by status code |
| Business metrics | ❌ | ✅ Custom (scans, generations) |
| Database metrics | ❌ | ✅ Pool size, query latency |
| External API metrics | ❌ | ✅ Stripe, OpenAI, Gemini |

### Recommended: Prometheus Metrics

```typescript
// shared/metrics/prometheus.ts (proposed)
import promClient from 'prom-client';

export const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

export const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const businessMetrics = {
  qrScans: new promClient.Counter({
    name: 'qr_scans_total',
    help: 'Total QR scans',
    labelNames: ['business_id', 'plan'],
    registers: [register],
  }),
  reviewGenerations: new promClient.Counter({
    name: 'review_generations_total',
    help: 'Total AI review generations',
    labelNames: ['business_id', 'plan', 'provider'],
    registers: [register],
  }),
  subscriptionEvents: new promClient.Counter({
    name: 'subscription_events_total',
    help: 'Subscription lifecycle events',
    labelNames: ['event', 'plan'],
    registers: [register],
  }),
};
```

```typescript
// middleware/metrics.ts (proposed)
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({ method: req.method, path: req.route?.path || req.path, status_code: res.statusCode });
    httpRequestDuration.observe({ method: req.method, path: req.route?.path || req.path }, duration);
  });
  next();
};
```

---

## 6. Health & Readiness Checks (Already Implemented)

### Status: ✅ **IMPLEMENTED**

**Location**: `apps/backend/src/index.ts:92-116`

| Endpoint | Purpose | Checks |
|----------|---------|--------|
| `GET /health` | Full health | DB connectivity, uptime, environment |
| `GET /health/ready` | K8s readiness | DB connectivity (returns 503 if down) |
| `GET /health/live` | K8s liveness | Process alive (always 200) |

**Database Health Check**: `apps/backend/src/config/supabase.ts:87-98`

```typescript
export async function checkSupabaseHealth(): Promise<{ healthy: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const { error } = await supabaseAdmin.from('users').select('id').limit(1).single();
    if (error && error.code !== 'PGRST116') throw error;
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { healthy: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

**Gap**: No checks for external dependencies (Stripe, AI providers, Email).

---

## 7. Logging by Module

### Auth Module
- Login attempts: ✅ Audit log (login action)
- Failed logins: ❌ Not logged separately (only audit on success)
- Token refresh: ✅ Audit log
- Password reset: ✅ Audit log

### Business Module
- CRUD operations: ✅ Audit log on all mutations
- List queries: ❌ Not logged (read-only)

### QR Code Module
- CRUD operations: ✅ Audit log
- Public scan: ✅ Creates scan_log + review_session + audit
- Download: ✅ Audit log + download_count increment

### Review Module
- Generation: ✅ Audit log (review.generated)
- Edit/Regenerate: ✅ Audit log (review.edited, review.regenerated)
- Complete/Abandon: ✅ Audit log (review.completed, review.abandoned)

### Analytics Module
- Queries: ❌ Not logged (read-only)

### Subscription Module
- All mutations: ✅ Audit log
- Stripe webhook events: ✅ Processed in controller, audit logged

### Admin Module
- All mutations: ✅ Audit log
- Sensitive operations: ✅ Audit log with full context

---

## 8. Security Event Logging

### Currently Logged
| Event | Logged | Location |
|-------|--------|----------|
| Failed authentication | ✅ | Auth middleware + audit (login) |
| Authorization failures | ⚠️ | Returns 403, not separately logged |
| Rate limit exceeded | ⚠️ | Returns 429, not separately logged |
| Input validation failures | ⚠️ | Returns 400, not separately logged |
| SQL injection attempts | ✅ | Blocked by parameterized queries |
| Admin actions | ✅ | Full audit trail |

### Recommended Security Logging
```typescript
// Security events to log
const securityLogger = logger.child({ category: 'security' });

// In auth middleware
if (!token) {
  securityLogger.warn({ ip: req.ip, path: req.path }, 'Missing auth token');
}

// In requireBusinessAccess
if (!membership) {
  securityLogger.warn({ 
    userId: req.user?.sub, 
    businessId: businessId,
    ip: req.ip 
  }, 'Business access denied');
}

// In rate limiter
securityLogger.warn({ 
  ip: req.ip, 
  endpoint: req.path,
  limit: 'auth' 
}, 'Rate limit exceeded');
```

---

## 9. Log Aggregation & Retention

### Current State
| Aspect | Status | Details |
|--------|--------|---------|
| Log destination | Stdout/Stderr | Container logs |
| Retention | Platform dependent | Railway/Vercel: ~30 days |
| Search/Query | ❌ | No centralized logging |
| Alerting | ❌ | No log-based alerts |
| Audit log retention | ✅ | PostgreSQL partitioned table, configurable |

### Required for Production
| Capability | Tool Options | Priority |
|------------|--------------|----------|
| Centralized logging | Loki, Elasticsearch, Datadog Logs, CloudWatch | High |
| Log search/query | Grafana, Kibana, Datadog | High |
| Log-based alerting | AlertManager, PagerDuty, OpsGenie | High |
| Retention policy | 90 days hot, 1 year cold | Medium |
| Cost control | Sampling, tiered storage | Medium |

---

## 10. Observability Checklist

### Pilot Launch (Minimum)
- [x] HTTP request logging (Morgan)
- [x] Unhandled error logging (console.error)
- [x] Comprehensive audit logging (database)
- [x] Health check endpoints (3 endpoints)
- [x] Graceful shutdown handlers
- [ ] **Request ID correlation** (needed for debugging)
- [ ] **Structured JSON logging** (needed for log aggregation)
- [ ] **Error tracking (Sentry)** (needed for production visibility)

### Production Launch (Required)
- [ ] Structured logging (Pino/Winston)
- [ ] Request ID middleware
- [ ] Error tracking (Sentry)
- [ ] Metrics collection (Prometheus)
- [ ] Centralized log aggregation (Loki/Datadog)
- [ ] Log-based alerting
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Business metrics dashboard
- [ ] SLI/SLO definitions
- [ ] On-call runbooks

---

## 11. Implementation Priority

| Priority | Task | Effort | Dependencies |
|----------|------|--------|--------------|
| P0 | Request ID middleware | 1 hour | None |
| P0 | Structured logger (Pino) | 2 hours | Request ID |
| P0 | Sentry integration | 2 hours | Structured logger |
| P1 | Prometheus metrics | 4 hours | Structured logger |
| P1 | Log aggregation (Loki) | 4 hours | Structured logger |
| P1 | Alerting rules | 2 hours | Metrics + logs |
| P2 | OpenTelemetry tracing | 8 hours | Metrics |
| P2 | Custom business dashboards | 8 hours | Metrics |

---

## 12. Audit Log Verification

### Query Examples for Operations

```sql
-- All actions by a user
SELECT * FROM audit_logs 
WHERE user_id = 'uuid' 
ORDER BY created_at DESC 
LIMIT 100;

-- Business activity timeline
SELECT * FROM audit_logs 
WHERE business_id = 'uuid' 
ORDER BY created_at DESC 
LIMIT 100;

-- Failed authorization attempts (not in audit, need to add)
-- Security events from application logs
SELECT * FROM application_logs 
WHERE level = 'warn' AND category = 'security' 
ORDER BY created_at DESC;

-- Subscription changes
SELECT * FROM audit_logs 
WHERE resource_type = 'subscription' 
ORDER BY created_at DESC;

-- Admin actions
SELECT * FROM audit_logs 
WHERE action LIKE 'admin.%' 
ORDER BY created_at DESC;
```

### Partition Management
```sql
-- Check partition sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE tablename LIKE 'audit_logs_%'
ORDER BY tablename;

-- Detach old partitions (after retention period)
ALTER TABLE audit_logs DETACH PARTITION audit_logs_2024_01;
```

---

## 13. Conclusion

**Observability Logging: ⚠️ CONDITIONALLY READY FOR PILOT**

### Current Strengths
1. ✅ Comprehensive audit logging on all mutations (database-level)
2. ✅ Health check endpoints for orchestration
3. ✅ Graceful shutdown handling
4. ✅ HTTP request logging (Morgan)
5. ✅ Error logging for unhandled exceptions
6. ✅ Partitioned audit_logs table for scalability

### Critical Gaps for Pilot
1. **No request ID correlation** - Makes debugging production issues difficult
2. **No structured logging** - Cannot aggregate/query logs effectively
3. **No error tracking service** - No visibility into production errors

### Recommended Pilot Minimum
1. Add **request ID middleware** (1 hour)
2. Add **Pino structured logger** (2 hours)
3. Add **Sentry error tracking** (2 hours)
4. Configure **uptime monitoring** on `/health/ready`

**Time to Pilot-Ready Observability**: ~5-6 hours

---

## Next Task: TASK 14 - Pilot Data Safety