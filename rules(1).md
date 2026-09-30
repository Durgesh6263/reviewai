# Rules

# AI QR Review Generator SaaS

## 1. Product Rules

-   Every business must have a unique `business_slug`.
-   Every QR code must point to:
    `https://reviewai.com/r/{business_slug}`
-   Never embed the Google Review URL directly in the QR code.
-   Store the Google Review URL securely in the database.
-   Redirect customers only after the AI review flow is completed.

------------------------------------------------------------------------

## 2. Customer Flow Rules

The customer journey must always be:

1.  Scan ReviewAI QR
2.  Business identified
3.  Select language
4.  Select 1--5 star rating
5.  AI generates review
6.  Customer edits review (optional)
7.  Customer taps **Continue to Google Reviews**
8.  Redirect to the stored Google Review URL
9.  Customer manually pastes and submits the review

This sequence must not be changed without updating the PRD and
architecture.

------------------------------------------------------------------------

## 3. AI Rules

-   AI only suggests review text.
-   Reviews should match the selected language and star rating.
-   Generated text must be editable.
-   Avoid repetitive review wording.
-   Never impersonate a customer.

------------------------------------------------------------------------

## 4. QR Rules

-   One QR per business location.
-   QR remains permanent even if the Google Review URL changes.
-   Updating a Google Review URL must not require printing a new QR.

------------------------------------------------------------------------

## 5. Business Rules

-   Each business stores:
    -   Business name
    -   Business slug
    -   Google Review URL
    -   Subscription status
-   Only verified business owners may edit business details.

------------------------------------------------------------------------

## 6. Security Rules

-   HTTPS only
-   JWT authentication
-   Role-based access control
-   Input validation
-   Rate limiting
-   Store secrets in environment variables
-   Hash passwords with bcrypt

------------------------------------------------------------------------

## 7. Database Rules

Use UUID primary keys where applicable.

Core tables: - users - businesses - qr_codes - review_sessions -
generated_reviews - scan_logs - subscriptions - audit_logs

------------------------------------------------------------------------

## 8. Analytics Rules

Track: - QR scans - AI review generations - Continue-to-Google clicks -
Active businesses - Subscription usage

Do not track or store the final Google review content after the customer
leaves the platform unless explicitly required and consented to.

------------------------------------------------------------------------

## 9. API Rules

Public: - GET /r/{business_slug} - POST /review/generate

Business: - PUT /business/google-review-url - GET /analytics

Admin: - Manage businesses - Manage subscriptions

------------------------------------------------------------------------

## 10. Coding Standards

-   TypeScript preferred
-   SOLID
-   DRY
-   Reusable components
-   Consistent API responses
-   Async/await

------------------------------------------------------------------------

## 11. Non-Negotiable Rules

-   Never auto-submit Google reviews.
-   Never bypass customer approval.
-   Never redirect before the customer finishes the review flow.
-   Always load the Google Review URL from the database using the
    business slug.
