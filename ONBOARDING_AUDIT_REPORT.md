# Onboarding Flow Audit Report - ReviewAI
**Date:** 2026-09-12  
**Purpose:** Audit current onboarding implementation for STEP 23 - Business Pilot Onboarding & Demo System

---

## Current Implementation Status

### ✅ COMPLETED - Authentication Flow
| Feature | File | Status |
|---------|------|--------|
| User Registration | `apps/frontend/src/app/register/page.tsx` | ✅ Complete |
| User Login | `apps/frontend/src/app/login/page.tsx` | ✅ Complete |
| JWT Auth Provider | `apps/frontend/src/lib/auth-provider.tsx` | ✅ Complete |
| Password Reset | `apps/frontend/src/app/forgot-password/page.tsx`, `reset-password/page.tsx` | ✅ Complete |
| Email Verification | `apps/frontend/src/app/verify-email/page.tsx` | ✅ Complete |
| OAuth (Google/GitHub) | Login page has buttons | ✅ UI ready |

**Backend Auth:** Complete with RS256 JWT, refresh tokens, role-based middleware

---

### ✅ COMPLETED - Business Creation
| Feature | File | Status |
|---------|------|--------|
| Create Business Page | `apps/frontend/src/app/dashboard/businesses/new/page.tsx` | ✅ Complete |
| Business API | `apps/backend/src/modules/business/controller.ts`, `service.ts` | ✅ Complete |
| Validation | `apps/backend/src/modules/business/validators.ts` | ✅ Complete |
| Fields: Name, Google Place ID, Email, Phone, Address, Timezone | | ✅ All present |
| Auto-slug generation | | ✅ Works |

**Missing from STEP 23 spec:** Google Review URL (required field is Google Place ID, not Review URL)

---

### ⚠️ PARTIAL - Business Configuration (Experience Tags)
| Feature | File | Status |
|---------|------|--------|
| Tag Management UI | `apps/frontend/src/app/dashboard/business/page.tsx` | ✅ Complete CRUD |
| Tag API Endpoints | Backend routes needed | ⚠️ Need to verify |
| Tag Validation (min 6, max 10) | Frontend shows warnings | ✅ Frontend validation |
| Drag-and-drop reordering | | ✅ Implemented |

**Issue:** The business profile page is at `/dashboard/business` (single business view) but there's no clear onboarding flow linking business creation → tag configuration → QR generation

---

### ✅ COMPLETED - QR Code Generation
| Feature | File | Status |
|---------|------|--------|
| Create QR Page | `apps/frontend/src/app/dashboard/qr-codes/new/page.tsx` | ✅ Complete |
| QR List Page | `apps/frontend/src/app/dashboard/qr-codes/page.tsx` | ✅ Complete |
| Design Customization | Color, shape, logo, frame text, quiet zone | ✅ Complete |
| Live Preview | Uses qrserver.com API | ✅ Complete |
| Download/Copy URL | | ✅ Complete |

---

### ✅ COMPLETED - Dashboard & Analytics
| Feature | File | Status |
|---------|------|--------|
| Main Dashboard | `apps/frontend/src/app/dashboard/page.tsx` | ✅ Complete |
| Analytics Page | `apps/frontend/src/app/dashboard/analytics/page.tsx` | ✅ Complete |
| Business List | `apps/frontend/src/app/dashboard/businesses/page.tsx` | Need to verify |
| Quick Actions | Create Business, Create QR, View Analytics | ✅ Present |

---

## GAPS IDENTIFIED for STEP 23

### 1. **No Guided Onboarding Flow** (Critical)
- **Current:** User registers → lands on dashboard → must manually navigate to create business → create QR
- **Required:** Step-by-step wizard: Signup → Business Setup → Google Config → Tags → QR Generation → Test → Dashboard

### 2. **Google Review URL vs Place ID Confusion** (Critical)
- **Current:** Business creation requires `google_place_id` (ChIJ...)
- **Spec requires:** `google_review_url` (direct review link like `https://g.page/.../review`)
- **Business profile page** has BOTH fields but they're in separate sections

### 3. **Missing Onboarding State Tracking** (High)
- No database field to track onboarding progress
- No "first-time user" detection
- No completion status per step

### 4. **No QR Test/Verification Step** (High)
- QR preview exists but no guided "scan with phone to test" step
- No verification that QR → ReviewAI page → Google redirect works

### 5. **Missing Business Selection After Login** (Medium)
- If user has multiple businesses, no selection screen
- Dashboard shows all but onboarding should focus on first business

### 6. **No Welcome/Success Screens** (Medium)
- After registration: generic dashboard
- After business creation: redirect to business detail
- After QR creation: redirect to QR detail
- No "onboarding complete" celebration

### 7. **Missing Pilot-Specific Features** (Per STEP 23)
- Demo mode indicator
- Pilot user tagging/metadata
- Limited feature flags for pilot
- Feedback collection during onboarding

---

## RECOMMENDED IMPLEMENTATION ORDER

### TASK 1: Onboarding State & Tracking (Backend) ✅ COMPLETED
- Added `onboarding_step` field to users/businesses table ✅
- Added `onboarding_completed_at` timestamp ✅
- Created onboarding progress API ✅
- Created database migration `004_onboarding_tracking.sql` ✅
- Created backend module at `apps/backend/src/modules/onboarding/` ✅
- API endpoints:
  - `GET /api/v1/onboarding/progress` - Get progress
  - `POST /api/v1/onboarding/progress/step` - Update step
  - `POST /api/v1/onboarding/progress/complete` - Complete onboarding
  - `POST /api/v1/onboarding/feedback` - Submit pilot feedback
  - `GET /api/v1/onboarding/analytics/funnel` - Funnel analytics (admin)
  - `GET /api/v1/onboarding/analytics/feedback-summary` - Feedback summary (admin)
  - `GET /api/v1/onboarding/limits/:businessId` - Pilot limits
  - `GET /api/v1/onboarding/limits/:businessId/qr-check` - QR creation limit check

### TASK 2: Onboarding Wizard Frontend
- Create `/onboarding` multi-step route
- Step 1: Business Basics (name, slug, Place ID)
- Step 2: Google Review URL Configuration
- Step 3: Experience Tags (with min 6 enforcement)
- Step 4: QR Code Generation & Design
- Step 5: QR Test & Verification
- Step 6: Dashboard Tour → Complete

### TASK 3: Fix Google Review URL Flow
- Make `google_review_url` required in business creation
- Keep `google_place_id` for maps integration
- Clear validation messaging

### TASK 4: Business Selection/Creation Flow
- Post-login: if no business → redirect to onboarding
- If has businesses → business selector → dashboard

### TASK 5: QR Test Flow
- Generate test QR → show mobile preview → "Scan to test" button
- Track test scan event
- Verify Google redirect works

### TASK 6: Pilot Metadata & Limits
- Add `is_pilot_user` flag
- Add pilot feature flags
- Limit: 1 business, 3 QR codes, 100 scans/month for pilot

### TASK 7: Onboarding Analytics
- Track completion rates per step
- Identify drop-off points
- Pilot feedback form at completion

---

## FILES TO CREATE/MODIFY

### New Files
1. `apps/frontend/src/app/onboarding/page.tsx` - Main wizard
2. `apps/frontend/src/app/onboarding/step/[step]/page.tsx` - Individual steps
3. `apps/frontend/src/components/onboarding/OnboardingWizard.tsx` - Wizard component
4. `apps/frontend/src/components/onboarding/OnboardingStep*.tsx` - Each step
5. `apps/frontend/src/lib/onboarding-tracker.ts` - Client-side progress
6. `apps/backend/src/modules/onboarding/` - Backend module ✅ CREATED
   - `apps/backend/src/modules/onboarding/types.ts` ✅
   - `apps/backend/src/modules/onboarding/validators.ts` ✅
   - `apps/backend/src/modules/onboarding/service.ts` ✅
   - `apps/backend/src/modules/onboarding/controller.ts` ✅
   - `apps/backend/src/modules/onboarding/routes.ts` ✅
   - `apps/backend/src/modules/onboarding/index.ts` ✅
7. `apps/backend/supabase/migrations/004_onboarding_tracking.sql` ✅

### Modified Files
1. `apps/frontend/src/lib/auth-provider.tsx` - Add onboarding state
2. `apps/frontend/src/app/dashboard/layout.tsx` - Redirect if onboarding incomplete
3. `apps/backend/src/modules/business/validators.ts` - Require google_review_url
4. `apps/backend/src/modules/business/service.ts` - Onboarding tracking
5. Database migration for onboarding fields ✅ COMPLETED
6. `apps/backend/src/index.ts` - Mount onboarding routes ✅ COMPLETED

---

## DATABASE MIGRATIONS NEEDED

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN onboarding_step TEXT DEFAULT 'welcome';
ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN is_pilot_user BOOLEAN DEFAULT FALSE;

-- Add to businesses table (or use user table)
ALTER TABLE businesses ADD COLUMN onboarding_step TEXT DEFAULT 'business_info';
ALTER TABLE businesses ADD COLUMN google_review_url TEXT; -- Already exists?
-- Verify google_place_id vs google_review_url distinction
```

---

## NEXT ACTIONS

1. **Immediate:** Create onboarding wizard frontend structure
2. **Backend:** Add onboarding tracking fields + API
3. **Integration:** Connect wizard steps to existing business/QR APIs
4. **Testing:** End-to-end flow with pilot user simulation
5. **Polish:** Success screens, demo mode badges, feedback collection