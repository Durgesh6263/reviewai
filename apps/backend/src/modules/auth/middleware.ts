/**
 * Authentication Module Middleware
 * ReviewAI SaaS Platform
 * JWT verification, RBAC, and request validation
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from './service';
import { TokenPayload, UserRole, hasPermission, Permission } from './types';
import { AppError, AuthenticationError, AuthorizationError } from '../../shared/exceptions';

// Extend Express Request type to include user
declare module 'express' {
  interface Request {
    user?: TokenPayload;
  }
}

// Type alias for authenticated requests
export type AuthenticatedRequest = Request;

export class AuthMiddleware {
  constructor(private authService: AuthService) {}

  /**
   * Verify access token and attach user to request
   */
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthenticationError('Access token required');
      }

      const token = authHeader.substring(7); // Remove 'Bearer '
      const payload = await this.authService.verifyAccessToken(token);

      // Verify that the user account is not deactivated (admins bypass)
      if (payload.role !== 'admin') {
        const accountStatus = await this.authService.getUserAccountStatus(payload.sub);
        if (accountStatus === 'deactivated') {
          throw new AppError('Your account has been deactivated by an administrator. Please contact support.', 403, 'ACCOUNT_DEACTIVATED');
        }
      }

      req.user = payload;
      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Optional authentication - attaches user if token present but doesn't require it
   */
  optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const payload = await this.authService.verifyAccessToken(token);
        req.user = payload;
      }

      next();
    } catch {
      // Ignore auth errors for optional auth
      next();
    }
  };

  /**
   * Require specific role or higher
   */
  requireRole = (...allowedRoles: UserRole[]) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          throw new AuthenticationError('Authentication required');
        }

        const userRole = req.user.role as UserRole;
        const hasRequiredRole = allowedRoles.some(role => userRole === role || this.roleInherits(userRole, role));

        if (!hasRequiredRole) {
          throw new AuthorizationError('Insufficient role permissions');
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Require specific permission
   */
  requirePermission = (permission: Permission) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          throw new AuthenticationError('Authentication required');
        }

        const hasPerm = await this.authService.checkPermission(req.user.sub, permission);

        if (!hasPerm) {
          throw new AuthorizationError(`Permission required: ${permission}`);
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Require business ownership or staff access
   */
  requireBusinessAccess = (businessIdParam = 'businessId') => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const businessId = req.params[businessIdParam];

      if (!businessId) {
        throw new AppError('Business ID required', 400, 'MISSING_BUSINESS_ID');
      }

      // Admin has access to all businesses
      if (req.user.role === 'admin') {
        return next();
      }

      // Check if user owns the business or is staff
      // This would typically query the database
      // For now, we'll attach the businessId for the service to verify
      req.params.businessId = businessId;
      next();
    };
  };

  /**
   * Rate limiting for auth endpoints
   */
  authRateLimit = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
    const attempts = new Map<string, { count: number; resetAt: number }>();

    return (req: Request, res: Response, next: NextFunction): void => {
      // In development / testing environments, do not lock out developers with aggressive rate limits
      if (process.env.NODE_ENV !== 'production') {
        return next();
      }

      const key = req.ip || 'unknown';
      const now = Date.now();

      const record = attempts.get(key);

      if (!record || now > record.resetAt) {
        attempts.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }

      if (record.count >= maxAttempts) {
        const retryAfter = Math.ceil((record.resetAt - now) / 1000);
        res.set('Retry-After', retryAfter.toString());
        throw new AppError('Too many attempts. Please try again later.', 429, 'RATE_LIMITED');
      }

      record.count++;
      next();
    };
  };

  /**
   * Validate request body against schema
   */
  validate = (schema: any) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      const result = schema.safeParse({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      if (!result.success) {
        const issues = result.error.issues;
        const fieldErrors: Record<string, string[]> = {
          ...result.error.flatten().fieldErrors,
        };
        for (const issue of issues) {
          const field = issue.path.length > 1 ? issue.path.slice(1).join('.') : issue.path.join('.') || 'general';
          if (!fieldErrors[field]) fieldErrors[field] = [];
          if (!fieldErrors[field].includes(issue.message)) {
            fieldErrors[field].push(issue.message);
          }
        }
        const errorMessages = issues.map((i: any) => i.message).filter(Boolean);
        const detailedMessage = errorMessages.length > 0 ? errorMessages.join('. ') : 'Validation failed';
        throw new AppError(detailedMessage, 400, 'VALIDATION_ERROR', fieldErrors);
      }

      // Attach validated data without clobbering unvalidated objects if not present in schema
      if (result.data.body !== undefined) req.body = result.data.body;
      if (result.data.query !== undefined) req.query = result.data.query as any;
      if (result.data.params !== undefined) req.params = result.data.params as any;

      next();
    };
  };

  /**
   * Check if user role inherits from required role
   */
  private roleInherits(userRole: UserRole, requiredRole: UserRole): boolean {
    const hierarchy: Record<UserRole, number> = {
      admin: 100,
      business_owner: 50,
      staff: 10,
    };

    return hierarchy[userRole] >= hierarchy[requiredRole];
  }
}

// Export singleton factory
export const createAuthMiddleware = (authService: AuthService) => new AuthMiddleware(authService);