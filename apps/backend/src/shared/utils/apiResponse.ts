/**
 * API Response Utility
 * ReviewAI SaaS Platform
 * Standardized API response format
 */

import { Response } from 'express';

export interface ApiResponseData<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  meta?: ResponseMeta;
}

export interface ResponseMeta {
  pagination?: PaginationMeta;
  timestamp: string;
  requestId?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class ApiResponse {
  /**
   * Successful response (200)
   */
  static ok<T>(res: Response, data: T, message?: string, meta?: Partial<ResponseMeta>): void {
    this.send(res, 200, data, message, meta);
  }

  /**
   * Created response (201)
   */
  static created<T>(res: Response, data: T, message?: string, meta?: Partial<ResponseMeta>): void {
    this.send(res, 201, data, message, meta);
  }

  /**
   * Accepted response (202) - for async operations
   */
  static accepted<T>(res: Response, data: T, message?: string, meta?: Partial<ResponseMeta>): void {
    this.send(res, 202, data, message, meta);
  }

  /**
   * No content response (204)
   */
  static noContent(res: Response): void {
    res.status(204).send();
  }

  /**
   * Send response with custom status code
   */
  private static send<T>(
    res: Response,
    statusCode: number,
    data: T,
    message?: string,
    meta?: Partial<ResponseMeta>
  ): void {
    const response: ApiResponseData<T> = {
      success: true,
      data,
      message,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    };

    res.status(statusCode).json(response);
  }

  /**
   * Paginated response helper
   */
  static paginated<T>(
    res: Response,
    items: T[],
    page: number,
    limit: number,
    total: number,
    message?: string
  ): void {
    const totalPages = Math.ceil(total / limit);

    this.ok(res, items, message, {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  }

  /**
   * Error response - use AppError classes instead
   */
  static error(res: Response, statusCode: number, message: string, code: string, details?: any): void {
    res.status(statusCode).json({
      success: false,
      error: {
        message,
        code,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// Helper functions for easier usage in controllers
export function successResponse<T>(data: T, message?: string): { success: boolean; data: T; message?: string; meta: { timestamp: string } } {
  return {
    success: true,
    data,
    message,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
}

export function createdResponse<T>(data: T, message?: string): { success: boolean; data: T; message?: string; meta: { timestamp: string } } {
  return {
    success: true,
    data,
    message,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
}