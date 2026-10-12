/**
 * Central Entitlement & Quota Service
 * ReviewAI SaaS Platform
 * 
 * Handles all service access permissions, trial management,
 * non-resetting total quota tracking, multi-condition expiration,
 * and concurrency-safe atomic quota consumption.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/logger';
import { planConfigService } from '../admin/plan-config-service';

export type ServiceType = 'qr_scan' | 'ai_generation' | 'create_qr';

export type BlockReason =
  | 'TRIAL_EXPIRED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'PLAN_EXPIRED'
  | 'TRIAL_QR_QUOTA_EXHAUSTED'
  | 'TRIAL_AI_QUOTA_EXHAUSTED'
  | 'PLAN_QR_QUOTA_EXHAUSTED'
  | 'PLAN_AI_QUOTA_EXHAUSTED'
  | 'QR_QUOTA_EXHAUSTED'
  | 'AI_QUOTA_EXHAUSTED'
  | 'CANCELED'
  | 'SUSPENDED'
  | 'NO_SUBSCRIPTION'
  | 'QR_CODE_LIMIT_REACHED'
  | 'FEATURE_NOT_INCLUDED';

/**
 * Standardize block reasons into Step 9 canonical values:
 * TRIAL_EXPIRED, SUBSCRIPTION_EXPIRED, QR_QUOTA_EXHAUSTED, AI_QUOTA_EXHAUSTED, SUSPENDED, CANCELED
 */
export function normalizeBlockReason(reason?: string | null): BlockReason {
  if (!reason) return 'NO_SUBSCRIPTION';
  if (reason === 'TRIAL_EXPIRED') return 'TRIAL_EXPIRED';
  if (reason === 'PLAN_EXPIRED' || reason === 'SUBSCRIPTION_EXPIRED') return 'SUBSCRIPTION_EXPIRED';
  if (reason === 'QR_QUOTA_EXHAUSTED' || reason === 'PLAN_QR_QUOTA_EXHAUSTED' || reason === 'TRIAL_QR_QUOTA_EXHAUSTED') return 'QR_QUOTA_EXHAUSTED';
  if (reason === 'AI_QUOTA_EXHAUSTED' || reason === 'PLAN_AI_QUOTA_EXHAUSTED' || reason === 'TRIAL_AI_QUOTA_EXHAUSTED') return 'AI_QUOTA_EXHAUSTED';
  if (reason === 'SUSPENDED') return 'SUSPENDED';
  if (reason === 'CANCELED') return 'CANCELED';
  return reason as BlockReason;
}

export interface UsagePeriod {
  period_index: number;
  period_start: string;
  period_end: string;
  next_reset: string;
  is_past_expiry: boolean;
}

export interface MonthlyPeriodHistoryRecord {
  subscription_id: string;
  period_index: number;
  period_start: string;
  period_end: string;
  qr_used: number;
  ai_used: number;
  recorded_at: string;
}

/**
 * Calculate the current monthly usage period relative to subscription start date.
 * E.g. start: 06/10/2026 -> Period 1: 06/10/2026 to 05/11/2026, next reset: 06/11/2026.
 * Anchored to the start date's day-of-month so calendar boundary drifts do not occur.
 */
export function calculateUsagePeriod(
  startDateStr: string,
  expiryDateStr: string,
  asOfDate: Date = new Date()
): UsagePeriod {
  const rawStart = new Date(startDateStr);
  const rawExpiry = new Date(expiryDateStr);
  const nowMs = asOfDate.getTime();
  const expiryMs = rawExpiry.getTime();

  if (nowMs >= expiryMs) {
    return {
      period_index: -1,
      period_start: startDateStr,
      period_end: expiryDateStr,
      next_reset: expiryDateStr,
      is_past_expiry: true,
    };
  }

  // Anchor to UTC day of start date to eliminate arbitrary time-of-day offsets
  const startYear = rawStart.getUTCFullYear();
  const startMonth = rawStart.getUTCMonth();
  const startDay = rawStart.getUTCDate();

  let k = 0;
  while (k < 120) {
    const pStartYear = startYear + Math.floor((startMonth + k) / 12);
    const pStartMonth = (startMonth + k) % 12;
    const maxDaysStart = new Date(Date.UTC(pStartYear, pStartMonth + 1, 0)).getUTCDate();
    const actualStartDay = Math.min(startDay, maxDaysStart);
    const pStart = new Date(Date.UTC(pStartYear, pStartMonth, actualStartDay, 0, 0, 0, 0));

    const pNextYear = startYear + Math.floor((startMonth + k + 1) / 12);
    const pNextMonth = (startMonth + k + 1) % 12;
    const maxDaysNext = new Date(Date.UTC(pNextYear, pNextMonth + 1, 0)).getUTCDate();
    const actualNextDay = Math.min(startDay, maxDaysNext);
    const pNextStart = new Date(Date.UTC(pNextYear, pNextMonth, actualNextDay, 0, 0, 0, 0));

    if (nowMs >= pStart.getTime() && nowMs < pNextStart.getTime()) {
      // Period end is 1 day before the next period starts
      const pEnd = new Date(pNextStart.getTime() - 86400000);
      const effectiveEnd = pEnd.getTime() > expiryMs ? rawExpiry : pEnd;
      const nextReset = pNextStart.getTime() > expiryMs ? rawExpiry : pNextStart;

      return {
        period_index: k,
        period_start: pStart.toISOString(),
        period_end: effectiveEnd.toISOString(),
        next_reset: nextReset.toISOString(),
        is_past_expiry: false,
      };
    }
    k++;
  }

  return {
    period_index: 0,
    period_start: rawStart.toISOString(),
    period_end: rawExpiry.toISOString(),
    next_reset: rawExpiry.toISOString(),
    is_past_expiry: false,
  };
}

/**
 * Calculate usage period boundaries for a specific period index k.
 */
export function calculatePeriodForIndex(
  startDateStr: string,
  expiryDateStr: string,
  k: number
): { period_start: string; period_end: string; next_reset: string } {
  const rawStart = new Date(startDateStr);
  const rawExpiry = new Date(expiryDateStr);
  const expiryMs = rawExpiry.getTime();

  const startYear = rawStart.getUTCFullYear();
  const startMonth = rawStart.getUTCMonth();
  const startDay = rawStart.getUTCDate();

  const pStartYear = startYear + Math.floor((startMonth + k) / 12);
  const pStartMonth = (startMonth + k) % 12;
  const maxDaysStart = new Date(Date.UTC(pStartYear, pStartMonth + 1, 0)).getUTCDate();
  const actualStartDay = Math.min(startDay, maxDaysStart);
  const pStart = new Date(Date.UTC(pStartYear, pStartMonth, actualStartDay, 0, 0, 0, 0));

  const pNextYear = startYear + Math.floor((startMonth + k + 1) / 12);
  const pNextMonth = (startMonth + k + 1) % 12;
  const maxDaysNext = new Date(Date.UTC(pNextYear, pNextMonth + 1, 0)).getUTCDate();
  const actualNextDay = Math.min(startDay, maxDaysNext);
  const pNextStart = new Date(Date.UTC(pNextYear, pNextMonth, actualNextDay, 0, 0, 0, 0));

  const pEnd = new Date(pNextStart.getTime() - 86400000);
  const effectiveEnd = pEnd.getTime() > expiryMs ? rawExpiry : pEnd;
  const nextReset = pNextStart.getTime() > expiryMs ? rawExpiry : pNextStart;

  return {
    period_start: pStart.toISOString(),
    period_end: effectiveEnd.toISOString(),
    next_reset: nextReset.toISOString(),
  };
}

export interface BusinessEntitlement {
  business_id: string;
  subscription_id: string;
  is_trial: boolean;
  status: 'active' | 'trialing' | 'expired' | 'canceled' | 'suspended';
  is_expired: boolean; // Authoritative expiration flag (server time >= end_date or status === expired)
  is_qr_allowed: boolean; // Authoritative QR service access permission
  is_ai_allowed: boolean; // Authoritative AI service access permission
  block_reason?: BlockReason | null;
  plan_id: string;
  plan_version_id: string;
  plan_name: string;
  duration_months: number;
  duration_days?: number;
  price_inr: number;
  start_date: string;
  end_date: string;
  days_remaining: number;

  // Monthly Quota Model
  monthly_qr_quota: number; // -1 = unlimited
  monthly_ai_quota: number; // -1 = unlimited
  monthly_qr_limit?: number; // alias
  monthly_ai_limit?: number; // alias
  current_month_qr_used: number;
  current_month_ai_used: number;
  current_month_qr_remaining: number; // -1 = unlimited
  current_month_ai_remaining: number; // -1 = unlimited

  // Period Information
  current_period_start: string;
  current_period_end: string;
  next_monthly_reset: string;
  current_period_index?: number;

  // Total Quotas (backward compatible fields)
  total_qr_quota: number; // -1 = unlimited
  total_ai_quota: number; // -1 = unlimited
  used_qr: number;
  used_ai: number;
  remaining_qr: number; // -1 = unlimited
  remaining_ai: number; // -1 = unlimited

  max_qr_codes: number;
  features: Record<string, boolean>;
  is_active: boolean; // True if subscription itself is active/trialing and not expired
  exhaustion_reason: BlockReason | null;
  history?: any[];
  monthly_history?: any[];
}

export interface CanUseServiceResult {
  allowed: boolean;
  reason?: BlockReason;
  message?: string;
  entitlement?: BusinessEntitlement;
}

export interface ConsumeQuotaResult {
  success: boolean;
  allowed: boolean;
  reason?: BlockReason;
  remaining_qr?: number;
  remaining_ai?: number;
  error?: string;
}

export class EntitlementService {
  private entitlementCache = new Map<string, { entitlement: BusinessEntitlement; cachedAt: number }>();
  private readonly ENTITLEMENT_CACHE_TTL_MS = 30000; // 30-second in-memory cache for ultra-fast QR scans

  constructor(private supabase: SupabaseClient = supabaseAdmin) {}

  /**
   * Invalidate in-memory entitlement cache for a specific business or all businesses
   */
  invalidateEntitlementCache(businessId?: string): void {
    if (businessId) {
      this.entitlementCache.delete(businessId);
    } else {
      this.entitlementCache.clear();
    }
  }

  /**
   * Helper: Human-friendly error messages for block reasons
   */
  getReasonMessage(reason: BlockReason | string): string {
    const normalized = normalizeBlockReason(reason);
    switch (normalized) {
      case 'TRIAL_EXPIRED':
      case 'SUBSCRIPTION_EXPIRED':
      case 'PLAN_EXPIRED':
        return 'Your subscription has expired.';
      case 'QR_QUOTA_EXHAUSTED':
      case 'PLAN_QR_QUOTA_EXHAUSTED':
      case 'TRIAL_QR_QUOTA_EXHAUSTED':
        return 'Your QR scan quota has been exhausted.';
      case 'AI_QUOTA_EXHAUSTED':
      case 'PLAN_AI_QUOTA_EXHAUSTED':
      case 'TRIAL_AI_QUOTA_EXHAUSTED':
        return 'Your AI generation quota has been exhausted.';
      case 'CANCELED':
        return 'Your subscription has been canceled. Please activate a new plan to resume access.';
      case 'SUSPENDED':
        return 'Your account is suspended. Please contact platform support.';
      case 'QR_CODE_LIMIT_REACHED':
        return 'You have reached the maximum number of QR codes allowed for your plan.';
      case 'FEATURE_NOT_INCLUDED':
        return 'This feature is not included in your current plan.';
      case 'NO_SUBSCRIPTION':
      default:
        return 'No active subscription or trial found. Please choose a plan.';
    }
  }

  /**
   * 1. Get complete server-side entitlement snapshot for a business.
   * Preserves historical version snapshot and calculates accurate remaining limits.
   */
  async getBusinessEntitlement(businessId: string, asOfDate: Date = new Date()): Promise<BusinessEntitlement> {
    const now = asOfDate.getTime();
    const cached = this.entitlementCache.get(businessId);
    if (cached && (now - cached.cachedAt) < this.ENTITLEMENT_CACHE_TTL_MS) {
      // Re-evaluate expiration boundary against asOfDate
      if (!cached.entitlement.is_expired && now >= new Date(cached.entitlement.end_date).getTime()) {
        this.entitlementCache.delete(businessId);
      } else {
        return cached.entitlement;
      }
    }

    // Query the subscription record for this business (business_id has a unique index)
    const { data: sub, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle();

    if (error) {
      logger.error({ error, businessId }, 'Error fetching subscription for entitlement');
    }

    if (!sub) {
      // Auto-activate or provision a trial using admin trial config
      const trialEntitlement = await this.provisionDefaultTrial(businessId);
      this.entitlementCache.set(businessId, { entitlement: trialEntitlement, cachedAt: now });
      return trialEntitlement;
    }

    const isTrial = sub.status === 'trialing' || sub.plan_id === 'free_trial' || sub.plan_id === 'free';
    if (isTrial) {
      const now = asOfDate.getTime();
      const originalEndStr = sub.trial_end || sub.current_period_end;
      const originalEndMs = originalEndStr ? new Date(originalEndStr).getTime() : 0;
      const wasAlreadyExpired = sub.status === 'expired' || (originalEndMs > 0 && originalEndMs <= now);

      if (wasAlreadyExpired) {
        // Expired/completed trials must NOT become active again. Do not extend.
        if (sub.status === 'trialing') {
          await this.supabase
            .from('subscriptions')
            .update({
              status: 'expired',
              updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id);
          sub.status = 'expired';
        }
        try {
          await this.supabase
            .from('qr_codes')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('business_id', businessId)
            .eq('is_active', true);
        } catch (err) {
          logger.warn({ businessId, err }, 'Failed to deactivate QR codes on trial expiry');
        }
        return this.parseSubscriptionRecord(sub, asOfDate);
      }

      // If active trialing, synchronize with authoritative admin trial config
      if (sub.status === 'trialing') {
        const trialConf = await planConfigService.getTrialConfig();
        const meta = sub.metadata || {};
        const isOutOfSync = 
          meta.trial_version !== trialConf.version ||
          meta.allocated_qr_quota !== trialConf.total_qr_quota ||
          meta.allocated_ai_quota !== trialConf.total_ai_quota ||
          meta.duration_days !== trialConf.duration_days ||
          meta.max_qr_codes !== trialConf.max_qr_codes;

        if (isOutOfSync) {
          const startDateStr = sub.trial_start || sub.current_period_start || sub.created_at;
          const startMs = new Date(startDateStr).getTime();
          const newEndMs = startMs + (trialConf.duration_days * 86400000);
          const newEndDateStr = new Date(newEndMs).toISOString();
          const isNowExpired = now >= newEndMs;

          const usedQr = Number(meta.used_qr_quota ?? meta.used_qr ?? 0);
          const usedAi = Number(meta.used_ai_quota ?? meta.used_ai ?? 0);
          const totalQr = trialConf.total_qr_quota;
          const totalAi = trialConf.total_ai_quota;
          const remainingQr = totalQr === -1 ? -1 : Math.max(0, totalQr - usedQr);
          const remainingAi = totalAi === -1 ? -1 : Math.max(0, totalAi - usedAi);

          let exhaustionReason: string | null = null;
          if (isNowExpired) {
            exhaustionReason = 'TRIAL_EXPIRED';
            try {
              await this.supabase
                .from('qr_codes')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('business_id', businessId)
                .eq('is_active', true);
            } catch (err) {
              logger.warn({ businessId, err }, 'Failed to deactivate QR codes on trial expiry sync');
            }
          } else if (totalQr !== -1 && remainingQr <= 0) {
            exhaustionReason = 'QR_QUOTA_EXHAUSTED';
          } else if (totalAi !== -1 && remainingAi <= 0) {
            exhaustionReason = 'AI_QUOTA_EXHAUSTED';
          }

          const newStatus = isNowExpired ? 'expired' : 'trialing';

          const updatedMeta = {
            ...meta,
            duration: `${trialConf.duration_days}_days`,
            duration_days: trialConf.duration_days,
            trial_version: trialConf.version,
            plan_version_id: `trial_v${trialConf.version}`,
            allocated_qr_quota: totalQr,
            allocated_ai_quota: totalAi,
            used_qr_quota: usedQr, // STRICTLY PRESERVED
            used_ai_quota: usedAi, // STRICTLY PRESERVED
            remaining_qr_quota: remainingQr,
            remaining_ai_quota: remainingAi,
            max_qr_codes: trialConf.max_qr_codes,
            features: trialConf.features,
            exhaustion_reason: exhaustionReason,
          };

          await this.supabase
            .from('subscriptions')
            .update({
              status: newStatus,
              current_period_end: newEndDateStr,
              trial_end: newEndDateStr,
              metadata: updatedMeta,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id);

          sub.status = newStatus;
          sub.current_period_end = newEndDateStr;
          sub.trial_end = newEndDateStr;
          sub.metadata = updatedMeta;
        }
      }
    } else if (sub.status === 'active') {
      const meta = sub.metadata || {};
      const startDateStr = sub.current_period_start || sub.created_at;
      const expiryDateStr = sub.current_period_end;
      const period = calculateUsagePeriod(startDateStr, expiryDateStr, asOfDate);
      const isPastExpiry = period.is_past_expiry || (expiryDateStr ? asOfDate.getTime() >= new Date(expiryDateStr).getTime() : false);

      if (isPastExpiry) {
        try {
          await this.supabase
            .from('subscriptions')
            .update({
              status: 'expired',
              updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id);
          sub.status = 'expired';

          await this.supabase
            .from('qr_codes')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('business_id', businessId)
            .eq('is_active', true);
        } catch (err) {
          logger.warn({ businessId, err }, 'Failed to mark expired subscription and deactivate QR codes');
        }
      } else {
        // Paid plan: Check if period rollover is needed
        const storedPeriodIndex = typeof meta.current_period_index === 'number' ? meta.current_period_index : 0;

        if (period.period_index > storedPeriodIndex) {
          const history: MonthlyPeriodHistoryRecord[] = Array.isArray(meta.monthly_history) ? [...meta.monthly_history] : [];

          for (let idx = storedPeriodIndex; idx < period.period_index; idx++) {
            const pIdx = calculatePeriodForIndex(startDateStr, expiryDateStr, idx);
            const pQrUsed = idx === storedPeriodIndex ? Number(meta.current_month_qr_used ?? meta.used_qr_quota ?? meta.used_qr ?? 0) : 0;
            const pAiUsed = idx === storedPeriodIndex ? Number(meta.current_month_ai_used ?? meta.used_ai_quota ?? meta.used_ai ?? 0) : 0;

            if (!history.some(h => h.period_index === idx)) {
              history.push({
                subscription_id: sub.id,
                period_index: idx,
                period_start: pIdx.period_start,
                period_end: pIdx.period_end,
                qr_used: pQrUsed,
                ai_used: pAiUsed,
                recorded_at: asOfDate.toISOString(),
              });
            }
          }

          const monthlyQr = meta.monthly_qr_quota !== undefined 
            ? Number(meta.monthly_qr_quota) 
            : (meta.allocated_qr_quota !== undefined ? Number(meta.allocated_qr_quota) : 200);
          const monthlyAi = meta.monthly_ai_quota !== undefined 
            ? Number(meta.monthly_ai_quota) 
            : (meta.allocated_ai_quota !== undefined ? Number(meta.allocated_ai_quota) : 100);

          const updatedMeta = {
            ...meta,
            current_period_index: period.period_index,
            current_month_qr_used: 0,
            current_month_ai_used: 0,
            current_period_start: period.period_start,
            current_period_end: period.period_end,
            next_monthly_reset: period.next_reset,
            used_qr_quota: 0,
            used_ai_quota: 0,
            remaining_qr_quota: monthlyQr,
            remaining_ai_quota: monthlyAi,
            exhaustion_reason: null,
            monthly_history: history,
          };

          await this.supabase
            .from('subscriptions')
            .update({
              metadata: updatedMeta,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id);

          sub.metadata = updatedMeta;
        }
      }
    }

    const result = this.parseSubscriptionRecord(sub, asOfDate);
    this.entitlementCache.set(businessId, { entitlement: result, cachedAt: asOfDate.getTime() });
    return result;
  }

  /**
   * Parse a DB subscription row into a strict BusinessEntitlement snapshot.
   */
  parseSubscriptionRecord(sub: any, asOfDate: Date = new Date()): BusinessEntitlement {
    const meta = sub.metadata || {};
    const isTrial = sub.status === 'trialing' || sub.plan_id === 'free_trial' || sub.plan_id === 'free';
    const trialLatest = planConfigService.getLatestTrialConfigSync();
    const now = asOfDate.getTime();

    const originalEndStr = sub.trial_end || sub.current_period_end;
    const originalEndMs = originalEndStr ? new Date(originalEndStr).getTime() : 0;
    const wasAlreadyExpired = sub.status === 'expired' || (isTrial && originalEndMs > 0 && originalEndMs <= now);

    const startDateStr = sub.current_period_start || sub.trial_start || sub.created_at;
    const startMs = startDateStr ? new Date(startDateStr).getTime() : now;

    let endMs = originalEndMs;
    let isTimeExpired = false;

    if (isTrial) {
      if (wasAlreadyExpired) {
        // Expired/completed trials must NOT become active again.
        isTimeExpired = true;
        endMs = originalEndMs > 0 ? originalEndMs : now;
      } else if (sub.status === 'trialing') {
        // Active trial: Authoritative duration from latest Admin trial config
        endMs = startMs + ((trialLatest.duration_days || 14) * 86400000);
        isTimeExpired = now >= endMs;
      } else {
        isTimeExpired = originalEndMs > 0 ? now >= originalEndMs : false;
      }
    } else {
      // Paid plan: Immutable snapshot expiry
      isTimeExpired = originalEndMs > 0 ? now >= originalEndMs : false;
    }

    const endDateStr = new Date(endMs).toISOString();
    const daysRemaining = Math.max(0, Math.ceil((endMs - now) / 86400000));

    // Resolve Total Quotas: Active trials ALWAYS resolve the latest Admin Trial Config authoritatively
    let totalQr: number;
    let totalAi: number;
    let maxQrCodes: number;
    let durationDays: number | undefined;
    let features: Record<string, boolean>;
    let planVersionId: string;

    if (isTrial) {
      if (!wasAlreadyExpired && sub.status === 'trialing') {
        // Active trial: Authoritative latest Admin trial configuration with subscription snapshot fallback
        totalQr = meta.allocated_qr_quota !== undefined ? Number(meta.allocated_qr_quota) : trialLatest.total_qr_quota;
        totalAi = meta.allocated_ai_quota !== undefined ? Number(meta.allocated_ai_quota) : trialLatest.total_ai_quota;
        maxQrCodes = meta.max_qr_codes !== undefined ? Number(meta.max_qr_codes) : trialLatest.max_qr_codes;
        durationDays = meta.duration_days !== undefined ? Number(meta.duration_days) : trialLatest.duration_days;
        features = meta.features || trialLatest.features;
        planVersionId = meta.plan_version_id || `trial_v${trialLatest.version || 1}`;
      } else {
        // Expired or historic trial: preserve snapshot or fallback
        totalQr = meta.allocated_qr_quota !== undefined 
          ? Number(meta.allocated_qr_quota) 
          : (meta.total_qr_quota !== undefined ? Number(meta.total_qr_quota) : trialLatest.total_qr_quota);
        totalAi = meta.allocated_ai_quota !== undefined 
          ? Number(meta.allocated_ai_quota) 
          : (meta.total_ai_quota !== undefined ? Number(meta.total_ai_quota) : trialLatest.total_ai_quota);
        maxQrCodes = meta.max_qr_codes !== undefined ? Number(meta.max_qr_codes) : trialLatest.max_qr_codes;
        durationDays = meta.duration_days ? Number(meta.duration_days) : trialLatest.duration_days;
        features = meta.features || trialLatest.features;
        planVersionId = meta.plan_version_id || `trial_v${trialLatest.version || 1}`;
      }
    } else {
      // Paid plan: Immutable snapshot
      totalQr = meta.monthly_qr_quota !== undefined 
        ? Number(meta.monthly_qr_quota) 
        : (meta.allocated_qr_quota !== undefined ? Number(meta.allocated_qr_quota) : (meta.total_qr_quota !== undefined ? Number(meta.total_qr_quota) : 200));
      totalAi = meta.monthly_ai_quota !== undefined 
        ? Number(meta.monthly_ai_quota) 
        : (meta.allocated_ai_quota !== undefined ? Number(meta.allocated_ai_quota) : (meta.total_ai_quota !== undefined ? Number(meta.total_ai_quota) : 100));
      maxQrCodes = meta.max_qr_codes !== undefined ? Number(meta.max_qr_codes) : (sub.plan_id === 'unlimited' ? 999 : 5);
      durationDays = undefined;
      features = meta.features || {
        ai_reviews: true,
        api_access: sub.plan_id === 'pro' || sub.plan_id === 'unlimited',
        white_label: sub.plan_id === 'unlimited',
        custom_domain: sub.plan_id === 'pro' || sub.plan_id === 'unlimited',
        priority_support: sub.plan_id === 'pro' || sub.plan_id === 'unlimited',
        advanced_analytics: true,
      };
      planVersionId = meta.plan_version_id || `${sub.plan_id || 'base'}_v1`;
    }

    // Monthly Quota & Period Calculation
    const monthlyQr = totalQr;
    const monthlyAi = totalAi;
    const period = calculateUsagePeriod(startDateStr, endDateStr, asOfDate);
    const storedPeriodIndex = typeof meta.current_period_index === 'number' ? meta.current_period_index : 0;
    const isNewPeriod = !isTrial && !period.is_past_expiry && period.period_index > storedPeriodIndex;

    // Resolve current month used
    let currentMonthQrUsed = 0;
    let currentMonthAiUsed = 0;

    if (isTrial) {
      currentMonthQrUsed = Number(meta.current_month_qr_used ?? meta.used_qr_quota ?? meta.used_qr ?? 0);
      currentMonthAiUsed = Number(meta.current_month_ai_used ?? meta.used_ai_quota ?? meta.used_ai ?? 0);
    } else {
      if (isNewPeriod) {
        currentMonthQrUsed = 0;
        currentMonthAiUsed = 0;
      } else {
        // Authoritative current month usage: Never fall back to old total-duration usage (which triggers false exhaustion)
        currentMonthQrUsed = meta.current_month_qr_used !== undefined ? Number(meta.current_month_qr_used) : 0;
        currentMonthAiUsed = meta.current_month_ai_used !== undefined ? Number(meta.current_month_ai_used) : 0;
      }
    }

    // Calculate Remaining: Never negative, no carry forward of unused quota
    const remainingQr = isTrial
      ? (totalQr === -1 ? -1 : Math.max(0, totalQr - currentMonthQrUsed))
      : (period.is_past_expiry || isTimeExpired 
          ? 0 
          : (monthlyQr === -1 ? -1 : Math.max(0, monthlyQr - currentMonthQrUsed)));

    const remainingAi = isTrial
      ? (totalAi === -1 ? -1 : Math.max(0, totalAi - currentMonthAiUsed))
      : (period.is_past_expiry || isTimeExpired 
          ? 0 
          : (monthlyAi === -1 ? -1 : Math.max(0, monthlyAi - currentMonthAiUsed)));

    // Accurate Expiry Determination: based on server/database time boundary
    const isExpired = Boolean(
      isTimeExpired || 
      wasAlreadyExpired || 
      sub.status === 'expired' || 
      (!isTrial && period.is_past_expiry) ||
      (originalEndMs > 0 && now >= originalEndMs)
    );

    const effectiveStatus: 'active' | 'trialing' | 'expired' | 'canceled' | 'suspended' = 
      isExpired
        ? 'expired'
        : sub.status === 'trialing'
          ? 'trialing'
          : sub.status === 'canceled'
            ? 'canceled'
            : (sub.status === 'paused' || sub.status === 'suspended')
              ? 'suspended'
              : 'active';

    // Priority Rules A, B, C, D:
    let isQrAllowed = false;
    let isAiAllowed = false;

    if (isExpired || effectiveStatus === 'expired' || effectiveStatus === 'canceled' || effectiveStatus === 'suspended') {
      // Priority Rule A: If subscription/trial is expired -> QR blocked, AI blocked, public QR access blocked
      isQrAllowed = false;
      isAiAllowed = false;
    } else if (isTrial) {
      isQrAllowed = totalQr === -1 || remainingQr > 0;
      isAiAllowed = totalAi === -1 || remainingAi > 0;
    } else {
      // Priority Rules B, C, D for active paid subscriptions:
      // Independent monthly quotas:
      // B. If QR quota exhausted: QR service = BLOCKED, AI service remains independent
      // C. If AI quota exhausted: AI service = BLOCKED, QR service remains usable if QR quota remains
      // D. Active + remaining quota: corresponding service = ALLOWED
      isQrAllowed = monthlyQr === -1 || remainingQr > 0;
      isAiAllowed = monthlyAi === -1 || remainingAi > 0;
    }

    // Determine Multi-Condition Exhaustion Reason
    let exhaustionReason: BlockReason | null = null;
    if (effectiveStatus === 'canceled') {
      exhaustionReason = 'CANCELED';
    } else if (effectiveStatus === 'suspended') {
      exhaustionReason = 'SUSPENDED';
    } else if (isExpired) {
      exhaustionReason = isTrial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED';
    } else if (!isQrAllowed && !isAiAllowed) {
      exhaustionReason = 'QR_QUOTA_EXHAUSTED';
    } else if (!isQrAllowed) {
      exhaustionReason = 'QR_QUOTA_EXHAUSTED';
    } else if (!isAiAllowed) {
      exhaustionReason = 'AI_QUOTA_EXHAUSTED';
    }

    // Subscription itself is active if not expired, canceled, or suspended.
    // Monthly quota exhaustion is NOT the same as subscription expiry!
    const isFullyActive = !isExpired && effectiveStatus !== 'canceled' && effectiveStatus !== 'suspended';

    const planName = meta.plan_name || (isTrial ? 'Free Trial' : (sub.plan_id ? sub.plan_id.charAt(0).toUpperCase() + sub.plan_id.slice(1) : 'Base'));
    const durationMonths = meta.duration_months !== undefined ? Number(meta.duration_months) : (isTrial ? 0 : 6);
    const priceInr = meta.price_inr !== undefined ? Number(meta.price_inr) : (sub.price_cents ? sub.price_cents / 100 : 0);

    return {
      business_id: sub.business_id,
      subscription_id: sub.id,
      is_trial: isTrial,
      status: effectiveStatus,
      is_expired: isExpired,
      is_qr_allowed: isQrAllowed,
      is_ai_allowed: isAiAllowed,
      block_reason: exhaustionReason,
      plan_id: sub.plan_id,
      plan_version_id: planVersionId,
      plan_name: planName,
      duration_months: durationMonths,
      duration_days: durationDays,
      price_inr: priceInr,
      start_date: startDateStr,
      end_date: endDateStr,
      days_remaining: daysRemaining,

      // Monthly Quota Model
      monthly_qr_quota: monthlyQr,
      monthly_ai_quota: monthlyAi,
      monthly_qr_limit: monthlyQr,
      monthly_ai_limit: monthlyAi,
      current_month_qr_used: currentMonthQrUsed,
      current_month_ai_used: currentMonthAiUsed,
      current_month_qr_remaining: remainingQr,
      current_month_ai_remaining: remainingAi,

      // Period Information
      current_period_start: isTrial ? startDateStr : period.period_start,
      current_period_end: isTrial ? endDateStr : period.period_end,
      next_monthly_reset: isTrial ? endDateStr : period.next_reset,
      current_period_index: isTrial ? 0 : period.period_index,

      // Backward compatible fields
      total_qr_quota: totalQr,
      total_ai_quota: totalAi,
      used_qr: currentMonthQrUsed,
      used_ai: currentMonthAiUsed,
      remaining_qr: remainingQr,
      remaining_ai: remainingAi,

      max_qr_codes: maxQrCodes,
      features,
      is_active: isFullyActive,
      exhaustion_reason: exhaustionReason,
      history: Array.isArray(meta.history) ? meta.history : [],
      monthly_history: Array.isArray(meta.monthly_history) ? meta.monthly_history : [],
    };
  }

  /**
  /**
   * Provision or fetch default trial configuration for businesses without a subscription record.
   * Loads the currently ACTIVE trial configuration and writes an immutable snapshot to subscriptions table.
   */
  async provisionTrialSubscription(businessId: string, ownerId?: string): Promise<BusinessEntitlement> {
    // 1. If subscription already exists, return its immutable snapshot
    const { data: existingSub } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle();

    if (existingSub) {
      return this.parseSubscriptionRecord(existingSub);
    }

    // 2. Fetch authoritative active trial configuration
    const trialConf = await planConfigService.getTrialConfig();
    const trialDays = Number(trialConf.duration_days || 14);
    const trialQr = Number(trialConf.total_qr_quota ?? 100);
    const trialAi = Number(trialConf.total_ai_quota ?? 50);
    const trialVersion = Number(trialConf.version || 1);
    const trialMaxQrCodes = Number(trialConf.max_qr_codes || 1);
    const trialFeatures = trialConf.features || {
      google_reviews: true,
      ai_generation: true,
      qr_customization: false,
      advanced_analytics: false,
      api_access: false,
      white_label: false,
      priority_support: false,
    };

    // Get business owner ID
    let finalOwnerId = ownerId;
    let bizCreatedAt = new Date().toISOString();
    if (!finalOwnerId) {
      const { data: biz } = await this.supabase
        .from('businesses')
        .select('owner_id, created_at')
        .eq('id', businessId)
        .maybeSingle();
      finalOwnerId = biz?.owner_id;
      if (biz?.created_at) bizCreatedAt = biz.created_at;
    }

    if (!finalOwnerId) {
      const { data: anyUser } = await this.supabase
        .from('users')
        .select('id')
        .limit(1)
        .maybeSingle();
      finalOwnerId = anyUser?.id;
    }

    const startDate = bizCreatedAt;
    const endMs = new Date(startDate).getTime() + (trialDays * 86400000);
    const endDate = new Date(endMs).toISOString();
    const now = Date.now();
    const isExpired = now >= endMs;
    const planVersionId = `trial_v${trialVersion}`;

    const trialMetadata = {
      plan_id: 'free_trial',
      duration: `${trialDays}_days`,
      duration_days: trialDays,
      trial_version: trialVersion,
      plan_version_id: planVersionId,
      allocated_qr_quota: trialQr,
      allocated_ai_quota: trialAi,
      used_qr_quota: 0,
      used_ai_quota: 0,
      remaining_qr_quota: trialQr,
      remaining_ai_quota: trialAi,
      max_qr_codes: trialMaxQrCodes,
      features: trialFeatures,
      exhaustion_reason: null,
    };

    if (finalOwnerId) {
      try {
        const { data: newSub } = await this.supabase
          .from('subscriptions')
          .insert({
            business_id: businessId,
            owner_id: finalOwnerId,
            plan_id: 'free_trial',
            status: isExpired ? 'expired' : 'trialing',
            billing_cycle: 'monthly',
            price_cents: 0,
            currency: 'INR',
            current_period_start: startDate,
            current_period_end: endDate,
            trial_start: startDate,
            trial_end: endDate,
            metadata: trialMetadata,
          })
          .select()
          .maybeSingle();

        if (newSub) {
          return this.parseSubscriptionRecord(newSub);
        }
      } catch (insertErr) {
        // Fallback if concurrent insert occurred
      }
    }

    return {
      business_id: businessId,
      subscription_id: 'trial-' + businessId,
      is_trial: true,
      status: isExpired ? 'expired' : 'trialing',
      is_expired: isExpired,
      is_qr_allowed: !isExpired && (trialQr === -1 || trialQr > 0),
      is_ai_allowed: !isExpired && (trialAi === -1 || trialAi > 0),
      block_reason: isExpired ? 'TRIAL_EXPIRED' : null,
      plan_id: 'free_trial',
      plan_version_id: planVersionId,
      plan_name: 'Free Trial',
      duration_months: 0,
      duration_days: trialDays,
      price_inr: 0,
      start_date: startDate,
      end_date: endDate,
      days_remaining: Math.max(0, Math.ceil((endMs - now) / 86400000)),
      monthly_qr_quota: trialQr,
      monthly_ai_quota: trialAi,
      monthly_qr_limit: trialQr,
      monthly_ai_limit: trialAi,
      current_month_qr_used: 0,
      current_month_ai_used: 0,
      current_month_qr_remaining: isExpired ? 0 : trialQr,
      current_month_ai_remaining: isExpired ? 0 : trialAi,
      current_period_start: startDate,
      current_period_end: endDate,
      next_monthly_reset: endDate,
      current_period_index: 0,
      total_qr_quota: trialQr,
      used_qr: 0,
      remaining_qr: isExpired ? 0 : trialQr,
      total_ai_quota: trialAi,
      used_ai: 0,
      remaining_ai: isExpired ? 0 : trialAi,
      exhaustion_reason: isExpired ? 'TRIAL_EXPIRED' : null,
      is_active: !isExpired,
      features: trialFeatures,
      max_qr_codes: trialMaxQrCodes,
    };
  }

  private async provisionDefaultTrial(businessId: string): Promise<BusinessEntitlement> {
    return this.provisionTrialSubscription(businessId);
  }

  /**
   * 2. Central Gatekeeper Check: canUseService(businessId, serviceType)
   * 
   * Authoritative gatekeeper enforcing Priority Rules:
   *  A. If subscription/trial is expired: QR = BLOCKED, AI = BLOCKED, public QR = BLOCKED
   *  B. If subscription is active but monthly QR quota exhausted: QR = BLOCKED, AI unaffected
   *  C. If subscription is active but monthly AI quota exhausted: AI = BLOCKED, QR unaffected
   *  D. Active subscription + remaining quota: corresponding service = ALLOWED
   */
  async canUseService(businessId: string, serviceType: ServiceType | 'ai_review' | 'review_flow', asOfDate: Date = new Date()): Promise<CanUseServiceResult> {
    const entitlement = await this.getBusinessEntitlement(businessId, asOfDate);

    // 1. Status Check
    if (entitlement.status === 'canceled') {
      const res: CanUseServiceResult = { allowed: false, reason: 'CANCELED', message: this.getReasonMessage('CANCELED'), entitlement };
      this.logEntitlementDecision(businessId, serviceType, entitlement, res);
      return res;
    }
    if (entitlement.status === 'suspended') {
      const res: CanUseServiceResult = { allowed: false, reason: 'SUSPENDED', message: this.getReasonMessage('SUSPENDED'), entitlement };
      this.logEntitlementDecision(businessId, serviceType, entitlement, res);
      return res;
    }

    // 2. Expiry Check (Rule A): current_time >= end_date OR status === 'expired'
    if (entitlement.is_expired || entitlement.status === 'expired' || asOfDate.getTime() >= new Date(entitlement.end_date).getTime()) {
      const reason: BlockReason = entitlement.is_trial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED';
      try {
        await this.supabase
          .from('qr_codes')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('business_id', businessId)
          .eq('is_active', true);
      } catch (err) {
        logger.warn({ businessId, err }, 'Non-fatal error deactivating QR codes on expired canUseService check');
      }
      const res: CanUseServiceResult = { allowed: false, reason, message: this.getReasonMessage(reason), entitlement };
      this.logEntitlementDecision(businessId, serviceType, entitlement, res);
      return res;
    }

    // 3. Quota Exhaustion Rules (Rules B, C, D):
    if (serviceType === 'qr_scan' || serviceType === 'create_qr') {
      if (!entitlement.is_qr_allowed) {
        const reason: BlockReason = 'QR_QUOTA_EXHAUSTED';
        const res: CanUseServiceResult = { allowed: false, reason, message: this.getReasonMessage(reason), entitlement };
        this.logEntitlementDecision(businessId, serviceType, entitlement, res);
        return res;
      }

      if (serviceType === 'create_qr') {
        const { count: qrCount } = await this.supabase
          .from('qr_codes')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('is_active', true);

        if (entitlement.max_qr_codes !== -1 && (qrCount || 0) >= entitlement.max_qr_codes) {
          const res: CanUseServiceResult = {
            allowed: false,
            reason: 'QR_CODE_LIMIT_REACHED',
            message: `QR code limit (${entitlement.max_qr_codes}) reached for ${entitlement.plan_name} plan.`,
            entitlement,
          };
          this.logEntitlementDecision(businessId, serviceType, entitlement, res);
          return res;
        }
      }

      const res: CanUseServiceResult = { allowed: true, entitlement };
      this.logEntitlementDecision(businessId, serviceType, entitlement, res);
      return res;
    }

    if (serviceType === 'ai_generation' || serviceType === 'ai_review' || serviceType === 'review_flow') {
      if (!entitlement.is_ai_allowed) {
        const reason: BlockReason = 'AI_QUOTA_EXHAUSTED';
        const res: CanUseServiceResult = { allowed: false, reason, message: this.getReasonMessage(reason), entitlement };
        this.logEntitlementDecision(businessId, serviceType, entitlement, res);
        return res;
      }
      const res: CanUseServiceResult = { allowed: true, entitlement };
      this.logEntitlementDecision(businessId, serviceType, entitlement, res);
      return res;
    }

    const res: CanUseServiceResult = { allowed: true, entitlement };
    this.logEntitlementDecision(businessId, serviceType, entitlement, res);
    return res;
  }

  /**
   * Minimal diagnostic logging for entitlement decisions (non-sensitive)
   */
  private logEntitlementDecision(businessId: string, serviceType: string, entitlement: BusinessEntitlement, decision: CanUseServiceResult): void {
    logger.info({
      business_id: businessId,
      service_type: serviceType,
      status: entitlement.status,
      is_expired: entitlement.is_expired,
      qr_limit: entitlement.monthly_qr_quota,
      qr_used: entitlement.current_month_qr_used,
      qr_remaining: entitlement.current_month_qr_remaining,
      ai_limit: entitlement.monthly_ai_quota,
      ai_used: entitlement.current_month_ai_used,
      ai_remaining: entitlement.current_month_ai_remaining,
      allowed: decision.allowed,
      reason: decision.reason || null,
    }, 'Authoritative entitlement check evaluated');
  }

  /**
   * 3. Atomic Usage Consumption with Compare-And-Swap (CAS) Concurrency Protection.
   * 
   * Guarantees:
   *  - Zero negative remaining quota
   *  - Zero double consumption
   *  - Automatic monthly period rollover
   *  - Concurrent requests serializing correctly without race conditions
   *  - Updates current_month_qr_used and current_month_ai_used directly on the subscription snapshot
   */
  async consumeServiceQuota(
    businessId: string,
    serviceType: 'qr_scan' | 'ai_generation',
    units: number = 1,
    asOfDate: Date = new Date()
  ): Promise<ConsumeQuotaResult> {
    const maxRetries = 15;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      // 1. Fetch latest subscription record
      const { data: sub, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !sub) {
        return { success: false, allowed: false, reason: 'NO_SUBSCRIPTION', error: 'Subscription not found' };
      }

      const entitlement = this.parseSubscriptionRecord(sub, asOfDate);

      // 2. Validate current entitlement
      if (entitlement.status === 'canceled') {
        return { success: false, allowed: false, reason: 'CANCELED' };
      }
      if (entitlement.status === 'suspended') {
        return { success: false, allowed: false, reason: 'SUSPENDED' };
      }
      if (entitlement.status === 'expired' || asOfDate.getTime() >= new Date(entitlement.end_date).getTime()) {
        const reason: BlockReason = entitlement.is_trial ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED';
        return { success: false, allowed: false, reason };
      }

      // Check specific requested units against CURRENT MONTH's remaining quota:
      if (serviceType === 'qr_scan') {
        if (entitlement.monthly_qr_quota !== -1 && (entitlement.current_month_qr_used + units) > entitlement.monthly_qr_quota) {
          const reason: BlockReason = 'QR_QUOTA_EXHAUSTED';
          return { success: false, allowed: false, reason };
        }
      } else if (serviceType === 'ai_generation') {
        if (entitlement.monthly_ai_quota !== -1 && (entitlement.current_month_ai_used + units) > entitlement.monthly_ai_quota) {
          const reason: BlockReason = 'AI_QUOTA_EXHAUSTED';
          return { success: false, allowed: false, reason };
        }
      }

      // 3. Prepare updated values
      const currentMeta = sub.metadata || {};
      const startDateStr = sub.current_period_start || sub.created_at;
      const expiryDateStr = sub.current_period_end;
      const period = calculateUsagePeriod(startDateStr, expiryDateStr, asOfDate);
      const storedPeriodIndex = typeof currentMeta.current_period_index === 'number' ? currentMeta.current_period_index : 0;
      const isNewPeriod = !entitlement.is_trial && !period.is_past_expiry && period.period_index > storedPeriodIndex;

      // Handle rollover if entering new period
      let updatedMonthlyHistory = Array.isArray(currentMeta.monthly_history) ? [...currentMeta.monthly_history] : [];
      let baseMonthQrUsed = entitlement.current_month_qr_used;
      let baseMonthAiUsed = entitlement.current_month_ai_used;

      if (isNewPeriod) {
        for (let idx = storedPeriodIndex; idx < period.period_index; idx++) {
          const pIdx = calculatePeriodForIndex(startDateStr, expiryDateStr, idx);
          const pQr = idx === storedPeriodIndex ? Number(currentMeta.current_month_qr_used ?? currentMeta.used_qr_quota ?? 0) : 0;
          const pAi = idx === storedPeriodIndex ? Number(currentMeta.current_month_ai_used ?? currentMeta.used_ai_quota ?? 0) : 0;
          if (!updatedMonthlyHistory.some(h => h.period_index === idx)) {
            updatedMonthlyHistory.push({
              subscription_id: sub.id,
              period_index: idx,
              period_start: pIdx.period_start,
              period_end: pIdx.period_end,
              qr_used: pQr,
              ai_used: pAi,
              recorded_at: asOfDate.toISOString(),
            });
          }
        }
        baseMonthQrUsed = 0;
        baseMonthAiUsed = 0;
      }

      const newMonthQrUsed = serviceType === 'qr_scan' ? baseMonthQrUsed + units : baseMonthQrUsed;
      const newMonthAiUsed = serviceType === 'ai_generation' ? baseMonthAiUsed + units : baseMonthAiUsed;

      const lifetimeQrUsed = Number(currentMeta.total_lifetime_qr_used ?? currentMeta.used_qr ?? 0);
      const lifetimeAiUsed = Number(currentMeta.total_lifetime_ai_used ?? currentMeta.used_ai ?? 0);
      const newLifetimeQr = serviceType === 'qr_scan' ? lifetimeQrUsed + units : lifetimeQrUsed;
      const newLifetimeAi = serviceType === 'ai_generation' ? lifetimeAiUsed + units : lifetimeAiUsed;

      const monthlyQr = entitlement.monthly_qr_quota;
      const monthlyAi = entitlement.monthly_ai_quota;
      const newRemainingQr = monthlyQr === -1 ? -1 : Math.max(0, monthlyQr - newMonthQrUsed);
      const newRemainingAi = monthlyAi === -1 ? -1 : Math.max(0, monthlyAi - newMonthAiUsed);

      let exhaustionReason: string | null = null;
      if (monthlyQr !== -1 && newRemainingQr <= 0 && monthlyAi !== -1 && newRemainingAi <= 0) {
        exhaustionReason = 'QR_QUOTA_EXHAUSTED';
      } else if (monthlyQr !== -1 && newRemainingQr <= 0) {
        exhaustionReason = 'QR_QUOTA_EXHAUSTED';
      } else if (monthlyAi !== -1 && newRemainingAi <= 0) {
        exhaustionReason = 'AI_QUOTA_EXHAUSTED';
      }

      const updatedMeta = {
        ...currentMeta,
        monthly_qr_quota: monthlyQr,
        monthly_ai_quota: monthlyAi,
        current_month_qr_used: newMonthQrUsed,
        current_month_ai_used: newMonthAiUsed,
        total_lifetime_qr_used: newLifetimeQr,
        total_lifetime_ai_used: newLifetimeAi,
        current_period_index: period.period_index,
        current_period_start: period.period_start,
        current_period_end: period.period_end,
        next_monthly_reset: period.next_reset,
        monthly_history: updatedMonthlyHistory,
        // Backward-compatible fields
        used_qr_quota: newMonthQrUsed,
        used_ai_quota: newMonthAiUsed,
        remaining_qr_quota: newRemainingQr,
        remaining_ai_quota: newRemainingAi,
        exhaustion_reason: exhaustionReason,
      };

      // 4. Perform Atomic CAS Update (condition: updated_at matches our read timestamp)
      const nowIso = new Date().toISOString();
      const { data: updatedRows, error: updateErr } = await this.supabase
        .from('subscriptions')
        .update({
          metadata: updatedMeta,
          updated_at: nowIso,
        })
        .eq('id', sub.id)
        .eq('updated_at', sub.updated_at)
        .select('id');

      if (updateErr) {
        logger.warn({ updateErr, attempt }, 'CAS update error, retrying');
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20) + 10));
        continue;
      }

      // If exactly 1 row updated, CAS succeeded!
      if (updatedRows && updatedRows.length === 1) {
        this.invalidateEntitlementCache(businessId);
        return {
          success: true,
          allowed: true,
          remaining_qr: newRemainingQr,
          remaining_ai: newRemainingAi,
        };
      }

      // If 0 rows updated, a concurrent request modified the row; apply jitter and retry
      logger.info({ businessId, attempt }, 'Concurrent modification detected during quota consumption; retrying with backoff');
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 25) + 10));
    }

    return {
      success: false,
      allowed: false,
      error: 'Concurrency lock contention. Please retry.',
    };
  }

  /**
   * Refund / rollback quota in case a downstream operation failed (e.g. AI provider timeout or scan log failure).
   */
  async refundServiceQuota(
    businessId: string,
    serviceType: 'qr_scan' | 'ai_generation',
    units: number = 1
  ): Promise<boolean> {
    const maxRetries = 10;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      const { data: sub, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !sub) return false;

      const currentMeta = sub.metadata || {};
      const currentUsedQr = Number(currentMeta.current_month_qr_used ?? currentMeta.used_qr_quota ?? currentMeta.used_qr ?? 0);
      const currentUsedAi = Number(currentMeta.current_month_ai_used ?? currentMeta.used_ai_quota ?? currentMeta.used_ai ?? 0);

      const trialFallback = planConfigService.getLatestTrialConfigSync();
      const isTrial = sub.status === 'trialing' || sub.plan_id === 'free_trial' || sub.plan_id === 'free';
      const totalQr = currentMeta.monthly_qr_quota !== undefined
        ? Number(currentMeta.monthly_qr_quota)
        : (currentMeta.allocated_qr_quota !== undefined ? Number(currentMeta.allocated_qr_quota) : (isTrial ? trialFallback.total_qr_quota : 200));

      const totalAi = currentMeta.monthly_ai_quota !== undefined
        ? Number(currentMeta.monthly_ai_quota)
        : (currentMeta.allocated_ai_quota !== undefined ? Number(currentMeta.allocated_ai_quota) : (isTrial ? trialFallback.total_ai_quota : 100));

      const newUsedQr = serviceType === 'qr_scan' ? Math.max(0, currentUsedQr - units) : currentUsedQr;
      const newUsedAi = serviceType === 'ai_generation' ? Math.max(0, currentUsedAi - units) : currentUsedAi;

      const newRemainingQr = totalQr === -1 ? -1 : Math.max(0, totalQr - newUsedQr);
      const newRemainingAi = totalAi === -1 ? -1 : Math.max(0, totalAi - newUsedAi);

      // Re-evaluate exhaustion_reason
      let exhaustionReason: string | null = currentMeta.exhaustion_reason || null;
      if (serviceType === 'ai_generation' && (exhaustionReason === 'AI_QUOTA_EXHAUSTED' || exhaustionReason === 'PLAN_AI_QUOTA_EXHAUSTED' || exhaustionReason === 'TRIAL_AI_QUOTA_EXHAUSTED')) {
        if (newRemainingAi > 0) {
          exhaustionReason = null;
        }
      } else if (serviceType === 'qr_scan' && (exhaustionReason === 'QR_QUOTA_EXHAUSTED' || exhaustionReason === 'PLAN_QR_QUOTA_EXHAUSTED' || exhaustionReason === 'TRIAL_QR_QUOTA_EXHAUSTED')) {
        if (newRemainingQr > 0) {
          exhaustionReason = null;
        }
      }

      const updatedMeta = {
        ...currentMeta,
        current_month_qr_used: newUsedQr,
        current_month_ai_used: newUsedAi,
        used_qr_quota: newUsedQr,
        used_ai_quota: newUsedAi,
        remaining_qr_quota: newRemainingQr,
        remaining_ai_quota: newRemainingAi,
        exhaustion_reason: exhaustionReason,
      };

      const nowIso = new Date().toISOString();
      const { data: updatedRows, error: updateErr } = await this.supabase
        .from('subscriptions')
        .update({
          metadata: updatedMeta,
          updated_at: nowIso,
        })
        .eq('id', sub.id)
        .eq('updated_at', sub.updated_at)
        .select('id');

      if (updateErr) {
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20) + 10));
        continue;
      }
      if (updatedRows && updatedRows.length === 1) {
        this.invalidateEntitlementCache(businessId);
        return true;
      }
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 25) + 10));
    }

    return false;
  }

  /**
   * 4. Plan Activation Engine:
   * Creates or updates a subscription with an immutable snapshot of the published plan version.
   * Monthly usage counters reset to 0/monthly_quota upon plan activation.
   */
  async activatePlan(params: {
    businessId: string;
    ownerId?: string;
    planId: string;
    durationMonths: 1 | 6 | 12;
    versionNumber?: number; // Optional explicit version; defaults to latest published
    assignedBy?: string;
    price?: number;
    qrQuota?: number;
    aiQuota?: number;
    maxQRCodes?: number;
    features?: any;
    planVersionId?: string;
    startDate?: Date | string;
    preserveUsage?: boolean;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    paymentStatus?: string;
  }): Promise<BusinessEntitlement> {
    const { businessId, planId, durationMonths, assignedBy = 'admin', preserveUsage = false } = params;

    let ownerId = params.ownerId;
    if (!ownerId) {
      const { data: biz } = await this.supabase
        .from('businesses')
        .select('owner_id')
        .eq('id', businessId)
        .maybeSingle();
      ownerId = biz?.owner_id;
    }
    if (!ownerId) {
      const { data: existingSub } = await this.supabase
        .from('subscriptions')
        .select('owner_id')
        .eq('business_id', businessId)
        .maybeSingle();
      ownerId = existingSub?.owner_id;
    }
    if (!ownerId) {
      const { data: anyUser } = await this.supabase
        .from('users')
        .select('id')
        .limit(1)
        .maybeSingle();
      ownerId = anyUser?.id;
    }

    // Fetch plan configuration from admin_settings
    const { data: settings } = await this.supabase
      .from('admin_settings')
      .select('limits')
      .limit(1)
      .maybeSingle();

    const planList = settings?.limits?.plans || [];
    const planDef = planList.find((p: any) => p.id === planId) || {
      id: planId,
      name: planId.charAt(0).toUpperCase() + planId.slice(1),
      features: {}
    };

    // Determine target version: prioritize requested version number or plan_version_id if specified!
    let targetVersion: any = null;
    const requestedVersionNum = params.versionNumber || (params.planVersionId ? Number(String(params.planVersionId).match(/_v(\d+)$/)?.[1]) : undefined);
    if (requestedVersionNum && planDef.versions) {
      targetVersion = planDef.versions.find((v: any) => v.version_number === requestedVersionNum);
    }
    if (!targetVersion) {
      targetVersion = planDef.versions?.find((v: any) => v.status === 'active') || planDef.versions?.[0];
    }

    const durationKey = `${durationMonths}_months` as '1_month' | '6_months' | '12_months';
    const durationOffering = targetVersion?.durations?.[durationKey] || {
      duration_months: durationMonths,
      price_inr: planId === 'base' ? (durationMonths === 6 ? 2499 : 499) : 1499,
      monthly_qr_quota: planId === 'base' ? 200 : (planId === 'pro' ? 1000 : -1),
      monthly_ai_quota: planId === 'base' ? 100 : (planId === 'pro' ? 500 : -1),
    };

    const startDate = params.startDate ? new Date(params.startDate) : new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationMonths);

    const planVersionId = params.planVersionId || `${planId}_v${targetVersion?.version_number || 1}`;
    const monthlyQr = params.qrQuota !== undefined 
      ? Number(params.qrQuota) 
      : Number((durationOffering as any).monthly_qr_quota ?? (durationOffering as any).allocated_qr_quota ?? 200);
    const monthlyAi = params.aiQuota !== undefined 
      ? Number(params.aiQuota) 
      : Number((durationOffering as any).monthly_ai_quota ?? (durationOffering as any).allocated_ai_quota ?? 100);

    const priceInr = params.price !== undefined ? Number(params.price) : Number(durationOffering.price_inr ?? 2499);
    const priceCents = priceInr * 100;
    const maxQrCodes = params.maxQRCodes !== undefined ? Number(params.maxQRCodes) : (planDef.features?.max_qr_codes ?? (planId === 'unlimited' ? 999 : 5));
    const features = params.features || planDef.features || {};

    const period = calculateUsagePeriod(startDate.toISOString(), endDate.toISOString(), startDate);

    // Query existing subscription to preserve complete historical record
    const { data: existingSub } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle();

    const existingMeta = (existingSub?.metadata as any) || {};
    const existingHistory: any[] = Array.isArray(existingMeta.history) ? [...existingMeta.history] : [];

    // If existingSub has an active or previously activated plan, preserve it in history
    if (existingSub && existingSub.plan_id) {
      const archivedRecord = {
        subscription_id: existingSub.id,
        plan_id: existingSub.plan_id,
        plan_name: existingMeta.plan_name || (existingSub.plan_id.charAt(0).toUpperCase() + existingSub.plan_id.slice(1)),
        plan_version_id: existingMeta.plan_version_id || `${existingSub.plan_id}_v1`,
        plan_version_number: existingMeta.plan_version_number || 1,
        duration: existingMeta.duration || `${existingMeta.duration_months || 6}_months`,
        duration_months: existingMeta.duration_months || (existingMeta.is_trial ? 0 : 6),
        price_inr: existingMeta.price_inr ?? (existingSub.price_cents ? existingSub.price_cents / 100 : 0),
        price_cents: existingSub.price_cents || 0,
        start_date: existingSub.current_period_start,
        end_date: existingSub.current_period_end,
        current_period_start: existingSub.current_period_start,
        current_period_end: existingSub.current_period_end,
        monthly_qr_quota: existingMeta.monthly_qr_quota ?? existingMeta.allocated_qr_quota ?? 200,
        monthly_ai_quota: existingMeta.monthly_ai_quota ?? existingMeta.allocated_ai_quota ?? 100,
        total_qr_quota: existingMeta.allocated_qr_quota ?? 200,
        total_ai_quota: existingMeta.allocated_ai_quota ?? 100,
        used_qr_quota: existingMeta.current_month_qr_used ?? existingMeta.used_qr_quota ?? 0,
        used_ai_quota: existingMeta.current_month_ai_used ?? existingMeta.used_ai_quota ?? 0,
        status: existingSub.status,
        exhaustion_reason: existingMeta.exhaustion_reason || null,
        assigned_by: existingMeta.assigned_by || 'admin',
        activated_at: existingMeta.activated_at || existingSub.created_at,
        archived_at: new Date().toISOString(),
      };
      existingHistory.push(archivedRecord);
    }

    const currentMonthQrUsed = preserveUsage && existingMeta.current_month_qr_used !== undefined ? Number(existingMeta.current_month_qr_used) : 0;
    const currentMonthAiUsed = preserveUsage && existingMeta.current_month_ai_used !== undefined ? Number(existingMeta.current_month_ai_used) : 0;
    const lifetimeQrUsed = preserveUsage && existingMeta.total_lifetime_qr_used !== undefined ? Number(existingMeta.total_lifetime_qr_used) : currentMonthQrUsed;
    const lifetimeAiUsed = preserveUsage && existingMeta.total_lifetime_ai_used !== undefined ? Number(existingMeta.total_lifetime_ai_used) : currentMonthAiUsed;
    const remainingQr = monthlyQr === -1 ? -1 : Math.max(0, monthlyQr - currentMonthQrUsed);
    const remainingAi = monthlyAi === -1 ? -1 : Math.max(0, monthlyAi - currentMonthAiUsed);

    const snapshotMetadata = {
      plan_id: planId,
      plan_version_id: planVersionId,
      plan_version_number: targetVersion?.version_number || 1,
      plan_name: planDef.name || (planId.charAt(0).toUpperCase() + planId.slice(1)),
      duration: durationKey,
      duration_months: durationMonths,
      price_inr: priceInr,
      amount: priceCents,
      monthly_qr_quota: monthlyQr,
      monthly_ai_quota: monthlyAi,
      current_month_qr_used: currentMonthQrUsed,
      current_month_ai_used: currentMonthAiUsed,
      total_lifetime_qr_used: lifetimeQrUsed,
      total_lifetime_ai_used: lifetimeAiUsed,
      current_period_index: preserveUsage && existingMeta.current_period_index !== undefined ? existingMeta.current_period_index : 0,
      current_period_start: period.period_start,
      current_period_end: period.period_end,
      next_monthly_reset: period.next_reset,
      monthly_history: preserveUsage && Array.isArray(existingMeta.monthly_history) ? existingMeta.monthly_history : [],
      // Backward compatibility fields
      allocated_qr_quota: monthlyQr,
      allocated_ai_quota: monthlyAi,
      used_qr_quota: currentMonthQrUsed,
      used_ai_quota: currentMonthAiUsed,
      remaining_qr_quota: remainingQr,
      remaining_ai_quota: remainingAi,
      max_qr_codes: maxQrCodes,
      features,
      payment_type: params.razorpayPaymentId ? 'razorpay' : 'one_time',
      razorpay_order_id: params.razorpayOrderId || null,
      razorpay_payment_id: params.razorpayPaymentId || null,
      payment_status: params.paymentStatus || (params.razorpayPaymentId ? 'SUCCESS' : 'PAID'),
      payment_date: startDate.toISOString(),
      assigned_by: assignedBy,
      activated_at: startDate.toISOString(),
      exhaustion_reason: null,
      history: existingHistory,
    };

    // Upsert into subscriptions
    const { data: updatedSub, error: subError } = await this.supabase
      .from('subscriptions')
      .upsert(
        {
          business_id: businessId,
          owner_id: ownerId,
          plan_id: planId,
          status: 'active',
          billing_cycle: durationMonths === 12 ? 'annual' : 'monthly',
          price_cents: priceCents,
          currency: 'INR',
          current_period_start: startDate.toISOString(),
          current_period_end: endDate.toISOString(),
          trial_start: null,
          trial_end: null,
          canceled_at: null,
          cancel_at_period_end: false,
          metadata: snapshotMetadata,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id' }
      )
      .select()
      .single();

    if (subError) {
      logger.error({ subError, businessId }, 'Failed to activate subscription plan');
      throw new Error(`Failed to activate subscription: ${subError.message}`);
    }

    // Requirement 10: QR ACTIVATION - Reactivate user's eligible QR codes for the new ACTIVE subscription
    try {
      await this.supabase
        .from('qr_codes')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('business_id', businessId);
    } catch (qrErr) {
      logger.warn({ qrErr, businessId }, 'Non-fatal error reactivating QR codes on plan activation');
    }

    this.invalidateEntitlementCache(businessId);
    return this.parseSubscriptionRecord(updatedSub, startDate);
  }
}

export const entitlementService = new EntitlementService();
