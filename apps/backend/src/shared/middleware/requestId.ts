/**
 * Request ID Middleware
 * Generates and propagates request IDs for correlation across logs and services
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Extend Express Request type
declare module 'express' {
  interface Request {
    requestId: string;
    startTime: number;
  }
}

/**
 * Middleware to generate/extract request ID and attach to request/response
 * Adds X-Request-ID header to response for client-side correlation
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Get request ID from header or generate new one
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();

  // Attach to request for use in handlers
  req.requestId = requestId;
  req.startTime = Date.now();

  // Set response header for client correlation
  res.setHeader('X-Request-ID', requestId);

  next();
};

/**
 * Middleware to log request completion with timing
 * Should be added after requestIdMiddleware
 */
export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = req.startTime || Date.now();

  // Log request start
  const logger = req.logger;
  if (logger) {
    logger.debug({
      query: req.query,
      params: req.params,
      // Don't log body in production for privacy
      body: process.env.NODE_ENV === 'development' ? req.body : undefined,
    }, 'Request started');
  }

  // Capture response finish
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;

    if (logger) {
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level](
        {
          statusCode: res.statusCode,
          durationMs,
          contentLength: res.get('content-length'),
        },
        `${req.method} ${req.route?.path || req.path} ${res.statusCode} ${durationMs}ms`
      );
    }
  });

  next();
};

/**
 * Get request ID from request (helper for services)
 */
export function getRequestId(req: Request): string {
  return req.requestId;
}

/**
 * Add request ID to outgoing fetch/axios calls
 */
export function addRequestIdToHeaders(headers: Record<string, string>, requestId: string): Record<string, string> {
  return {
    ...headers,
    'X-Request-ID': requestId,
  };
}