/**
 * Onboarding Module Controller
 * ReviewAI SaaS Platform
 * REST endpoints for onboarding progress tracking
 */

import { Request, Response } from 'express';
import { OnboardingService } from './service';
import {
  UpdateOnboardingStepInput,
  SubmitPilotFeedbackInput,
  OnboardingFunnelQuery,
} from './validators';
import { AppError } from '../../shared/exceptions';

export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  // ============================================================================
  // Onboarding Progress Endpoints
  // ============================================================================

  /**
   * GET /api/v1/onboarding/progress
   * Get current user's onboarding progress
   */
  getProgress = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await this.onboardingService.getProgress(req.user.sub);
    res.json({ success: true, data: result });
  };

  /**
   * POST /api/v1/onboarding/progress/step
   * Update current onboarding step
   */
  updateStep = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { step, step_data } = req.body as UpdateOnboardingStepInput;
    const result = await this.onboardingService.updateStep(req.user.sub, step, step_data);
    res.json({ success: true, data: result });
  };

  /**
   * POST /api/v1/onboarding/progress/complete
   * Complete onboarding
   */
  completeOnboarding = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await this.onboardingService.completeOnboarding(req.user.sub);
    res.json({ success: true, data: result });
  };

  /**
   * POST /api/v1/onboarding/verify-google-url
   * Verify Google Review URL
   */
  verifyGoogleUrl = async (req: Request, res: Response): Promise<void> => {
    const { google_review_url } = req.body as { google_review_url: string };
    const result = await this.onboardingService.verifyGoogleReviewUrl(google_review_url);
    res.json({ success: true, data: result });
  };

  /**
   * POST /api/v1/onboarding/test-scan
   * Create test scan session
   */
  createTestScan = async (req: Request, res: Response): Promise<void> => {
    const { business_id, qr_slug } = req.body;
    const result = await this.onboardingService.createTestScanSession(business_id, qr_slug);
    res.json({ success: true, data: result });
  };

  /**
   * GET /api/v1/onboarding/test-scan/:sessionId
   * Check test scan session status
   */
  getTestScan = async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = req.params;
    const result = await this.onboardingService.getTestScanSession(sessionId);
    res.json({ success: true, data: result });
  };

  /**
   * POST /api/v1/onboarding/pilot
   * Mark current user as pilot (admin only)
   */
  markAsPilot = async (req: Request, res: Response): Promise<void> => {
    if (!req.user || req.user.role !== 'admin') {
      throw new AppError('Admin access required', 403, 'FORBIDDEN');
    }

    // In real implementation, would get user_id from params
    // For now, use current user
    const { cohort } = req.body as { cohort?: string };
    const result = await this.onboardingService.markAsPilot(req.user.sub, cohort);
    res.json({ success: true, data: result });
  };

  // ============================================================================
  // Pilot Feedback Endpoints
  // ============================================================================

  /**
   * POST /api/v1/onboarding/feedback
   * Submit pilot feedback
   */
  submitFeedback = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const data = req.body as SubmitPilotFeedbackInput;
    const result = await this.onboardingService.submitFeedback(req.user.sub, data);
    res.status(201).json({ success: true, data: result });
  };

  /**
   * GET /api/v1/onboarding/feedback
   * Get current user's feedback submissions
   */
  getFeedback = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const feedback = await this.onboardingService.getUserFeedback(req.user.sub);
    res.json({ success: true, data: { feedback } });
  };

  // ============================================================================
  // Analytics Endpoints (Admin)
  // ============================================================================

  /**
   * GET /api/v1/onboarding/analytics/funnel
   * Get onboarding funnel analytics
   */
  getFunnel = async (req: Request, res: Response): Promise<void> => {
    if (!req.user || req.user.role !== 'admin') {
      throw new AppError('Admin access required', 403, 'FORBIDDEN');
    }

    const query = req.query as OnboardingFunnelQuery;
    const pilotOnlyBool = query.pilot_only === true;
    const result = await this.onboardingService.getFunnel(pilotOnlyBool);
    res.json({ success: true, data: result });
  };

  /**
   * GET /api/v1/onboarding/analytics/feedback-summary
   * Get pilot feedback summary
   */
  getFeedbackSummary = async (req: Request, res: Response): Promise<void> => {
    if (!req.user || req.user.role !== 'admin') {
      throw new AppError('Admin access required', 403, 'FORBIDDEN');
    }

    const result = await this.onboardingService.getFeedbackSummary();
    res.json({ success: true, data: result });
  };

  // ============================================================================
  // Pilot Limits Endpoints
  // ============================================================================

  /**
   * GET /api/v1/onboarding/limits/:businessId
   * Get pilot limits for a business
   */
  getPilotLimits = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { businessId } = req.params;
    if (!businessId) {
      throw new AppError('Business ID required', 400, 'MISSING_BUSINESS_ID');
    }

    const limits = await this.onboardingService.getPilotLimits(businessId);
    res.json({ success: true, data: { limits } });
  };

  /**
   * GET /api/v1/onboarding/limits/:businessId/qr-check
   * Check if user can create more QR codes
   */
  checkQRCodeLimit = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { businessId } = req.params;
    if (!businessId) {
      throw new AppError('Business ID required', 400, 'MISSING_BUSINESS_ID');
    }

    const result = await this.onboardingService.canCreateQRCode(businessId);
    res.json({ success: true, data: result });
  };
}