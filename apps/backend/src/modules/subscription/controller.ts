/**
 * Subscription Module Controller
 * ReviewAI SaaS Platform
 * HTTP handlers for subscription management
 */

import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from './service';
import { AuthenticatedRequest } from '../auth/middleware';
import {
  createSubscriptionSchema,
  updateSubscriptionSchema,
  cancelSubscriptionSchema,
  subscriptionIdParamSchema,
  businessIdParamSchema,
  createCheckoutSessionSchema,
  createBillingPortalSessionSchema,
} from './validators';
import { successResponse, createdResponse } from '../../shared/utils/apiResponse';
import { AuthorizationError } from '../../shared/exceptions';

export class SubscriptionController {
  private statusCache = new Map<string, { data: any; expiresAt: number }>();
  private overviewCache = new Map<string, { data: any; expiresAt: number }>();

  constructor(private subscriptionService: SubscriptionService) {}

  /**
   * GET /subscriptions/businesses/:businessId
   * Get subscription for a business
   */
  async getSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId } = businessIdParamSchema.parse(req.params).params;

      // Verify user has access to this business
      await this.verifyBusinessAccess(req, businessId);

      const subscription = await this.subscriptionService.getSubscriptionWithUsage(businessId);
      res.json(successResponse(subscription, 'Subscription retrieved'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /subscriptions
   * Create a new subscription
   */
  async createSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = createSubscriptionSchema.parse(req.body).body;

      // Verify user has access to this business
      await this.verifyBusinessAccess(req, data.business_id);

      const subscription = await this.subscriptionService.createSubscription(data);
      this.statusCache.clear();
      this.overviewCache.clear();
      res.status(201).json(createdResponse(subscription, 'Subscription created'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /subscriptions/:subscriptionId
   * Update subscription (plan change, etc.)
   */
  async updateSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { subscriptionId } = subscriptionIdParamSchema.parse(req.params).params;
      const data = updateSubscriptionSchema.parse(req.body).body;

      // Verify user has access to this subscription's business
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      await this.verifyBusinessAccess(req, subscription.business_id);

      const updated = await this.subscriptionService.updateSubscription(subscriptionId, data);
      this.statusCache.clear();
      this.overviewCache.clear();
      res.json(successResponse(updated, 'Subscription updated'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /subscriptions/:subscriptionId/cancel
   * Cancel subscription
   */
  async cancelSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { subscriptionId } = subscriptionIdParamSchema.parse(req.params).params;
      const data = cancelSubscriptionSchema.parse(req.body).body;

      // Verify user has access to this subscription's business
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      await this.verifyBusinessAccess(req, subscription.business_id);

      const canceled = await this.subscriptionService.cancelSubscription(subscriptionId, data);
      this.statusCache.clear();
      this.overviewCache.clear();
      res.json(successResponse(canceled, 'Subscription canceled'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /subscriptions/checkout
   * Create Stripe checkout session
   */
  async createCheckoutSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = createCheckoutSessionSchema.parse(req.body).body;

      // Verify user has access to this business
      await this.verifyBusinessAccess(req, data.business_id);

      const session = await this.subscriptionService.createCheckoutSession(data);
      res.json(successResponse(session, 'Checkout session created'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /subscriptions/billing-portal
   * Create Stripe billing portal session
   */
  async createBillingPortalSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = createBillingPortalSessionSchema.parse(req.body).body;

      // Verify user has access to this business
      await this.verifyBusinessAccess(req, data.business_id);

      const session = await this.subscriptionService.createBillingPortalSession(data.business_id, data.return_url);
      res.json(successResponse(session, 'Billing portal session created'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /subscriptions/:subscriptionId/invoices
   * Get invoices for a subscription
   */
  async getInvoices(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { subscriptionId } = subscriptionIdParamSchema.parse(req.params).params;

      // Verify user has access to this subscription's business
      const subscription = await this.subscriptionService.getSubscription(subscriptionId);
      await this.verifyBusinessAccess(req, subscription.business_id);

      const invoices = await this.subscriptionService.getInvoices(subscriptionId);
      res.json(successResponse(invoices, 'Invoices retrieved'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify user has access to business
   */
  private async verifyBusinessAccess(req: AuthenticatedRequest, businessId: string): Promise<void> {
    const user = req.user!;

    // Admin can access all
    if (user.role === 'admin') {
      return;
    }

    // Business owners and staff must have membership
    const supabase = (this.subscriptionService as any).supabase;
    const { data: business } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', businessId)
      .is('deleted_at', null)
      .maybeSingle();

    if (business && business.owner_id === user.sub) {
      return;
    }

    const { data: staff } = await supabase
      .from('business_staff')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.sub)
      .maybeSingle();

    if (!staff) {
      throw new AuthorizationError('Access denied: not a member of this business');
    }

    // Only owners/managers can manage subscriptions
    if (staff.role !== 'owner' && staff.role !== 'manager') {
      throw new AuthorizationError('Access denied: insufficient permissions to manage subscriptions');
    }
  }

  /**
   * Helper to retrieve business IDs for user
   */
  private async getAccessibleBusinessIds(userId: string, role?: string, requestedBusinessId?: string): Promise<string[]> {
    const supabase = (this.subscriptionService as any).supabase;
    const [{ data: owned }, { data: staff }] = await Promise.all([
      supabase.from('businesses').select('id').eq('owner_id', userId).is('deleted_at', null),
      supabase.from('business_staff').select('business_id').eq('user_id', userId),
    ]);

    const ids = new Set<string>();
    (owned || []).forEach((b: any) => ids.add(b.id));
    (staff || []).forEach((s: any) => ids.add(s.business_id));

    if (role === 'admin' && ids.size === 0) {
      const { data: all } = await supabase.from('businesses').select('id').is('deleted_at', null);
      (all || []).forEach((b: any) => ids.add(b.id));
    }

    if (requestedBusinessId) {
      if (ids.has(requestedBusinessId) || role === 'admin') {
        return [requestedBusinessId];
      }
      return [];
    }

    return Array.from(ids);
  }

  /**
   * GET /subscription/status
   * Current subscription status and usage limits
   */
  getStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestedBusinessId = req.query.business_id as string | undefined;
      const cacheKey = `${req.user!.sub}:${requestedBusinessId || 'all'}`;
      const cached = this.statusCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        res.json(successResponse(cached.data, 'Subscription status retrieved'));
        return;
      }

      const supabase = (this.subscriptionService as any).supabase;
      const bIds = await this.getAccessibleBusinessIds(req.user!.sub, req.user!.role, requestedBusinessId);

      // Default monthly cycle: 1st of current month to 1st of next month
      const now = new Date();
      let periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      let periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

      let planName = 'Free Pilot';
      let planSlug = 'free';
      let monthlyScansLimit = 100;
      let monthlyGensLimit = 50;
      const isActive = true;

      if (bIds.length > 0) {
        // Check for active subscription
        const { data: activeSubs } = await supabase
          .from('subscriptions')
          .select('*')
          .in('business_id', bIds)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1);

        if (activeSubs && activeSubs.length > 0) {
          const sub = activeSubs[0];
          planName = sub.plan ? (sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)) : 'Starter';
          planSlug = sub.plan || 'starter';
          if (sub.current_period_start) periodStart = new Date(sub.current_period_start);
          if (sub.current_period_end) periodEnd = new Date(sub.current_period_end);

          if (planSlug === 'starter') {
            monthlyScansLimit = 500;
            monthlyGensLimit = 250;
          } else if (planSlug === 'growth') {
            monthlyScansLimit = 2000;
            monthlyGensLimit = 1000;
          } else if (planSlug === 'enterprise') {
            monthlyScansLimit = -1;
            monthlyGensLimit = -1;
          }
        } else {
          // Check business pilot limits
          const { data: bizData } = await supabase
            .from('businesses')
            .select('pilot_limits')
            .in('id', bIds);

          if (bizData && bizData.length > 0) {
            let totalScans = 0;
            bizData.forEach((b: any) => {
              if (b.pilot_limits?.max_scans_per_month) {
                totalScans += b.pilot_limits.max_scans_per_month;
              } else {
                totalScans += 100;
              }
            });
            monthlyScansLimit = totalScans;
            monthlyGensLimit = bizData.length * 50;
          }
        }
      }

      let scansUsed = 0;
      let gensUsed = 0;

      if (bIds.length > 0) {
        const [{ count: scansCount }, { count: gensCount }] = await Promise.all([
          supabase
            .from('scan_logs')
            .select('id', { count: 'exact', head: true })
            .in('business_id', bIds)
            .gte('scanned_at', periodStart.toISOString())
            .lt('scanned_at', periodEnd.toISOString()),
          supabase
            .from('generated_reviews')
            .select('id', { count: 'exact', head: true })
            .in('business_id', bIds)
            .gte('created_at', periodStart.toISOString())
            .lt('created_at', periodEnd.toISOString()),
        ]);

        scansUsed = scansCount || 0;
        gensUsed = gensCount || 0;
      }

      const scansRemaining = monthlyScansLimit === -1 ? -1 : Math.max(0, monthlyScansLimit - scansUsed);
      const scansPercentage = monthlyScansLimit === -1 ? 0 : Math.min(100, Math.round((scansUsed / monthlyScansLimit) * 100));

      const gensRemaining = monthlyGensLimit === -1 ? -1 : Math.max(0, monthlyGensLimit - gensUsed);
      const gensPercentage = monthlyGensLimit === -1 ? 0 : Math.min(100, Math.round((gensUsed / monthlyGensLimit) * 100));

      const statusData = {
        plan: {
          name: planName,
          slug: planSlug,
          monthly_qr_scans: monthlyScansLimit,
          monthly_ai_generations: monthlyGensLimit,
          features: {
            custom_domain: false,
            advanced_analytics: true,
            api_access: false,
            white_label: false,
            priority_support: false,
            ai_reviews: true,
          },
        },
        qr_scans: {
          limit: monthlyScansLimit,
          used: scansUsed,
          remaining: scansRemaining,
          percentage: scansPercentage,
        },
        ai_generations: {
          limit: monthlyGensLimit,
          used: gensUsed,
          remaining: gensRemaining,
          percentage: gensPercentage,
        },
        is_active: isActive,
        current_period_end: periodEnd.toISOString(),
      };

      this.statusCache.set(cacheKey, { data: statusData, expiresAt: Date.now() + 20_000 });
      res.json(successResponse(statusData, 'Subscription status retrieved'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /subscription
   * Simplified subscription details for settings tab
   */
  getSubscriptionOverview = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestedBusinessId = req.query.business_id as string | undefined;
      const cacheKey = `${req.user!.sub}:${requestedBusinessId || 'all'}`;
      const cached = this.overviewCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        res.json(successResponse(cached.data, 'Subscription retrieved'));
        return;
      }

      const supabase = (this.subscriptionService as any).supabase;
      const bIds = await this.getAccessibleBusinessIds(req.user!.sub, req.user!.role, requestedBusinessId);

      const now = new Date();
      let periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      let planName = 'Free Pilot';

      if (bIds.length > 0) {
        const { data: activeSubs } = await supabase
          .from('subscriptions')
          .select('plan, current_period_end')
          .in('business_id', bIds)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1);

        if (activeSubs && activeSubs.length > 0) {
          const sub = activeSubs[0];
          planName = sub.plan ? (sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)) : 'Starter';
          if (sub.current_period_end) periodEnd = new Date(sub.current_period_end);
        }
      }

      const responseData = {
        plan: planName,
        status: 'active',
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
      };

      this.overviewCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 20_000 });
      res.json(successResponse(responseData, 'Subscription retrieved'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /subscription/upgrade-requests
   * List upgrade requests
   */
  getUpgradeRequests = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(successResponse([], 'Upgrade requests retrieved'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /subscription/upgrade-request
   * Submit an upgrade request
   */
  createUpgradeRequest = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { requested_plan, message } = req.body;
      const requestData = {
        id: `req_${Date.now()}`,
        business_id: req.body.business_id || 'default',
        requested_plan: requested_plan || 'starter',
        message: message || null,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      res.status(201).json(createdResponse(requestData, 'Upgrade request submitted successfully'));
    } catch (error) {
      next(error);
    }
  };
}