/**
 * Extended Express types for Request/Response
 */

import { Logger } from 'pino';
import { TokenPayload } from '../../modules/auth/types';
import { BusinessAccess } from '../../modules/auth/middleware';

declare global {
  namespace Express {
    interface Request {
      // Request ID for correlation
      requestId: string;
      startTime: number;

      // Authenticated user (from JWT)
      user?: TokenPayload;

      // Business access (from requireBusinessAccess middleware)
      businessAccess?: BusinessAccess;

      // Structured logger with request context
      logger?: Logger;
    }
  }
}

export {};