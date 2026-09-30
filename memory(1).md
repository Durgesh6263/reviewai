# memory.md

# ReviewAI Project Memory

This document stores long-term architectural and product decisions that
must remain consistent across future development.

------------------------------------------------------------------------

# Product Vision

ReviewAI is a multi-tenant SaaS platform that helps businesses collect
authentic Google reviews.

Customers scan a ReviewAI QR code, receive an AI-assisted review
suggestion, edit it if needed, and are then redirected to that
business's Google Review page to manually submit the review.

------------------------------------------------------------------------

# Permanent Customer Flow

1.  Scan ReviewAI QR
2.  Open: https://reviewai.com/r/{business_slug}
3.  Backend identifies the business
4.  Load business information
5.  Select language
6.  Select star rating
7.  AI generates review
8.  Customer edits review
9.  Continue to Google Reviews
10. Redirect to the stored Google Review URL
11. Customer pastes and submits the review

This flow is considered the canonical customer journey.

------------------------------------------------------------------------

# Permanent Architecture Decisions

-   QR codes always point to ReviewAI URLs.
-   Google Review URLs are stored only in the database.
-   Business identification is performed using `business_slug`.
-   QR codes should never need to change if the Google Review URL
    changes.
-   The backend is responsible for resolving the Google Review URL.

------------------------------------------------------------------------

# Business Data

Each business stores: - Business ID - Business Slug - Business Name -
Google Review URL - Logo - Subscription - Status

------------------------------------------------------------------------

# Core Technologies

Frontend - Next.js - React - TypeScript - Tailwind CSS

Backend - Node.js - Express

Database - Supabase PostgreSQL

Authentication - JWT + RBAC

AI - OpenAI or Gemini

Hosting - Vercel - Railway / Render / VPS

------------------------------------------------------------------------

# Analytics

Always track: - QR scans - Review sessions - AI review generations -
Continue-to-Google clicks - Conversion rate

------------------------------------------------------------------------

# Non-Negotiable Rules

-   Never auto-submit Google reviews.
-   Never redirect before the customer completes the review flow.
-   Never store Google Review URLs inside QR codes.
-   Always load the Google Review URL from the database using the
    business slug.
-   Customer approval is required before leaving ReviewAI.

------------------------------------------------------------------------

# Repository Documents

-   project_requirements_document.md
-   architecture.md
-   rules.md
-   phases.md
-   design.md
-   memory.md

------------------------------------------------------------------------

Update this document whenever a permanent product, architecture, or
business decision changes.
