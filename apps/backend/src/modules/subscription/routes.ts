/**
 * Subscription Module Routes
 * ReviewAI SaaS Platform
 * REST API endpoint definitions for subscription management
 */

import { Router } from 'express';
import { SubscriptionController } from './controller';
import { AuthMiddleware, createAuthMiddleware } from '../auth/middleware';
import {
  createSubscriptionSchema,
  updateSubscriptionSchema,
  cancelSubscriptionSchema,
  subscriptionIdParamSchema,
  businessIdParamSchema,
  createCheckoutSessionSchema,
  createBillingPortalSessionSchema,
} from './validators';

export function createSubscriptionRoutes(
  controller: SubscriptionController,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): Router {
  const router = Router();

  // All subscription routes require authentication
  router.use(authMiddleware.authenticate);

  // Status & limits
  router.get('/status', controller.getStatus);
  router.get('/subscription/status', controller.getStatus);
  router.get('/', controller.getSubscriptionOverview);

  // Upgrade requests
  router.get('/upgrade-requests', controller.getUpgradeRequests);
  router.post('/upgrade-request', controller.createUpgradeRequest);

  // Get subscription for a business
  router.get(
    '/businesses/:businessId',
    authMiddleware.validate(businessIdParamSchema),
    controller.getSubscription
  );

  // Create subscription
  router.post(
    '/',
    authMiddleware.validate(createSubscriptionSchema),
    controller.createSubscription
  );

  // Create Stripe checkout session
  router.post(
    '/checkout',
    authMiddleware.validate(createCheckoutSessionSchema),
    controller.createCheckoutSession
  );

  // Create Stripe billing portal session
  router.post(
    '/billing-portal',
    authMiddleware.validate(createBillingPortalSessionSchema),
    controller.createBillingPortalSession
  );

  // Update subscription
  router.patch(
    '/:subscriptionId',
    authMiddleware.validate(updateSubscriptionSchema),
    controller.updateSubscription
  );

  // Cancel subscription
  router.post(
    '/:subscriptionId/cancel',
    authMiddleware.validate(cancelSubscriptionSchema),
    controller.cancelSubscription
  );

  // Get invoices
  router.get(
    '/:subscriptionId/invoices',
    authMiddleware.validate(subscriptionIdParamSchema),
    controller.getInvoices
  );

  return router;
}

// Route documentation for API spec generation
export const SUBSCRIPTION_ROUTES_DOCS = {
  '/subscriptions/businesses/{businessId}': {
    get: {
      summary: 'Get subscription for a business with usage and limits',
      tags: ['Subscription'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'businessId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Subscription retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      business_id: { type: 'string', format: 'uuid' },
                      stripe_customer_id: { type: 'string' },
                      stripe_subscription_id: { type: 'string', nullable: true },
                      stripe_price_id: { type: 'string', nullable: true },
                      status: { type: 'string', enum: ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'] },
                      plan: { type: 'string', enum: ['free', 'starter', 'professional', 'enterprise'] },
                      current_period_start: { type: 'string', format: 'date-time' },
                      current_period_end: { type: 'string', format: 'date-time' },
                      cancel_at_period_end: { type: 'boolean' },
                      canceled_at: { type: 'string', format: 'date-time', nullable: true },
                      trial_start: { type: 'string', format: 'date-time', nullable: true },
                      trial_end: { type: 'string', format: 'date-time', nullable: true },
                      usage: {
                        type: 'object',
                        properties: {
                          review_generations: { type: 'object', properties: { used: { type: 'integer' }, limit: { type: 'integer', nullable: true }, percentage: { type: 'number' } } },
                          google_redirects: { type: 'object', properties: { used: { type: 'integer' }, limit: { type: 'integer', nullable: true }, percentage: { type: 'number' } } },
                          qr_codes: { type: 'object', properties: { used: { type: 'integer' }, limit: { type: 'integer', nullable: true }, percentage: { type: 'number' } } },
                          team_members: { type: 'object', properties: { used: { type: 'integer' }, limit: { type: 'integer', nullable: true }, percentage: { type: 'number' } } },
                        },
                      },
                      limits: { type: 'object' },
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
  '/subscriptions': {
    post: {
      summary: 'Create a new subscription',
      tags: ['Subscription'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['business_id', 'plan'],
              properties: {
                business_id: { type: 'string', format: 'uuid' },
                plan: { type: 'string', enum: ['free', 'starter', 'professional', 'enterprise'] },
                payment_method_id: { type: 'string' },
                trial_days: { type: 'integer', minimum: 0, maximum: 365, default: 14 },
                metadata: { type: 'object' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Subscription created' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        409: { $ref: '#/components/responses/ConflictError' },
      },
    },
  },
  '/subscriptions/checkout': {
    post: {
      summary: 'Create Stripe checkout session',
      tags: ['Subscription'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['business_id', 'plan'],
              properties: {
                business_id: { type: 'string', format: 'uuid' },
                plan: { type: 'string', enum: ['starter', 'professional', 'enterprise'] },
                success_url: { type: 'string', format: 'uri' },
                cancel_url: { type: 'string', format: 'uri' },
                trial_days: { type: 'integer', minimum: 0, maximum: 365 },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Checkout session created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      session_id: { type: 'string' },
                      url: { type: 'string', format: 'uri' },
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
        409: { $ref: '#/components/responses/ConflictError' },
      },
    },
  },
  '/subscriptions/billing-portal': {
    post: {
      summary: 'Create Stripe billing portal session',
      tags: ['Subscription'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['business_id'],
              properties: {
                business_id: { type: 'string', format: 'uuid' },
                return_url: { type: 'string', format: 'uri' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Billing portal session created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { type: 'object', properties: { url: { type: 'string', format: 'uri' } } },
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
  '/subscriptions/{subscriptionId}': {
    patch: {
      summary: 'Update subscription (plan change, cancel at period end)',
      tags: ['Subscription'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'subscriptionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                plan: { type: 'string', enum: ['starter', 'professional', 'enterprise'] },
                cancel_at_period_end: { type: 'boolean' },
                metadata: { type: 'object' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Subscription updated' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/subscriptions/{subscriptionId}/cancel': {
    post: {
      summary: 'Cancel subscription',
      tags: ['Subscription'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'subscriptionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                immediately: { type: 'boolean', default: false },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Subscription canceled' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
  '/subscriptions/{subscriptionId}/invoices': {
    get: {
      summary: 'Get invoices for a subscription',
      tags: ['Subscription'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'subscriptionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Invoices retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        subscription_id: { type: 'string', format: 'uuid' },
                        amount: { type: 'integer' },
                        currency: { type: 'string' },
                        status: { type: 'string', enum: ['draft', 'open', 'paid', 'void', 'uncollectible'] },
                        invoice_url: { type: 'string', format: 'uri' },
                        pdf_url: { type: 'string', format: 'uri' },
                        period_start: { type: 'string', format: 'date-time' },
                        period_end: { type: 'string', format: 'date-time' },
                        created_at: { type: 'string', format: 'date-time' },
                      },
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