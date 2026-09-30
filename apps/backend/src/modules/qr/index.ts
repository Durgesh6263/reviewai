/**
 * QR Module
 * ReviewAI SaaS Platform
 * Main export for the QR module
 */

export * from './types';
export * from './validators';
export { QRService } from './service';
export { QRController } from './controller';
export { createQRRoutes, QR_ROUTES_DOCS } from './routes';