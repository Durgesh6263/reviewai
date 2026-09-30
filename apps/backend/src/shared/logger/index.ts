/**
 * Structured Logging with Pino
 * Provides JSON logging with request correlation via request IDs
 */

import pino, { Logger, DestinationStream } from 'pino';
import { Request } from 'express';

const isDevelopment = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || 'info';
const logFormat = process.env.LOG_FORMAT || (isDevelopment ? 'pretty' : 'json');

// Create base logger configuration
const loggerConfig: pino.LoggerOptions = {
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'reviewai-backend',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    hostname: process.env.HOSTNAME || 'localhost',
  },
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
    }),
  },
  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.password_hash',
      'req.body.token',
      'req.body.refresh_token',
      'req.body.access_token',
      'req.body.secret',
      'req.body.api_key',
      'req.body.stripe_secret_key',
      'res.headers["set-cookie"]',
      '*.password',
      '*.password_hash',
      '*.token',
      '*.secret',
      '*.api_key',
      '*.key_hash',
    ],
    censor: '[REDACTED]',
  },
};

// Pretty printing for development
if (isDevelopment && logFormat === 'pretty') {
  loggerConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
      singleLine: false,
    },
  };
}

// Create the root logger
export const logger: Logger = pino(loggerConfig);

// ============================================================================
// REQUEST LOGGER FACTORY
// ============================================================================

/**
 * Create a child logger with request context
 * Includes requestId, userId, businessId, IP, and user agent
 */
export function getRequestLogger(req: Request): Logger {
  return logger.child({
    requestId: req.requestId,
    userId: req.user?.sub,
    businessId: req.businessAccess?.business_id,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    method: req.method,
    path: req.route?.path || req.path,
  });
}

/**
 * Create a child logger for background jobs/cron tasks
 */
export function getJobLogger(jobName: string, context: Record<string, any> = {}): Logger {
  return logger.child({
    job: jobName,
    ...context,
  });
}

/**
 * Create a child logger for external service calls
 */
export function getExternalLogger(service: string, context: Record<string, any> = {}): Logger {
  return logger.child({
    externalService: service,
    ...context,
  });
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Log an info message with structured data
 */
export function logInfo(logger: Logger, message: string, meta?: Record<string, any>): void {
  logger.info(meta, message);
}

/**
 * Log a warning message with structured data
 */
export function logWarn(logger: Logger, message: string, meta?: Record<string, any>): void {
  logger.warn(meta, message);
}

/**
 * Log an error message with structured data and error object
 */
export function logError(logger: Logger, message: string, error: Error, meta?: Record<string, any>): void {
  logger.error({ err: error, ...meta }, message);
}

/**
 * Log a debug message with structured data
 */
export function logDebug(logger: Logger, message: string, meta?: Record<string, any>): void {
  logger.debug(meta, message);
}

/**
 * Log an HTTP request completion
 */
export function logRequest(logger: Logger, res: any, durationMs: number): void {
  const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
  logger[level](
    {
      statusCode: res.statusCode,
      durationMs,
      contentLength: res.get('content-length'),
    },
    `${logger.bindings().method} ${logger.bindings().path} ${res.statusCode} ${durationMs}ms`
  );
}

// ============================================================================
// EXPORT TYPES
// ============================================================================

export type { Logger } from 'pino';