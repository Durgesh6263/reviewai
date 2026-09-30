/**
 * Review Module Routes
 * ReviewAI SaaS Platform
 * REST API endpoint definitions for review generation flow
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ReviewController } from './controller';
import { AuthMiddleware, createAuthMiddleware } from '../auth/middleware';
import {
  generateReviewSchema,
  updateReviewSchema,
  regenerateReviewSchema,
  completeReviewSchema,
  sessionIdParamSchema,
  selectLanguageSchema,
  selectRatingSchema,
} from './validators';

export function createReviewRoutes(
  controller: ReviewController,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): Router {
  const router = Router();

  // Rate limiter for AI review generation (protect API quotas from abuse while allowing normal flow)
  const aiGenerationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: {
      success: false,
      error: 'Too many review generation requests. Please try again in a few minutes.',
      code: 'RATE_LIMITED',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Rate limiter for feedback submissions
  const feedbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
      success: false,
      error: 'Too many feedback submissions. Please try again later.',
      code: 'RATE_LIMITED',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Public customer review session flow routes (no auth required for customer QR scanning)
  router.post('/sessions/start', controller.startSession);
  router.post('/sessions', controller.startSession);
  router.get('/sessions/:sessionId', controller.getSession);
  router.get('/sessions/:sessionId/step', controller.getFlowStep);

  // Step 1: Language selection (supports /sessions/language and /sessions/:sessionId/language)
  router.post('/sessions/language', controller.selectLanguage);
  router.post('/sessions/:sessionId/language', controller.selectLanguage);

  // Step 2: Rating selection (supports /sessions/rating and /sessions/:sessionId/rating)
  router.post('/sessions/rating', controller.selectRating);
  router.post('/sessions/:sessionId/rating', controller.selectRating);

  // Step 2.5: Tags selection (supports /sessions/tags and /sessions/:sessionId/tags)
  router.post('/sessions/tags', controller.selectTags);
  router.post('/sessions/:sessionId/tags', controller.selectTags);

  // Copy tracking (supports /sessions/copy, /sessions/copied, and :sessionId param variants)
  router.post('/sessions/copy', controller.recordCopy);
  router.post('/sessions/:sessionId/copy', controller.recordCopy);
  router.post('/sessions/copied', controller.recordCopy);
  router.post('/sessions/:sessionId/copied', controller.recordCopy);

  // Step 3: AI review generation (supports /sessions/generate and /sessions/:sessionId/generate)
  router.post('/sessions/generate', aiGenerationLimiter, controller.generateReview);
  router.post('/sessions/:sessionId/generate', aiGenerationLimiter, controller.generateReview);

  // Step 4: Edit review (supports /sessions/edit and /sessions/:sessionId/edit)
  router.patch('/sessions/edit', controller.updateReview);
  router.patch('/sessions/:sessionId/edit', controller.updateReview);

  // Regenerate review (supports /sessions/regenerate and /sessions/:sessionId/regenerate)
  router.post('/sessions/regenerate', aiGenerationLimiter, controller.regenerateReview);
  router.post('/sessions/:sessionId/regenerate', aiGenerationLimiter, controller.regenerateReview);

  // Step 5: Complete and redirect to Google (supports /sessions/complete and /sessions/:sessionId/complete)
  router.post('/sessions/complete', controller.completeReview);
  router.post('/sessions/:sessionId/complete', controller.completeReview);

  // Private feedback for 1-3 star ratings
  router.post('/sessions/feedback', feedbackLimiter, controller.submitFeedback);
  router.post('/sessions/:sessionId/feedback', feedbackLimiter, controller.submitFeedback);
  router.post('/sessions/feedback/start', controller.recordFeedbackStart);
  router.post('/sessions/:sessionId/feedback/start', controller.recordFeedbackStart);
  router.post('/sessions/feedback/skip', controller.recordFeedbackSkip);
  router.post('/sessions/:sessionId/feedback/skip', controller.recordFeedbackSkip);

  // Abandon session (supports /sessions/abandon and /sessions/:sessionId/abandon)
  router.post('/sessions/abandon', controller.abandonSession);
  router.post('/sessions/:sessionId/abandon', controller.abandonSession);

  return router;
}

// Route documentation for API spec generation
export const REVIEW_ROUTES_DOCS = {
  '/review/sessions/{sessionId}': {
    get: {
      summary: 'Get review session with current state',
      tags: ['Review'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: { description: 'Review session retrieved' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/review/sessions/{sessionId}/step': {
    get: {
      summary: 'Get current flow step for frontend rendering',
      tags: ['Review'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: { description: 'Flow step retrieved' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/review/sessions/{sessionId}/language': {
    post: {
      summary: 'Select language for review (Step 1)',
      tags: ['Review'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['language'],
              properties: {
                language: { type: 'string', pattern: '^[a-z]{2}$', example: 'en' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Language selected' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/ConflictError' },
      },
    },
  },
  '/review/sessions/{sessionId}/rating': {
    post: {
      summary: 'Select rating for review (Step 2)',
      tags: ['Review'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['rating'],
              properties: {
                rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Rating selected' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/ConflictError' },
      },
    },
  },
  '/review/sessions/{sessionId}/generate': {
    post: {
      summary: 'Generate AI review (Step 3)',
      tags: ['Review'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['rating'],
              properties: {
                rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
                language: { type: 'string', pattern: '^[a-z]{2}$', example: 'en' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Review generated' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/ConflictError' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/review/sessions/{sessionId}/edit': {
    patch: {
      summary: 'Edit generated review (Step 4)',
      tags: ['Review'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['edited_text'],
              properties: {
                edited_text: { type: 'string', minLength: 10, maxLength: 4000, example: 'Great service and amazing food!' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Review updated' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/ConflictError' },
      },
    },
  },
  '/review/sessions/{sessionId}/regenerate': {
    post: {
      summary: 'Regenerate AI review (max 5 times)',
      tags: ['Review'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: { description: 'Review regenerated' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/ConflictError' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/review/sessions/{sessionId}/complete': {
    post: {
      summary: 'Complete review and get Google redirect URL (Step 5)',
      tags: ['Review'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Redirect URL returned',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      redirect_url: { type: 'string', format: 'uri', example: 'https://g.page/business/review' },
                    },
                  },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/ConflictError' },
      },
    },
  },
  '/review/sessions/{sessionId}/abandon': {
    post: {
      summary: 'Abandon review session',
      tags: ['Review'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: { description: 'Session abandoned' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/ConflictError' },
      },
    },
  },
};