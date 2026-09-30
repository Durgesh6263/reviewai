# ReviewAI Pilot Launch Checklist

This checklist tracks the production launch readiness and pilot deployment process for the first 5–10 business cohort.

---

## PRE-LAUNCH (Engineering & Infrastructure Readiness)

- [x] **Production environment configured**
  - Canonical domain configured via `NEXT_PUBLIC_APP_URL` / `FRONTEND_URL`.
  - Production backend port, CORS origins (`ALLOWED_ORIGINS`), and SSL termination verified.
- [x] **Secrets configured**
  - Strict separation between public variables (`NEXT_PUBLIC_*`) and server-only secrets.
  - Required secrets validated on boot via Zod schema (`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` min 32 chars, `JWT_REFRESH_SECRET` min 32 chars, `OPENAI_API_KEY`/`GEMINI_API_KEY`).
  - Admin settings API masks secrets (`••••••••`) to prevent browser exposure.
- [x] **Database migrations verified**
  - Schema migrations `001_initial_schema.sql`, `002_admin_tables.sql`, `003_pilot_onboarding.sql`, and `004_billing_production.sql` apply cleanly in order.
  - All tables enforce Row-Level Security (RLS) policies.
  - Foreign keys, composite indexes, and unique constraints validated.
  - Seed scripts strictly block execution in `NODE_ENV === 'production'` to prevent mock data leakage.
- [x] **Authentication verified**
  - Email/password authentication, JWT issuance, and refresh token rotation in place.
  - Protected dashboard routes reject unauthenticated requests.
  - Anonymous customer review routes (`/r/[slug]`) remain fully accessible without login.
- [x] **Admin access verified**
  - Role-based authorization (`requireAdmin` middleware) protects all `/api/v1/admin/*` endpoints.
  - Regular business owners cannot access admin capabilities.
- [x] **QR production URL verified**
  - QR generation dynamically formats canonical production URL: `https://<production-domain>/r/{business_slug}`.
  - No hardcoded `localhost:3000` URLs in generated codes.
  - `ISO/IEC 18004` compliance with Level M/Q error correction and 4-module quiet zone.
- [x] **AI API verified**
  - Dual-provider support (OpenAI `gpt-4o-mini` with fallback to Google Gemini `gemini-1.5-flash`).
  - Strict generation timeout (8000ms) with localized template fallbacks.
  - Session-level generation cap (maximum 5 generations/regenerations per review session).
- [x] **Google Review URLs verified**
  - Support for `https://search.google.com/local/writereview?placeid=...` and Google Maps shortlinks.
  - URL sanitization and direct external redirection to native review composer.
- [x] **Rate limiting verified**
  - General API limiter: 100 requests per 15 minutes.
  - Auth limiter: 5 requests per 15 minutes.
  - Public QR review flow limiter: 60 requests per 15 minutes.
  - AI generation limiter: 20 requests per 15 minutes per IP.
  - Feedback submission limiter: 10 requests per 15 minutes per IP.
- [x] **Error handling verified**
  - Production error middleware masks database errors and internal stack traces.
  - Structured Pino logging with error redaction and correlation IDs.
  - Custom UI fallback pages for 404 (`not-found.tsx`), runtime errors (`error.tsx`), and inactive business slugs.
- [x] **Backup/recovery responsibility confirmed**
  - Documented as an external operational requirement: Supabase Automated Daily Backups + Point-In-Time Recovery (PITR) for Pro tiers. Manual pg_dump operational runbook defined.
- [x] **Production build passes**
  - Turbo build succeeded across all 6 monorepo packages (`@reviewai/types`, `@reviewai/shared`, `@reviewai/ui`, `@reviewai/api-client`, `@reviewai/backend`, `@reviewai/frontend`).
  - Next.js 14 optimized static and dynamic routes compiled with zero TypeScript or ESLint errors.

---

## BUSINESS PILOT (First 5–10 Business Onboarding)

- [ ] **Business account created**
  - Business owner registers account at `/register` or via invitation.
- [ ] **Business profile completed**
  - Business name, contact details, category, and operating hours saved in `/dashboard/settings`.
- [ ] **Google Review URL configured**
  - Verified valid Place ID or direct Google review composer URL tested.
- [ ] **Experience tags configured**
  - Custom service/experience chips configured for quick customer selection.
- [ ] **QR generated**
  - High-resolution SVG/PNG generated with business branding and high contrast colors.
- [ ] **QR tested**
  - QR scanned with iOS and Android camera apps under normal ambient lighting.
- [ ] **Owner dashboard verified**
  - Review analytics, scan logs, conversion funnel, and private feedback inbox loading correctly.

---

## CUSTOMER PILOT (In-Store Review Experience)

- [ ] **QR scan works**
  - Customer scans physical QR code on counter/table tent and opens `/r/[slug]` within < 2 seconds.
- [ ] **Rating works**
  - Clean 1–5 star interactive selection with responsive visual feedback.
- [ ] **Tags work**
  - Customer selects 1–3 experience tags reflecting their visit.
- [ ] **Customer text works**
  - Optional customer notes/keywords seamlessly incorporated into prompt.
- [ ] **AI generation works**
  - Authentic, personalized review draft generated in < 3 seconds in selected language.
- [ ] **Editing works**
  - Customer can easily modify, add details, or regenerate draft.
- [ ] **Copy works**
  - Single-tap copy to system clipboard with clear visual confirmation toast.
- [ ] **Google page opens**
  - Review composer opens in new tab/native browser window.
- [ ] **Manual submission wording is correct**
  - UI explicitly instructs: *"Review copied! Paste your review and submit on Google."* (Google policy compliant).
- [ ] **Low-rating flow does not block Google**
  - Ratings of 1–3 stars offer a private direct feedback form, but ALWAYS provide an explicit, unblocked link to open Google Reviews directly (strict anti-gating compliance).

---

## POST-LAUNCH (Monitoring & Pilot Iteration)

- [ ] **Monitor errors**
  - Track server error logs and Sentry alerts for any 5xx responses.
- [ ] **Review pilot feedback**
  - Review owner onboarding feedback captured in `onboarding_feedback` table.
- [ ] **Check AI usage**
  - Monitor daily AI generation counts and token consumption against pilot budgets.
- [ ] **Check QR scans**
  - Verify scan timestamps, user agents, and conversion rates across active pilot locations.
- [ ] **Check Google page opens**
  - Verify `converted_to_google` conversion rate metrics in analytics dashboard.
- [ ] **Check private feedback**
  - Ensure private negative feedback submissions are received and actionable in dashboard.
- [ ] **Review reported issues**
  - Schedule weekly check-ins with pilot cohort businesses to gather usability observations.
