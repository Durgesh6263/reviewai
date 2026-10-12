/**
 * Razorpay Payment & Activation Service
 * ReviewAI SaaS Platform
 * 
 * Handles server-authoritative order creation, HMAC-SHA256 payment signature verification,
 * idempotent webhook processing, trial-to-paid activation, and payment history.
 * 
 * Security:
 * - Razorpay secret key is NEVER exposed to the frontend.
 * - Frontend payment callbacks are NEVER trusted alone; server-side verification is mandatory.
 * - Idempotent processing prevents duplicate subscriptions or activations.
 */

import crypto from 'crypto';
import axios from 'axios';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/logger';
import { ValidationError, AppError, AuthorizationError, NotFoundError } from '../../shared/exceptions';
import { planConfigService } from '../admin/plan-config-service';
import { entitlementService, BusinessEntitlement } from '../subscription/entitlement';

export interface RazorpayOrderDetails {
  order_id: string;
  amount: number; // in paise (e.g. 249900)
  currency: string;
  key_id: string;
  business_id: string;
  plan_id: string;
  plan_name: string;
  duration_months: number;
  plan_version_id: string;
  price_inr: number;
  created_at: string;
}

export interface PaymentVerificationParams {
  business_id: string;
  plan_id?: string;
  duration_months?: 1 | 6 | 12;
  plan_version_id?: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  user_id: string;
  user_email?: string;
  amount?: number;
}

export interface PaymentHistoryRecord {
  id: string;
  user_id: string;
  user_email?: string;
  business_id: string;
  business_name?: string;
  plan_id: string;
  plan_name: string;
  plan_version_id: string;
  duration_months: number;
  amount_inr: number;
  amount_cents: number;
  currency: string;
  razorpay_order_id: string;
  razorpay_payment_id?: string;
  status: 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'PENDING' | 'CREATED';
  verification_source?: 'frontend_verified' | 'webhook_verified' | 'pending' | 'failed';
  created_at: string;
}

export class RazorpayService {
  private _keyId?: string;
  private _keySecret?: string;
  private _webhookSecret?: string;

  // In-memory order cache to validate server-created order integrity
  private orderCache = new Map<string, RazorpayOrderDetails>();
  // Processed payment IDs set for rapid in-memory idempotency check
  private processedPayments = new Set<string>();
  // In-flight concurrency lock to avoid frontend + webhook race conditions
  private processingLocks = new Map<string, Promise<any>>();

  constructor(private supabase: SupabaseClient = supabaseAdmin) {
    this._keyId = process.env.RAZORPAY_KEY_ID;
    this._keySecret = process.env.RAZORPAY_KEY_SECRET;
    this._webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  }

  get keyId(): string {
    return process.env.RAZORPAY_KEY_ID || this._keyId || 'rzp_test_TlEX9SgJLgWuWC';
  }

  get keySecret(): string {
    return process.env.RAZORPAY_KEY_SECRET || this._keySecret || 'aPma1OvKUzwxLL99M9NABte3';
  }

  get webhookSecret(): string {
    return process.env.RAZORPAY_WEBHOOK_SECRET || this._webhookSecret || 'rzp_whsec_reviewai_dev_123';
  }

  getPublicKey(): string {
    return this.keyId;
  }

  /**
   * Helper: Check for recent unexpired pending order to prevent duplicate order generation
   * Reuses order if requested within 15 minutes for the same business, plan, duration and version.
   */
  async findRecentPendingOrder(
    businessId: string,
    planId: string,
    durationMonths: number,
    planVersionId?: string
  ): Promise<RazorpayOrderDetails | null> {
    const PENDING_ORDER_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    const now = Date.now();

    // 1. Check in-memory order cache
    const cachedOrders = Array.from(this.orderCache.values());
    for (const order of cachedOrders) {
      if (
        order.business_id === businessId &&
        order.plan_id === planId &&
        order.duration_months === durationMonths &&
        (!planVersionId || order.plan_version_id === planVersionId)
      ) {
        const orderTime = new Date(order.created_at).getTime();
        if (now - orderTime < PENDING_ORDER_WINDOW_MS) {
          return order;
        }
      }
    }

    // 2. Check persistent admin_settings payment_history
    try {
      const { data: settings } = await this.supabase
        .from('admin_settings')
        .select('limits')
        .limit(1)
        .maybeSingle();

      const history: PaymentHistoryRecord[] = Array.isArray(settings?.limits?.payment_history)
        ? settings.limits.payment_history
        : [];

      const match = history.find((p) =>
        p.business_id === businessId &&
        p.plan_id === planId &&
        p.duration_months === durationMonths &&
        p.status === 'PENDING' &&
        (!planVersionId || p.plan_version_id === planVersionId) &&
        (now - new Date(p.created_at).getTime() < PENDING_ORDER_WINDOW_MS)
      );

      if (match) {
        const details: RazorpayOrderDetails = {
          order_id: match.razorpay_order_id,
          amount: match.amount_cents,
          currency: match.currency || 'INR',
          key_id: this.getPublicKey(),
          business_id: match.business_id,
          plan_id: match.plan_id,
          plan_name: match.plan_name,
          duration_months: match.duration_months,
          plan_version_id: match.plan_version_id,
          price_inr: match.amount_inr,
          created_at: match.created_at,
        };
        this.orderCache.set(match.razorpay_order_id, details);
        return details;
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Failed to check recent pending orders from DB');
    }

    return null;
  }

  /**
   * Helper: Record pending order in admin_settings.limits.payment_history
   */
  async recordPendingOrder(record: {
    user_id: string;
    user_email?: string;
    business_id: string;
    business_name?: string;
    plan_id: string;
    plan_name: string;
    plan_version_id: string;
    duration_months: number;
    amount_inr: number;
    amount_cents: number;
    currency: string;
    razorpay_order_id: string;
  }): Promise<PaymentHistoryRecord> {
    const paymentId = `order_rec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const fullRecord: PaymentHistoryRecord = {
      id: paymentId,
      ...record,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    };

    try {
      const { data: settings } = await this.supabase
        .from('admin_settings')
        .select('id, limits')
        .limit(1)
        .maybeSingle();

      const limits = settings?.limits || {};
      const history: PaymentHistoryRecord[] = Array.isArray(limits.payment_history)
        ? [...limits.payment_history]
        : [];

      // Avoid duplicates with the same razorpay_order_id
      const existingIdx = history.findIndex((p) => p.razorpay_order_id === record.razorpay_order_id);
      if (existingIdx >= 0) {
        history[existingIdx] = { ...history[existingIdx], ...fullRecord };
      } else {
        history.unshift(fullRecord);
      }

      limits.payment_history = history.slice(0, 1000);

      if (settings?.id) {
        await this.supabase
          .from('admin_settings')
          .update({ limits, updated_at: new Date().toISOString() })
          .eq('id', settings.id);
      } else {
        await this.supabase
          .from('admin_settings')
          .insert({ limits, updated_at: new Date().toISOString() });
      }
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Failed to record pending order in admin_settings');
    }

    return fullRecord;
  }

  /**
   * Helper: Find order by razorpay_order_id in cache or database
   */
  async findOrderRecord(orderId: string): Promise<PaymentHistoryRecord | null> {
    // 1. Check in-memory cache
    const cached = this.orderCache.get(orderId);

    // 2. Check persistent DB history
    try {
      const { data: settings } = await this.supabase
        .from('admin_settings')
        .select('limits')
        .limit(1)
        .maybeSingle();

      const history: PaymentHistoryRecord[] = Array.isArray(settings?.limits?.payment_history)
        ? settings.limits.payment_history
        : [];

      const found = history.find((p) => p.razorpay_order_id === orderId);
      if (found) {
        return found;
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Error looking up order in database');
    }

    if (cached) {
      return {
        id: `cached_${orderId}`,
        user_id: '',
        business_id: cached.business_id,
        plan_id: cached.plan_id,
        plan_name: cached.plan_name,
        plan_version_id: cached.plan_version_id,
        duration_months: cached.duration_months,
        amount_inr: cached.price_inr,
        amount_cents: cached.amount,
        currency: cached.currency,
        razorpay_order_id: cached.order_id,
        status: 'PENDING',
        created_at: cached.created_at,
      };
    }

    return null;
  }

  /**
   * Helper: Record failed payment status in admin_settings
   */
  async recordFailedPayment(params: {
    user_id?: string;
    user_email?: string;
    business_id?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    reason?: string;
  }): Promise<void> {
    try {
      const { data: settings } = await this.supabase
        .from('admin_settings')
        .select('id, limits')
        .limit(1)
        .maybeSingle();

      const limits = settings?.limits || {};
      const history: PaymentHistoryRecord[] = Array.isArray(limits.payment_history)
        ? [...limits.payment_history]
        : [];

      if (params.razorpay_order_id) {
        const existingIdx = history.findIndex((p) => p.razorpay_order_id === params.razorpay_order_id);
        if (existingIdx >= 0) {
          history[existingIdx] = {
            ...history[existingIdx],
            status: 'FAILED',
            razorpay_payment_id: params.razorpay_payment_id || history[existingIdx].razorpay_payment_id,
          };
          limits.payment_history = history.slice(0, 1000);
          if (settings?.id) {
            await this.supabase
              .from('admin_settings')
              .update({ limits, updated_at: new Date().toISOString() })
              .eq('id', settings.id);
          }
        }
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Failed to record failed payment');
    }
  }

  /**
   * 1. CREATE RAZORPAY ORDER
   * Server validates active offering and loads authoritative price from Admin configuration.
   * Never trusts frontend price, quota, or duration.
   * Validates plan is active and version is not archived.
   * Reuses unexpired pending orders to prevent duplicate order generation.
   * Does NOT activate subscription or modify existing entitlement records.
   */
  async createOrder(params: {
    businessId: string;
    planId: string;
    durationMonths: number;
    planVersionId?: string;
    userId: string;
    userEmail?: string;
  }): Promise<RazorpayOrderDetails> {
    const { businessId, planId, durationMonths, userId } = params;

    // Validate business exists
    const { data: business, error: bizError } = await this.supabase
      .from('businesses')
      .select('id, name, owner_id')
      .eq('id', businessId)
      .maybeSingle();

    if (bizError || !business) {
      throw new NotFoundError('Business not found');
    }

    // Validate duration is supported: 1, 6, or 12 months
    if (![1, 6, 12].includes(durationMonths)) {
      throw new ValidationError('Invalid duration. Supported durations are 1, 6, or 12 months.');
    }

    // Authoritative lookup from Admin plan catalog
    const allPlans = await planConfigService.getPlans(true);
    const plan = allPlans.find((p) => p.id === planId);

    if (!plan) {
      throw new ValidationError(`Plan '${planId}' does not exist.`);
    }

    if (!plan.is_active) {
      throw new ValidationError(`Plan '${plan.name || planId}' is deactivated and unavailable for purchase.`);
    }

    // Resolve target version
    let targetVersion = plan.versions.find((v) => v.status === 'active');
    if (params.planVersionId) {
      const specific = plan.versions.find((v) =>
        v.version_number === Number(params.planVersionId) ||
        `${plan.id}_v${v.version_number}` === params.planVersionId
      );
      if (!specific) {
        throw new ValidationError(`Requested plan version '${params.planVersionId}' does not exist.`);
      }
      if (specific.status === 'archived') {
        throw new ValidationError(`Requested plan version '${params.planVersionId}' is archived and cannot be purchased.`);
      }
      if (specific.status !== 'active') {
        throw new ValidationError(`Requested plan version '${params.planVersionId}' is not available for purchase.`);
      }
      targetVersion = specific;
    }

    if (!targetVersion) {
      throw new ValidationError(`No active purchase version found for plan '${plan.name}'.`);
    }

    const durationKey = `${durationMonths}_month${durationMonths > 1 ? 's' : ''}` as '1_month' | '6_months' | '12_months';
    const offering = targetVersion.durations?.[durationKey];
    if (!offering || typeof offering.price_inr !== 'number' || offering.price_inr < 0) {
      throw new ValidationError(`Duration offering '${durationMonths} months' not available for plan '${plan.name}'.`);
    }

    // Authoritative price calculation (in INR and paise)
    const authoritativePriceInr = Number(offering.price_inr);
    const amountInPaise = Math.round(authoritativePriceInr * 100);
    const resolvedVersionId = `${plan.id}_v${targetVersion.version_number}`;

    // Prevent accidental duplicate order creation: Reuse existing pending order if active within 15 mins
    const existingPending = await this.findRecentPendingOrder(
      businessId,
      planId,
      durationMonths,
      resolvedVersionId
    );
    if (existingPending) {
      logger.info(
        { orderId: existingPending.order_id, businessId, planId, durationMonths },
        'Reusing recent pending Razorpay order to prevent duplicate creation'
      );
      return existingPending;
    }

    const receipt = `rcpt_${Date.now()}_${businessId.slice(0, 8)}`;
    let orderId: string;

    // Create Razorpay API order in TEST MODE
    try {
      const authHeader = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
      const response = await axios.post(
        'https://api.razorpay.com/v1/orders',
        {
          amount: amountInPaise,
          currency: 'INR',
          receipt,
          notes: {
            business_id: businessId,
            user_id: userId,
            plan_id: planId,
            plan_name: plan.name,
            duration_months: String(durationMonths),
            plan_version_id: resolvedVersionId,
            price_inr: String(authoritativePriceInr),
          },
        },
        {
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      orderId = response.data.id;
    } catch (apiError: any) {
      logger.error(
        {
          status: apiError?.response?.status,
          message: apiError?.response?.data?.error?.description || apiError?.message,
        },
        'Razorpay API order creation failed'
      );
      throw new AppError(
        'Unable to create payment order with gateway. Please try again.',
        502,
        'GATEWAY_ERROR'
      );
    }

    const orderDetails: RazorpayOrderDetails = {
      order_id: orderId,
      amount: amountInPaise,
      currency: 'INR',
      key_id: this.keyId,
      business_id: businessId,
      plan_id: planId,
      plan_name: plan.name,
      duration_months: durationMonths,
      plan_version_id: resolvedVersionId,
      price_inr: authoritativePriceInr,
      created_at: new Date().toISOString(),
    };

    // Cache order details
    this.orderCache.set(orderId, orderDetails);

    // Record pending order in payment history (does NOT activate subscription)
    await this.recordPendingOrder({
      user_id: userId,
      user_email: params.userEmail,
      business_id: businessId,
      business_name: business.name,
      plan_id: planId,
      plan_name: plan.name,
      plan_version_id: resolvedVersionId,
      duration_months: durationMonths,
      amount_inr: authoritativePriceInr,
      amount_cents: amountInPaise,
      currency: 'INR',
      razorpay_order_id: orderId,
    });

    logger.info(
      { orderId, businessId, planId, durationMonths, amountInPaise },
      'Razorpay test mode order created and pending record saved'
    );

    return orderDetails;
  }

  /**
   * 2. PAYMENT VERIFICATION & PLAN ACTIVATION
   * Server verifies payment signature with Razorpay secret.
   * Protects against fake payment success, modified amounts, and replay attacks.
   */
  async verifyPayment(params: PaymentVerificationParams): Promise<{
    success: boolean;
    message: string;
    subscription: BusinessEntitlement;
    payment_id: string;
    already_processed?: boolean;
  }> {
    const {
      business_id,
      plan_id,
      duration_months,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      user_id,
      user_email,
      amount,
    } = params;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new ValidationError('Missing required Razorpay payment identifiers.');
    }

    // 1. Verify HMAC SHA-256 signature using server-side RAZORPAY_KEY_SECRET
    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      logger.error(
        { razorpay_order_id, razorpay_payment_id },
        'Payment signature verification failed'
      );
      // Persist failed status in payment record
      await this.recordFailedPayment({
        business_id,
        user_id,
        user_email,
        razorpay_order_id,
        razorpay_payment_id,
        reason: 'INVALID_SIGNATURE',
      });
      throw new ValidationError('Payment verification failed: Invalid signature.');
    }

    // 2. Idempotency Check: Prevent duplicate payment processing or activations
    if (this.processedPayments.has(razorpay_payment_id)) {
      logger.info(
        { razorpay_payment_id },
        'Payment already processed (in-memory idempotency check). Returning existing subscription.'
      );
      const existingEntitlement = await entitlementService.getBusinessEntitlement(business_id);
      return {
        success: true,
        message: 'Payment already processed and verified.',
        subscription: existingEntitlement,
        payment_id: razorpay_payment_id,
        already_processed: true,
      };
    }

    // Check DB payment history for idempotency
    const existingPayment = await this.findPaymentRecord(razorpay_payment_id);
    if (existingPayment && existingPayment.status === 'SUCCESS') {
      this.processedPayments.add(razorpay_payment_id);
      logger.info(
        { razorpay_payment_id },
        'Payment already recorded in database. Returning existing subscription.'
      );
      const existingEntitlement = await entitlementService.getBusinessEntitlement(business_id);
      return {
        success: true,
        message: 'Payment already processed and verified.',
        subscription: existingEntitlement,
        payment_id: razorpay_payment_id,
        already_processed: true,
      };
    }

    // 3. Verify order exists in our server database/cache
    const pendingOrder = await this.findOrderRecord(razorpay_order_id);
    if (!pendingOrder) {
      throw new NotFoundError(`Payment order '${razorpay_order_id}' not found in server records.`);
    }

    // 4. Verify order belongs to the authenticated user and correct business context
    if (pendingOrder.business_id && pendingOrder.business_id !== business_id) {
      throw new AuthorizationError('Payment order business does not match request business context.');
    }
    if (pendingOrder.user_id && pendingOrder.user_id !== user_id) {
      throw new AuthorizationError('Payment order user does not match authenticated user context.');
    }

    // 5. Verify plan, duration, and version match original pending order
    const resolvedPlanId = pendingOrder.plan_id || plan_id;
    const resolvedDuration = (pendingOrder.duration_months || duration_months) as 1 | 6 | 12;
    const resolvedVersionId = pendingOrder.plan_version_id || params.plan_version_id;

    if (plan_id && pendingOrder.plan_id && plan_id !== pendingOrder.plan_id) {
      throw new ValidationError('Payment plan does not match original order plan.');
    }
    if (duration_months && pendingOrder.duration_months && Number(duration_months) !== Number(pendingOrder.duration_months)) {
      throw new ValidationError('Payment duration does not match original order duration.');
    }
    if (params.plan_version_id && pendingOrder.plan_version_id && params.plan_version_id !== pendingOrder.plan_version_id) {
      throw new ValidationError('Payment plan version does not match original order version.');
    }

    // 6. Verify amount tampering (client amount must never override server amount)
    if (amount !== undefined) {
      if (amount !== pendingOrder.amount_cents && amount !== pendingOrder.amount_inr) {
        await this.recordFailedPayment({
          business_id,
          user_id,
          razorpay_order_id,
          razorpay_payment_id,
          reason: 'AMOUNT_MISMATCH',
        });
        throw new ValidationError('Payment amount does not match authoritative order amount.');
      }
    }

    // 7. Authoritative synchronized activation using exact captured plan and version
    return await this.processVerifiedPayment({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      businessId: business_id,
      userId: user_id,
      userEmail: user_email || pendingOrder.user_email,
      businessName: pendingOrder.business_name,
      planId: resolvedPlanId || 'base',
      durationMonths: resolvedDuration,
      planVersionId: resolvedVersionId,
      amountInr: pendingOrder.amount_inr,
      amountCents: pendingOrder.amount_cents,
      currency: pendingOrder.currency || 'INR',
      verificationSource: 'frontend_verified',
    });
  }

  /**
   * Internal synchronized activation method for verified payments.
   * Ensures that if frontend verification and webhook arrive concurrently,
   * only ONE execution performs the activation, while the other waits
   * and safely returns already_processed: true.
   */
  async processVerifiedPayment(params: {
    paymentId: string;
    orderId: string;
    businessId: string;
    userId: string;
    userEmail?: string;
    businessName?: string;
    planId: string;
    durationMonths: 1 | 6 | 12;
    planVersionId?: string;
    amountInr: number;
    amountCents: number;
    currency?: string;
    verificationSource: 'frontend_verified' | 'webhook_verified';
  }): Promise<{
    success: boolean;
    message: string;
    subscription: BusinessEntitlement;
    payment_id: string;
    already_processed?: boolean;
  }> {
    const { paymentId, businessId } = params;

    // 1. Fast in-memory idempotency check
    if (this.processedPayments.has(paymentId)) {
      logger.info({ paymentId }, 'Payment already processed (in-memory idempotency check)');
      const existingEntitlement = await entitlementService.getBusinessEntitlement(businessId);
      return {
        success: true,
        message: 'Payment already processed and verified.',
        subscription: existingEntitlement,
        payment_id: paymentId,
        already_processed: true,
      };
    }

    // 2. Database idempotency check
    const existingPayment = await this.findPaymentRecord(paymentId);
    if (existingPayment && existingPayment.status === 'SUCCESS') {
      this.processedPayments.add(paymentId);
      logger.info({ paymentId }, 'Payment already recorded in database (db idempotency check)');
      const existingEntitlement = await entitlementService.getBusinessEntitlement(businessId);
      return {
        success: true,
        message: 'Payment already processed and verified.',
        subscription: existingEntitlement,
        payment_id: paymentId,
        already_processed: true,
      };
    }

    // 3. Concurrency lock check: wait if another thread/request is currently processing this payment
    const activeLock = this.processingLocks.get(paymentId);
    if (activeLock) {
      logger.info({ paymentId }, 'Awaiting in-flight payment processing lock to resolve race condition');
      await activeLock;
      const existingEntitlement = await entitlementService.getBusinessEntitlement(businessId);
      return {
        success: true,
        message: 'Payment already processed and verified.',
        subscription: existingEntitlement,
        payment_id: paymentId,
        already_processed: true,
      };
    }

    // 4. Acquire Lock
    let lockResolver: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      lockResolver = resolve;
    });
    this.processingLocks.set(paymentId, lockPromise);

    try {
      // Re-verify idempotency inside lock
      if (this.processedPayments.has(paymentId)) {
        const existingEntitlement = await entitlementService.getBusinessEntitlement(businessId);
        return {
          success: true,
          message: 'Payment already processed and verified.',
          subscription: existingEntitlement,
          payment_id: paymentId,
          already_processed: true,
        };
      }

      // Fetch authoritative plan config for exact purchased version
      const durationKey = `${params.durationMonths}_month${params.durationMonths > 1 ? 's' : ''}` as '1_month' | '6_months' | '12_months';
      const allPlans = await planConfigService.getPlans(true);
      const plan = allPlans.find((p) => p.id === params.planId);
      if (!plan) {
        throw new ValidationError(`Plan '${params.planId}' does not exist.`);
      }

      const versionNum = Number(String(params.planVersionId).match(/_v(\d+)$/)?.[1]) || 1;
      const targetVersion =
        plan.versions?.find((v) => v.version_number === versionNum) ||
        plan.versions?.find((v) => v.status === 'active') ||
        plan.versions?.[0];

      const offering = targetVersion?.durations?.[durationKey];
      if (!offering) {
        throw new ValidationError(`Duration '${params.durationMonths}' not supported for plan '${params.planId}'.`);
      }

      const authoritativePriceInr = params.amountInr || Number(offering.price_inr);
      const monthlyQr = Number(offering.monthly_qr_quota ?? offering.allocated_qr_quota ?? 200);
      const monthlyAi = Number(offering.monthly_ai_quota ?? offering.allocated_ai_quota ?? 100);
      const resolvedVersionId = params.planVersionId || `${plan.id}_v${targetVersion?.version_number || 1}`;

      // Activate paid plan via existing entitlement service
      // preserveUsage = false: Trial usage is NOT carried over; monthly usage starts fresh (QR=0, AI=0).
      // Automatically reuses existing eligible QR code without creating a new QR code.
      const activatedEntitlement = await entitlementService.activatePlan({
        businessId: params.businessId,
        ownerId: params.userId,
        planId: params.planId,
        durationMonths: params.durationMonths,
        versionNumber: (targetVersion as any)?.version_number || (plan as any)?.version_number || 1,
        planVersionId: resolvedVersionId,
        price: authoritativePriceInr,
        qrQuota: monthlyQr,
        aiQuota: monthlyAi,
        maxQRCodes: offering.max_qr_codes,
        features: plan.features,
        assignedBy: params.verificationSource === 'webhook_verified' ? 'razorpay_webhook' : 'razorpay_verified',
        preserveUsage: false,
        razorpayOrderId: params.orderId,
        razorpayPaymentId: params.paymentId,
        paymentStatus: 'SUCCESS',
      });

      // Persist payment record
      await this.recordPayment({
        user_id: params.userId,
        user_email: params.userEmail,
        business_id: params.businessId,
        business_name: params.businessName,
        plan_id: params.planId,
        plan_name: plan.name,
        plan_version_id: resolvedVersionId,
        duration_months: params.durationMonths,
        amount_inr: authoritativePriceInr,
        amount_cents: params.amountCents || authoritativePriceInr * 100,
        currency: params.currency || 'INR',
        razorpay_order_id: params.orderId,
        razorpay_payment_id: params.paymentId,
        status: 'SUCCESS',
        verification_source: params.verificationSource,
        created_at: new Date().toISOString(),
      });

      this.processedPayments.add(paymentId);

      logger.info(
        {
          business_id: params.businessId,
          plan_id: params.planId,
          duration_months: params.durationMonths,
          payment_id: params.paymentId,
          source: params.verificationSource,
        },
        'Paid subscription successfully activated and payment record saved'
      );

      return {
        success: true,
        message: 'Payment verified and plan activated successfully.',
        subscription: activatedEntitlement,
        payment_id: paymentId,
        already_processed: false,
      };
    } finally {
      this.processingLocks.delete(paymentId);
      lockResolver!();
    }
  }

  /**
   * 3. WEBHOOK HANDLING
   * Verifies Razorpay webhook signature and handles payment events idempotently.
   */
  async handleWebhook(rawBody: string, signature: string): Promise<{
    status: string;
    message?: string;
    event?: string;
    order_id?: string;
    payment_id?: string;
    subscription?: BusinessEntitlement;
  }> {
    if (!signature) {
      throw new ValidationError('Missing X-Razorpay-Signature webhook header');
    }

    // Verify webhook signature with timing-safe comparison
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      logger.error('Webhook signature mismatch');
      throw new ValidationError('Invalid Razorpay webhook signature');
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new ValidationError('Invalid webhook JSON payload');
    }

    const event = payload.event;
    logger.info({ event }, 'Received verified Razorpay webhook event');

    // Handle payment failed event
    if (event === 'payment.failed') {
      const paymentEntity = payload.payload?.payment?.entity;
      const paymentId = paymentEntity?.id;
      const orderId = paymentEntity?.order_id;
      const errorDesc =
        paymentEntity?.error_description ||
        paymentEntity?.error_reason ||
        'PAYMENT_FAILED_GATEWAY';

      logger.warn({ paymentId, orderId, errorDesc }, 'Webhook: Payment failed event received');

      const internalOrder = orderId ? await this.findOrderRecord(orderId) : null;
      await this.recordFailedPayment({
        business_id: internalOrder?.business_id || paymentEntity?.notes?.business_id || 'unknown_business',
        user_id: internalOrder?.user_id || paymentEntity?.notes?.user_id || 'unknown_user',
        razorpay_order_id: orderId || 'unknown_order',
        razorpay_payment_id: paymentId || `failed_${Date.now()}`,
        reason: errorDesc,
      });

      return {
        status: 'payment_failed_recorded',
        message: 'Payment failure recorded. Subscription remains unchanged.',
        event,
        order_id: orderId,
        payment_id: paymentId,
      };
    }

    // Handle successful payment events
    if (event === 'order.paid' || event === 'payment.captured') {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderEntity = payload.payload?.order?.entity;

      const paymentId = paymentEntity?.id;
      const orderId = paymentEntity?.order_id || orderEntity?.id;

      if (!orderId) {
        logger.warn({ paymentId, event }, 'Webhook: Missing order ID in payload');
        return { status: 'rejected_missing_order_id', event };
      }

      const effectivePaymentId = paymentId || `pay_wh_${orderId}`;

      // Check idempotency: If payment is already processed, do nothing
      if (this.processedPayments.has(effectivePaymentId)) {
        logger.info({ paymentId: effectivePaymentId }, 'Webhook: Payment already processed (idempotent skip)');
        return {
          status: 'already_processed',
          message: 'Payment already processed.',
          event,
          order_id: orderId,
          payment_id: effectivePaymentId,
        };
      }

      const existingRecord = await this.findPaymentRecord(effectivePaymentId);
      if (existingRecord && existingRecord.status === 'SUCCESS') {
        this.processedPayments.add(effectivePaymentId);
        logger.info({ paymentId: effectivePaymentId }, 'Webhook: Payment already recorded in DB (idempotent skip)');
        return {
          status: 'already_processed',
          message: 'Payment already recorded in database.',
          event,
          order_id: orderId,
          payment_id: effectivePaymentId,
        };
      }

      // Requirement 5: Match internal order
      const internalOrder = await this.findOrderRecord(orderId);
      if (!internalOrder) {
        logger.warn(
          { orderId, paymentId: effectivePaymentId, event },
          'Webhook: Unknown order ID - no matching internal order found'
        );
        return {
          status: 'rejected_unknown_order',
          message: `Unknown order ID '${orderId}': no matching internal order record found`,
          event,
          order_id: orderId,
          payment_id: effectivePaymentId,
        };
      }

      // Validate Amount
      const receivedAmount = paymentEntity?.amount;
      if (receivedAmount !== undefined && receivedAmount !== internalOrder.amount_cents) {
        logger.warn(
          { orderId, paymentId: effectivePaymentId, receivedAmount, expected: internalOrder.amount_cents },
          'Webhook: Payment amount mismatch'
        );
        await this.recordFailedPayment({
          business_id: internalOrder.business_id,
          user_id: internalOrder.user_id,
          razorpay_order_id: orderId,
          razorpay_payment_id: effectivePaymentId,
          reason: 'AMOUNT_MISMATCH',
        });
        return {
          status: 'rejected_amount_mismatch',
          message: 'Payment amount mismatch against authoritative order',
          event,
          order_id: orderId,
          payment_id: effectivePaymentId,
        };
      }

      // Validate Currency
      const currency = paymentEntity?.currency || orderEntity?.currency || 'INR';
      if (currency.toUpperCase() !== 'INR') {
        logger.warn({ orderId, currency }, 'Webhook: Currency mismatch (expected INR)');
        return {
          status: 'rejected_currency_mismatch',
          message: 'Currency must be INR',
          event,
          order_id: orderId,
          payment_id: effectivePaymentId,
        };
      }

      // Execute synchronized activation using exact plan/version captured in pending order
      const activationResult = await this.processVerifiedPayment({
        paymentId: effectivePaymentId,
        orderId,
        businessId: internalOrder.business_id,
        userId: internalOrder.user_id,
        userEmail: internalOrder.user_email,
        businessName: internalOrder.business_name,
        planId: internalOrder.plan_id,
        durationMonths: (internalOrder.duration_months || 6) as 1 | 6 | 12,
        planVersionId: internalOrder.plan_version_id,
        amountInr: internalOrder.amount_inr,
        amountCents: internalOrder.amount_cents,
        currency: 'INR',
        verificationSource: 'webhook_verified',
      });

      return {
        status: activationResult.already_processed ? 'already_processed' : 'activated',
        message: activationResult.message,
        event,
        order_id: orderId,
        payment_id: effectivePaymentId,
        subscription: activationResult.subscription,
      };
    }

    return { status: 'unhandled_event', event };
  }

  /**
   * Helper: Record payment in admin_settings.limits.payment_history and invoices
   */
  async recordPayment(record: Omit<PaymentHistoryRecord, 'id'>): Promise<PaymentHistoryRecord> {
    const paymentId = `pay_rec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const fullRecord: PaymentHistoryRecord = {
      id: paymentId,
      ...record,
    };

    // 1. Store in admin_settings.limits.payment_history
    try {
      const { data: settings } = await this.supabase
        .from('admin_settings')
        .select('id, limits')
        .limit(1)
        .maybeSingle();

      const limits = settings?.limits || {};
      const history: PaymentHistoryRecord[] = Array.isArray(limits.payment_history)
        ? [...limits.payment_history]
        : [];

      // Update existing pending order record in-place if it exists, or insert new
      const orderIdx = history.findIndex((p) => p.razorpay_order_id === record.razorpay_order_id);
      if (orderIdx >= 0) {
        history[orderIdx] = {
          ...history[orderIdx],
          ...fullRecord,
          id: history[orderIdx].id,
          status: 'SUCCESS',
        };
      } else if (!history.some((p) => p.razorpay_payment_id === record.razorpay_payment_id)) {
        history.unshift(fullRecord);
      }
      // Keep last 1000 payment records
      limits.payment_history = history.slice(0, 1000);

        if (settings?.id) {
          await this.supabase
            .from('admin_settings')
            .update({ limits, updated_at: new Date().toISOString() })
            .eq('id', settings.id);
        } else {
          await this.supabase
            .from('admin_settings')
            .insert({ limits, updated_at: new Date().toISOString() });
        }
    } catch (err) {
      logger.error({ err }, 'Failed to record payment in admin_settings');
    }

    // 2. Store in invoices table
    try {
      const { data: sub } = await this.supabase
        .from('subscriptions')
        .select('id')
        .eq('business_id', record.business_id)
        .maybeSingle();

      if (sub?.id) {
        await this.supabase.from('invoices').insert({
          id: crypto.randomUUID(),
          subscription_id: sub.id,
          business_id: record.business_id,
          stripe_invoice_id: record.razorpay_payment_id,
          invoice_number: `INV-RZP-${Date.now().toString().slice(-6)}`,
          status: 'paid',
          amount_cents: record.amount_cents,
          amount_paid_cents: record.amount_cents,
          currency: record.currency || 'INR',
          period_start: new Date().toISOString(),
          period_end: new Date(Date.now() + record.duration_months * 30 * 86400000).toISOString(),
          due_date: null,
          paid_at: record.created_at,
          invoice_pdf_url: null,
          hosted_invoice_url: null,
          created_at: record.created_at,
        });
      }
    } catch (invoiceErr) {
      logger.warn({ invoiceErr }, 'Non-fatal error creating invoice row');
    }

    return fullRecord;
  }

  /**
   * Helper: Find payment record by razorpay_payment_id
   */
  async findPaymentRecord(paymentId: string): Promise<PaymentHistoryRecord | null> {
    try {
      const { data: settings } = await this.supabase
        .from('admin_settings')
        .select('limits')
        .limit(1)
        .maybeSingle();

      const history: PaymentHistoryRecord[] = Array.isArray(settings?.limits?.payment_history)
        ? settings.limits.payment_history
        : [];

      return history.find((p) => p.razorpay_payment_id === paymentId) || null;
    } catch {
      return null;
    }
  }

  /**
   * Get payment history (filtered by businessId if provided)
   */
  async getPaymentHistory(businessId?: string): Promise<PaymentHistoryRecord[]> {
    try {
      const { data: settings } = await this.supabase
        .from('admin_settings')
        .select('limits')
        .limit(1)
        .maybeSingle();

      const history: PaymentHistoryRecord[] = Array.isArray(settings?.limits?.payment_history)
        ? settings.limits.payment_history
        : [];

      if (businessId) {
        return history.filter((p) => p.business_id === businessId);
      }
      return history;
    } catch {
      return [];
    }
  }
}

export const razorpayService = new RazorpayService();
