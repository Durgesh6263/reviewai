/**
 * Authentication Module Routes
 * ReviewAI SaaS Platform
 * REST API endpoint definitions for authentication
 */

import { Router } from 'express';
import { AuthController } from './controller';
import { AuthMiddleware, createAuthMiddleware } from './middleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  changePasswordSchema,
  updateProfileSchema,
} from './validators';

export function createAuthRoutes(
  controller: AuthController,
  middleware: ReturnType<typeof createAuthMiddleware>
): Router {
  const router = Router();

  // Public routes (no authentication required)
  router.post(
    '/register',
    middleware.authRateLimit(3, 15 * 60 * 1000), // 3 attempts per 15 minutes
    middleware.validate(registerSchema),
    controller.register
  );

  router.post(
    '/login',
    middleware.authRateLimit(5, 15 * 60 * 1000), // 5 attempts per 15 minutes
    middleware.validate(loginSchema),
    controller.login
  );

  router.post(
    '/refresh',
    middleware.validate(refreshTokenSchema),
    controller.refresh
  );

  router.post(
    '/forgot-password',
    middleware.authRateLimit(3, 60 * 60 * 1000), // 3 attempts per hour
    middleware.validate(forgotPasswordSchema),
    controller.forgotPassword
  );

  router.post(
    '/reset-password',
    middleware.validate(resetPasswordSchema),
    controller.resetPassword
  );

  router.post(
    '/verify-email',
    middleware.validate(verifyEmailSchema),
    controller.verifyEmail
  );

  // Protected routes (authentication required)
  router.post(
    '/logout',
    middleware.authenticate,
    controller.logout
  );

  router.post(
    '/change-password',
    middleware.authenticate,
    middleware.validate(changePasswordSchema),
    controller.changePassword
  );

  router.get(
    '/me',
    middleware.authenticate,
    controller.me
  );

  router.patch(
    '/me',
    middleware.authenticate,
    middleware.validate(updateProfileSchema),
    controller.updateProfile
  );

  return router;
}

// Route documentation for API spec generation
export const AUTH_ROUTES_DOCS = {
  '/auth/register': {
    post: {
      summary: 'Register a new business owner',
      tags: ['Authentication'],
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password', 'full_name'],
              properties: {
                email: { type: 'string', format: 'email', example: 'owner@example.com' },
                password: { type: 'string', format: 'password', example: 'SecurePass123!' },
                full_name: { type: 'string', example: 'John Doe' },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Registration successful',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' },
                      tokens: { $ref: '#/components/schemas/AuthTokens' },
                    },
                  },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/responses/ValidationError' },
        409: { $ref: '#/components/responses/ConflictError' },
        429: { $ref: '#/components/responses/RateLimited' },
      },
    },
  },
  '/auth/login': {
    post: {
      summary: 'Login with email and password',
      tags: ['Authentication'],
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email', example: 'owner@example.com' },
                password: { type: 'string', format: 'password', example: 'SecurePass123!' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Login successful',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' },
                      tokens: { $ref: '#/components/schemas/AuthTokens' },
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
        429: { $ref: '#/components/responses/RateLimited' },
      },
    },
  },
  '/auth/refresh': {
    post: {
      summary: 'Refresh access token',
      tags: ['Authentication'],
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['refresh_token'],
              properties: {
                refresh_token: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Token refreshed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/AuthTokens' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
  '/auth/logout': {
    post: {
      summary: 'Logout and revoke refresh token',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                refresh_token: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: { $ref: '#/components/responses/Success' },
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
  '/auth/forgot-password': {
    post: {
      summary: 'Request password reset email',
      tags: ['Authentication'],
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', format: 'email', example: 'owner@example.com' },
              },
            },
          },
        },
      },
      responses: {
        200: { $ref: '#/components/responses/Success' },
        400: { $ref: '#/components/responses/ValidationError' },
        429: { $ref: '#/components/responses/RateLimited' },
      },
    },
  },
  '/auth/reset-password': {
    post: {
      summary: 'Reset password with token',
      tags: ['Authentication'],
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'password'],
              properties: {
                token: { type: 'string' },
                password: { type: 'string', format: 'password', example: 'NewSecurePass123!' },
              },
            },
          },
        },
      },
      responses: {
        200: { $ref: '#/components/responses/Success' },
        400: { $ref: '#/components/responses/ValidationError' },
      },
    },
  },
  '/auth/verify-email': {
    post: {
      summary: 'Verify email address',
      tags: ['Authentication'],
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token'],
              properties: {
                token: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: { $ref: '#/components/responses/Success' },
        400: { $ref: '#/components/responses/ValidationError' },
      },
    },
  },
  '/auth/change-password': {
    post: {
      summary: 'Change password (authenticated)',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['current_password', 'new_password'],
              properties: {
                current_password: { type: 'string', format: 'password' },
                new_password: { type: 'string', format: 'password', example: 'NewSecurePass123!' },
              },
            },
          },
        },
      },
      responses: {
        200: { $ref: '#/components/responses/Success' },
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
  '/auth/me': {
    get: {
      summary: 'Get current user profile',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Profile retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' },
                    },
                  },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
    patch: {
      summary: 'Update current user profile',
      tags: ['Authentication'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                full_name: { type: 'string', example: 'John Smith' },
                avatar_url: { type: 'string', format: 'uri', nullable: true },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Profile updated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' },
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
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
};