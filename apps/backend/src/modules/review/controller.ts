/**
 * Review Module Controller
 * ReviewAI SaaS Platform
 * HTTP handlers for review generation flow
 */

import { Request, Response, NextFunction } from 'express';
import { ReviewService } from './service';
import { AuthenticatedRequest } from '../auth/middleware';
import {
  generateReviewSchema,
  updateReviewSchema,
  regenerateReviewSchema,
  completeReviewSchema,
  sessionIdParamSchema,
  selectLanguageSchema,
  selectRatingSchema,
} from './validators';
import { successResponse, createdResponse } from '../../shared/utils/apiResponse';

export class ReviewController {
  constructor(private reviewService: ReviewService) {}

  /**
   * POST /review/sessions/start or /review/sessions
   * Start a new review session linked to QR scan log
   */
  startSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { qr_code_id, business_id, scan_log_id, language, rating, metadata } = req.body;
      const session = await this.reviewService.createSession({
        qr_code_id,
        business_id,
        scan_log_id,
        language,
        rating,
        metadata,
      });
      res.status(201).json(createdResponse({ session, session_id: session.id }, 'Review session started'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /review/sessions/:sessionId
   * Get review session with current state
   */
  getSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = (req.params?.sessionId || req.body?.session_id || 'guest-session') as string;
      const result = await this.reviewService.getSessionWithReview(sessionId);
      res.json(successResponse(result, 'Review session retrieved'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /review/sessions/:sessionId/step
   * Get current flow step for frontend
   */
  getFlowStep = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = (req.params?.sessionId || req.body?.session_id || 'guest-session') as string;
      const result = await this.reviewService.getFlowStep(sessionId);
      res.json(successResponse(result, 'Flow step retrieved'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /review/sessions/language or /sessions/:sessionId/language
   * Select language (Step 1)
   */
  selectLanguage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = (req.body?.session_id || req.params?.sessionId || 'guest-session') as string;
      const language = (req.body?.language || 'en') as string;
      const session = await this.reviewService.selectLanguage(sessionId, language);
      res.json(successResponse({ session }, 'Language selected'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /review/sessions/rating or /sessions/:sessionId/rating
   * Select rating (Step 2)
   */
  selectRating = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = (req.body?.session_id || req.params?.sessionId || 'guest-session') as string;
      const rating = Number(req.body?.rating || 5);
      const session = await this.reviewService.selectRating(sessionId, rating);
      res.json(successResponse({ session }, 'Rating selected'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /review/sessions/tags or /sessions/:sessionId/tags
   * Select experience tags (Step 2.5)
   */
  selectTags = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = (req.body?.session_id || req.params?.sessionId || 'guest-session') as string;
      const tags = (req.body?.tags || []) as string[];
      const session = await this.reviewService.selectTags(sessionId, tags);
      res.json(successResponse({ session }, 'Tags selected'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /review/sessions/generate or /sessions/:sessionId/generate
   * Generate AI review (Step 3)
   */
  generateReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = (req.body?.session_id || req.params?.sessionId || 'guest-session') as string;
      const rating = Number(req.body?.rating || 5);
      const language = (req.body?.language || 'en') as string;
      const tags = Array.isArray(req.body?.tags) ? req.body.tags : undefined;
      const customer_text = typeof req.body?.customer_text === 'string' ? req.body.customer_text : undefined;
      const variation = typeof req.body?.variation === 'number' ? req.body.variation : undefined;
      const review = await this.reviewService.generateReview({
        session_id: sessionId,
        rating,
        language,
        tags,
        customer_text,
        variation,
      });
      res.json(createdResponse({ review }, 'Review generated successfully'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /review/sessions/copy or /sessions/:sessionId/copy
   * Track customer copying review to clipboard
   */
  recordCopy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let body = req.body;
      if (typeof body === 'string' && body.trim().startsWith('{')) {
        try { body = JSON.parse(body); } catch {}
      }
      const sessionId = (body?.session_id || req.params?.sessionId || req.params?.id || 'guest-session') as string;
      const result = await this.reviewService.recordCopy(sessionId);
      res.json(successResponse(result, 'Review copy recorded'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /review/sessions/feedback/start or /sessions/:sessionId/feedback/start
   * Track customer viewing/starting private feedback flow
   */
  recordFeedbackStart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let body = req.body;
      if (typeof body === 'string' && body.trim().startsWith('{')) {
        try { body = JSON.parse(body); } catch {}
      }
      const sessionId = (body?.session_id || req.params?.sessionId || 'guest-session') as string;
      const result = await this.reviewService.recordFeedbackStart(sessionId);
      res.json(successResponse(result, 'Private feedback start recorded'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /review/sessions/feedback/skip or /sessions/:sessionId/feedback/skip
   * Track customer skipping private feedback to go to Google
   */
  recordFeedbackSkip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let body = req.body;
      if (typeof body === 'string' && body.trim().startsWith('{')) {
        try { body = JSON.parse(body); } catch {}
      }
      const sessionId = (body?.session_id || req.params?.sessionId || 'guest-session') as string;
      const result = await this.reviewService.recordFeedbackSkip(sessionId);
      res.json(successResponse(result, 'Private feedback skipped'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /review/sessions/edit or /sessions/:sessionId/edit
   * Edit review (Step 4)
   */
  updateReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let body = req.body;
      if (typeof body === 'string' && body.trim().startsWith('{')) {
        try { body = JSON.parse(body); } catch {}
      }
      const sessionId = (body?.session_id || req.params?.sessionId || 'guest-session') as string;
      const edited_text = (body?.edited_text || '') as string;
      const review = await this.reviewService.updateReview(sessionId, { edited_text });
      res.json(successResponse({ review }, 'Review updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /review/sessions/regenerate or /sessions/:sessionId/regenerate
   * Regenerate review
   */
  regenerateReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let body = req.body;
      if (typeof body === 'string' && body.trim().startsWith('{')) {
        try { body = JSON.parse(body); } catch {}
      }
      const sessionId = (body?.session_id || req.params?.sessionId || 'guest-session') as string;
      const review = await this.reviewService.regenerateReview(sessionId);
      res.json(successResponse({ review }, 'Review regenerated successfully'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /review/sessions/complete or /sessions/:sessionId/complete
   * Complete review and get Google redirect URL (Step 5)
   */
  completeReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let body = req.body;
      if (typeof body === 'string' && body.trim().startsWith('{')) {
        try { body = JSON.parse(body); } catch {}
      }
      const sessionId = (body?.session_id || req.params?.sessionId || req.params?.id || 'guest-session') as string;
      const result = await this.reviewService.completeReview(sessionId);
      res.json(successResponse(result, 'Review completed, redirecting to Google'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /review/sessions/feedback or /review/sessions/:sessionId/feedback
   * Submit private feedback for 1-3 star ratings
   */
  submitFeedback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let body = req.body;
      if (typeof body === 'string' && body.trim().startsWith('{')) {
        try { body = JSON.parse(body); } catch {}
      }
      const sessionId = (req.params?.sessionId || body?.session_id || 'guest-session') as string;
      const feedbackText = (body?.feedback_text || body?.message || '') as string;
      const rating = Number(body?.rating) || 3;
      const result = await this.reviewService.submitPrivateFeedback(sessionId, feedbackText, rating);
      res.json(successResponse(result, 'Private feedback submitted successfully'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /review/sessions/abandon or /sessions/:sessionId/abandon
   * Abandon review session
   */
  abandonSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let body = req.body;
      if (typeof body === 'string' && body.trim().startsWith('{')) {
        try { body = JSON.parse(body); } catch {}
      }
      const sessionId = (body?.session_id || req.params?.sessionId || 'guest-session') as string;
      await this.reviewService.abandonSession(sessionId);
      res.json(successResponse(null, 'Session abandoned'));
    } catch (error) {
      next(error);
    }
  };
}