# ReviewAI Pilot Operations Runbook

### Business Onboarding
- create owner account
- configure business
- configure Google Review URL
- configure tags
- generate/test QR

### Customer Test
- scan QR
- rating
- tags
- optional text
- AI draft
- edit
- copy
- manually paste/submit on Google

### Daily Admin Check
- check Pilot Control Center
- check critical errors
- check AI failures
- check unresolved feedback

### Incident
- identify
- reproduce
- fix
- regression test
- resolve

### Important Rules
- never auto-submit Google reviews
- never block customers based on rating
- Google page open ≠ Google review submitted
- offline QR requires internet

### Pilot Review & Issues Log (Step 35 & Step 37)
- Confirmed issues (Step 35): Mobile sendBeacon text/plain payload in updateReview, recordFeedbackStart, recordFeedbackSkip could drop session mapping if sent as unparsed string
- Confirmed issues (Step 37):
  1. AI prompt hallucination risk & customer personal notes/tags dropped in fallback review generation and regeneration
  2. Fallback session creation in in-memory mode did not preserve session metadata
  3. Controller beacon payload handling needed safe stringified JSON parsing on regenerateReview, submitFeedback, and abandonSession
- Fixes made (Step 37):
  1. Updated Gemini and OpenAI system and user prompts with strict anti-hallucination guidelines and mandatory customer notes/tags preservation
  2. Enhanced generateFallbackReviewText and regenerateReview to weave customer notes and selected highlights directly into generated reviews
  3. Preserved session metadata on fallback session creation in ReviewService
  4. Added stringified JSON request body parsing across regenerateReview, submitFeedback, and abandonSession in ReviewController
  5. Added regression test suite (95 tests now passing across all modules)
- Remaining known issues: None (0 blockers, 95/95 tests passing, zero-error production build)
- Deferred improvements (P2/P3):
  - Multi-language dual side-by-side translation on Google redirect (P2): Deferred; Google Maps handles in-app translation natively
  - Custom brand vector logo embedding inside QR frames (P3): Deferred to post-pilot; high-contrast SVG QRs are camera-optimized
  - Automated owner response drafting for Google reviews (P3): Deferred to post-pilot feature roadmap
