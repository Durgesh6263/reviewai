/**
 * Subscription Module Service
 * ReviewAI SaaS Platform
 * Business logic for subscription management with Stripe
 */

import { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
  UsageRecord,
  UsageMetric,
  PlanLimits,
  SubscriptionWithUsage,
  UsageSummary,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  CancelSubscriptionRequest,
  SubscriptionCheckoutSession,
  BillingPortalSession,
  Invoice,
  SUBSCRIPTION_CONSTANTS,
  getPlanLimits,
  getPlanPrice,
} from './types';
import { NotFoundError, ValidationError, ConflictError, AppError } from '../../shared/exceptions';

export class SubscriptionService {
  private stripe: Stripe;

  constructor(
    private supabase: SupabaseClient,
    stripeSecretKey: string
  ) {
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });
  }

  /**
   * Get subscription by business ID
   */
  async getSubscriptionByBusiness(businessId: string): Promise<Subscription | null> {
    const { data: subscription } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('business_id', businessId)
      .single();

    return subscription;
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Subscription> {
    const { data: subscription, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single();

    if (error || !subscription) {
      throw new NotFoundError('Subscription');
    }

    return subscription;
  }

  /**
   * Get subscription with usage and limits
   */
  async getSubscriptionWithUsage(businessId: string): Promise<SubscriptionWithUsage> {
    const subscription = await this.getSubscriptionByBusiness(businessId);

    if (!subscription) {
      // Return free plan defaults
      return this.getFreePlanSubscription(businessId);
    }

    const usage = await this.getUsageSummary(subscription.id);
    const limits = getPlanLimits(subscription.plan);

    return {
      ...subscription,
      usage,
      limits,
    };
  }

  /**
   * Get free plan subscription (for businesses without subscription)
   */
  private getFreePlanSubscription(businessId: string): SubscriptionWithUsage {
    const limits = getPlanLimits('free');
    return {
      id: '',
      business_id: businessId,
      stripe_customer_id: '',
      stripe_subscription_id: null,
      stripe_price_id: null,
      status: 'active',
      plan: 'free',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
      canceled_at: null,
      trial_start: null,
      trial_end: null,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      usage: this.calculateUsageSummary({}, limits),
      limits,
    };
  }

  /**
   * Create or update subscription
   */
  async createSubscription(data: CreateSubscriptionRequest): Promise<Subscription> {
    const { business_id, plan, payment_method_id, trial_days, metadata } = data;

    // Check if subscription already exists
    const existing = await this.getSubscriptionByBusiness(business_id);
    if (existing) {
      throw new ConflictError('Subscription already exists for this business');
    }

    // Get or create Stripe customer
    const { data: business } = await this.supabase
      .from('businesses')
      .select('id, name, email, stripe_customer_id')
      .eq('id', business_id)
      .single();

    if (!business) {
      throw new NotFoundError('Business');
    }

    let stripeCustomerId = business.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: business.email,
        name: business.name,
        metadata: { business_id: business.id },
      });
      stripeCustomerId = customer.id;

      // Update business with Stripe customer ID
      await this.supabase
        .from('businesses')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', business_id);
    }

    // Create subscription in Stripe for paid plans
    let stripeSubscriptionId: string | null = null;
    let stripePriceId: string | null = null;
    let status: SubscriptionStatus = 'active';
    let currentPeriodStart = new Date().toISOString();
    let currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    let trialStart: string | null = null;
    let trialEnd: string | null = null;

    if (plan !== 'free') {
      // Get price ID from environment or create
      stripePriceId = await this.getOrCreatePriceId(plan, 'monthly');

      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: stripeCustomerId,
        items: [{ price: stripePriceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: { business_id, plan },
      };

      if (trial_days && trial_days > 0) {
        subscriptionParams.trial_period_days = trial_days;
      }

      if (payment_method_id) {
        subscriptionParams.default_payment_method = payment_method_id;
      }

      const stripeSubscription = await this.stripe.subscriptions.create(subscriptionParams);
      stripeSubscriptionId = stripeSubscription.id;
      status = stripeSubscription.status as SubscriptionStatus;
      currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000).toISOString();
      currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000).toISOString();

      if (stripeSubscription.trial_start) {
        trialStart = new Date(stripeSubscription.trial_start * 1000).toISOString();
      }
      if (stripeSubscription.trial_end) {
        trialEnd = new Date(stripeSubscription.trial_end * 1000).toISOString();
      }
    }

    // Create subscription record
    const { data: subscription, error } = await this.supabase
      .from('subscriptions')
      .insert({
        business_id,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_price_id: stripePriceId,
        status,
        plan,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: false,
        canceled_at: null,
        trial_start: trialStart,
        trial_end: trialEnd,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error || !subscription) {
      throw new AppError('Failed to create subscription', 500, 'SUBSCRIPTION_CREATION_FAILED');
    }

    // Track initial usage
    await this.resetUsageCounters(subscription.id);

    return subscription;
  }

  /**
   * Update subscription (plan change, etc.)
   */
  async updateSubscription(subscriptionId: string, data: UpdateSubscriptionRequest): Promise<Subscription> {
    const subscription = await this.getSubscription(subscriptionId);

    const updates: Partial<Subscription> = {};
    const stripeSubscriptionId = subscription.stripe_subscription_id;

    if (data.plan && data.plan !== subscription.plan) {
      if (!stripeSubscriptionId) {
        throw new ValidationError('Cannot change plan for free subscription');
      }

      // Update Stripe subscription
      const newPriceId = await this.getOrCreatePriceId(data.plan, 'monthly');
      await this.stripe.subscriptions.update(stripeSubscriptionId, {
        items: [{
          id: (await this.stripe.subscriptions.retrieve(stripeSubscriptionId)).items.data[0].id,
          price: newPriceId,
        }],
        proration_behavior: 'create_prorations',
        metadata: { plan: data.plan },
      });

      updates.plan = data.plan;
      updates.stripe_price_id = newPriceId;
    }

    if (data.cancel_at_period_end !== undefined) {
      if (!stripeSubscriptionId) {
        throw new ValidationError('Cannot modify cancel setting for free subscription');
      }

      await this.stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: data.cancel_at_period_end,
      });

      updates.cancel_at_period_end = data.cancel_at_period_end;
    }

    if (data.metadata) {
      updates.metadata = { ...subscription.metadata, ...data.metadata };
    }

    const { data: updated, error } = await this.supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', subscriptionId)
      .select()
      .single();

    if (error || !updated) {
      throw new AppError('Failed to update subscription', 500, 'SUBSCRIPTION_UPDATE_FAILED');
    }

    return updated;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, data: CancelSubscriptionRequest): Promise<Subscription> {
    const subscription = await this.getSubscription(subscriptionId);
    const stripeSubscriptionId = subscription.stripe_subscription_id;

    if (!stripeSubscriptionId) {
      throw new ValidationError('Cannot cancel free subscription');
    }

    if (data.immediately) {
      await this.stripe.subscriptions.cancel(stripeSubscriptionId);
    } else {
      await this.stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }

    const updates: Partial<Subscription> = {
      cancel_at_period_end: !data.immediately,
      canceled_at: data.immediately ? new Date().toISOString() : subscription.canceled_at,
      status: data.immediately ? 'canceled' : subscription.status,
    };

    const { data: updated, error } = await this.supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', subscriptionId)
      .select()
      .single();

    if (error || !updated) {
      throw new AppError('Failed to cancel subscription', 500, 'SUBSCRIPTION_CANCEL_FAILED');
    }

    return updated;
  }

  /**
   * Create Stripe checkout session
   */
  async createCheckoutSession(data: CreateSubscriptionRequest): Promise<SubscriptionCheckoutSession> {
    const { business_id, plan, success_url, cancel_url, trial_days } = data;

    if (plan === 'free') {
      throw new ValidationError('Cannot create checkout for free plan');
    }

    const subscription = await this.getSubscriptionByBusiness(business_id);
    if (subscription) {
      throw new ConflictError('Subscription already exists');
    }

    const { data: business } = await this.supabase
      .from('businesses')
      .select('id, name, email, stripe_customer_id')
      .eq('id', business_id)
      .single();

    if (!business) {
      throw new NotFoundError('Business');
    }

    let stripeCustomerId = business.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: business.email,
        name: business.name,
        metadata: { business_id: business.id },
      });
      stripeCustomerId = customer.id;

      await this.supabase
        .from('businesses')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', business_id);
    }

    const priceId = await this.getOrCreatePriceId(plan, 'monthly');

    const session = await this.stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: success_url || `${process.env.FRONTEND_URL}/dashboard/billing?success=true`,
      cancel_url: cancel_url || `${process.env.FRONTEND_URL}/dashboard/billing?canceled=true`,
      subscription_data: {
        trial_period_days: trial_days || SUBSCRIPTION_CONSTANTS.TRIAL_DAYS,
        metadata: { business_id, plan },
      },
      metadata: { business_id, plan },
    });

    return {
      session_id: session.id,
      url: session.url!,
    };
  }

  /**
   * Create billing portal session
   */
  async createBillingPortalSession(businessId: string, returnUrl?: string): Promise<BillingPortalSession> {
    const subscription = await this.getSubscriptionByBusiness(businessId);

    if (!subscription || !subscription.stripe_customer_id) {
      throw new NotFoundError('No billing account found');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl || `${process.env.FRONTEND_URL}/dashboard/billing`,
    });

    return { url: session.url };
  }

  /**
   * Get invoices for a subscription
   */
  async getInvoices(subscriptionId: string): Promise<Invoice[]> {
    const subscription = await this.getSubscription(subscriptionId);

    if (!subscription.stripe_customer_id) {
      return [];
    }

    const invoices = await this.stripe.invoices.list({
      customer: subscription.stripe_customer_id,
      limit: 50,
    });

    return invoices.data.map(inv => ({
      id: inv.id,
      subscription_id: subscriptionId,
      amount: inv.amount_paid,
      currency: inv.currency.toUpperCase(),
      status: inv.status as Invoice['status'],
      invoice_url: inv.hosted_invoice_url || '',
      pdf_url: inv.invoice_pdf || '',
      period_start: new Date(inv.period_start * 1000).toISOString(),
      period_end: new Date(inv.period_end * 1000).toISOString(),
      created_at: new Date(inv.created * 1000).toISOString(),
    }));
  }

  /**
   * Track usage
   */
  async trackUsage(subscriptionId: string, metric: UsageMetric, count: number = 1): Promise<void> {
    const subscription = await this.getSubscription(subscriptionId);

    // Check if we're in the current billing period
    const now = new Date();
    const periodStart = new Date(subscription.current_period_start);
    const periodEnd = new Date(subscription.current_period_end);

    if (now < periodStart || now > periodEnd) {
      // Reset usage for new period
      await this.resetUsageCounters(subscriptionId);
    }

    // Increment usage counter
    await this.supabase.rpc('increment_usage', {
      p_subscription_id: subscriptionId,
      p_metric: metric,
      p_count: count,
    });
  }

  /**
   * Get usage summary for subscription
   */
  async getUsageSummary(subscriptionId: string): Promise<UsageSummary> {
    const subscription = await this.getSubscription(subscriptionId);
    const limits = getPlanLimits(subscription.plan);

    // Get current period usage
    const { data: usageRecords } = await this.supabase
      .from('usage_records')
      .select('metric, count')
      .eq('subscription_id', subscriptionId)
      .eq('period_start', subscription.current_period_start)
      .eq('period_end', subscription.current_period_end);

    const usageMap = new Map<UsageMetric, number>();
    usageRecords?.forEach(r => {
      usageMap.set(r.metric, (usageMap.get(r.metric) || 0) + r.count);
    });

    return this.calculateUsageSummary(Object.fromEntries(usageMap), limits);
  }

  /**
   * Calculate usage summary
   */
  private calculateUsageSummary(
    usage: Partial<Record<UsageMetric, number>>,
    limits: PlanLimits
  ): UsageSummary {
    return {
      review_generations: this.calculateMetricUsage(usage.review_generations || 0, limits.review_generations),
      google_redirects: this.calculateMetricUsage(usage.google_redirects || 0, limits.google_redirects),
      qr_codes: this.calculateMetricUsage(usage.qr_codes || 0, limits.qr_codes),
      team_members: this.calculateMetricUsage(usage.team_members || 0, limits.team_members),
    };
  }

  /**
   * Calculate individual metric usage
   */
  private calculateMetricUsage(used: number, limit: number | null): { used: number; limit: number | null; percentage: number } {
    if (limit === null) {
      return { used, limit: null, percentage: 0 };
    }
    return {
      used,
      limit,
      percentage: limit > 0 ? Math.round((used / limit) * 10000) / 100 : 0,
    };
  }

  /**
   * Reset usage counters for new billing period
   */
  private async resetUsageCounters(subscriptionId: string): Promise<void> {
    const subscription = await this.getSubscription(subscriptionId);

    await this.supabase
      .from('usage_records')
      .upsert({
        subscription_id: subscriptionId,
        metric: 'review_generations',
        count: 0,
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
      }, { onConflict: 'subscription_id,metric,period_start,period_end' });

    await this.supabase
      .from('usage_records')
      .upsert({
        subscription_id: subscriptionId,
        metric: 'google_redirects',
        count: 0,
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
      }, { onConflict: 'subscription_id,metric,period_start,period_end' });

    await this.supabase
      .from('usage_records')
      .upsert({
        subscription_id: subscriptionId,
        metric: 'qr_codes',
        count: 0,
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
      }, { onConflict: 'subscription_id,metric,period_start,period_end' });

    await this.supabase
      .from('usage_records')
      .upsert({
        subscription_id: subscriptionId,
        metric: 'team_members',
        count: 0,
        period_start: subscription.current_period_start,
        period_end: subscription.current_period_end,
      }, { onConflict: 'subscription_id,metric,period_start,period_end' });
  }

  /**
   * Get or create Stripe price ID for plan
   */
  private async getOrCreatePriceId(plan: SubscriptionPlan, interval: 'monthly' | 'yearly'): Promise<string> {
    // In production, these would be stored in environment variables or database
    // For now, we'll use a mapping that should match Stripe dashboard
    const priceIds: Record<SubscriptionPlan, { monthly: string; yearly: string }> = {
      free: { monthly: '', yearly: '' },
      starter: { monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || '', yearly: process.env.STRIPE_PRICE_STARTER_YEARLY || '' },
      professional: { monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || '', yearly: process.env.STRIPE_PRICE_PROFESSIONAL_YEARLY || '' },
      enterprise: { monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '', yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || '' },
    };

    const priceId = priceIds[plan]?.[interval];

    if (!priceId) {
      // Create price if not exists
      const amount = getPlanPrice(plan, interval);
      const product = await this.stripe.products.create({
        name: `ReviewAI ${SUBSCRIPTION_CONSTANTS.PLANS[plan].name}`,
        metadata: { plan, interval },
      });

      const stripeInterval = interval === 'monthly' ? 'month' : 'year';
      const price = await this.stripe.prices.create({
        product: product.id,
        unit_amount: amount,
        currency: 'usd',
        recurring: { interval: stripeInterval },
        metadata: { plan, interval },
      });

      return price.id;
    }

    return priceId;
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.syncSubscriptionFromStripe(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }
  }

  /**
   * Sync subscription from Stripe
   */
  private async syncSubscriptionFromStripe(stripeSub: Stripe.Subscription): Promise<void> {
    const businessId = stripeSub.metadata.business_id;
    if (!businessId) return;

    const status = stripeSub.status as SubscriptionStatus;
    const plan = stripeSub.metadata.plan as SubscriptionPlan || 'free';

    await this.supabase
      .from('subscriptions')
      .upsert({
        business_id: businessId,
        stripe_customer_id: stripeSub.customer as string,
        stripe_subscription_id: stripeSub.id,
        stripe_price_id: stripeSub.items.data[0]?.price.id || null,
        status,
        plan,
        current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
        cancel_at_period_end: stripeSub.cancel_at_period_end,
        canceled_at: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000).toISOString() : null,
        trial_start: stripeSub.trial_start ? new Date(stripeSub.trial_start * 1000).toISOString() : null,
        trial_end: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
      }, { onConflict: 'business_id' });
  }

  /**
   * Handle subscription deleted
   */
  private async handleSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
    const businessId = stripeSub.metadata.business_id;
    if (!businessId) return;

    await this.supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        stripe_subscription_id: null,
        stripe_price_id: null,
        plan: 'free',
      })
      .eq('business_id', businessId);
  }

  /**
   * Handle payment succeeded
   */
  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    if (!invoice.subscription) return;

    const stripeSub = await this.stripe.subscriptions.retrieve(invoice.subscription as string);
    await this.syncSubscriptionFromStripe(stripeSub);
  }

  /**
   * Handle payment failed
   */
  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    if (!invoice.subscription) return;

    const stripeSub = await this.stripe.subscriptions.retrieve(invoice.subscription as string);
    await this.syncSubscriptionFromStripe(stripeSub);
  }

  /**
   * Check if business has access to feature
   */
  async checkFeatureAccess(businessId: string, feature: keyof PlanLimits): Promise<boolean> {
    const subscription = await this.getSubscriptionWithUsage(businessId);
    const limit = subscription.limits[feature];

    if (typeof limit === 'boolean') {
      return limit;
    }

    if (limit === null) {
      return true; // unlimited
    }

    const usage = subscription.usage[feature as keyof UsageSummary];
    return usage.used < limit;
  }

  /**
   * Increment QR code count
   */
  async incrementQrCodeCount(businessId: string): Promise<void> {
    const subscription = await this.getSubscriptionByBusiness(businessId);
    if (subscription) {
      await this.trackUsage(subscription.id, 'qr_codes', 1);
    }
  }

  /**
   * Decrement QR code count
   */
  async decrementQrCodeCount(businessId: string): Promise<void> {
    const subscription = await this.getSubscriptionByBusiness(businessId);
    if (subscription) {
      await this.supabase.rpc('decrement_usage', {
        p_subscription_id: subscription.id,
        p_metric: 'qr_codes',
        p_count: 1,
      });
    }
  }

  /**
   * Increment team member count
   */
  async incrementTeamMemberCount(businessId: string): Promise<void> {
    const subscription = await this.getSubscriptionByBusiness(businessId);
    if (subscription) {
      await this.trackUsage(subscription.id, 'team_members', 1);
    }
  }

  /**
   * Decrement team member count
   */
  async decrementTeamMemberCount(businessId: string): Promise<void> {
    const subscription = await this.getSubscriptionByBusiness(businessId);
    if (subscription) {
      await this.supabase.rpc('decrement_usage', {
        p_subscription_id: subscription.id,
        p_metric: 'team_members',
        p_count: 1,
      });
    }
  }
}