# Design Guidelines

# AI QR Review Generator (ReviewAI)

## Design Philosophy

-   Mobile-first
-   Clean and minimal
-   Fast user journey
-   Maximum 3--4 minutes from QR scan to Google Review
-   Simple enough for first-time users

------------------------------------------------------------------------

# Brand Identity

Product Name: ReviewAI

Primary Color: #2563EB Success: #10B981 Accent: #F59E0B Background:
#F8FAFC Surface: #FFFFFF Text: #111827

Typography: - Font: Inter - Headings: 600--700 - Body: 400--500

------------------------------------------------------------------------

# Customer Journey

1.  Scan ReviewAI QR
2.  ReviewAI identifies the business
3.  Welcome screen with business branding
4.  Language selection
5.  Star rating selection
6.  AI review generation
7.  Review editor
8.  Continue to Google Reviews
9.  Redirect to the business's stored Google Review URL
10. Customer pastes and submits the review

------------------------------------------------------------------------

# Customer Screens

## 1. QR Landing

-   Business logo
-   Business name
-   Welcome message
-   Start button

## 2. Language Selection

-   English
-   Hindi
-   Hinglish
-   Other supported languages

## 3. Rating Screen

-   1--5 star selector
-   Short description under each rating

## 4. AI Review Screen

-   Generated review
-   Regenerate button
-   Copy button
-   Edit button

## 5. Review Editor

-   Editable textarea
-   Character counter
-   Continue to Google Reviews button

## 6. Redirect Screen

Message: "Opening Google Reviews..."

Automatically redirect to the Google Review URL stored for the business.

------------------------------------------------------------------------

# Business Dashboard

Sections: - Overview - Businesses - QR Codes - Google Review URL -
Analytics - Subscription - Settings

Widgets: - QR Scans - AI Reviews Generated - Continue-to-Google Clicks -
Conversion Rate

------------------------------------------------------------------------

# Admin Dashboard

-   Businesses
-   Users
-   Revenue
-   Plans
-   Platform Analytics
-   Audit Logs

------------------------------------------------------------------------

# UX Rules

-   Never ask customers to search for the business manually.
-   Always identify the business from the ReviewAI QR.
-   Always redirect using the Google Review URL stored in the database.
-   Keep the review generation flow linear.
-   Preserve customer edits before redirect.

------------------------------------------------------------------------

# Components

-   Primary Button
-   Secondary Button
-   Rating Selector
-   Language Selector
-   Review Card
-   Editable Textarea
-   Analytics Cards
-   QR Card

------------------------------------------------------------------------

# Responsive Breakpoints

Mobile: \<640px Tablet: 640--1023px Desktop: 1024px+

------------------------------------------------------------------------

# Accessibility

-   WCAG-friendly contrast
-   Keyboard navigation
-   Screen reader support
-   Visible focus states

------------------------------------------------------------------------

# Future Enhancements

-   Dark mode
-   White-label themes
-   Custom branding
-   Animated onboarding
-   Voice-to-review
