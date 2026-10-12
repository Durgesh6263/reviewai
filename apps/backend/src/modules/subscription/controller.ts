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
import { AuthorizationError, ValidationError, NotFoundError, AppError } from '../../shared/exceptions';
import { entitlementService } from './entitlement';
import { planConfigService } from '../admin/plan-config-service';
import { supabaseAdmin } from '../../config/supabase';
import { razorpayService } from '../payment/razorpay-service';
import { logger } from '../../shared/logger';

export class SubscriptionController {
  private statusCache = new Map<string, { data: any; expiresAt: number }>();
  private overviewCache = new Map<string, { data: any; expiresAt: number }>();

  constructor(private subscriptionService: SubscriptionService) {}

  /**
   * GET /subscriptions/plans
   * Get active public plans with duration matrix and trial configuration
   */
  getPlans = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      const data = await planConfigService.getPublicPlans(true);
      res.json(successResponse(data, 'Plans retrieved successfully'));
    } catch (error) {
      next(error);
    }
  };

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
    const supabase = (this.subscriptionService as any)?.supabase || supabaseAdmin;
    const [{ data: owned }, { data: staff }] = await Promise.all([
      supabase.from('businesses').select('id, created_at').eq('owner_id', userId).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('business_staff').select('business_id').eq('user_id', userId),
    ]);

    const ids = new Set<string>();
    (owned || []).forEach((b: any) => ids.add(b.id));
    (staff || []).forEach((s: any) => ids.add(s.business_id));

    if (role === 'admin' && ids.size === 0) {
      const { data: all } = await supabase.from('businesses').select('id, created_at').is('deleted_at', null).order('created_at', { ascending: false });
      (all || []).forEach((b: any) => ids.add(b.id));
    }

    if (requestedBusinessId) {
      if (ids.has(requestedBusinessId) || role === 'admin') {
        return [requestedBusinessId];
      }
      return [];
    }

    const idList = Array.from(ids);
    if (idList.length <= 1) {
      return idList;
    }

    // When multiple businesses exist and NO specific business is requested:
    // Maintain the canonical business ordering from owned businesses (created_at desc)
    // to strictly match GET /businesses and avoid arbitary rank-based desync.
    return idList;
  }

  /**
   * Helper to derive authoritative display status from entitlement
   */
  private deriveDisplayStatus(entitlement: any): 'FREE_TRIAL' | 'ACTIVE' | 'EXPIRED' | 'CANCELED' | 'SUSPENDED' | 'QR_QUOTA_EXHAUSTED' | 'AI_QUOTA_EXHAUSTED' {
    if (entitlement.status === 'canceled') return 'CANCELED';
    if (entitlement.status === 'suspended') return 'SUSPENDED';

    if (entitlement.is_expired || entitlement.status === 'expired') {
      return 'EXPIRED';
    }

    if (!entitlement.is_trial && entitlement.status === 'active') {
      return 'ACTIVE';
    }

    if (entitlement.is_trial || entitlement.status === 'trialing') {
      return 'FREE_TRIAL';
    }

    return 'ACTIVE';
  }

  /**
   * Helper to derive authoritative exhaustion message from entitlement
   */
  private deriveExhaustionMessage(entitlement: any): string | null {
    if (entitlement.status === 'canceled') {
      return 'Your subscription has been canceled.';
    }
    if (entitlement.status === 'suspended') {
      return 'Your account is suspended.';
    }
    if (
      entitlement.is_expired ||
      entitlement.exhaustion_reason === 'PLAN_EXPIRED' ||
      entitlement.exhaustion_reason === 'TRIAL_EXPIRED' ||
      entitlement.exhaustion_reason === 'SUBSCRIPTION_EXPIRED' ||
      entitlement.status === 'expired'
    ) {
      return 'Your subscription has expired.';
    }

    // For active paid plans: check monthly quota limits
    if (!entitlement.is_trial) {
      const qrExhausted = !entitlement.is_qr_allowed;
      const aiExhausted = !entitlement.is_ai_allowed;

      if (qrExhausted && aiExhausted) {
        return 'Your monthly QR scan and AI generation quotas have been exhausted. Access will resume automatically in the next monthly period.';
      }
      if (qrExhausted) {
        return 'Your monthly QR scan quota has been exhausted. AI generation remains available.';
      }
      if (aiExhausted) {
        return 'Your monthly AI generation quota has been exhausted. QR scan reviews remain available.';
      }
      return null;
    }

    // For free trials:
    if (!entitlement.is_qr_allowed && !entitlement.is_ai_allowed) {
      return 'Your trial quota has been exhausted.';
    }
    if (!entitlement.is_qr_allowed) {
      return 'Your QR scan quota has been exhausted.';
    }
    if (!entitlement.is_ai_allowed) {
      return 'Your AI generation quota has been exhausted.';
    }

    return null;
  }

  /**
   * GET /subscription/status
   * Current subscription status and usage limits
   */
  getStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      const requestedBusinessId = req.query.business_id as string | undefined;
      const bIds = await this.getAccessibleBusinessIds(req.user!.sub, req.user!.role, requestedBusinessId);
      if (requestedBusinessId && bIds.length === 0) {
        throw new AuthorizationError('Access denied: not authorized for this business');
      }
      const targetBusinessId = bIds.length > 0 ? bIds[0] : null;

      if (!targetBusinessId) {
        // Fallback if user has no registered business yet (dynamically load active admin trial config)
        const trialConf = await planConfigService.getTrialConfig();
        const durationDays = trialConf.duration_days || 14;
        const totalQr = trialConf.total_qr_quota ?? 100;
        const totalAi = trialConf.total_ai_quota ?? 50;
        const now = Date.now();
        const endIso = new Date(now + durationDays * 86400000).toISOString();

        const defaultStatus = {
          plan: {
            name: 'Free Trial',
            slug: 'free_trial',
            version_id: `trial_v${trialConf.version || 1}`,
            duration: `${durationDays} Days`,
            duration_months: 0,
            price_inr: 0,
            monthly_qr_scans: totalQr,
            monthly_ai_generations: totalAi,
            total_qr_quota: totalQr,
            total_ai_quota: totalAi,
            features: trialConf.features || {
              custom_domain: false,
              advanced_analytics: true,
              api_access: false,
              white_label: false,
              priority_support: false,
              ai_reviews: true,
            },
          },
          status: 'FREE_TRIAL',
          display_status: 'FREE_TRIAL',
          raw_status: 'trialing',
          is_trial: true,
          start_date: new Date(now).toISOString(),
          end_date: endIso,
          expiry_date: endIso,
          current_period_end: endIso,
          days_remaining: durationDays,
          price_paid: 0,
          price_inr: 0,
          duration: `${durationDays} Days`,
          duration_months: 0,
          total_qr_quota: totalQr,
          used_qr: 0,
          remaining_qr: totalQr,
          total_ai_quota: totalAi,
          used_ai: 0,
          remaining_ai: totalAi,
          qr_scans: { limit: totalQr, used: 0, remaining: totalQr, percentage: 0 },
          ai_generations: { limit: totalAi, used: 0, remaining: totalAi, percentage: 0 },
          is_active: true,
          is_blocked: false,
          exhaustion_reason: null,
          exhaustion_message: null,
          block_message: null,
        };
        res.json(successResponse(defaultStatus, 'Subscription status retrieved'));
        return;
      }

      // Fetch trusted server-side entitlement snapshot with current monthly period and usage
      const entitlement = await entitlementService.getBusinessEntitlement(targetBusinessId);

      const qrLimit = entitlement.monthly_qr_quota;
      const qrUsed = entitlement.current_month_qr_used;
      const qrRemaining = entitlement.current_month_qr_remaining;
      const qrPercentage = qrLimit > 0 ? Math.min(100, Math.round((qrUsed / qrLimit) * 100)) : 0;

      const aiLimit = entitlement.monthly_ai_quota;
      const aiUsed = entitlement.current_month_ai_used;
      const aiRemaining = entitlement.current_month_ai_remaining;
      const aiPercentage = aiLimit > 0 ? Math.min(100, Math.round((aiUsed / aiLimit) * 100)) : 0;

      const durationStr = entitlement.duration_months > 0 
        ? `${entitlement.duration_months} Months` 
        : `${entitlement.duration_days || 14} Days`;

      const displayStatus = this.deriveDisplayStatus(entitlement);
      const exhaustionMessage = this.deriveExhaustionMessage(entitlement);

      const statusData = {
        business_id: targetBusinessId,
        plan: {
          name: entitlement.plan_name,
          slug: entitlement.plan_id,
          version_id: entitlement.plan_version_id,
          duration: durationStr,
          duration_months: entitlement.duration_months,
          duration_days: entitlement.duration_days,
          price_inr: entitlement.price_inr,
          monthly_qr_scans: qrLimit,
          monthly_ai_generations: aiLimit,
          monthly_qr_limit: qrLimit,
          monthly_ai_limit: aiLimit,
          total_qr_quota: qrLimit,
          total_ai_quota: aiLimit,
          max_qr_codes: entitlement.max_qr_codes,
          features: entitlement.features,
        },
        status: displayStatus,
        display_status: displayStatus,
        raw_status: entitlement.status,
        is_trial: entitlement.is_trial,
        start_date: entitlement.start_date,
        end_date: entitlement.end_date,
        expiry_date: entitlement.end_date,
        current_period_end: entitlement.current_period_end,
        current_period_start: entitlement.current_period_start,
        next_monthly_reset: entitlement.next_monthly_reset,
        current_period_index: entitlement.current_period_index,
        monthly_history: entitlement.monthly_history || [],
        days_remaining: entitlement.days_remaining,
        price_paid: entitlement.price_inr,
        price_inr: entitlement.price_inr,
        duration: durationStr,
        duration_months: entitlement.duration_months,
        duration_days: entitlement.duration_days,
        max_qr_codes: entitlement.max_qr_codes,
        monthly_qr_limit: qrLimit,
        monthly_ai_limit: aiLimit,
        current_month_qr_used: qrUsed,
        current_month_ai_used: aiUsed,
        current_month_qr_remaining: qrRemaining,
        current_month_ai_remaining: aiRemaining,
        total_qr_quota: qrLimit,
        used_qr: qrUsed,
        remaining_qr: qrRemaining,
        total_ai_quota: aiLimit,
        used_ai: aiUsed,
        remaining_ai: aiRemaining,
        qr_scans: {
          limit: qrLimit,
          used: qrUsed,
          remaining: qrRemaining,
          percentage: qrPercentage,
        },
        ai_generations: {
          limit: aiLimit,
          used: aiUsed,
          remaining: aiRemaining,
          percentage: aiPercentage,
        },
        is_active: entitlement.is_active,
        is_expired: entitlement.is_expired,
        is_blocked: entitlement.is_expired || entitlement.status === 'canceled' || entitlement.status === 'suspended',
        is_qr_allowed: entitlement.is_qr_allowed,
        is_ai_allowed: entitlement.is_ai_allowed,
        qr_blocked: !entitlement.is_qr_allowed,
        ai_blocked: !entitlement.is_ai_allowed,
        exhaustion_reason: entitlement.exhaustion_reason,
        exhaustion_message: exhaustionMessage,
        block_message: (entitlement.is_expired || entitlement.status === 'canceled' || entitlement.status === 'suspended') ? exhaustionMessage : null,
        history: entitlement.history || [],
      };

      logger.info(
        {
          user_id: req.user!.sub,
          business_id: targetBusinessId,
          status: entitlement.status,
          is_expired: entitlement.is_expired,
          qr_limit: qrLimit,
          qr_used: qrUsed,
          qr_remaining: qrRemaining,
          ai_limit: aiLimit,
          ai_used: aiUsed,
          ai_remaining: aiRemaining,
          is_qr_allowed: entitlement.is_qr_allowed,
          is_ai_allowed: entitlement.is_ai_allowed,
        },
        'Authoritative subscription status evaluated'
      );

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
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      const requestedBusinessId = req.query.business_id as string | undefined;
      const bIds = await this.getAccessibleBusinessIds(req.user!.sub, req.user!.role, requestedBusinessId);
      if (requestedBusinessId && bIds.length === 0) {
        throw new AuthorizationError('Access denied: not authorized for this business');
      }
      const targetBusinessId = bIds.length > 0 ? bIds[0] : null;

      if (!targetBusinessId) {
        const trialConf = await planConfigService.getTrialConfig();
        const durationDays = trialConf.duration_days || 14;
        const totalQr = trialConf.total_qr_quota ?? 100;
        const totalAi = trialConf.total_ai_quota ?? 50;
        const now = Date.now();
        const endIso = new Date(now + durationDays * 86400000).toISOString();

        res.json(successResponse({
          plan: 'Free Trial',
          plan_name: 'Free Trial',
          plan_version_id: `trial_v${trialConf.version || 1}`,
          status: 'FREE_TRIAL',
          display_status: 'FREE_TRIAL',
          raw_status: 'trialing',
          is_trial: true,
          is_active: true,
          is_expired: false,
          is_blocked: false,
          is_qr_allowed: true,
          is_ai_allowed: true,
          start_date: new Date(now).toISOString(),
          end_date: endIso,
          expiry_date: endIso,
          current_period_end: endIso,
          cancel_at_period_end: false,
          days_remaining: durationDays,
          price_paid: 0,
          total_qr_quota: totalQr,
          used_qr: 0,
          remaining_qr: totalQr,
          total_ai_quota: totalAi,
          used_ai: 0,
          remaining_ai: totalAi,
        }, 'Subscription retrieved'));
        return;
      }

      const entitlement = await entitlementService.getBusinessEntitlement(targetBusinessId);
      const durationStr = entitlement.duration_months > 0 
        ? `${entitlement.duration_months} Months` 
        : `${entitlement.duration_days || 14} Days`;

      const displayStatus = this.deriveDisplayStatus(entitlement);
      const exhaustionMessage = this.deriveExhaustionMessage(entitlement);

      const responseData = {
        plan: entitlement.plan_name,
        plan_name: entitlement.plan_name,
        plan_version_id: entitlement.plan_version_id,
        duration: durationStr,
        duration_months: entitlement.duration_months,
        status: displayStatus,
        display_status: displayStatus,
        raw_status: entitlement.status,
        is_trial: entitlement.is_trial,
        is_active: entitlement.is_active,
        is_expired: entitlement.is_expired,
        is_blocked: entitlement.is_expired || entitlement.status === 'canceled' || entitlement.status === 'suspended',
        is_qr_allowed: entitlement.is_qr_allowed,
        is_ai_allowed: entitlement.is_ai_allowed,
        start_date: entitlement.start_date,
        end_date: entitlement.end_date,
        expiry_date: entitlement.end_date,
        days_remaining: entitlement.days_remaining,
        price_paid: entitlement.price_inr,
        total_qr_quota: entitlement.total_qr_quota,
        used_qr: entitlement.used_qr,
        remaining_qr: entitlement.remaining_qr,
        total_ai_quota: entitlement.total_ai_quota,
        used_ai: entitlement.used_ai,
        remaining_ai: entitlement.remaining_ai,
        exhaustion_reason: entitlement.exhaustion_reason,
        exhaustion_message: exhaustionMessage,
        current_period_end: entitlement.end_date,
        cancel_at_period_end: false,
      };

      res.json(successResponse(responseData, 'Subscription retrieved'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /subscription/upgrade-requests
  /**
   * GET /subscription/upgrade-requests
   * List upgrade/activation requests for the user's businesses
   */
  getUpgradeRequests = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestedBusinessId = req.query.business_id as string | undefined;
      const bIds = await this.getAccessibleBusinessIds(req.user!.sub, req.user!.role, requestedBusinessId);

      if (requestedBusinessId && bIds.length === 0) {
        throw new AuthorizationError('Access denied: not authorized for this business');
      }

      if (bIds.length === 0) {
        res.json(successResponse([], 'Upgrade requests retrieved'));
        return;
      }

      const supabase = (this.subscriptionService as any).supabase;
      const { data: rows, error } = await supabase
        .from('upgrade_requests')
        .select('*')
        .in('business_id', bIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const requests = (rows || []).map((r: any) => {
        let meta: any = {};
        try {
          if (r.message && typeof r.message === 'string' && r.message.startsWith('{')) {
            meta = JSON.parse(r.message);
          }
        } catch (e) {}

        return {
          id: r.id,
          business_id: r.business_id,
          requested_plan: meta.plan_id || r.requested_plan,
          plan_name: meta.plan_name || r.requested_plan,
          plan_version_id: meta.plan_version_id,
          duration_months: meta.duration_months,
          price_inr: meta.price_inr,
          total_qr_quota: meta.allocated_qr_quota,
          total_ai_quota: meta.allocated_ai_quota,
          max_qr_codes: meta.max_qr_codes,
          status: r.status,
          admin_notes: r.admin_notes,
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      });

      res.json(successResponse(requests, 'Upgrade requests retrieved'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /subscription/upgrade-request
   * Submit an activation/upgrade request with authoritative server-side validation
   */
  createUpgradeRequest = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const requestedBusinessId = req.body.business_id;

      // 1. Resolve and verify business access
      let targetBusinessId = requestedBusinessId;
      if (targetBusinessId) {
        await this.verifyBusinessAccess(req, targetBusinessId);
      } else {
        const bIds = await this.getAccessibleBusinessIds(user.sub, user.role);
        if (bIds.length === 0) {
          throw new ValidationError('No accessible business found for this account');
        }
        targetBusinessId = bIds[0];
      }

      // 2. Prevent accidental replacement if current subscription is still active (and not trial)
      const currentEntitlement = await entitlementService.getBusinessEntitlement(targetBusinessId);
      if (currentEntitlement.is_active && !currentEntitlement.is_trial) {
        throw new ValidationError('You currently have an active paid subscription. New plan activation requests cannot replace an active subscription.');
      }

      const supabase = (this.subscriptionService as any).supabase;

      // 3. Prevent duplicate pending requests for the same business
      const { data: existingPending } = await supabase
        .from('upgrade_requests')
        .select('id, requested_plan, created_at')
        .eq('business_id', targetBusinessId)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingPending) {
        throw new ValidationError('A pending activation request already exists for this business. Please wait for Admin review or contact support.');
      }

      // 4. Server-side validation of plan selection: NEVER trust client price, quota, or features
      const rawPlanId = String(req.body.plan_id || req.body.requested_plan || '').toLowerCase().trim();
      if (!rawPlanId) {
        throw new ValidationError('A plan must be selected');
      }

      // Map alias / legacy names
      const planAliasMap: Record<string, string> = {
        starter: 'base',
        base: 'base',
        professional: 'pro',
        pro: 'pro',
        enterprise: 'unlimited',
        unlimited: 'unlimited',
      };
      const canonicalPlanId = planAliasMap[rawPlanId] || rawPlanId;

      const allPlans = await planConfigService.getPlans();
      const planDef = allPlans.find(p => p.id === canonicalPlanId);
      if (!planDef) {
        throw new ValidationError(`Selected plan '${rawPlanId}' is invalid or not available`);
      }

      if (!planDef.is_active) {
        throw new ValidationError(`Plan '${planDef.name}' is currently inactive and not accepting new activations`);
      }

      // 5. Validate duration (must be 1, 6, or 12 months)
      const durationMonths = Number(req.body.duration_months);
      if (![1, 6, 12].includes(durationMonths)) {
        throw new ValidationError('Invalid plan duration. Supported durations are 1, 6, or 12 months');
      }

      // 6. Authoritatively resolve the currently ACTIVE plan version
      const activeVersion = 
        planDef.versions?.find(v => v.status === 'active') || 
        planDef.versions?.find(v => v.status !== 'archived') || 
        planDef.versions?.[0];
      if (!activeVersion || activeVersion.status !== 'active') {
        throw new ValidationError(`Plan '${planDef.name}' has no active version available for activation`);
      }

      // Always enforce the currently active version for new activation requests
      const targetVersion = activeVersion;

      // 7. Calculate authoritative duration offerings directly from Admin config
      const durationKey = `${durationMonths}_months` as '1_month' | '6_months' | '12_months';
      const durationOffering = targetVersion.durations?.[durationKey];
      if (!durationOffering) {
        throw new ValidationError(`Duration of ${durationMonths} months is not configured for this plan`);
      }

      const authoritativePrice = Number(durationOffering.price_inr);
      const authoritativeQrQuota = Number(durationOffering.monthly_qr_quota ?? durationOffering.monthly_qr_limit ?? durationOffering.allocated_qr_quota);
      const authoritativeAiQuota = Number(durationOffering.monthly_ai_quota ?? durationOffering.monthly_ai_limit ?? durationOffering.allocated_ai_quota);
      const authoritativeMaxQrCodes = Number(durationOffering.max_qr_codes ?? (planDef.features?.max_qr_codes || 5));
      const authoritativePlanVersionId = `${planDef.id}_v${targetVersion.version_number}`;
      const authoritativePlanName = planDef.name;
      const authoritativeFeatures = planDef.features || {};

      // 8. Strict validation: Reject inactive versions or manipulated price/quota payloads
      const clientVersionId = req.body.plan_version_id || req.body.version_id;
      if (clientVersionId && clientVersionId !== authoritativePlanVersionId) {
        throw new ValidationError(`Requested plan version '${clientVersionId}' is inactive or invalid. Active version is '${authoritativePlanVersionId}'.`);
      }
      if (req.body.version_number !== undefined && Number(req.body.version_number) !== targetVersion.version_number) {
        throw new ValidationError(`Requested plan version v${req.body.version_number} is inactive. Active version is v${targetVersion.version_number}.`);
      }

      if (req.body.price !== undefined && Number(req.body.price) !== authoritativePrice) {
        throw new ValidationError(`Manipulated price detected (${req.body.price} vs authoritative ${authoritativePrice}). Price must match server configuration.`);
      }
      if (req.body.price_inr !== undefined && Number(req.body.price_inr) !== authoritativePrice) {
        throw new ValidationError(`Manipulated price detected (${req.body.price_inr} vs authoritative ${authoritativePrice}). Price must match server configuration.`);
      }
      if (req.body.monthly_qr_limit !== undefined && Number(req.body.monthly_qr_limit) !== authoritativeQrQuota) {
        throw new ValidationError(`Manipulated Monthly QR limit detected (${req.body.monthly_qr_limit} vs authoritative ${authoritativeQrQuota}). Quota must match server configuration.`);
      }
      if (req.body.monthly_qr_quota !== undefined && Number(req.body.monthly_qr_quota) !== authoritativeQrQuota) {
        throw new ValidationError(`Manipulated Monthly QR limit detected (${req.body.monthly_qr_quota} vs authoritative ${authoritativeQrQuota}). Quota must match server configuration.`);
      }
      if (req.body.allocated_qr_quota !== undefined && Number(req.body.allocated_qr_quota) !== authoritativeQrQuota) {
        throw new ValidationError(`Manipulated QR quota detected (${req.body.allocated_qr_quota} vs authoritative ${authoritativeQrQuota}). Quota must match server configuration.`);
      }
      if (req.body.qr_quota !== undefined && Number(req.body.qr_quota) !== authoritativeQrQuota) {
        throw new ValidationError(`Manipulated QR quota detected (${req.body.qr_quota} vs authoritative ${authoritativeQrQuota}). Quota must match server configuration.`);
      }
      if (req.body.monthly_ai_limit !== undefined && Number(req.body.monthly_ai_limit) !== authoritativeAiQuota) {
        throw new ValidationError(`Manipulated Monthly AI limit detected (${req.body.monthly_ai_limit} vs authoritative ${authoritativeAiQuota}). Quota must match server configuration.`);
      }
      if (req.body.monthly_ai_quota !== undefined && Number(req.body.monthly_ai_quota) !== authoritativeAiQuota) {
        throw new ValidationError(`Manipulated Monthly AI limit detected (${req.body.monthly_ai_quota} vs authoritative ${authoritativeAiQuota}). Quota must match server configuration.`);
      }
      if (req.body.allocated_ai_quota !== undefined && Number(req.body.allocated_ai_quota) !== authoritativeAiQuota) {
        throw new ValidationError(`Manipulated AI quota detected (${req.body.allocated_ai_quota} vs authoritative ${authoritativeAiQuota}). Quota must match server configuration.`);
      }
      if (req.body.ai_quota !== undefined && Number(req.body.ai_quota) !== authoritativeAiQuota) {
        throw new ValidationError(`Manipulated AI quota detected (${req.body.ai_quota} vs authoritative ${authoritativeAiQuota}). Quota must match server configuration.`);
      }

      // DB check constraint accepts: 'starter', 'professional', 'enterprise'
      const dbPlanMap: Record<string, 'starter' | 'professional' | 'enterprise'> = {
        base: 'starter',
        pro: 'professional',
        unlimited: 'enterprise',
      };
      const dbRequestedPlan = dbPlanMap[planDef.id] || 'starter';

      const metadata = {
        plan_id: planDef.id,
        plan_name: authoritativePlanName,
        plan_version_id: authoritativePlanVersionId,
        plan_version_number: targetVersion.version_number,
        duration_months: durationMonths,
        price_inr: authoritativePrice,
        monthly_qr_limit: authoritativeQrQuota,
        monthly_ai_limit: authoritativeAiQuota,
        monthly_qr_quota: authoritativeQrQuota,
        monthly_ai_quota: authoritativeAiQuota,
        allocated_qr_quota: authoritativeQrQuota,
        allocated_ai_quota: authoritativeAiQuota,
        max_qr_codes: authoritativeMaxQrCodes,
        features: authoritativeFeatures,
        note: typeof req.body.note === 'string' ? req.body.note : (typeof req.body.message === 'string' ? req.body.message : null),
        requested_at: new Date().toISOString(),
      };

      // Map current plan to valid constraint value
      const dbCurrentPlan = currentEntitlement.plan_id === 'free_trial' 
        ? 'free' 
        : (dbPlanMap[currentEntitlement.plan_id] || 'free');

      const { data: inserted, error: insertError } = await supabase
        .from('upgrade_requests')
        .insert({
          business_id: targetBusinessId,
          owner_id: user.sub,
          requested_plan: dbRequestedPlan,
          current_plan: dbCurrentPlan,
          status: 'pending',
          reason: 'Activation Request',
          message: JSON.stringify(metadata),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          throw new ValidationError('A pending activation request already exists for this business.');
        }
        throw insertError;
      }

      res.status(201).json(createdResponse({
        id: inserted.id,
        business_id: inserted.business_id,
        requested_plan: planDef.id,
        plan_name: authoritativePlanName,
        plan_version_id: authoritativePlanVersionId,
        duration_months: durationMonths,
        price_inr: authoritativePrice,
        allocated_qr_quota: authoritativeQrQuota,
        allocated_ai_quota: authoritativeAiQuota,
        max_qr_codes: authoritativeMaxQrCodes,
        status: 'pending',
        created_at: inserted.created_at,
      }, 'Subscription activation request submitted successfully'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /subscriptions/create-order
   * Client selects plan/version/duration -> Server validates active offering & authoritative price -> creates Razorpay Order
   */
  createRazorpayOrder = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        throw new AuthorizationError('Authentication required');
      }

      const { plan_id, duration_months, plan_version_id } = req.body;
      let targetBusinessId = req.body.business_id;

      if (!targetBusinessId) {
        const { data: userBusiness } = await supabaseAdmin
          .from('businesses')
          .select('id')
          .eq('owner_id', user.sub)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if ((userBusiness as any)?.id) {
          targetBusinessId = (userBusiness as any).id;
        }
      }

      if (!targetBusinessId || !plan_id || !duration_months) {
        throw new ValidationError('business_id, plan_id, and duration_months are required');
      }

      // Verify business access (rejects unauthorized access or tampering)
      await this.verifyBusinessAccess(req, targetBusinessId);

      // Server creates Razorpay Order - ignores any client-supplied amount or price
      const order = await razorpayService.createOrder({
        businessId: targetBusinessId,
        planId: plan_id,
        durationMonths: Number(duration_months),
        planVersionId: plan_version_id,
        userId: user.sub,
        userEmail: user.email,
      });

      // Response contains ONLY safe fields required for client checkout
      const clientOrderPayload = {
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        key_id: order.key_id,
        plan_id: order.plan_id,
        plan_name: order.plan_name,
        duration_months: order.duration_months,
        plan_version_id: order.plan_version_id,
        price_inr: order.price_inr,
        created_at: order.created_at,
      };

      res.status(201).json(createdResponse(clientOrderPayload, 'Razorpay order created successfully'));
    } catch (error: any) {
      if (
        error instanceof ValidationError ||
        error instanceof AuthorizationError ||
        error instanceof NotFoundError ||
        error instanceof AppError
      ) {
        next(error);
      } else {
        logger.error({ err: error?.message }, 'Failed to create Razorpay order');
        next(new AppError('Failed to create payment order. Please try again.', 500, 'PAYMENT_ORDER_FAILED'));
      }
    }
  };

  /**
   * POST /subscriptions/verify-payment
   * Server verifies payment signature with Razorpay secret and activates paid plan.
   * Protects against fake payments, replayed payments, and altered prices.
   */
  verifyRazorpayPayment = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        throw new AuthorizationError('Authentication required');
      }

      const {
        plan_id,
        duration_months,
        plan_version_id,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount,
      } = req.body;

      let targetBusinessId = req.body.business_id;
      if (!targetBusinessId) {
        const { data: userBusiness } = await supabaseAdmin
          .from('businesses')
          .select('id')
          .eq('owner_id', user.sub)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if ((userBusiness as any)?.id) {
          targetBusinessId = (userBusiness as any).id;
        }
      }

      if (!targetBusinessId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        throw new ValidationError('business_id, razorpay_order_id, razorpay_payment_id, and razorpay_signature are required');
      }

      // Verify business access - user cannot verify payment for another user's business
      await this.verifyBusinessAccess(req, targetBusinessId);

      const result = await razorpayService.verifyPayment({
        business_id: targetBusinessId,
        plan_id,
        duration_months: duration_months ? Number(duration_months) as 1 | 6 | 12 : undefined,
        plan_version_id,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        user_id: user.sub,
        user_email: user.email,
        amount: amount !== undefined ? Number(amount) : undefined,
      });

      // Invalidate caches so client immediately sees updated subscription & entitlement
      this.statusCache.clear();
      this.overviewCache.clear();

      res.json(successResponse(result, 'Payment verified and subscription activated successfully'));
    } catch (error: any) {
      if (
        error instanceof ValidationError ||
        error instanceof AuthorizationError ||
        error instanceof NotFoundError ||
        error instanceof AppError
      ) {
        next(error);
      } else {
        logger.error({ err: error?.message }, 'Failed to verify Razorpay payment');
        next(new AppError(error?.message || 'Payment verification failed. Please try again.', 400, 'PAYMENT_VERIFICATION_FAILED'));
      }
    }
  };

  /**
   * POST /payments/razorpay/webhook & /subscriptions/webhook
   * Razorpay webhook endpoint for reliable asynchronous payment confirmation.
   * Verifies X-Razorpay-Signature header and processes payment idempotently.
   */
  handleRazorpayWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = (req.headers['x-razorpay-signature'] || '') as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      const result = await razorpayService.handleWebhook(rawBody, signature);

      this.statusCache.clear();
      this.overviewCache.clear();

      res.status(200).json(successResponse(result, 'Webhook processed successfully'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /subscriptions/payments/history
   * Retrieve payment history
   */
  getPaymentHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = (req.query.business_id as string) || undefined;
      if (businessId) {
        await this.verifyBusinessAccess(req, businessId);
      }

      const history = await razorpayService.getPaymentHistory(businessId);
      res.json(successResponse(history, 'Payment history retrieved successfully'));
    } catch (error) {
      next(error);
    }
  };
}