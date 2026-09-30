/**
 * Sentry Configuration
 * Error tracking and performance monitoring (Sentry v8 API)
 */

import * as Sentry from '@sentry/node';
import { httpIntegration, expressIntegration, requestDataIntegration } from '@sentry/node';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || 'development';

  if (!dsn) {
    console.warn('SENTRY_DSN not configured, skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    profilesSampleRate: environment === 'production' ? 0.1 : 1.0,

    // Release tracking
    release: process.env.APP_VERSION || 'unknown',

    // Enable debug mode in development
    debug: environment === 'development',

    // Ignore certain errors
    ignoreErrors: [
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ENETUNREACH',
      'Request timeout',
      'Network Error',
    ],

    // Before send hook to filter/modify events
    beforeSend(event, _hint) {
      // Don't send 404 errors
      if (event.exception?.values?.[0]?.value?.includes('NOT_FOUND')) {
        return null;
      }

      // Don't send validation errors from user input
      if (event.exception?.values?.[0]?.value?.includes('VALIDATION_ERROR')) {
        return null;
      }

      // Remove sensitive data from request
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }

      return event;
    },

    // Before send transaction for performance monitoring
    beforeSendTransaction(event) {
      // Sample transactions based on route
      const transactionName = event.transaction;
      if (transactionName?.includes('/health')) {
        return null; // Drop health check transactions
      }
      return event;
    },

    // Integrations for Sentry v8
    integrations: [
      httpIntegration(),
      expressIntegration(),
      requestDataIntegration(),
    ],
  });

  console.log(`Sentry initialized for environment: ${environment}`);
}

export { Sentry };