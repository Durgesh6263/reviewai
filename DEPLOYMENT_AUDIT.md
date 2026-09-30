# Environment/Deployment Audit

## Overview
Audit of environment configuration, build requirements, deployment readiness, and missing infrastructure for the ReviewAI SaaS platform.

---

## 1. Required Environment Variables (Secrets)

### Backend (`apps/backend/.env.example`)

| Variable | Required | Description | Min Length / Format |
|----------|----------|-------------|---------------------|
| `NODE_ENV` | Yes | Environment (development/production) | `production` \| `development` |
| `PORT` | Yes | Server port | Integer (default 4000) |
| `API_PREFIX` | Yes | API route prefix | `/api/v1` |
| `SUPABASE_URL` | **Critical** | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | **Critical** | Supabase anon key (public) | JWT format |
| `SUPABASE_SERVICE_ROLE_KEY` | **Critical** | Supabase service role key (secret) | JWT format, **NEVER expose to frontend** |
| `JWT_SECRET` | **Critical** | JWT signing secret | **Min 32 chars**, high entropy |
| `JWT_REFRESH_SECRET` | **Critical** | Refresh token signing secret | **Min 32 chars**, different from JWT_SECRET |
| `JWT_ACCESS_EXPIRY` | Yes | Access token expiry | e.g., `15m` |
| `JWT_REFRESH_EXPIRY` | Yes | Refresh token expiry | e.g., `7d` |
| `FRONTEND_URL` | Yes | Frontend origin for CORS | `https://app.reviewai.com` |
| `STRIPE_SECRET_KEY` | **Critical** | Stripe secret key | `sk_live_...` or `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | **Critical** | Stripe webhook signing secret | `whsec_...` |
| `STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key | `pk_live_...` or `pk_test_...` |
| `OPENAI_API_KEY` | **Critical** | OpenAI API key | `sk-...` |
| `GEMINI_API_KEY` | **Critical** | Google Gemini API key | API key format |
| `DEFAULT_AI_PROVIDER` | Yes | Default AI provider | `openai` \| `gemini` |
| `EMAIL_PROVIDER` | Yes | Email service | `resend` \| `sendgrid` \| `postmark` |
| `RESEND_API_KEY` | If Resend | Resend API key | `re_...` |
| `EMAIL_FROM` | Yes | From email address | Valid email |
| `EMAIL_FROM_NAME` | Yes | From display name | String |
| `RATE_LIMIT_WINDOW_MS` | Yes | Rate limit window | Milliseconds (default 900000 = 15min) |
| `RATE_LIMIT_MAX_REQUESTS` | Yes | Max requests per window | Integer (default 100) |
| `LOG_LEVEL` | Yes | Log level | `debug` \| `info` \| `warn` \| `error` |
| `LOG_FORMAT` | Yes | Log format | `json` \| `pretty` |
| `FEATURE_AI_REVIEW_GENERATION` | Yes | Enable AI generation | `true` \| `false` |
| `FEATURE_STRIPE_BILLING` | Yes | Enable Stripe billing | `true` \| `false` |
| `FEATURE_WEBHOOKS` | Yes | Enable webhooks | `true` \| `false` |
| `FEATURE_TEAM_MANAGEMENT` | Yes | Enable team features | `true` \| `false` |

### Frontend (Missing `.env.example` - **Gap**)

**Required frontend environment variables:**
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | **Critical** | Backend API URL (e.g., `https://api.reviewai.com`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **Critical** | Stripe publishable key for client-side |
| `NEXT_PUBLIC_SUPABASE_URL` | **Critical** | Supabase URL for client-side auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Critical** | Supabase anon key for client-side |

---

## 2. Build Requirements

### Root Level
- **Package Manager**: `pnpm@9.0.0` (specified in root `package.json`)
- **Node.js**: ≥ 20.x (implied by dependencies)
- **Turbo**: `^1.13.0` for monorepo orchestration

### Backend
- **TypeScript**: `^5.4.0`
- **Runtime**: Node.js with `tsx` for development, compiled JS for production
- **Build Command**: `pnpm --filter=@reviewai/backend build` → `tsc`
- **Output**: `apps/backend/dist/`
- **Dependencies**: Express, Supabase, Stripe, Zod, bcrypt, jsonwebtoken, OpenAI, Gemini

### Frontend
- **Framework**: Next.js 14.2+ (App Router)
- **TypeScript**: `^5.4.0`
- **Build Command**: `pnpm --filter=@reviewai/frontend build` → `next build`
- **Output**: `apps/frontend/.next/`
- **Dependencies**: React 18.3, TanStack Query, Radix UI, Tailwind CSS, Recharts, Storybook

### Shared Packages
- `@reviewai/types` - Shared TypeScript types
- `@reviewai/shared` - Shared utilities (exceptions, validation, pagination)
- `@reviewai/api-client` - Axios-based API client
- `@reviewai/ui` - shadcn/ui component library

---

## 3. Deployment Infrastructure Gaps

### ❌ **Missing: Docker Configuration**
- No `Dockerfile` in backend or frontend
- No `docker-compose.yml` for local development
- No multi-stage build optimization

### ❌ **Missing: CI/CD Pipeline**
- No `.github/workflows/` directory
- No GitHub Actions for:
  - Type checking
  - Linting
  - Testing
  - Building
  - Deploying to staging/production

### ❌ **Missing: Frontend `.env.example`**
- No example environment file for frontend
- Developers must guess required variables

### ❌ **Missing: ESLint Configuration**
- Backend: No `.eslintrc.js` (lint script exists but will fail)
- Frontend: Has `eslint-config-next` but no custom config file visible

### ❌ **Missing: Jest Configuration**
- Backend: `jest` in devDependencies but no `jest.config.js`
- Frontend: `jest` in devDependencies but no `jest.config.js`
- Test scripts will fail without config

### ❌ **Missing: Database Migration Automation**
- Migrations exist in `apps/backend/supabase/migrations/`
- No automated migration runner for production
- No pg_cron setup for partition maintenance (`create_future_partitions()`)

### ❌ **Missing: Health Check Endpoints**
- No `/health` or `/ready` endpoints in backend
- Required for container orchestration (K8s, ECS, etc.)

### ❌ **Missing: Production Logging Infrastructure**
- Logs to stdout (JSON format) but no aggregation setup
- No structured logging correlation IDs
- No log retention/archival policy

---

## 4. Security Configuration Review

### ✅ **Good Practices**
- Service role key separated from anon key
- JWT secrets separated (access vs refresh)
- Stripe webhook secret configured
- CORS configured via `FRONTEND_URL`
- Helmet.js for security headers
- Rate limiting configured

### ⚠️ **Concerns**
- **No secret rotation strategy** documented
- **No `.env.production` template** with production-specific values
- **Service role key** used in backend - must be protected in deployment (Vault, AWS Secrets Manager, etc.)
- **No CSP (Content Security Policy)** configuration visible

---

## 5. Database Deployment Requirements

### Supabase Setup
1. **Run migrations in order:**
   - `001_initial_schema.sql`
   - `002_admin_tables.sql`
   - `003_upgrade_requests.sql`

2. **Configure pg_cron for partition maintenance:**
   ```sql
   -- Run monthly
   SELECT cron.schedule('create-partitions', '0 0 1 * *', 'SELECT create_future_partitions();');
   SELECT cron.schedule('drop-old-partitions', '0 2 1 * *', 'SELECT drop_old_partitions();');
   ```

3. **Enable required extensions:**
   - `uuid-ossp` (for UUID generation)
   - `pg_cron` (for partition maintenance)
   - `pgcrypto` (for hashing)

4. **RLS Policies:** Already defined in migrations - verify all enabled

---

## 6. Stripe Deployment Requirements

### Webhook Endpoints (Configure in Stripe Dashboard)
| Event | Endpoint |
|-------|----------|
| `customer.subscription.created` | `/api/v1/webhooks/stripe` |
| `customer.subscription.updated` | `/api/v1/webhooks/stripe` |
| `customer.subscription.deleted` | `/api/v1/webhooks/stripe` |
| `invoice.payment_succeeded` | `/api/v1/webhooks/stripe` |
| `invoice.payment_failed` | `/api/v1/webhooks/stripe` |
| `checkout.session.completed` | `/api/v1/webhooks/stripe` |

### Products & Prices
Must create in Stripe Dashboard matching `PLAN_CONFIG`:
- Free: $0/month (50 scans)
- Starter: $29/month (500 scans)
- Professional: $79/month (2,000 scans)
- Enterprise: Custom (unlimited)

---

## 7. AI Provider Deployment

### OpenAI
- API key with `gpt-4o-mini` access
- Set usage limits in OpenAI dashboard
- Monitor costs via OpenAI dashboard

### Gemini (Google AI)
- API key from Google AI Studio
- `gemini-1.5-flash` model access
- Configure safety settings if needed

---

## 8. Email Provider (Resend)

### Domain Setup
1. Verify domain in Resend
2. Configure DKIM/SPF/DMARC
3. Set up sending domain (e.g., `mail.reviewai.com`)

### Templates Needed
- Welcome email
- Review generated notification
- Subscription confirmation
- Upgrade request notifications
- Team invitation emails
- Password reset

---

## 9. Monitoring & Observability Gaps

### Missing
- **APM**: No Datadog, New Relic, or similar integration
- **Error Tracking**: No Sentry, Bugsnag configuration
- **Uptime Monitoring**: No health check endpoints
- **Business Metrics**: No custom dashboard for conversions, revenue
- **Alerting**: No alert rules for error rates, latency, AI failures

---

## 10. Scaling Considerations

### Backend (Stateless - Horizontal Scaling)
- Session data in Supabase (JWT-based, no sticky sessions needed)
- Rate limiting uses in-memory store → **Needs Redis for multi-instance**
- AI generation blocks event loop → **Needs job queue (BullMQ, pg-boss)**

### Database (Supabase/PostgreSQL)
- Connection pooling via PgBouncer (Supabase managed)
- Partitioned tables for high-volume data
- Read replicas for analytics queries

### Frontend (Next.js)
- Static generation where possible
- ISR for dynamic pages
- Edge middleware for auth/redirects
- Image optimization via Next.js Image component

---

## 11. Deployment Checklist

### Pre-Production
- [ ] Create `.env.production` for backend with all secrets
- [ ] Create `.env.production` for frontend (new file needed)
- [ ] Set up Supabase project and run migrations
- [ ] Configure pg_cron for partition maintenance
- [ ] Set up Stripe products, prices, and webhooks
- [ ] Configure Resend domain and templates
- [ ] Set up AI provider accounts and API keys
- [ ] Create Dockerfiles for backend and frontend
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Configure secret management (GitHub Environments, AWS Secrets Manager, etc.)
- [ ] Set up monitoring (Sentry, Datadog, or similar)
- [ ] Configure health check endpoints
- [ ] Set up Redis for rate limiting (multi-instance)
- [ ] Set up job queue for AI generation
- [ ] Run load tests
- [ ] Configure backup/restore strategy for Supabase

### Production Launch
- [ ] Deploy backend to container platform (ECS, K8s, Fly.io, Railway, Render)
- [ ] Deploy frontend to Vercel (recommended for Next.js) or container platform
- [ ] Configure custom domains and SSL
- [ ] Set up CDN for static assets
- [ ] Configure WAF/DDoS protection
- [ ] Run smoke tests on production
- [ ] Monitor error rates and latency
- [ ] Verify Stripe webhooks receiving events
- [ ] Verify email delivery
- [ ] Verify AI generation working

---

## 12. Cost Estimation (Monthly, Approximate)

| Component | Estimate |
|-----------|----------|
| Supabase (Pro) | $25-100+ |
| Backend hosting (2x containers) | $20-100 |
| Frontend hosting (Vercel Pro) | $20 |
| Redis (managed) | $15-50 |
| Job queue (Redis-based) | Included in Redis |
| Stripe fees | 2.9% + 30¢ per transaction |
| OpenAI API | $50-500+ (usage dependent) |
| Gemini API | Free tier / pay-as-you-go |
| Resend (email) | $20-100 |
| Monitoring (Sentry/Datadog) | $50-200 |
| **Total (excluding AI usage)** | **~$200-600/month** |

---

## Summary: Critical Gaps to Address

| Priority | Gap | Effort |
|----------|-----|--------|
| **Critical** | Frontend `.env.example` missing | Low |
| **Critical** | No Dockerfiles | Medium |
| **Critical** | No CI/CD pipeline | Medium |
| **Critical** | No jest.config (tests won't run) | Low |
| **Critical** | No health check endpoints | Low |
| **High** | Rate limiting needs Redis for scaling | Medium |
| **High** | AI generation needs job queue | High |
| **High** | pg_cron not configured for partitions | Low |
| **Medium** | No ESLint config files | Low |
| **Medium** | No monitoring/alerting setup | Medium |
| **Medium** | No secret rotation strategy | Low |

---

## Next Steps

1. **Create frontend `.env.example`** - Copy required variables from this audit
2. **Add Dockerfiles** - Multi-stage builds for backend and frontend
3. **Set up GitHub Actions** - Type-check, lint, build, test pipeline
4. **Add jest.config.js** - Both backend and frontend
5. **Add health check endpoint** - `/health` in backend Express app
6. **Configure Redis** - For rate limiting and job queue
7. **Implement job queue** - For async AI generation (BullMQ recommended)
8. **Set up pg_cron** - For partition maintenance
9. **Add monitoring** - Sentry for errors, basic uptime checks