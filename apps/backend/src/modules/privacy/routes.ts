/**
 * Privacy Routes - GDPR Compliance Endpoints
 */

import { Router } from 'express';
import { PrivacyController } from './controller';
import { AuthMiddleware } from '../../modules/auth/middleware';
import { z } from 'zod';

export function createPrivacyRoutes(
  privacyController: PrivacyController,
  authMiddleware: AuthMiddleware
): Router {
  const router = Router();

  // All privacy endpoints require authentication
  router.use(authMiddleware.authenticate);

  // Validation schemas
  const uuidParamSchema = z.object({
    params: z.object({
      businessId: z.string().uuid('Invalid business ID format'),
    }),
  });

  const confirmQuerySchema = z.object({
    query: z.object({
      confirmed: z.literal('true', {
        errorMap: () => ({ message: 'Confirmation required: add ?confirmed=true' }),
      }),
    }),
  });

  /**
   * @route GET /privacy/export
   * @desc Export all user data (GDPR Right to Access - Article 15)
   * @access Private
   */
  router.get(
    '/export',
    authMiddleware.validate(z.object({})),
    privacyController.exportData.bind(privacyController)
  );

  /**
   * @route GET /privacy/info
   * @desc Get privacy information (GDPR Articles 13/14)
   * @access Private
   */
  router.get(
    '/info',
    authMiddleware.validate(z.object({})),
    privacyController.getPrivacyInfo.bind(privacyController)
  );

  /**
   * @route DELETE /privacy/account
   * @desc Delete user account and all data (GDPR Right to Erasure - Article 17)
   * @access Private
   */
  router.delete(
    '/account',
    authMiddleware.validate(confirmQuerySchema),
    privacyController.deleteAccount.bind(privacyController)
  );

  /**
   * @route DELETE /privacy/business/:businessId
   * @desc Delete business data (for business owner)
   * @access Private
   */
  router.delete(
    '/business/:businessId',
    authMiddleware.validate(z.object({
      params: z.object({
        businessId: z.string().uuid('Invalid business ID format'),
      }),
      query: z.object({
        confirmed: z.literal('true', {
          errorMap: () => ({ message: 'Confirmation required: add ?confirmed=true' }),
        }),
      }),
    })),
    privacyController.deleteBusiness.bind(privacyController)
  );

  return router;
}