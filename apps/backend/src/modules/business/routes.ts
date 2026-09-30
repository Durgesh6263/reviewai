/**
 * Business Module Routes
 * ReviewAI SaaS Platform
 * REST API endpoint definitions for business management
 */

import { Router } from 'express';
import { BusinessController } from './controller';
import { AuthMiddleware, createAuthMiddleware } from '../auth/middleware';
import {
  createBusinessSchema,
  updateBusinessSchema,
  businessIdParamSchema,
  businessSlugParamSchema,
  listBusinessesSchema,
  updateGoogleUrlSchema,
  updateBusinessStatusSchema,
} from './validators';

export function createBusinessRoutes(
  controller: BusinessController,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): Router {
  const router = Router();

  // Public category list endpoint
  router.get('/businesses/categories', controller.getCategories);

  // Protected routes (authentication required)
  router.use('/businesses', authMiddleware.authenticate);
  router.use('/admin/businesses', authMiddleware.authenticate);

  // Business owner routes
  router.post(
    '/businesses',
    authMiddleware.validate(createBusinessSchema),
    controller.createBusiness
  );

  router.get(
    '/businesses',
    authMiddleware.validate(listBusinessesSchema),
    controller.listBusinesses
  );

  router.get(
    '/businesses/:id',
    authMiddleware.validate(businessIdParamSchema),
    controller.getBusiness
  );

  router.get(
    '/businesses/:id/stats',
    authMiddleware.validate(businessIdParamSchema),
    controller.getBusinessStats
  );

  router.patch(
    '/businesses/:id',
    authMiddleware.validate(updateBusinessSchema),
    controller.updateBusiness
  );

  router.put(
    '/businesses/:id/google-review-url',
    authMiddleware.validate(updateGoogleUrlSchema),
    controller.updateGoogleReviewUrl
  );

  router.delete(
    '/businesses/:id',
    authMiddleware.validate(businessIdParamSchema),
    controller.deleteBusiness
  );

  // Admin routes
  router.patch(
    '/admin/businesses/:id/status',
    authMiddleware.requireRole('admin'),
    authMiddleware.validate(updateBusinessStatusSchema),
    controller.updateBusinessStatus
  );

  return router;
}

// Route documentation for API spec generation
export const BUSINESS_ROUTES_DOCS = {
  '/businesses': {
    post: {
      summary: 'Create a new business',
      tags: ['Business'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'google_review_url'],
              properties: {
                name: { type: 'string', example: 'The Fitness World' },
                google_review_url: { type: 'string', format: 'uri', example: 'https://g.page/r/Cabc123/review' },
                description: { type: 'string', example: 'Best gym in town!' },
                website_url: { type: 'string', format: 'uri', nullable: true },
                phone: { type: 'string', nullable: true },
                address: {
                  type: 'object',
                  properties: {
                    street: { type: 'string' },
                    city: { type: 'string' },
                    state: { type: 'string' },
                    country: { type: 'string', pattern: '^[A-Z]{2}$' },
                    postal_code: { type: 'string' },
                  },
                },
                timezone: { type: 'string', example: 'America/New_York' },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Business created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      business: { $ref: '#/components/schemas/Business' },
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
        409: { $ref: '#/components/responses/ConflictError' },
      },
    },
    get: {
      summary: 'List businesses for authenticated user',
      tags: ['Business'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'suspended', 'pending_verification'] } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'sort', in: 'query', schema: { type: 'string' } },
        { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
      ],
      responses: {
        200: {
          description: 'Businesses retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      businesses: { type: 'array', items: { $ref: '#/components/schemas/Business' } },
                      meta: { $ref: '#/components/schemas/PaginationMeta' },
                    },
                  },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
  '/businesses/{id}': {
    get: {
      summary: 'Get business by ID',
      tags: ['Business'],
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        200: { description: 'Business retrieved' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
    patch: {
      summary: 'Update business',
      tags: ['Business'],
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string', nullable: true },
                logo_url: { type: 'string', format: 'uri', nullable: true },
                google_review_url: { type: 'string', format: 'uri' },
                website_url: { type: 'string', format: 'uri', nullable: true },
                phone: { type: 'string', nullable: true },
                address: { $ref: '#/components/schemas/BusinessAddress' },
                timezone: { type: 'string' },
                settings: { $ref: '#/components/schemas/BusinessSettings' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Business updated' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
    delete: {
      summary: 'Delete business (soft delete)',
      tags: ['Business'],
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        200: { description: 'Business deleted' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/businesses/{id}/stats': {
    get: {
      summary: 'Get business with statistics',
      tags: ['Business'],
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        200: { description: 'Business with stats' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/businesses/{id}/google-review-url': {
    put: {
      summary: 'Update Google Review URL',
      tags: ['Business'],
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['google_review_url'],
              properties: {
                google_review_url: { type: 'string', format: 'uri', example: 'https://g.page/r/Cabc123/review' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Google Review URL updated' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/r/{slug}': {
    get: {
      summary: 'Get business by slug (public QR routing)',
      tags: ['Business', 'Public'],
      security: [],
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-z0-9-]+$' } }],
      responses: {
        200: { description: 'Business found' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/admin/businesses/{id}/status': {
    patch: {
      summary: 'Update business status (admin only)',
      tags: ['Admin', 'Business'],
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['active', 'suspended', 'pending_verification'] },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Business status updated' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
};