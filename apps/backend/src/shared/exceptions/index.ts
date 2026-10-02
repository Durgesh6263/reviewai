/**
 * Custom Exception Classes
 * ReviewAI SaaS Platform
 * Standardized error handling across the application
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, any>;
  public isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, details?: Record<string, any>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(message: string = 'Too many requests', retryAfter: number = 60) {
    super(message, 429, 'RATE_LIMITED');
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', details?: Record<string, any>) {
    super(message, 500, 'INTERNAL_ERROR', details);
    this.isOperational = false;
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

// Error codes enum for consistent error handling
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  BAD_REQUEST: 'BAD_REQUEST',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

import { operationalIncidents } from '../../modules/admin/incident_service';
import { OperationalErrorCategory, OperationalIncidentSeverity } from '../../modules/admin/types';

// Global error handler middleware
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Fail-safe operational incident recording (Step 29)
  try {
    const route = `${req.method || 'GET'} ${req.baseUrl || ''}${req.path || ''}`;
    let category: OperationalErrorCategory = 'UNKNOWN';
    let severity: OperationalIncidentSeverity = 'error';
    const statusCode = err instanceof AppError ? err.statusCode : 500;

    if (statusCode === 401) {
      category = 'AUTH';
      severity = 'warning';
    } else if (statusCode === 403) {
      category = 'AUTHORIZATION';
      severity = 'warning';
    } else if (
      err.message?.toLowerCase().includes('database') ||
      err.message?.toLowerCase().includes('postgres') ||
      (err as any).code?.startsWith?.('PGRST')
    ) {
      category = 'DATABASE';
      severity = 'critical';
    } else if (
      route.includes('/review/sessions/generate') ||
      err.message?.toLowerCase().includes('ai') ||
      err.message?.toLowerCase().includes('llm') ||
      err.message?.toLowerCase().includes('gemini') ||
      err.message?.toLowerCase().includes('openai')
    ) {
      category = 'AI';
      severity = statusCode >= 500 ? 'critical' : 'error';
    } else if (route.includes('/r/') || route.includes('/qr')) {
      category = 'QR';
      severity = statusCode >= 500 ? 'critical' : 'error';
    } else if (route.includes('/review/') || route.includes('/sessions/')) {
      category = 'CUSTOMER_FLOW';
      severity = statusCode >= 500 ? 'critical' : 'error';
    } else if (route.includes('/subscriptions') || route.includes('/billing')) {
      category = 'SUBSCRIPTION';
      severity = statusCode >= 500 ? 'critical' : 'error';
    } else if (statusCode >= 500) {
      severity = 'critical';
    }

    const businessId =
      (req as any).businessId ||
      req.params?.businessId ||
      req.params?.id ||
      (req.body && typeof req.body.business_id === 'string' ? req.body.business_id : null);

    operationalIncidents.record({
      category,
      route,
      severity,
      business_id: businessId,
      message: err.message,
    });
  } catch (logErr) {
    // Fail-safe: logging error must never break error response
    console.error('Failed to record operational incident in errorHandler:', logErr);
  }

  if (err instanceof AppError) {
    const isDup = err.code === 'GOOGLE_BUSINESS_ALREADY_REGISTERED';
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      details: err.details,
      ...(isDup && err.details ? err.details : {}),
    });
    return;
  }

  // Log unexpected errors
  console.error('Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}

// Import Express types for the error handler
import { Request, Response, NextFunction } from 'express';