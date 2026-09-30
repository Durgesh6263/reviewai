/**
 * QR Module Routes
 * ReviewAI SaaS Platform
 * REST API endpoint definitions for QR code management and routing
 */

import { Router } from 'express';
import { QRController } from './controller';
import { AuthMiddleware, createAuthMiddleware } from '../auth/middleware';
import {
  createQRCodeSchema,
  updateQRCodeSchema,
  qrCodeIdParamSchema,
  businessIdParamSchema,
  qrSlugParamSchema,
  listQRCodesSchema,
  scanQRCodeSchema,
} from './validators';

export function createQRRoutes(
  controller: QRController,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): Router {
  const router = Router();

  // Public routes (no authentication required) - QR code scanning and landing
  router.get(
    '/r/:slug',
    authMiddleware.validate(qrSlugParamSchema),
    controller.getBusinessByQRSlug
  );

  router.post(
    '/r/:slug/scan',
    authMiddleware.validate(scanQRCodeSchema),
    controller.scanQRCode
  );

  // Protected routes (authentication required)
  router.use('/businesses/:businessId/qr-codes', authMiddleware.authenticate);
  router.use('/qr-codes', authMiddleware.authenticate);

  // Global QR code routes (for /dashboard/qr-codes)
  router.get('/qr-codes/:id/download', authMiddleware.authenticate, controller.downloadQRCodeDirect);

  router.get('/qr-codes/:id', authMiddleware.authenticate, controller.getQRCodeDirect);
  router.patch('/qr-codes/:id', authMiddleware.authenticate, controller.updateQRCodeDirect);
  router.delete('/qr-codes/:id', authMiddleware.authenticate, controller.deleteQRCodeDirect);

  router.get('/qr-codes', authMiddleware.authenticate, controller.listAllQRCodes);
  router.post('/qr-codes', authMiddleware.authenticate, controller.createQRCode);

  // QR code management routes
  router.post(
    '/businesses/:businessId/qr-codes',
    authMiddleware.validate(createQRCodeSchema),
    controller.createQRCode
  );

  router.get(
    '/businesses/:businessId/qr-codes',
    authMiddleware.validate(listQRCodesSchema),
    controller.listQRCodes
  );

  router.get(
    '/businesses/:businessId/qr-codes/:id',
    authMiddleware.validate(qrCodeIdParamSchema),
    controller.getQRCode
  );

  router.get(
    '/businesses/:businessId/qr-codes/:id/stats',
    authMiddleware.validate(qrCodeIdParamSchema),
    controller.getQRCodeStats
  );

  router.patch(
    '/businesses/:businessId/qr-codes/:id',
    authMiddleware.validate(updateQRCodeSchema),
    controller.updateQRCode
  );

  router.delete(
    '/businesses/:businessId/qr-codes/:id',
    authMiddleware.validate(qrCodeIdParamSchema),
    controller.deleteQRCode
  );

  router.get(
    '/businesses/:businessId/qr-codes/:id/download',
    authMiddleware.validate(qrCodeIdParamSchema),
    controller.downloadQRCode
  );

  return router;
}

// Route documentation for API spec generation
export const QR_ROUTES_DOCS = {
  '/r/{slug}': {
    get: {
      summary: 'Get business info by QR slug (public landing page)',
      tags: ['QR', 'Public'],
      security: [],
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-z0-9-]+$' } }],
      responses: {
        200: {
          description: 'Business found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      business: { $ref: '#/components/schemas/PublicBusiness' },
                    },
                  },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
    post: {
      summary: 'Handle QR code scan (start review session)',
      tags: ['QR', 'Public'],
      security: [],
      parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-z0-9-]+$' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                ip_address: { type: 'string', format: 'ipv4' },
                user_agent: { type: 'string' },
                referrer: { type: 'string', nullable: true },
                country: { type: 'string', pattern: '^[A-Z]{2}$' },
                city: { type: 'string' },
                device_type: { type: 'string', enum: ['mobile', 'tablet', 'desktop'] },
                browser: { type: 'string' },
                os: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Scan recorded, session started',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      scan_id: { type: 'string', format: 'uuid' },
                      business: { $ref: '#/components/schemas/PublicBusiness' },
                      session_id: { type: 'string', format: 'uuid' },
                    },
                  },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/businesses/{businessId}/qr-codes': {
    post: {
      summary: 'Create a new QR code for a business',
      tags: ['QR'],
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'businessId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                label: { type: 'string', maxLength: 255, example: 'Front Desk' },
                design: {
                  type: 'object',
                  properties: {
                    color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', example: '#2563EB' },
                    logo: { type: 'boolean', example: true },
                    frame: { type: 'string', enum: ['rounded', 'square', 'circle', 'none'], example: 'rounded' },
                    size: { type: 'integer', minimum: 128, maximum: 2048, example: 512 },
                    error_correction: { type: 'string', enum: ['L', 'M', 'Q', 'H'], example: 'M' },
                    background_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', example: '#FFFFFF' },
                    logo_size: { type: 'number', minimum: 0.1, maximum: 0.5, example: 0.3 },
                    margin: { type: 'integer', minimum: 0, maximum: 20, example: 4 },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'QR code created' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        409: { $ref: '#/components/responses/ConflictError' },
      },
    },
    get: {
      summary: 'List QR codes for a business',
      tags: ['QR'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'businessId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'is_active', in: 'query', schema: { type: 'boolean' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'sort', in: 'query', schema: { type: 'string' } },
        { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
      ],
      responses: {
        200: { description: 'QR codes retrieved' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
  '/businesses/{businessId}/qr-codes/{id}': {
    get: {
      summary: 'Get QR code by ID',
      tags: ['QR'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'businessId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: { description: 'QR code retrieved' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
    patch: {
      summary: 'Update QR code',
      tags: ['QR'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'businessId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                label: { type: 'string', maxLength: 255, nullable: true },
                design: { $ref: '#/components/schemas/QRDesign' },
                is_active: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'QR code updated' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
    delete: {
      summary: 'Delete QR code (deactivate)',
      tags: ['QR'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'businessId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: { description: 'QR code deactivated' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/businesses/{businessId}/qr-codes/{id}/stats': {
    get: {
      summary: 'Get QR code with statistics',
      tags: ['QR'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'businessId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: { description: 'QR code with stats' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/businesses/{businessId}/qr-codes/{id}/download': {
    get: {
      summary: 'Download QR code image',
      tags: ['QR'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'businessId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'format', in: 'query', schema: { type: 'string', enum: ['png', 'svg'], default: 'png' } },
      ],
      responses: {
        200: { description: 'Download URL generated' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
};