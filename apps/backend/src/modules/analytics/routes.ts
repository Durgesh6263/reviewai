/**
 * Analytics Module Routes
 * ReviewAI SaaS Platform
 * REST API endpoint definitions for analytics
 */

import { Router } from 'express';
import { AnalyticsController } from './controller';
import { AuthMiddleware, createAuthMiddleware } from '../auth/middleware';
import {
  analyticsFiltersSchema,
  qrAnalyticsFiltersSchema,
  businessIdParamSchema,
  qrCodeIdParamSchema,
} from './validators';

export function createAnalyticsRoutes(
  controller: AnalyticsController,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): Router {
  const router = Router();

  // All analytics routes require authentication
  router.use(authMiddleware.authenticate);

  // Dashboard Overview metrics
  router.get('/overview', controller.getOverview);

  // Sessions chart data
  router.get('/sessions-chart', controller.getSessionsChart);

  // Recent feedback
  router.get('/recent-feedback', controller.getRecentFeedback);

  // Recent activity
  router.get('/recent-activity', controller.getRecentActivity);

  // Full analytics page data
  router.get('/', controller.getAnalytics);
  router.get('/analytics', controller.getAnalytics);

  // Business analytics overview
  router.get(
    '/businesses/:businessId',
    authMiddleware.validate(businessIdParamSchema),
    authMiddleware.validate(analyticsFiltersSchema),
    controller.getBusinessAnalytics
  );

  // QR code specific analytics
  router.get(
    '/qr-codes/:qrCodeId',
    authMiddleware.validate(qrCodeIdParamSchema),
    authMiddleware.validate(qrAnalyticsFiltersSchema),
    controller.getQRCodeAnalytics
  );

  // Realtime metrics
  router.get(
    '/businesses/:businessId/realtime',
    authMiddleware.validate(businessIdParamSchema),
    controller.getRealtimeMetrics
  );

  return router;
}

// Route documentation for API spec generation
export const ANALYTICS_ROUTES_DOCS = {
  '/analytics/businesses/{businessId}': {
    get: {
      summary: 'Get business analytics overview',
      tags: ['Analytics'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'businessId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'start_date', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
        { name: 'end_date', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
        { name: 'group_by', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' } },
        { name: 'qr_code_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Business analytics retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      business_id: { type: 'string', format: 'uuid' },
                      period_start: { type: 'string', format: 'date-time' },
                      period_end: { type: 'string', format: 'date-time' },
                      total_scans: { type: 'integer', example: 1250 },
                      total_sessions_started: { type: 'integer', example: 890 },
                      total_reviews_generated: { type: 'integer', example: 720 },
                      total_reviews_edited: { type: 'integer', example: 180 },
                      total_google_redirects: { type: 'integer', example: 580 },
                      conversion_rate: { type: 'number', format: 'float', example: 46.4 },
                      abandonment_rate: { type: 'number', format: 'float', example: 34.8 },
                      avg_session_duration_seconds: { type: 'integer', example: 145 },
                      rating_distribution: {
                        type: 'object',
                        properties: {
                          '1': { type: 'integer' },
                          '2': { type: 'integer' },
                          '3': { type: 'integer' },
                          '4': { type: 'integer' },
                          '5': { type: 'integer' },
                        },
                      },
                      language_distribution: { type: 'object', additionalProperties: { type: 'integer' } },
                      device_distribution: {
                        type: 'object',
                        properties: {
                          mobile: { type: 'integer' },
                          tablet: { type: 'integer' },
                          desktop: { type: 'integer' },
                        },
                      },
                      daily_trends: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            date: { type: 'string', format: 'date' },
                            scans: { type: 'integer' },
                            sessions_started: { type: 'integer' },
                            reviews_generated: { type: 'integer' },
                            google_redirects: { type: 'integer' },
                          },
                        },
                      },
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
      },
    },
  },
  '/analytics/qr-codes/{qrCodeId}': {
    get: {
      summary: 'Get QR code specific analytics',
      tags: ['Analytics'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'qrCodeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'start_date', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
        { name: 'end_date', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
        { name: 'group_by', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' } },
      ],
      responses: {
        200: { description: 'QR code analytics retrieved' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/analytics/businesses/{businessId}/realtime': {
    get: {
      summary: 'Get realtime metrics for a business',
      tags: ['Analytics'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'businessId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Realtime metrics retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      active_sessions: { type: 'integer', example: 12 },
                      scans_last_hour: { type: 'integer', example: 45 },
                      reviews_generated_last_hour: { type: 'integer', example: 28 },
                      redirects_last_hour: { type: 'integer', example: 22 },
                    },
                  },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
};