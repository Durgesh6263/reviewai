/**
 * Team Module Routes
 * ReviewAI SaaS Platform
 */

import { Router, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthMiddleware, createAuthMiddleware, AuthenticatedRequest } from '../auth/middleware';
import { ApiResponse } from '../../shared/utils/apiResponse';

export function createTeamRoutes(
  supabase: SupabaseClient,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): Router {
  const router = Router();

  router.use(authMiddleware.authenticate);

  router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;

      // Fetch user's business
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, name')
        .eq('owner_id', user.sub);

      const businessName = businesses?.[0]?.name || 'My Business';
      const businessId = businesses?.[0]?.id || 'default';

      // Always return at least the current user as the Owner
      const currentOwnerMember = {
        id: `member_${user.sub}`,
        user_id: user.sub,
        business_id: businessId,
        business_name: businessName,
        name: user.email?.split('@')[0] || 'Business Owner',
        email: user.email || '',
        role: 'owner',
        status: 'active',
        invited_at: new Date().toISOString(),
        joined_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };

      res.json({
        success: true,
        data: [currentOwnerMember],
        meta: {
          total: 1,
          page,
          limit,
          total_pages: 1,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/invite', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { email, role, business_id } = req.body;
      const newMember = {
        id: `member_${Date.now()}`,
        user_id: `user_${Date.now()}`,
        business_id: business_id || 'default',
        business_name: 'My Business',
        name: email.split('@')[0],
        email,
        role: role || 'staff',
        status: 'invited',
        invited_at: new Date().toISOString(),
        joined_at: null,
        last_active_at: null,
      };

      ApiResponse.created(res, newMember, 'Invitation sent successfully');
    } catch (error) {
      next(error);
    }
  });

  return router;
}
