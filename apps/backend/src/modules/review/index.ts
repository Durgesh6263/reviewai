/**
 * Review Module
 * ReviewAI SaaS Platform
 * Main export for the review module
 */

export * from './types';
export * from './validators';
export { ReviewService } from './service';
export { ReviewController } from './controller';
export { createReviewRoutes, REVIEW_ROUTES_DOCS } from './routes';
export { AIProviderFactory } from './ai/factory';