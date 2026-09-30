/**
 * Authentication Module
 * ReviewAI SaaS Platform
 * Main export for the authentication module
 */

export * from './types';
export * from './validators';
export { AuthService } from './service';
export { AuthController } from './controller';
export { AuthMiddleware, createAuthMiddleware } from './middleware';
export { createAuthRoutes, AUTH_ROUTES_DOCS } from './routes';