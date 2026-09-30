/**
 * Settings Module Routes
 * ReviewAI SaaS Platform
 */

import { Router, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { createAuthMiddleware, AuthenticatedRequest } from '../auth/middleware';
import { ApiResponse } from '../../shared/utils/apiResponse';

export function createSettingsRoutes(
  supabase: SupabaseClient,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): Router {
  const router = Router();

  router.use(authMiddleware.authenticate);

  // In-memory preferences fallback
  const userPreferences: Record<string, any> = {};

  router.get('/notifications', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const defaultSettings = {
        email_reviews: true,
        email_weekly_report: true,
        email_marketing: false,
        push_reviews: true,
        push_mentions: true,
      };

      const settings = userPreferences[userId] || defaultSettings;
      ApiResponse.ok(res, settings, 'Notification settings retrieved');
    } catch (error) {
      next(error);
    }
  });

  router.patch('/notifications', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const current = userPreferences[userId] || {
        email_reviews: true,
        email_weekly_report: true,
        email_marketing: false,
        push_reviews: true,
        push_mentions: true,
      };

      userPreferences[userId] = {
        ...current,
        ...req.body,
      };

      ApiResponse.ok(res, userPreferences[userId], 'Notification settings updated');
    } catch (error) {
      next(error);
    }
  });

  return router;
}
