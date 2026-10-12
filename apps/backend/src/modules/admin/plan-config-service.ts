/**
 * Admin Plan & Trial Configuration Service
 * ReviewAI SaaS Platform
 * 
 * Manages Base, Pro, Unlimited plan definitions, immutable version matrices,
 * duration offerings (1, 6, 12 months), and admin-controlled Free Trial settings.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/logger';
import { ValidationError, NotFoundError, ConflictError } from '../../shared/exceptions';

export type PlanDurationKey = '1_month' | '6_months' | '12_months';
export type VersionStatus = 'draft' | 'active' | 'archived';

export interface DurationOffering {
  duration_months: number;
  price_inr: number;
  monthly_qr_quota: number; // -1 = unlimited
  monthly_ai_quota: number; // -1 = unlimited
  monthly_qr_limit?: number; // alias
  monthly_ai_limit?: number; // alias
  allocated_qr_quota?: number; // legacy alias for backward compatibility
  allocated_ai_quota?: number; // legacy alias for backward compatibility
  max_qr_codes: number;
}

export interface PlanVersion {
  version_number: number;
  status: VersionStatus;
  created_at: string;
  created_by: string;
  published_at?: string;
  archived_at?: string;
  change_notes?: string;
  durations: Record<PlanDurationKey, DurationOffering>;
}

export interface PlanDefinition {
  id: string;
  name: string;
  description: string;
  display_order: number;
  is_active: boolean;
  features: Record<string, boolean>;
  versions: PlanVersion[];
}

export interface TrialConfig {
  enabled: boolean;
  duration_days: number;
  total_qr_quota: number;
  total_ai_quota: number;
  max_qr_codes: number;
  features: Record<string, boolean>;
  version: number;
  updated_at?: string;
  updated_by?: string;
}

export interface TrialConfigHistoryRecord {
  id?: string;
  version_id: string;
  version: number;
  action_type: string;
  admin_id: string;
  timestamp: string;
  affected_fields: string[];
  affected_active_trials: number;
  summary: string;
  old_values: Partial<TrialConfig>;
  new_values: Partial<TrialConfig>;
}

export class PlanConfigService {
  private cachedPlans: PlanDefinition[] | null = null;
  private cachedTrial: TrialConfig | null = null;
  private cacheExpiresAt: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 60-second in-memory cache

  constructor(private supabase: SupabaseClient = supabaseAdmin) {}

  /**
   * Invalidate in-memory plan and trial caches.
   */
  invalidateCache(): void {
    this.cachedPlans = null;
    this.cachedTrial = null;
    this.cacheExpiresAt = 0;
  }

  /**
   * Get canonical default plans if admin_settings is uninitialized
   */
  getDefaultPlans(): PlanDefinition[] {
    const timestamp = new Date().toISOString();
    return [
      {
        id: 'base',
        name: 'Base',
        description: 'Essential review automation for local retail and service businesses.',
        display_order: 1,
        is_active: true,
        features: {
          google_reviews: true,
          ai_generation: true,
          qr_customization: true,
          advanced_analytics: false,
          api_access: false,
          white_label: false,
          priority_support: false,
        },
        versions: [
          {
            version_number: 1,
            status: 'active',
            created_at: timestamp,
            created_by: 'system',
            published_at: timestamp,
            durations: {
              '1_month': {
                duration_months: 1,
                price_inr: 499,
                monthly_qr_quota: 200,
                monthly_ai_quota: 100,
                monthly_qr_limit: 200,
                monthly_ai_limit: 100,
                allocated_qr_quota: 200,
                allocated_ai_quota: 100,
                max_qr_codes: 1,
              },
              '6_months': {
                duration_months: 6,
                price_inr: 2499,
                monthly_qr_quota: 200,
                monthly_ai_quota: 100,
                monthly_qr_limit: 200,
                monthly_ai_limit: 100,
                allocated_qr_quota: 200,
                allocated_ai_quota: 100,
                max_qr_codes: 5,
              },
              '12_months': {
                duration_months: 12,
                price_inr: 4499,
                monthly_qr_quota: 200,
                monthly_ai_quota: 100,
                monthly_qr_limit: 200,
                monthly_ai_limit: 100,
                allocated_qr_quota: 200,
                allocated_ai_quota: 100,
                max_qr_codes: 10,
              },
            },
          },
        ],
      },
      {
        id: 'pro',
        name: 'Pro',
        description: 'High-volume review capture for multi-counter or fast-growing businesses.',
        display_order: 2,
        is_active: true,
        features: {
          google_reviews: true,
          ai_generation: true,
          qr_customization: true,
          advanced_analytics: true,
          api_access: true,
          white_label: false,
          priority_support: true,
        },
        versions: [
          {
            version_number: 1,
            status: 'active',
            created_at: timestamp,
            created_by: 'system',
            published_at: timestamp,
            durations: {
              '1_month': {
                duration_months: 1,
                price_inr: 1499,
                monthly_qr_quota: 1000,
                monthly_ai_quota: 500,
                monthly_qr_limit: 1000,
                monthly_ai_limit: 500,
                allocated_qr_quota: 1000,
                allocated_ai_quota: 500,
                max_qr_codes: 5,
              },
              '6_months': {
                duration_months: 6,
                price_inr: 7499,
                monthly_qr_quota: 1000,
                monthly_ai_quota: 500,
                monthly_qr_limit: 1000,
                monthly_ai_limit: 500,
                allocated_qr_quota: 1000,
                allocated_ai_quota: 500,
                max_qr_codes: 15,
              },
              '12_months': {
                duration_months: 12,
                price_inr: 12999,
                monthly_qr_quota: 1000,
                monthly_ai_quota: 500,
                monthly_qr_limit: 1000,
                monthly_ai_limit: 500,
                allocated_qr_quota: 1000,
                allocated_ai_quota: 500,
                max_qr_codes: 30,
              },
            },
          },
        ],
      },
      {
        id: 'unlimited',
        name: 'Unlimited',
        description: 'Maximum scale for high-footfall venues, chains, and enterprise fleets.',
        display_order: 3,
        is_active: true,
        features: {
          google_reviews: true,
          ai_generation: true,
          qr_customization: true,
          advanced_analytics: true,
          api_access: true,
          white_label: true,
          priority_support: true,
        },
        versions: [
          {
            version_number: 1,
            status: 'active',
            created_at: timestamp,
            created_by: 'system',
            published_at: timestamp,
            durations: {
              '1_month': {
                duration_months: 1,
                price_inr: 2999,
                monthly_qr_quota: -1,
                monthly_ai_quota: -1,
                monthly_qr_limit: -1,
                monthly_ai_limit: -1,
                allocated_qr_quota: -1,
                allocated_ai_quota: -1,
                max_qr_codes: 999,
              },
              '6_months': {
                duration_months: 6,
                price_inr: 14999,
                monthly_qr_quota: -1,
                monthly_ai_quota: -1,
                monthly_qr_limit: -1,
                monthly_ai_limit: -1,
                allocated_qr_quota: -1,
                allocated_ai_quota: -1,
                max_qr_codes: 999,
              },
              '12_months': {
                duration_months: 12,
                price_inr: 24999,
                monthly_qr_quota: -1,
                monthly_ai_quota: -1,
                monthly_qr_limit: -1,
                monthly_ai_limit: -1,
                allocated_qr_quota: -1,
                allocated_ai_quota: -1,
                max_qr_codes: 999,
              },
            },
          },
        ],
      },
    ];
  }

  getDefaultTrialConfig(): TrialConfig {
    return {
      enabled: true,
      duration_days: 14,
      total_qr_quota: 100,
      total_ai_quota: 50,
      max_qr_codes: 1,
      features: {
        google_reviews: true,
        ai_generation: true,
        qr_customization: false,
        advanced_analytics: false,
        api_access: false,
        white_label: false,
        priority_support: false,
      },
      version: 1,
      updated_at: new Date().toISOString(),
      updated_by: 'system',
    };
  }

  /**
   * Fetch all plans with versions. Automatically seeds if uninitialized and normalizes active statuses.
   */
  async getPlans(forceRefresh: boolean = false): Promise<PlanDefinition[]> {
    if (!forceRefresh && this.cachedPlans && Date.now() < this.cacheExpiresAt) {
      return this.cachedPlans;
    }

    const { data: settings } = await this.supabase
      .from('admin_settings')
      .select('limits')
      .limit(1)
      .maybeSingle();

    let plans: PlanDefinition[] = settings?.limits?.plans || [];

    // If plans array is empty or incomplete, initialize defaults
    if (!plans || plans.length === 0 || !plans.some(p => p.id === 'base')) {
      plans = this.getDefaultPlans();
      await this.savePlansToSettings(plans);
    } else {
      // Ensure Base, Pro, Unlimited are all present
      const defaultPlans = this.getDefaultPlans();
      let updated = false;
      for (const def of defaultPlans) {
        if (!plans.some(p => p.id === def.id)) {
          plans.push(def);
          updated = true;
        }
      }

      // Normalization: Ensure every plan's versions have explicit status and exactly one active version
      for (const plan of plans) {
        if (plan.versions && plan.versions.length > 0) {
          const hasActive = plan.versions.some(v => v.status === 'active');
          if (!hasActive) {
            // Find highest version_number that is not archived, or first version
            const nonArchived = plan.versions.filter(v => v.status !== 'archived');
            const candidate = nonArchived.length > 0 
              ? nonArchived.reduce((prev, curr) => (curr.version_number > prev.version_number ? curr : prev))
              : plan.versions[0];
            candidate.status = 'active';
            updated = true;
          }

          // Normalize any version that has undefined status
          const activeVer = plan.versions.find(v => v.status === 'active');
          for (const v of plan.versions) {
            if (!v.status) {
              v.status = (v === activeVer) ? 'active' : 'archived';
              updated = true;
            }
            if (v.durations) {
              for (const durKey of ['1_month', '6_months', '12_months'] as PlanDurationKey[]) {
                const off = v.durations[durKey];
                if (off) {
                  const qr = off.monthly_qr_quota ?? off.monthly_qr_limit ?? off.allocated_qr_quota;
                  const ai = off.monthly_ai_quota ?? off.monthly_ai_limit ?? off.allocated_ai_quota;
                  if (off.monthly_qr_quota !== qr || off.monthly_ai_quota !== ai || off.monthly_qr_limit !== qr || off.monthly_ai_limit !== ai) {
                    off.monthly_qr_quota = qr;
                    off.monthly_qr_limit = qr;
                    off.allocated_qr_quota = qr;
                    off.monthly_ai_quota = ai;
                    off.monthly_ai_limit = ai;
                    off.allocated_ai_quota = ai;
                    updated = true;
                  }
                }
              }
            }
          }
        }
      }

      if (updated) {
        await this.savePlansToSettings(plans);
      }
    }

    const sorted = plans.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    this.cachedPlans = sorted;
    this.cacheExpiresAt = Date.now() + this.CACHE_TTL_MS;
    return sorted;
  }

  /**
   * Get public/client active plans (only active plans, active version) for billing display.
   * Single authoritative source for client billing.
   */
  async getPublicPlans(forceRefresh: boolean = true): Promise<{
    plans: Array<{
      id: string;
      name: string;
      description: string;
      display_order: number;
      features: Record<string, boolean>;
      version_number: number;
      plan_version_id: string;
      durations: Record<PlanDurationKey, DurationOffering>;
    }>;
    trial: TrialConfig;
  }> {
    const [allPlans, trial] = await Promise.all([
      this.getPlans(forceRefresh),
      this.getTrialConfig(forceRefresh),
    ]);

    const activePlans = allPlans
      .filter(p => p.is_active)
      .map(p => {
        // Authoritatively select the active version
        const activeVersion = 
          p.versions.find(v => v.status === 'active') || 
          p.versions.find(v => v.status !== 'archived') || 
          p.versions[0];

        const versionNumber = activeVersion ? activeVersion.version_number : 1;
        const planVersionId = `${p.id}_v${versionNumber}`;

        return {
          id: p.id,
          name: p.name,
          description: p.description,
          display_order: p.display_order,
          features: p.features,
          version_number: versionNumber,
          plan_version_id: planVersionId,
          durations: activeVersion ? activeVersion.durations : ({} as Record<PlanDurationKey, DurationOffering>),
        };
      })
      .sort((a, b) => a.display_order - b.display_order);

    return { plans: activePlans, trial };
  }

  /**
   * Update plan metadata (name, description, features, display_order, is_active, durations).
   * Authoritatively updates plan definitions in the database.
   */
  async updatePlanMetadata(
    planId: string,
    updates: {
      name?: string;
      description?: string;
      display_order?: number;
      is_active?: boolean;
      features?: Record<string, boolean>;
      durations?: Record<PlanDurationKey, DurationOffering>;
    },
    adminUserId: string = 'admin'
  ): Promise<PlanDefinition> {
    const plans = await this.getPlans(true);
    const planIndex = plans.findIndex(p => p.id === planId);
    if (planIndex === -1) {
      throw new NotFoundError(`Plan '${planId}' not found`);
    }

    const oldPlan = JSON.parse(JSON.stringify(plans[planIndex]));

    if (updates.name !== undefined) plans[planIndex].name = updates.name.trim();
    if (updates.description !== undefined) plans[planIndex].description = updates.description.trim();
    if (updates.display_order !== undefined) plans[planIndex].display_order = updates.display_order;
    if (updates.is_active !== undefined) plans[planIndex].is_active = updates.is_active;
    if (updates.features !== undefined) plans[planIndex].features = { ...plans[planIndex].features, ...updates.features };
    if (updates.durations !== undefined) {
      this.validateDurationOfferings(updates.durations);
      const activeVer = plans[planIndex].versions?.find(v => v.status === 'active') || plans[planIndex].versions?.[0];
      if (activeVer) {
        activeVer.durations = { ...activeVer.durations, ...updates.durations };
      }
    }

    await this.savePlansToSettings(plans);

    // Audit log
    const action = updates.is_active === false && oldPlan.is_active !== false ? 'PLAN_DEACTIVATED' : 'PLAN_METADATA_UPDATED';
    await this.logAudit({
      action,
      resource_type: 'plan',
      resource_id: planId,
      user_id: adminUserId,
      metadata: { plan_id: planId, old_values: oldPlan, new_values: plans[planIndex] },
    });

    return plans[planIndex];
  }

  /**
   * Create a new plan version.
   * Validates duration > 0, price >= 0, quotas >= 0.
   */
  async createPlanVersion(
    planId: string,
    params: {
      durations: Record<PlanDurationKey, DurationOffering>;
      change_notes?: string;
      publishImmediately?: boolean;
    },
    adminUserId: string = 'admin'
  ): Promise<PlanVersion> {
    this.validateDurationOfferings(params.durations);

    const plans = await this.getPlans(true);
    const planIndex = plans.findIndex(p => p.id === planId);
    if (planIndex === -1) {
      throw new NotFoundError(`Plan '${planId}' not found`);
    }

    const currentVersions = plans[planIndex].versions || [];
    const highestVer = currentVersions.reduce((max, v) => Math.max(max, v.version_number || 0), 0);
    const newVersionNumber = highestVer + 1;
    const now = new Date().toISOString();

    const newVersion: PlanVersion = {
      version_number: newVersionNumber,
      status: params.publishImmediately ? 'active' : 'draft',
      created_at: now,
      created_by: adminUserId,
      published_at: params.publishImmediately ? now : undefined,
      change_notes: params.change_notes,
      durations: params.durations,
    };

    if (params.publishImmediately) {
      currentVersions.forEach(v => {
        if (v.status === 'active') {
          v.status = 'archived';
          v.archived_at = now;
        }
      });
    }

    currentVersions.unshift(newVersion);
    plans[planIndex].versions = currentVersions;

    await this.savePlansToSettings(plans);

    await this.logAudit({
      action: params.publishImmediately ? 'PLAN_VERSION_PUBLISHED' : 'PLAN_VERSION_CREATED',
      resource_type: 'plan_version',
      resource_id: `${planId}_v${newVersionNumber}`,
      user_id: adminUserId,
      metadata: {
        plan_id: planId,
        version_number: newVersionNumber,
        status: newVersion.status,
        durations: params.durations,
      },
    });

    return newVersion;
  }

  /**
   * Publish an existing draft or archived version as the live ACTIVE version.
   */
  async publishPlanVersion(
    planId: string,
    versionNumber: number,
    adminUserId: string = 'admin'
  ): Promise<PlanVersion> {
    const plans = await this.getPlans(true);
    const planIndex = plans.findIndex(p => p.id === planId);
    if (planIndex === -1) {
      throw new NotFoundError(`Plan '${planId}' not found`);
    }

    const versions = plans[planIndex].versions || [];
    const targetVer = versions.find(v => v.version_number === versionNumber);
    if (!targetVer) {
      throw new NotFoundError(`Version ${versionNumber} for plan '${planId}' not found`);
    }

    const now = new Date().toISOString();

    versions.forEach(v => {
      if (v.version_number !== versionNumber && v.status === 'active') {
        v.status = 'archived';
        v.archived_at = now;
      }
    });

    targetVer.status = 'active';
    targetVer.published_at = now;

    await this.savePlansToSettings(plans);

    await this.logAudit({
      action: 'PLAN_VERSION_PUBLISHED',
      resource_type: 'plan_version',
      resource_id: `${planId}_v${versionNumber}`,
      user_id: adminUserId,
      metadata: { plan_id: planId, version_number: versionNumber },
    });

    return targetVer;
  }

  /**
   * Archive a plan version so it is not selectable for new customers.
   */
  async archivePlanVersion(
    planId: string,
    versionNumber: number,
    adminUserId: string = 'admin'
  ): Promise<PlanVersion> {
    const plans = await this.getPlans(true);
    const planIndex = plans.findIndex(p => p.id === planId);
    if (planIndex === -1) {
      throw new NotFoundError(`Plan '${planId}' not found`);
    }

    const versions = plans[planIndex].versions || [];
    const targetVer = versions.find(v => v.version_number === versionNumber);
    if (!targetVer) {
      throw new NotFoundError(`Version ${versionNumber} for plan '${planId}' not found`);
    }

    const wasActive = targetVer.status === 'active';
    targetVer.status = 'archived';
    targetVer.archived_at = new Date().toISOString();

    // If the archived version was active, promote the highest remaining non-archived version to active
    if (wasActive) {
      const nonArchived = versions.filter(v => v.version_number !== versionNumber && v.status !== 'archived');
      if (nonArchived.length > 0) {
        const nextActive = nonArchived.reduce((prev, curr) => (curr.version_number > prev.version_number ? curr : prev));
        nextActive.status = 'active';
        nextActive.published_at = new Date().toISOString();
      }
    }

    await this.savePlansToSettings(plans);

    await this.logAudit({
      action: 'PLAN_VERSION_ARCHIVED',
      resource_type: 'plan_version',
      resource_id: `${planId}_v${versionNumber}`,
      user_id: adminUserId,
      metadata: { plan_id: planId, version_number: versionNumber },
    });

    return targetVer;
  }

  /**
   * Create a new custom plan with duration offerings and initial active version (v1).
   * Appears immediately in the plans list.
   */
  async createPlan(
    params: {
      name: string;
      description?: string;
      display_order?: number;
      is_active?: boolean;
      features?: Record<string, boolean>;
      durations: Record<PlanDurationKey, DurationOffering>;
    },
    adminUserId: string = 'admin'
  ): Promise<PlanDefinition> {
    if (!params.name || typeof params.name !== 'string' || !params.name.trim()) {
      throw new ValidationError('Plan name is required and cannot be empty');
    }

    const cleanName = params.name.trim();
    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const planId = slug || `plan_${Date.now()}`;

    const plans = await this.getPlans(true);

    if (plans.some(p => p.id.toLowerCase() === planId.toLowerCase() || p.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new ValidationError(`A plan with name '${cleanName}' or ID '${planId}' already exists`);
    }

    if (!params.durations || typeof params.durations !== 'object') {
      throw new ValidationError('Duration offerings are required for 1, 6, and 12 months');
    }

    // Validate duration offerings (ensures non-negative prices, valid monthly limits, max QR codes >= 1)
    this.validateDurationOfferings(params.durations);

    const highestDisplayOrder = plans.reduce((max, p) => Math.max(max, p.display_order || 0), 0);
    const displayOrder = typeof params.display_order === 'number' && params.display_order > 0
      ? params.display_order
      : highestDisplayOrder + 1;

    const defaultFeatures: Record<string, boolean> = {
      google_reviews: true,
      ai_generation: true,
      qr_customization: true,
      advanced_analytics: false,
      api_access: false,
      white_label: false,
      priority_support: false,
    };

    const now = new Date().toISOString();
    const initialVersion: PlanVersion = {
      version_number: 1,
      status: 'active',
      created_at: now,
      created_by: adminUserId,
      published_at: now,
      change_notes: 'Initial plan creation',
      durations: params.durations,
    };

    const newPlan: PlanDefinition = {
      id: planId,
      name: cleanName,
      description: (params.description || '').trim(),
      display_order: displayOrder,
      is_active: params.is_active !== undefined ? Boolean(params.is_active) : true,
      features: params.features ? { ...defaultFeatures, ...params.features } : defaultFeatures,
      versions: [initialVersion],
    };

    plans.push(newPlan);
    await this.savePlansToSettings(plans);

    await this.logAudit({
      action: 'PLAN_CREATED',
      resource_type: 'plan',
      resource_id: planId,
      user_id: adminUserId,
      new_values: newPlan,
      metadata: { plan_id: planId, plan_name: cleanName, display_order: displayOrder },
    });

    return newPlan;
  }

  /**
   * Check whether a plan or a specific version is referenced by:
   * - Active subscriptions
   * - Historical subscriptions
   * - Pending activation / upgrade requests
   */
  async checkPlanReferences(planId: string, versionNumber?: number): Promise<{
    hasActiveSubscriptions: boolean;
    hasHistoricalSubscriptions: boolean;
    hasPendingRequests: boolean;
    activeSubscriptionCount: number;
    historicalSubscriptionCount: number;
    pendingRequestCount: number;
    totalReferences: number;
    canPermanentlyDelete: boolean;
  }> {
    const targetPlanId = planId.toLowerCase();
    let activeSubscriptionCount = 0;
    let historicalSubscriptionCount = 0;

    // 1. Check subscriptions
    try {
      const { data: subs, error: subError } = await this.supabase
        .from('subscriptions')
        .select('id, status, plan_id, metadata');

      if (!subError && subs) {
        for (const sub of subs) {
          const subPlanId = (sub.plan_id || sub.metadata?.plan_id || '').toLowerCase();
          const subVersionId = (sub.metadata?.plan_version_id || '').toLowerCase();
          const subVersionNum = sub.metadata?.plan_version_number;

          let matches = false;
          if (versionNumber !== undefined) {
            matches = subVersionId === `${targetPlanId}_v${versionNumber}` ||
                      (subPlanId === targetPlanId && Number(subVersionNum) === versionNumber);
          } else {
            matches = subPlanId === targetPlanId || subVersionId.startsWith(`${targetPlanId}_`);
          }

          if (matches) {
            const isActive = ['active', 'trialing'].includes(sub.status);
            if (isActive) {
              activeSubscriptionCount++;
            } else {
              historicalSubscriptionCount++;
            }
          }
        }
      }
    } catch (err) {
      logger.warn({ err, planId }, 'Failed checking subscriptions references for plan');
    }

    // 2. Check upgrade_requests (pending)
    let pendingRequestCount = 0;
    try {
      const { data: requests, error: reqError } = await this.supabase
        .from('upgrade_requests')
        .select('id, requested_plan, current_plan, status')
        .eq('status', 'pending');

      if (!reqError && requests) {
        for (const req of requests) {
          if ((req.requested_plan || '').toLowerCase() === targetPlanId ||
              (req.current_plan || '').toLowerCase() === targetPlanId) {
            pendingRequestCount++;
          }
        }
      }
    } catch (err) {
      logger.warn({ err, planId }, 'Failed checking upgrade_requests references for plan');
    }

    const hasActiveSubscriptions = activeSubscriptionCount > 0;
    const hasHistoricalSubscriptions = historicalSubscriptionCount > 0;
    const hasPendingRequests = pendingRequestCount > 0;
    const totalReferences = activeSubscriptionCount + historicalSubscriptionCount + pendingRequestCount;
    const canPermanentlyDelete = totalReferences === 0;

    return {
      hasActiveSubscriptions,
      hasHistoricalSubscriptions,
      hasPendingRequests,
      activeSubscriptionCount,
      historicalSubscriptionCount,
      pendingRequestCount,
      totalReferences,
      canPermanentlyDelete,
    };
  }

  /**
   * Delete a plan or safely archive it if it has active or historical customer references.
   * - If references exist: Requires confirmation (forceArchive). Sets is_active = false and archives versions.
   * - If no references exist: Permanently removes the plan definition.
   */
  async deletePlan(
    planId: string,
    options: { forceArchive?: boolean } = {},
    adminUserId: string = 'admin'
  ): Promise<{
    action: 'deleted' | 'archived';
    planId: string;
    message: string;
    references: {
      hasActiveSubscriptions: boolean;
      hasHistoricalSubscriptions: boolean;
      hasPendingRequests: boolean;
      activeSubscriptionCount: number;
      historicalSubscriptionCount: number;
      pendingRequestCount: number;
      totalReferences: number;
      canPermanentlyDelete: boolean;
    };
  }> {
    const plans = await this.getPlans(true);
    const planIndex = plans.findIndex(p => p.id.toLowerCase() === planId.toLowerCase());
    if (planIndex === -1) {
      throw new NotFoundError(`Plan '${planId}' not found`);
    }

    const plan = plans[planIndex];
    const refs = await this.checkPlanReferences(planId);

    // SAFE DELETE RULE:
    // If plan has active subscriptions, historical subscriptions, or pending requests:
    // DO NOT physically delete the plan or historical version.
    if (refs.totalReferences > 0) {
      if (!options.forceArchive) {
        throw new ConflictError(
          'This plan is currently used by existing customers. It will be archived instead of permanently deleted.',
          refs
        );
      }

      // Safe archive: mark inactive and archive active versions
      plan.is_active = false;
      const now = new Date().toISOString();
      if (plan.versions) {
        plan.versions.forEach(v => {
          if (v.status === 'active') {
            v.status = 'archived';
            v.archived_at = now;
          }
        });
      }

      await this.savePlansToSettings(plans);

      await this.logAudit({
        action: 'PLAN_ARCHIVED',
        resource_type: 'plan',
        resource_id: planId,
        user_id: adminUserId,
        metadata: {
          plan_id: planId,
          plan_name: plan.name,
          reason: 'Safe deletion: Plan archived because it has customer references',
          references: refs,
        },
      });

      return {
        action: 'archived',
        planId,
        message: 'Plan has been archived instead of permanently deleted to protect existing customer subscriptions and history.',
        references: refs,
      };
    }

    // Newly created or unused plan with NO references: permanently delete
    const [deletedPlan] = plans.splice(planIndex, 1);
    await this.savePlansToSettings(plans);

    await this.logAudit({
      action: 'PLAN_DELETED',
      resource_type: 'plan',
      resource_id: planId,
      user_id: adminUserId,
      metadata: {
        plan_id: planId,
        deleted_plan: deletedPlan,
        references: refs,
      },
    });

    return {
      action: 'deleted',
      planId,
      message: 'Plan has been permanently deleted as it has no active, historical, or pending customer references.',
      references: refs,
    };
  }

  /**
   * Delete or archive an unreferenced plan version.
   */
  async deletePlanVersion(
    planId: string,
    versionNumber: number,
    options: { forceArchive?: boolean } = {},
    adminUserId: string = 'admin'
  ): Promise<{
    action: 'deleted' | 'archived';
    planId: string;
    versionNumber: number;
    message: string;
  }> {
    const plans = await this.getPlans();
    const plan = plans.find(p => p.id.toLowerCase() === planId.toLowerCase());
    if (!plan) {
      throw new NotFoundError(`Plan '${planId}' not found`);
    }

    const verIndex = plan.versions.findIndex(v => v.version_number === versionNumber);
    if (verIndex === -1) {
      throw new NotFoundError(`Version ${versionNumber} for plan '${planId}' not found`);
    }

    const refs = await this.checkPlanReferences(planId, versionNumber);

    if (refs.totalReferences > 0) {
      if (!options.forceArchive) {
        throw new ConflictError(
          `Version ${versionNumber} is currently referenced by subscriptions or requests. It will be archived instead of permanently deleted.`,
          refs
        );
      }

      await this.archivePlanVersion(planId, versionNumber, adminUserId);
      return {
        action: 'archived',
        planId,
        versionNumber,
        message: `Version ${versionNumber} archived to preserve existing customer references.`,
      };
    }

    if (plan.versions.length <= 1) {
      throw new ValidationError('Cannot delete the only version of a plan.');
    }

    const [deletedVer] = plan.versions.splice(verIndex, 1);
    const wasActive = deletedVer.status === 'active';

    if (wasActive && plan.versions.length > 0) {
      const nextVer = plan.versions.reduce((prev, curr) => (curr.version_number > prev.version_number ? curr : prev));
      nextVer.status = 'active';
      nextVer.published_at = new Date().toISOString();
    }

    await this.savePlansToSettings(plans);

    await this.logAudit({
      action: 'PLAN_VERSION_DELETED',
      resource_type: 'plan_version',
      resource_id: `${planId}_v${versionNumber}`,
      user_id: adminUserId,
      metadata: { plan_id: planId, version_number: versionNumber },
    });

    return {
      action: 'deleted',
      planId,
      versionNumber,
      message: `Version ${versionNumber} permanently deleted.`,
    };
  }

  /**
   * Get current Free Trial configuration
   */
  async getTrialConfig(forceRefresh: boolean = false): Promise<TrialConfig> {
    if (!forceRefresh && this.cachedTrial && Date.now() < this.cacheExpiresAt) {
      return this.cachedTrial;
    }

    const { data: settings } = await this.supabase
      .from('admin_settings')
      .select('limits')
      .limit(1)
      .maybeSingle();

    let trial: TrialConfig = settings?.limits?.trial_config;
    if (!trial) {
      trial = this.getDefaultTrialConfig();
      await this.saveTrialConfigToSettings(trial);
    }

    this.cachedTrial = trial;
    return trial;
  }

  /**
   * Update Free Trial configuration.
   * Increments trial version so existing trials retain their initial snapshot,
   * while future new trials receive this new configuration.
   */
  async updateTrialConfig(
    updates: {
      enabled?: boolean;
      duration_days?: number;
      total_qr_quota?: number;
      total_ai_quota?: number;
      max_qr_codes?: number;
      features?: Record<string, boolean>;
    },
    adminUserId: string = 'admin'
  ): Promise<TrialConfig & { affected_active_trials?: number; summary?: string }> {
    const current = await this.getTrialConfig();
    const oldConfig = JSON.parse(JSON.stringify(current));

    // Server-side validation
    if (updates.duration_days !== undefined) {
      if (typeof updates.duration_days !== 'number' || updates.duration_days <= 0) {
        throw new ValidationError('Trial duration must be greater than 0 days');
      }
    }
    if (updates.total_qr_quota !== undefined) {
      if (typeof updates.total_qr_quota !== 'number' || updates.total_qr_quota < 0) {
        throw new ValidationError('Total QR quota must be non-negative');
      }
    }
    if (updates.total_ai_quota !== undefined) {
      if (typeof updates.total_ai_quota !== 'number' || updates.total_ai_quota < 0) {
        throw new ValidationError('Total AI quota must be non-negative');
      }
    }
    if (updates.max_qr_codes !== undefined) {
      if (typeof updates.max_qr_codes !== 'number' || updates.max_qr_codes < 0) {
        throw new ValidationError('Max QR codes must be non-negative');
      }
    }

    // Determine affected fields
    const affectedFields: string[] = [];
    if (updates.duration_days !== undefined && updates.duration_days !== oldConfig.duration_days) {
      affectedFields.push('duration_days');
    }
    if (updates.total_qr_quota !== undefined && updates.total_qr_quota !== oldConfig.total_qr_quota) {
      affectedFields.push('total_qr_quota');
    }
    if (updates.total_ai_quota !== undefined && updates.total_ai_quota !== oldConfig.total_ai_quota) {
      affectedFields.push('total_ai_quota');
    }
    if (updates.max_qr_codes !== undefined && updates.max_qr_codes !== oldConfig.max_qr_codes) {
      affectedFields.push('max_qr_codes');
    }
    if (updates.enabled !== undefined && updates.enabled !== oldConfig.enabled) {
      affectedFields.push('enabled');
    }
    if (updates.features && JSON.stringify(updates.features) !== JSON.stringify(oldConfig.features)) {
      affectedFields.push('features');
    }
    if (affectedFields.length === 0) {
      affectedFields.push('duration_days');
    }

    const newVersion = (current.version || 1) + 1;
    const nowIso = new Date().toISOString();
    const updated: TrialConfig = {
      enabled: updates.enabled !== undefined ? updates.enabled : current.enabled,
      duration_days: updates.duration_days !== undefined ? updates.duration_days : current.duration_days,
      total_qr_quota: updates.total_qr_quota !== undefined ? updates.total_qr_quota : current.total_qr_quota,
      total_ai_quota: updates.total_ai_quota !== undefined ? updates.total_ai_quota : current.total_ai_quota,
      max_qr_codes: updates.max_qr_codes !== undefined ? updates.max_qr_codes : current.max_qr_codes,
      features: updates.features ? { ...current.features, ...updates.features } : current.features,
      version: newVersion,
      updated_at: nowIso,
      updated_by: adminUserId,
    };

    // Authoritatively synchronize all currently ACTIVE Free Trial subscriptions to the new Admin trial configuration
    const syncResult = await this.syncActiveTrialSubscriptions(updated);
    const affectedActiveTrials = (syncResult.updatedCount || 0) + (syncResult.expiredCount || 0);

    const summary = `Trial config changed: ${oldConfig.duration_days} days/${oldConfig.total_qr_quota} QR/${oldConfig.total_ai_quota} AI → ${updated.duration_days} days/${updated.total_qr_quota} QR/${updated.total_ai_quota} AI (Affected active trials: ${affectedActiveTrials})`;

    const historyRecord: TrialConfigHistoryRecord = {
      version_id: `trial_v${newVersion}`,
      version: newVersion,
      action_type: 'TRIAL_CONFIG_CHANGED',
      admin_id: adminUserId,
      timestamp: nowIso,
      affected_fields: affectedFields,
      affected_active_trials: affectedActiveTrials,
      summary,
      old_values: oldConfig,
      new_values: updated,
    };

    // 1. Save updated configuration and history to admin_settings
    await this.saveTrialConfigToSettings(updated, historyRecord);

    // 2. Insert audit log into audit_logs table
    await this.logAudit({
      action: 'TRIAL_CONFIG_CHANGED',
      resource_type: 'trial_config',
      resource_id: null,
      user_id: adminUserId,
      old_values: oldConfig,
      new_values: updated,
      metadata: {
        admin_id: adminUserId,
        user_id: adminUserId,
        version_id: `trial_v${newVersion}`,
        version: newVersion,
        action_type: 'TRIAL_CONFIG_CHANGED',
        timestamp: nowIso,
        affected_fields: affectedFields,
        affected_active_trials: affectedActiveTrials,
        affected_trials_count: affectedActiveTrials,
        updated_trials: syncResult.updatedCount,
        expired_trials: syncResult.expiredCount,
        summary,
        old_values: oldConfig,
        new_values: updated,
      },
    });

    return {
      ...updated,
      affected_active_trials: affectedActiveTrials,
      summary,
    };
  }

  /**
   * Synchronous helper to get latest cached trial config or defaults
   */
  getLatestTrialConfigSync(): TrialConfig {
    return this.cachedTrial || this.getDefaultTrialConfig();
  }

  /**
   * Synchronize all existing active Free Trial subscriptions with the latest Admin trial configuration.
   * 
   * Strict Rules:
   * 1. Applies ONLY to FREE_TRIAL subscriptions (never modifies paid subscriptions like Base, Pro, Unlimited).
   * 2. Expired/completed trials must NOT become active again (do NOT extend an already expired trial).
   * 3. Existing usage (used_qr_quota, used_ai_quota) is NEVER reset or deleted.
   * 4. If usage >= new limit, remaining becomes 0 and quota is marked exhausted.
   * 5. Recalculates expiry date: original_start_date + new_duration_days.
   *    If new expiry is in the past, marks trial as expired.
   */
  async syncActiveTrialSubscriptions(trialConfig: TrialConfig): Promise<{ updatedCount: number; expiredCount: number }> {
    const now = Date.now();
    let updatedCount = 0;
    let expiredCount = 0;

    try {
      // Find all subscriptions that are potentially free trial records
      const { data: subs, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .or('plan_id.eq.free_trial,plan_id.eq.free,status.eq.trialing');

      if (error || !subs || subs.length === 0) {
        return { updatedCount: 0, expiredCount: 0 };
      }

      for (const sub of subs) {
        // Rule 1: Must ONLY be a free trial. Never touch paid subscriptions!
        const isTrial = sub.plan_id === 'free_trial' || sub.plan_id === 'free' || sub.metadata?.plan_id === 'free_trial';
        if (!isTrial) {
          continue;
        }

        // Rule 2: Expired/completed trials must NOT become active again!
        const originalEndStr = sub.trial_end || sub.current_period_end;
        const originalEndMs = originalEndStr ? new Date(originalEndStr).getTime() : 0;
        const wasAlreadyExpired = sub.status === 'expired' || (originalEndMs > 0 && originalEndMs <= now);

        if (wasAlreadyExpired) {
          // If the record was still marked trialing in DB despite time expiration, ensure it is set to expired
          if (sub.status === 'trialing') {
            await this.supabase
              .from('subscriptions')
              .update({
                status: 'expired',
                updated_at: new Date().toISOString(),
              })
              .eq('id', sub.id);
          }
          // Do NOT extend or reactivate
          continue;
        }

        // Only active trialing subscriptions continue to recalculation
        if (sub.status !== 'trialing') {
          continue;
        }

        // Rule 5: Recalculate expiry from existing start date + new Admin duration
        const startDateStr = sub.trial_start || sub.current_period_start || sub.created_at;
        const startMs = new Date(startDateStr).getTime();
        const newEndMs = startMs + (trialConfig.duration_days * 86400000);
        const newEndDateStr = new Date(newEndMs).toISOString();
        const isNowExpired = now >= newEndMs;

        // Rule 3 & 4: Preserve existing usage, recalculate remaining quotas
        const meta = sub.metadata || {};
        const usedQr = Number(meta.used_qr_quota ?? meta.used_qr ?? 0);
        const usedAi = Number(meta.used_ai_quota ?? meta.used_ai ?? 0);
        const totalQr = trialConfig.total_qr_quota;
        const totalAi = trialConfig.total_ai_quota;
        const remainingQr = totalQr === -1 ? -1 : Math.max(0, totalQr - usedQr);
        const remainingAi = totalAi === -1 ? -1 : Math.max(0, totalAi - usedAi);

        let exhaustionReason: string | null = null;
        if (isNowExpired) {
          exhaustionReason = 'TRIAL_EXPIRED';
        } else if (totalQr !== -1 && remainingQr <= 0) {
          exhaustionReason = 'QR_QUOTA_EXHAUSTED';
        } else if (totalAi !== -1 && remainingAi <= 0) {
          exhaustionReason = 'AI_QUOTA_EXHAUSTED';
        }

        const newStatus = isNowExpired ? 'expired' : 'trialing';

        const updatedMeta = {
          ...meta,
          duration: `${trialConfig.duration_days}_days`,
          duration_days: trialConfig.duration_days,
          trial_version: trialConfig.version,
          plan_version_id: `trial_v${trialConfig.version}`,
          allocated_qr_quota: totalQr,
          allocated_ai_quota: totalAi,
          used_qr_quota: usedQr, // Never reset or delete
          used_ai_quota: usedAi, // Never reset or delete
          remaining_qr_quota: remainingQr,
          remaining_ai_quota: remainingAi,
          max_qr_codes: trialConfig.max_qr_codes,
          features: trialConfig.features,
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

        if (isNowExpired) {
          expiredCount++;
        } else {
          updatedCount++;
        }
      }
    } catch (err) {
      logger.error({ error: err }, 'Error during syncActiveTrialSubscriptions');
    }

    return { updatedCount, expiredCount };
  }

  // --- Helpers ---

  private validateDurationOfferings(durations: Record<PlanDurationKey, DurationOffering>) {
    const requiredKeys: PlanDurationKey[] = ['1_month', '6_months', '12_months'];
    for (const key of requiredKeys) {
      const offering = durations[key];
      if (!offering) {
        throw new ValidationError(`Missing duration offering for '${key}'`);
      }
      if (typeof offering.duration_months !== 'number' || offering.duration_months <= 0) {
        throw new ValidationError(`Invalid duration_months for '${key}': must be > 0`);
      }
      if (typeof offering.price_inr !== 'number' || offering.price_inr < 0) {
        throw new ValidationError(`Invalid price_inr for '${key}': must be >= 0`);
      }

      // Monthly QR limit validation (integer >= 0 or -1 for unlimited)
      const qrQuota = offering.monthly_qr_quota ?? offering.monthly_qr_limit ?? offering.allocated_qr_quota;
      if (typeof qrQuota !== 'number' || !Number.isInteger(qrQuota) || (qrQuota < 0 && qrQuota !== -1)) {
        throw new ValidationError(`Invalid Monthly QR Limit for '${key}': must be an integer >= 0 or -1 (unlimited)`);
      }
      offering.monthly_qr_quota = qrQuota;
      offering.monthly_qr_limit = qrQuota;
      offering.allocated_qr_quota = qrQuota;

      // Monthly AI limit validation (integer >= 0 or -1 for unlimited)
      const aiQuota = offering.monthly_ai_quota ?? offering.monthly_ai_limit ?? offering.allocated_ai_quota;
      if (typeof aiQuota !== 'number' || !Number.isInteger(aiQuota) || (aiQuota < 0 && aiQuota !== -1)) {
        throw new ValidationError(`Invalid Monthly AI Limit for '${key}': must be an integer >= 0 or -1 (unlimited)`);
      }
      offering.monthly_ai_quota = aiQuota;
      offering.monthly_ai_limit = aiQuota;
      offering.allocated_ai_quota = aiQuota;

      if (typeof offering.max_qr_codes !== 'number' || offering.max_qr_codes < 0) {
        throw new ValidationError(`Invalid max_qr_codes for '${key}': must be >= 0`);
      }
    }
  }

  private async savePlansToSettings(plans: PlanDefinition[]) {
    this.invalidateCache();
    const { data: currentSettings } = await this.supabase
      .from('admin_settings')
      .select('id, limits')
      .limit(1)
      .maybeSingle();

    const limits = currentSettings?.limits || {};
    limits.plans = plans;

    if (currentSettings?.id) {
      await this.supabase
        .from('admin_settings')
        .update({ limits, updated_at: new Date().toISOString() })
        .eq('id', currentSettings.id);
    } else {
      await this.supabase
        .from('admin_settings')
        .insert({ limits, updated_at: new Date().toISOString() });
    }
    this.cachedPlans = plans;
    this.cacheExpiresAt = Date.now() + this.CACHE_TTL_MS;
  }

  private async saveTrialConfigToSettings(trialConfig: TrialConfig, historyEntry?: TrialConfigHistoryRecord) {
    this.invalidateCache();
    const { data: currentSettings } = await this.supabase
      .from('admin_settings')
      .select('id, limits')
      .limit(1)
      .maybeSingle();

    const limits = currentSettings?.limits || {};
    limits.trial_config = trialConfig;

    if (historyEntry) {
      if (!Array.isArray(limits.trial_history)) {
        limits.trial_history = [];
      }
      limits.trial_history.unshift(historyEntry);
      // Retain up to 100 historical versions
      if (limits.trial_history.length > 100) {
        limits.trial_history = limits.trial_history.slice(0, 100);
      }
    }

    if (currentSettings?.id) {
      await this.supabase
        .from('admin_settings')
        .update({ limits, updated_at: new Date().toISOString() })
        .eq('id', currentSettings.id);
    } else {
      await this.supabase
        .from('admin_settings')
        .insert({ limits, updated_at: new Date().toISOString() });
    }
    this.cachedTrial = trialConfig;
    this.cacheExpiresAt = Date.now() + this.CACHE_TTL_MS;
  }

  private async logAudit(entry: {
    action: string;
    resource_type: string;
    resource_id?: string | null;
    user_id?: string | null;
    business_id?: string | null;
    old_values?: any;
    new_values?: any;
    metadata?: any;
  }) {
    try {
      const isUserUuid = entry.user_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.user_id);
      const isResourceIdUuid = entry.resource_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.resource_id);

      let validUserId: string | null = null;
      if (isUserUuid) {
        const { data: userExists } = await this.supabase
          .from('users')
          .select('id')
          .eq('id', entry.user_id)
          .maybeSingle();
        if (userExists) {
          validUserId = entry.user_id || null;
        }
      }

      const { error: insertErr } = await this.supabase.from('audit_logs').insert({
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: isResourceIdUuid ? entry.resource_id : null,
        user_id: validUserId,
        business_id: entry.business_id || null,
        old_values: entry.old_values || entry.metadata?.old_values || null,
        new_values: entry.new_values || entry.metadata?.new_values || null,
        metadata: {
          ...entry.metadata,
          admin_id: entry.user_id || entry.metadata?.admin_id || 'admin',
        },
        created_at: new Date().toISOString(),
      });

      if (insertErr) {
        logger.warn({ insertErr, entry }, 'Failed to insert audit log for plan configuration');
      }
    } catch (e) {
      logger.warn({ error: e, entry }, 'Failed to insert audit log for plan configuration');
    }
  }

  /**
   * Fetch complete Free Trial configuration audit history.
   * Pulls authoritatively from postgres audit_logs with fallback to admin_settings.limits.trial_history.
   */
  async getTrialConfigHistory(): Promise<TrialConfigHistoryRecord[]> {
    try {
      // 1. Fetch from audit_logs table
      const { data: logs, error } = await this.supabase
        .from('audit_logs')
        .select('*')
        .eq('resource_type', 'trial_config')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && logs && logs.length > 0) {
        return logs.map((l: any) => ({
          id: l.id,
          version_id: l.metadata?.version_id || `trial_v${l.new_values?.version || 1}`,
          version: l.new_values?.version || l.metadata?.version || 1,
          action_type: l.metadata?.action_type || l.action || 'TRIAL_CONFIG_CHANGED',
          admin_id: l.metadata?.admin_id || l.metadata?.user_id || l.user_id || 'admin',
          timestamp: l.created_at || l.metadata?.timestamp,
          affected_fields: l.metadata?.affected_fields || [],
          affected_active_trials: l.metadata?.affected_active_trials ?? l.metadata?.affected_trials_count ?? 0,
          summary: l.metadata?.summary || '',
          old_values: l.old_values || l.metadata?.old_values || {},
          new_values: l.new_values || l.metadata?.new_values || {},
        }));
      }

      // 2. Fallback to admin_settings.limits.trial_history
      const { data: settings } = await this.supabase
        .from('admin_settings')
        .select('limits')
        .limit(1)
        .maybeSingle();

      return (settings?.limits?.trial_history as TrialConfigHistoryRecord[]) || [];
    } catch (err) {
      logger.error({ error: err }, 'Failed to fetch trial config history');
      return [];
    }
  }
}

export const planConfigService = new PlanConfigService();
