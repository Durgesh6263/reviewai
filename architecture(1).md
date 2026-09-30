# Architecture Document

# AI QR Review Generator SaaS

## 1. High-Level Architecture

Customer │ ▼ Scan ReviewAI QR │ ▼ https://reviewai.com/r/{business_slug}
│ ▼ Frontend (Next.js) │ ▼ Backend API │ ▼ Lookup Business by Slug │ ▼
Supabase Database │ ├── Business Details ├── Google Review URL └──
Analytics │ ▼ Frontend Flow ├── Language Selection ├── Rating Selection
├── AI Review Generation ├── Review Editing └── Continue to Google
Reviews │ ▼ Redirect to Stored Google Review URL │ ▼ Customer Pastes &
Submits Review

------------------------------------------------------------------------

## 2. System Components

### Frontend

-   Landing / QR entry page
-   Language selection
-   Rating selector
-   AI review editor
-   Business dashboard
-   Admin dashboard

### Backend Services

-   Authentication
-   Business service
-   QR routing service
-   AI review service
-   Analytics service
-   Subscription service

### Database

Tables: - users - businesses - qr_codes - review_sessions -
generated_reviews - scan_logs - subscriptions - audit_logs

------------------------------------------------------------------------

## 3. QR Routing

QR Example: https://reviewai.com/r/the-fitness-world

Flow: 1. Read business_slug. 2. Fetch business from database. 3.
Validate business status. 4. Load branding and Google Review URL. 5.
Start review session.

------------------------------------------------------------------------

## 4. Review Generation Flow

1.  Scan QR.
2.  Identify business.
3.  Select language.
4.  Select 1--5 star rating.
5.  AI generates review.
6.  Customer edits review.
7.  Click "Continue to Google Reviews".
8.  Redirect to stored Google Review URL.
9.  Customer manually pastes and submits review.

------------------------------------------------------------------------

## 5. Database Relationships

Business ├── One Google Review URL ├── Many QR Scans ├── Many Review
Sessions ├── Many Generated Reviews └── One Subscription

------------------------------------------------------------------------

## 6. APIs

Public - GET /r/{business_slug} - POST /review/generate

Business - POST /business - PUT /business/google-review-url - GET
/analytics

Admin - GET /businesses - GET /subscriptions

------------------------------------------------------------------------

## 7. Analytics

Track: - QR scans - Review sessions - AI review generations -
Continue-to-Google clicks - Conversion metrics

------------------------------------------------------------------------

## 8. Security

-   JWT authentication
-   RBAC
-   HTTPS
-   Rate limiting
-   Input validation
-   Encrypted secrets

------------------------------------------------------------------------

## 9. Deployment

Frontend: Vercel

Backend: Railway / Render / VPS

Database: Supabase PostgreSQL

AI: OpenAI or Gemini

------------------------------------------------------------------------

## 10. Non-Negotiable Rule

The platform must never automatically submit Google reviews. It only
redirects customers to the business's stored Google Review page after
they approve the AI-generated review.
