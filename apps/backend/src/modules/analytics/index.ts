/**
 * Analytics Module
 * ReviewAI SaaS Platform
 * Main export for the analytics module
 */

export * from './types';
export * from './validators';
export { AnalyticsService } from './service';
export { AnalyticsController } from './controller';
export { createAnalyticsRoutes, ANALYTICS_ROUTES_DOCS } from './routes';