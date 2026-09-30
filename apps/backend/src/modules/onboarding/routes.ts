/**
 * Onboarding Module Routes
 * ReviewAI SaaS Platform
 * REST API routes for onboarding progress tracking
 */

import { Router } from 'express';
import { OnboardingController } from './controller';
import { OnboardingService } from './service';
import { createAuthMiddleware } from '../auth/middleware';
import { AuthService } from '../auth/service';
import {
  updateOnboardingStepSchema,
  completeOnboardingSchema,
  verifyGoogleUrlSchema,
  submitPilotFeedbackSchema,
  onboardingFunnelQuerySchema,
} from './validators';
import { SupabaseClient } from '@supabase/supabase-js';

export function createOnboardingRoutes(
  supabase: SupabaseClient,
  authService: AuthService
): Router {
  const router = Router();
  const onboardingService = new OnboardingService(supabase);
  const onboardingController = new OnboardingController(onboardingService);
  const authMiddleware = createAuthMiddleware(authService);

  // Apply authentication to all routes
  router.use(authMiddleware.authenticate);

  // ============================================================================
  // Onboarding Progress Routes
  // ============================================================================

  /**
   * GET /api/v1/onboarding/progress
   * Get current user's onboarding progress
   */
  router.get('/progress', onboardingController.getProgress);

  /**
   * POST /api/v1/onboarding/progress/step
   * Update current onboarding step
   * Body: { step: OnboardingStep, step_data?: Record<string, unknown> }
   */
  router.post(
    '/progress/step',
    authMiddleware.validate(updateOnboardingStepSchema),
    onboardingController.updateStep
  );

  /**
   * POST /api/v1/onboarding/progress/complete
   * Complete onboarding
   */
  router.post(
    '/progress/complete',
    authMiddleware.validate(completeOnboardingSchema),
    onboardingController.completeOnboarding
  );

  /**
   * POST /api/v1/onboarding/verify-google-url
   * Verify Google Review URL
   */
  router.post(
    '/verify-google-url',
    authMiddleware.validate(verifyGoogleUrlSchema),
    onboardingController.verifyGoogleUrl
  );

  /**
   * POST /api/v1/onboarding/test-scan
   * Start test scan session
   */
  router.post('/test-scan', onboardingController.createTestScan);

  /**
   * GET /api/v1/onboarding/test-scan/:sessionId
   * Check test scan session status
   */
  router.get('/test-scan/:sessionId', onboardingController.getTestScan);

  /**
   * POST /api/v1/onboarding/pilot
   * Mark current user as pilot (admin only)
   * Body: { cohort?: string }
   */
  router.post('/pilot', onboardingController.markAsPilot);

  // ============================================================================
  // Pilot Feedback Routes
  // ============================================================================

  /**
   * POST /api/v1/onboarding/feedback
   * Submit pilot feedback
   * Body: { business_id?, category, rating, feedback_text?, step_context?, metadata? }
   */
  router.post(
    '/feedback',
    authMiddleware.validate(submitPilotFeedbackSchema),
    onboardingController.submitFeedback
  );

  /**
   * GET /api/v1/onboarding/feedback
   * Get current user's feedback submissions
   */
  router.get('/feedback', onboardingController.getFeedback);

  // ============================================================================
  // Analytics Routes (Admin)
  // ============================================================================

  /**
   * GET /api/v1/onboarding/analytics/funnel
   * Get onboarding funnel analytics
   * Query: { pilot_only?: boolean }
   */
  router.get(
    '/analytics/funnel',
    authMiddleware.validate(onboardingFunnelQuerySchema),
    onboardingController.getFunnel
  );

  /**
   * GET /api/v1/onboarding/analytics/feedback-summary
   * Get pilot feedback summary
   */
  router.get('/analytics/feedback-summary', onboardingController.getFeedbackSummary);

  // ============================================================================
  // Pilot Limits Routes
  // ============================================================================

  /**
   * GET /api/v1/onboarding/limits/:businessId
   * Get pilot limits for a business
   */
  router.get('/limits/:businessId', onboardingController.getPilotLimits);

  /**
   * GET /api/v1/onboarding/limits/:businessId/qr-check
   * Check if user can create more QR codes
   */
  router.get('/limits/:businessId/qr-check', onboardingController.checkQRCodeLimit);

  return router;
}