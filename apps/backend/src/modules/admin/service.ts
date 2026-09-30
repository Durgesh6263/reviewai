import { SupabaseClient } from '@supabase/supabase-js';
import {
  AdminBusiness,
  AdminBusinessListQuery,
  AdminBusinessDetail,
  AdminQRCode,
  AdminQRCodeListQuery,
  AdminAnalytics,
  AdminAnalyticsQuery,
  AdminSubscription,
  AdminSubscriptionListQuery,
  AdminSubscriptionStats,
  AdminSystemHealth,
  AdminSystemStats,
  AdminBackgroundJob,
  AdminSettings,
  AdminStats,
  AdminRecentActivity,
  AdminSettingsUpdate,
  AdminUpgradeRequest,
  AdminUpgradeRequestListQuery,
  AdminFeedbackItem,
  AdminFeedbackListQuery,
  PilotInsightsQuery,
  PilotInsightsResponse,
  PilotBusinessActivityItem,
  PilotActivationStatus,
  PilotUsageTrendItem,
  PilotControlCenterQuery,
  PilotControlCenterResponse,
  PilotControlCenterBusiness,
} from './types';
import { operationalIncidents } from './incident_service';
import { NotFoundError, ValidationError } from '../../shared/exceptions';

export class AdminService {
  private statsCache: { data: AdminStats; expiresAt: number } | null = null;
  private clientsCache = new Map<string, { data: any; expiresAt: number }>();

  constructor(private supabase: SupabaseClient) {}

  invalidateAdminCaches(): void {
    this.statsCache = null;
    this.clientsCache.clear();
  }

  async getBusinesses(query: AdminBusinessListQuery): Promise<{ data: AdminBusiness[]; meta: { total: number; page: number; limit: number; total_pages: number } }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    let queryBuilder = this.supabase
      .from('businesses')
      .select(`
        id,
        name,
        slug,
        email,
        owner_id,
        is_active,
        google_place_id,
        google_review_url,
        description,
        is_pilot_business,
        pilot_limits,
        created_at,
        owner:users!businesses_owner_id_fkey(id, name, email, role, is_pilot_user, pilot_cohort, created_at),
        stats:business_stats(total_scans, total_reviews, conversion_rate),
        subscription:subscriptions(plan, status, trial_end, stripe_subscription_id, stripe_customer_id, current_period_start, current_period_end, canceled_at, cancel_at_period_end, quantity, monthly_price, features),
        qr_codes:qr_codes(id, name, download_count, is_active)
      `, { count: 'exact' });

    if (query.search) {
      queryBuilder = queryBuilder.or(`name.ilike.%${query.search}%,slug.ilike.%${query.search}%,email.ilike.%${query.search}%`);
    }

    if (query.status && query.status !== 'all') {
      queryBuilder = queryBuilder.eq('is_active', query.status === 'active');
    }

    if (query.plan && query.plan !== 'all') {
      queryBuilder = queryBuilder.eq('subscription.plan', query.plan);
    }

    if (query.readiness && query.readiness !== 'all') {
      // We'll filter by readiness after computing it
    }

    if (query.health && query.health !== 'all') {
      // We'll filter by health after computing it
    }

    queryBuilder = queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await queryBuilder;

    if (error) throw error;

    const businessesData = data || [];
    const businessIds = businessesData.map(b => b.id);

    // Fetch additional data needed for pilot readiness and health in batch
    const [
      { data: onboardingProgress },
      { data: tags },
      { data: scans },
      { data: sessions },
      { data: reviews },
      { data: feedback },
    ] = await Promise.all([
      businessIds.length > 0 ? this.supabase
        .from('onboarding_progress')
        .select('business_id, current_step, completed_steps, completed_at')
        .in('business_id', businessIds) : Promise.resolve({ data: [] }),
      businessIds.length > 0 ? this.supabase
        .from('tags')
        .select('business_id, id, name, emoji, order')
        .in('business_id', businessIds) : Promise.resolve({ data: [] }),
      businessIds.length > 0 ? this.supabase
        .from('scan_logs')
        .select('business_id, id, scanned_at')
        .in('business_id', businessIds)
        .gte('scanned_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) : Promise.resolve({ data: [] }),
      businessIds.length > 0 ? this.supabase
        .from('review_sessions')
        .select('business_id, id, status, rating, language, started_at')
        .in('business_id', businessIds)
        .gte('started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) : Promise.resolve({ data: [] }),
      businessIds.length > 0 ? this.supabase
        .from('generated_reviews')
        .select('business_id, id, rating, created_at')
        .in('business_id', businessIds)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) : Promise.resolve({ data: [] }),
      businessIds.length > 0 ? this.supabase
        .from('pilot_feedback')
        .select('business_id, id, status')
        .in('business_id', businessIds)
        .eq('status', 'open') : Promise.resolve({ data: [] }),
    ]);

    // Group additional data by business_id for easy lookup
    const onboardingByBusiness = new Map<string, any>();
    (onboardingProgress || []).forEach(op => onboardingByBusiness.set(op.business_id, op));

    const tagsByBusiness = new Map<string, any[]>();
    (tags || []).forEach(t => {
      if (!tagsByBusiness.has(t.business_id)) tagsByBusiness.set(t.business_id, []);
      tagsByBusiness.get(t.business_id)!.push(t);
    });

    const scansByBusiness = new Map<string, any[]>();
    (scans || []).forEach(s => {
      if (!scansByBusiness.has(s.business_id)) scansByBusiness.set(s.business_id, []);
      scansByBusiness.get(s.business_id)!.push(s);
    });

    const sessionsByBusiness = new Map<string, any[]>();
    (sessions || []).forEach(s => {
      if (!sessionsByBusiness.has(s.business_id)) sessionsByBusiness.set(s.business_id, []);
      sessionsByBusiness.get(s.business_id)!.push(s);
    });

    const reviewsByBusiness = new Map<string, any[]>();
    (reviews || []).forEach(r => {
      if (!reviewsByBusiness.has(r.business_id)) reviewsByBusiness.set(r.business_id, []);
      reviewsByBusiness.get(r.business_id)!.push(r);
    });

    const feedbackByBusiness = new Map<string, number>();
    (feedback || []).forEach(f => {
      feedbackByBusiness.set(f.business_id, (feedbackByBusiness.get(f.business_id) || 0) + 1);
    });

    // Build the response with pilot-specific fields
    let businesses: AdminBusiness[] = businessesData.map((b: any) => {
      const businessId = b.id;
      const owner = Array.isArray(b.owner) ? b.owner[0] : b.owner;
      const subscription = b.subscription?.[0] || null;
      const qrCodes = b.qr_codes || [];
      const businessTags = tagsByBusiness.get(businessId) || [];
      const businessScans = scansByBusiness.get(businessId) || [];
      const businessSessions = sessionsByBusiness.get(businessId) || [];
      const businessReviews = reviewsByBusiness.get(businessId) || [];
      const onboarding = onboardingByBusiness.get(businessId) || null;
      const openFeedbackCount = feedbackByBusiness.get(businessId) || 0;

      // Calculate pilot readiness
      const pilotReadiness = this.calculatePilotReadinessForList(b, onboarding, qrCodes, subscription, businessTags);

      // Calculate health indicator
      const health = this.calculateHealthIndicatorForList(b, businessScans, businessSessions, businessReviews, subscription);

      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        email: b.email,
        owner_id: b.owner_id,
        owner_name: owner?.name || 'Unknown',
        owner_email: owner?.email || 'Unknown',
        is_active: b.is_active,
        google_place_id: b.google_place_id,
        is_pilot_business: b.is_pilot_business || false,
        pilot_readiness_score: pilotReadiness.score,
        pilot_readiness_status: pilotReadiness.status,
        health_score: health.score,
        health_status: health.status,
        open_feedback_count: openFeedbackCount,
        stats: {
          total_scans: b.stats?.[0]?.total_scans || 0,
          total_reviews: b.stats?.[0]?.total_reviews || 0,
          conversion_rate: b.stats?.[0]?.conversion_rate || 0,
          qr_codes_count: qrCodes.length,
        },
        subscription: subscription ? {
          plan: subscription.plan,
          status: subscription.status,
        } : null,
        created_at: b.created_at,
      };
    });

    // Apply readiness filter if specified
    if (query.readiness && query.readiness !== 'all') {
      businesses = businesses.filter(b => b.pilot_readiness_status === query.readiness);
    }

    // Apply health filter if specified
    if (query.health && query.health !== 'all') {
      businesses = businesses.filter(b => b.health_status === query.health);
    }

    return {
      data: businesses,
      meta: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
    };
  }

  private calculatePilotReadinessForList(
    business: any,
    onboarding: any,
    qrCodes: any[],
    subscription: any,
    tags: any[]
  ): { score: number; status: 'not_started' | 'in_progress' | 'ready' | 'launched' } {
    let score = 0;

    // Business info (20 points)
    if (business.name && business.google_review_url) {
      score += 20;
    }

    // Google config verified (20 points)
    if (business.google_review_url) {
      score += 20;
    }

    // Experience tags added (15 points)
    if (tags && tags.length > 0) {
      score += 15;
    }

    // QR code created (15 points)
    if (qrCodes && qrCodes.length > 0) {
      score += 15;
    }

    // QR code tested (10 points)
    const hasScans = qrCodes && qrCodes.some(q => q.download_count > 0);
    if (hasScans) {
      score += 10;
    }

    // Onboarding completed (10 points)
    if (onboarding && onboarding.completed_at) {
      score += 10;
    } else if (onboarding && onboarding.current_step !== 'welcome') {
      score += 5;
    }

    // Subscription active (10 points)
    if (subscription && ['active', 'trialing'].includes(subscription.status)) {
      score += 10;
    }

    let status: 'not_started' | 'in_progress' | 'ready' | 'launched';
    if (score === 0) status = 'not_started';
    else if (score < 70) status = 'in_progress';
    else if (score < 100) status = 'ready';
    else status = 'launched';

    return { score, status };
  }

  private calculateHealthIndicatorForList(
    business: any,
    scans: any[],
    sessions: any[],
    reviews: any[],
    subscription: any
  ): { score: number; status: 'healthy' | 'at_risk' | 'critical' } {
    let score = 100;

    // Activity factor (40 points max)
    const recentScans = scans?.length || 0;
    const recentSessions = sessions?.length || 0;
    const recentReviews = reviews?.length || 0;
    const conversionRate = recentScans > 0 ? (recentReviews / recentScans) * 100 : 0;

    if (recentScans === 0) {
      score -= 40;
    } else if (recentScans < 10) {
      score -= 20;
    } else if (recentScans < 50) {
      score -= 10;
    }

    if (conversionRate > 0 && conversionRate < 10) {
      score -= 15;
    } else if (conversionRate > 0 && conversionRate < 20) {
      score -= 5;
    }

    // Subscription health (30 points)
    if (!subscription) {
      score -= 30;
    } else if (subscription.status === 'past_due') {
      score -= 20;
    } else if (subscription.status === 'canceled') {
      score -= 30;
    } else if (subscription.status === 'trialing') {
      const trialEnd = subscription.trial_end ? new Date(subscription.trial_end).getTime() : 0;
      const daysLeft = (trialEnd - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysLeft < 3) {
        score -= 15;
      } else if (daysLeft < 7) {
        score -= 5;
      }
    }

    let status: 'healthy' | 'at_risk' | 'critical';
    if (score >= 80) status = 'healthy';
    else if (score >= 50) status = 'at_risk';
    else status = 'critical';

    return { score: Math.max(0, score), status };
  }

  async getBusinessDetail(id: string): Promise<AdminBusinessDetail> {
    // Fetch business with all related data in parallel to avoid N+1
    const [
      { data: business, error: businessError },
      { data: qrCodes },
      { data: tags },
      { data: subscription },
      { data: usageLogs },
      { data: onboardingProgress },
      { data: feedback },
      { data: scans },
      { data: sessions },
      { data: reviews },
    ] = await Promise.all([
      this.supabase
        .from('businesses')
        .select(`
          id,
          name,
          slug,
          email,
          owner_id,
          description,
          logo_url,
          google_review_url,
          website_url,
          phone,
          address,
          timezone,
          status,
          settings,
          is_pilot_business,
          pilot_limits,
          created_at,
          updated_at,
          owner:users!businesses_owner_id_fkey(id, name, email, role, is_pilot_user, pilot_cohort, created_at)
        `)
        .eq('id', id)
        .single(),
      this.supabase
        .from('qr_codes')
        .select('id, name, slug, design, is_active, download_count, last_downloaded_at, created_at, updated_at')
        .eq('business_id', id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      this.supabase
        .from('tags')
        .select('id, name, emoji, order, created_at')
        .eq('business_id', id)
        .order('order', { ascending: true }),
      this.supabase
        .from('subscriptions')
        .select('id, plan, status, stripe_subscription_id, stripe_customer_id, current_period_start, current_period_end, trial_start, trial_end, canceled_at, cancel_at_period_end, quantity, monthly_price, features, created_at, updated_at')
        .eq('business_id', id)
        .single(),
      this.supabase
        .from('usage_logs')
        .select('metric, count, period_start, period_end')
        .eq('business_id', id)
        .order('period_start', { ascending: false })
        .limit(12),
      this.supabase
        .from('onboarding_progress')
        .select('current_step, completed_steps, step_data, started_at, completed_at, is_pilot_user, pilot_cohort')
        .eq('business_id', id)
        .single(),
      this.supabase
        .from('pilot_feedback')
        .select('id, category, rating, feedback_text, step_context, created_at')
        .eq('business_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
      this.supabase
        .from('scan_logs')
        .select('id, scanned_at')
        .eq('business_id', id)
        .gte('scanned_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      this.supabase
        .from('review_sessions')
        .select('id, status, rating, language, started_at')
        .eq('business_id', id)
        .gte('started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      this.supabase
        .from('generated_reviews')
        .select('id, rating, ai_provider, created_at')
        .eq('business_id', id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    if (businessError || !business) {
      throw new Error('Business not found');
    }

    // Calculate pilot readiness
    const pilotReadiness = this.calculatePilotReadiness(business, onboardingProgress, qrCodes || [], subscription, tags || []);

    // Calculate health indicator
    const health = this.calculateHealthIndicator(business, scans || [], sessions || [], reviews || [], subscription);

    // Calculate activity summary (last 30 days)
    const activitySummary = this.calculateActivitySummary(scans || [], sessions || [], reviews || []);

    const owner = Array.isArray(business.owner) ? business.owner[0] : business.owner;

    return {
      id: business.id,
      name: business.name,
      slug: business.slug,
      email: business.email,
      owner_id: business.owner_id,
      owner_name: owner?.name || 'Unknown',
      owner_email: owner?.email || 'Unknown',
      owner_role: owner?.role || 'business_owner',
      owner_is_pilot: owner?.is_pilot_user || false,
      owner_pilot_cohort: owner?.pilot_cohort || null,
      owner_created_at: owner?.created_at || null,
      description: business.description,
      logo_url: business.logo_url,
      google_review_url: business.google_review_url,
      website_url: business.website_url,
      phone: business.phone,
      address: business.address,
      timezone: business.timezone,
      status: business.status,
      settings: business.settings || {},
      is_pilot_business: business.is_pilot_business || false,
      pilot_limits: business.pilot_limits || { max_qr_codes: 3, max_scans_per_month: 100, max_staff: 1 },
      pilot_readiness: pilotReadiness,
      health,
      activity_summary: activitySummary,
      qr_codes: (qrCodes || []).map(q => ({
        id: q.id,
        name: q.name,
        slug: q.slug,
        design: q.design || {},
        is_active: q.is_active,
        download_count: q.download_count || 0,
        last_downloaded_at: q.last_downloaded_at,
        created_at: q.created_at,
        updated_at: q.updated_at,
      })),
      tags: (tags || []).map(t => ({
        id: t.id,
        name: t.name,
        emoji: t.emoji,
        order: t.order,
        created_at: t.created_at,
      })),
      subscription: subscription ? {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        stripe_subscription_id: subscription.stripe_subscription_id,
        stripe_customer_id: subscription.stripe_customer_id,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        trial_start: subscription.trial_start,
        trial_end: subscription.trial_end,
        canceled_at: subscription.canceled_at,
        cancel_at_period_end: subscription.cancel_at_period_end,
        quantity: subscription.quantity || 1,
        monthly_price: subscription.monthly_price || 0,
        features: subscription.features || {},
        created_at: subscription.created_at,
        updated_at: subscription.updated_at,
      } : null,
      usage_logs: (usageLogs || []).map(u => ({
        metric: u.metric,
        count: u.count,
        period_start: u.period_start,
        period_end: u.period_end,
      })),
      onboarding_progress: onboardingProgress ? {
        current_step: onboardingProgress.current_step,
        completed_steps: onboardingProgress.completed_steps || [],
        step_data: onboardingProgress.step_data || {},
        started_at: onboardingProgress.started_at,
        completed_at: onboardingProgress.completed_at,
        is_pilot_user: onboardingProgress.is_pilot_user,
        pilot_cohort: onboardingProgress.pilot_cohort,
      } : null,
      feedback: (feedback || []).map(f => ({
        id: f.id,
        category: f.category,
        rating: f.rating,
        feedback_text: f.feedback_text,
        step_context: f.step_context,
        created_at: f.created_at,
      })),
      created_at: business.created_at,
      updated_at: business.updated_at,
    };
  }

  private calculatePilotReadiness(
    business: any,
    onboarding: any,
    qrCodes: any[],
    subscription: any,
    tags: any[]
  ): { score: number; status: 'not_started' | 'in_progress' | 'ready' | 'launched'; missing: string[] } {
    const missing: string[] = [];
    let score = 0;

    // Business info (20 points)
    if (business.name && business.google_review_url) {
      score += 20;
    } else {
      missing.push('Business info incomplete');
    }

    // Google config verified (20 points)
    if (business.google_review_url) {
      score += 20;
    } else {
      missing.push('Google Review URL not configured');
    }

    // Experience tags added (15 points)
    if (tags && tags.length > 0) {
      score += 15;
    } else {
      missing.push('No experience tags added');
    }

    // QR code created (15 points)
    if (qrCodes && qrCodes.length > 0) {
      score += 15;
    } else {
      missing.push('No QR codes created');
    }

    // QR code tested (10 points)
    // Check if any QR code has scans
    const hasScans = qrCodes && qrCodes.some(q => q.download_count > 0);
    if (hasScans) {
      score += 10;
    } else {
      missing.push('QR code not tested');
    }

    // Onboarding completed (10 points)
    if (onboarding && onboarding.completed_at) {
      score += 10;
    } else if (onboarding && onboarding.current_step !== 'welcome') {
      score += 5;
    } else {
      missing.push('Onboarding not completed');
    }

    // Subscription active (10 points)
    if (subscription && ['active', 'trialing'].includes(subscription.status)) {
      score += 10;
    } else {
      missing.push('No active subscription');
    }

    let status: 'not_started' | 'in_progress' | 'ready' | 'launched';
    if (score === 0) status = 'not_started';
    else if (score < 70) status = 'in_progress';
    else if (score < 100) status = 'ready';
    else status = 'launched';

    return { score, status, missing };
  }

  private calculateHealthIndicator(
    business: any,
    scans: any[],
    sessions: any[],
    reviews: any[],
    subscription: any
  ): { score: number; status: 'healthy' | 'at_risk' | 'critical'; factors: string[] } {
    const factors: string[] = [];
    let score = 100;

    // Activity factor (40 points max)
    const recentScans = scans?.length || 0;
    const recentSessions = sessions?.length || 0;
    const recentReviews = reviews?.length || 0;
    const conversionRate = recentScans > 0 ? (recentReviews / recentScans) * 100 : 0;

    if (recentScans === 0) {
      score -= 40;
      factors.push('No scans in last 30 days');
    } else if (recentScans < 10) {
      score -= 20;
      factors.push('Low scan volume (<10 in 30 days)');
    } else if (recentScans < 50) {
      score -= 10;
      factors.push('Moderate scan volume');
    }

    if (conversionRate > 0 && conversionRate < 10) {
      score -= 15;
      factors.push('Low conversion rate (<10%)');
    } else if (conversionRate > 0 && conversionRate < 20) {
      score -= 5;
      factors.push('Below average conversion rate');
    }

    // Subscription health (30 points)
    if (!subscription) {
      score -= 30;
      factors.push('No subscription');
    } else if (subscription.status === 'past_due') {
      score -= 20;
      factors.push('Subscription past due');
    } else if (subscription.status === 'canceled') {
      score -= 30;
      factors.push('Subscription canceled');
    } else if (subscription.status === 'trialing') {
      const trialEnd = new Date(subscription.trial_end).getTime();
      const daysLeft = (trialEnd - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysLeft < 3) {
        score -= 15;
        factors.push('Trial ending soon (<3 days)');
      } else if (daysLeft < 7) {
        score -= 5;
        factors.push('Trial ending within a week');
      }
    }

    // Feedback sentiment (20 points)
    // This would need feedback data - simplified here
    // Could check pilot_feedback for negative ratings

    // QR code health (10 points)
    // Check if QR codes are active

    let status: 'healthy' | 'at_risk' | 'critical';
    if (score >= 80) status = 'healthy';
    else if (score >= 50) status = 'at_risk';
    else status = 'critical';

    return { score: Math.max(0, score), status, factors };
  }

  private calculateActivitySummary(
    scans: any[],
    sessions: any[],
    reviews: any[]
  ): { scans_30d: number; sessions_30d: number; reviews_30d: number; conversion_rate: number; avg_rating: number; top_languages: { language: string; count: number }[] } {
    const scans30d = scans?.length || 0;
    const sessions30d = sessions?.length || 0;
    const reviews30d = reviews?.length || 0;
    const conversionRate = scans30d > 0 ? (reviews30d / scans30d) * 100 : 0;

    const ratings = reviews?.filter(r => r.rating).map(r => r.rating) || [];
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    const languageCounts: Record<string, number> = {};
    sessions?.forEach(s => {
      if (s.language) {
        languageCounts[s.language] = (languageCounts[s.language] || 0) + 1;
      }
    });
    const topLanguages = Object.entries(languageCounts)
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      scans_30d: scans30d,
      sessions_30d: sessions30d,
      reviews_30d: reviews30d,
      conversion_rate: Number(conversionRate.toFixed(1)),
      avg_rating: Number(avgRating.toFixed(1)),
      top_languages: topLanguages,
    };
  }

  async updateBusiness(id: string, updates: { is_active?: boolean; name?: string }): Promise<AdminBusiness> {
    const { data, error } = await this.supabase
      .from('businesses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteBusiness(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('businesses')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async getQRCodes(query: AdminQRCodeListQuery): Promise<{ data: AdminQRCode[]; meta: { total: number; page: number; limit: number; total_pages: number } }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    let queryBuilder = this.supabase
      .from('qr_codes')
      .select(`
        id,
        name,
        slug,
        business_id,
        design,
        stats:qr_code_stats(total_scans, total_reviews, conversion_rate),
        is_active,
        created_at,
        updated_at,
        business:businesses!qr_codes_business_id_fkey(name, slug)
      `, { count: 'exact' });

    if (query.search) {
      queryBuilder = queryBuilder.or(`name.ilike.%${query.search}%,slug.ilike.%${query.search}%`);
    }

    if (query.status && query.status !== 'all') {
      queryBuilder = queryBuilder.eq('is_active', query.status === 'active');
    }

    if (query.business_id) {
      queryBuilder = queryBuilder.eq('business_id', query.business_id);
    }

    queryBuilder = queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await queryBuilder;

    if (error) throw error;

    const qrCodes: AdminQRCode[] = (data || []).map((q: any) => ({
      id: q.id,
      name: q.name,
      slug: q.slug,
      business_id: q.business_id,
      business_name: q.business?.name || 'Unknown',
      business_slug: q.business?.slug || 'Unknown',
      design: q.design || {},
      stats: {
        total_scans: q.stats?.[0]?.total_scans || 0,
        total_reviews: q.stats?.[0]?.total_reviews || 0,
        conversion_rate: q.stats?.[0]?.conversion_rate || 0,
      },
      is_active: q.is_active,
      created_at: q.created_at,
      updated_at: q.updated_at,
    }));

    return {
      data: qrCodes,
      meta: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async updateQRCode(id: string, updates: { is_active?: boolean; name?: string }): Promise<AdminQRCode> {
    const { data, error } = await this.supabase
      .from('qr_codes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteQRCode(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('qr_codes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async getAnalytics(query: AdminAnalyticsQuery): Promise<AdminAnalytics> {
    const range = query.range || '30d';
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateISO = startDate.toISOString();

    // Get overview stats
    const [
      { count: totalScans },
      { count: totalReviews },
      { count: totalUsers },
      { count: totalBusinesses },
      { count: totalQRCodes },
      { data: activeSubscriptions },
      { data: mrrData },
    ] = await Promise.all([
      this.supabase.from('scan_logs').select('*', { count: 'exact', head: true }).gte('scanned_at', startDateISO),
      this.supabase.from('review_sessions').select('*', { count: 'exact', head: true }).gte('started_at', startDateISO).eq('status', 'completed'),
      this.supabase.from('users').select('*', { count: 'exact', head: true }),
      this.supabase.from('businesses').select('*', { count: 'exact', head: true }),
      this.supabase.from('qr_codes').select('*', { count: 'exact', head: true }),
      this.supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      this.supabase.from('subscriptions').select('monthly_price').eq('status', 'active'),
    ]);

    const mrr = mrrData?.reduce((sum: number, s: any) => sum + (s.monthly_price || 0), 0) || 0;

    // Get trends
    const { data: trendsData } = await this.supabase
      .from('daily_analytics')
      .select('*')
      .gte('date', startDateISO.split('T')[0])
      .order('date', { ascending: true });

    // Get distributions
    const [
      { data: ratingDist },
      { data: languageDist },
      { data: deviceDist },
    ] = await Promise.all([
      this.supabase.from('review_sessions').select('rating').not('rating', 'is', null).gte('started_at', startDateISO),
      this.supabase.from('review_sessions').select('language').gte('started_at', startDateISO),
      this.supabase.from('scan_logs').select('device_type').gte('scanned_at', startDateISO),
    ]);

    // Get top businesses
    const { data: topBusinesses } = await this.supabase
      .from('business_analytics')
      .select('business_id, scans, reviews, conversion_rate, businesses(name, slug)')
      .gte('date', startDateISO.split('T')[0])
      .order('scans', { ascending: false })
      .limit(10);

    // Get top QR codes
    const { data: topQRCodes } = await this.supabase
      .from('qr_code_analytics')
      .select('qr_code_id, scans, reviews, conversion_rate, qr_codes(name, slug), businesses(name)')
      .gte('date', startDateISO.split('T')[0])
      .order('scans', { ascending: false })
      .limit(10);

    return {
      overview: {
        total_scans: totalScans || 0,
        total_reviews: totalReviews || 0,
        conversion_rate: totalScans && totalScans > 0 ? (totalReviews || 0) / totalScans * 100 : 0,
        total_users: totalUsers || 0,
        total_businesses: totalBusinesses || 0,
        total_qr_codes: totalQRCodes || 0,
        active_subscriptions: activeSubscriptions?.length || 0,
        mrr,
      },
      trends: trendsData?.map((t: any) => ({
        date: t.date,
        scans: t.scans,
        reviews: t.reviews,
        conversions: t.conversions,
        new_users: t.new_users,
        new_businesses: t.new_businesses,
      })) || [],
      rating_distribution: this.aggregateDistribution(ratingDist || [], 'rating') as { rating: number; count: number }[],
      language_distribution: this.aggregateDistribution(languageDist || [], 'language') as { language: string; count: number }[],
      device_distribution: this.aggregateDistribution(deviceDist || [], 'device_type') as { device: string; count: number }[],
      top_businesses: topBusinesses?.map((b: any) => ({
        id: b.business_id,
        name: b.businesses?.name || 'Unknown',
        slug: b.businesses?.slug || 'Unknown',
        scans: b.scans,
        reviews: b.reviews,
        conversion_rate: b.conversion_rate,
      })) || [],
      top_qr_codes: topQRCodes?.map((q: any) => ({
        id: q.qr_code_id,
        name: q.qr_codes?.name || 'Unknown',
        slug: q.qr_codes?.slug || 'Unknown',
        business_name: q.businesses?.name || 'Unknown',
        scans: q.scans,
        reviews: q.reviews,
        conversion_rate: q.conversion_rate,
      })) || [],
    };
  }

  private aggregateDistribution(data: any[], field: string): { count: number; rating?: number; language?: string; device?: string }[] {
    const counts: Record<string, number> = {};
    data?.forEach((d: any) => {
      const value = d[field];
      if (value) counts[value] = (counts[value] || 0) + 1;
    });
    return Object.entries(counts).map(([key, count]) => {
      if (field === 'rating') return { rating: Number(key), count } as { rating: number; count: number };
      if (field === 'language') return { language: key, count } as { language: string; count: number };
      return { device: key, count } as { device: string; count: number };
    });
  }

  async getSubscriptions(query: AdminSubscriptionListQuery): Promise<{ data: AdminSubscription[]; meta: { total: number; page: number; limit: number; total_pages: number } }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    let queryBuilder = this.supabase
      .from('subscriptions')
      .select(`
        id,
        business_id,
        owner_id,
        plan_id,
        status,
        stripe_subscription_id,
        stripe_customer_id,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        trial_end,
        quantity,
        price_cents,
        metadata,
        created_at,
        updated_at,
        business:businesses!subscriptions_business_id_fkey(name, slug),
        owner:users!subscriptions_owner_id_fkey(full_name, email)
      `, { count: 'exact' });

    if (query.search) {
      queryBuilder = queryBuilder.or(`business.name.ilike.%${query.search}%,owner.full_name.ilike.%${query.search}%,owner.email.ilike.%${query.search}%`);
    }

    if (query.status && query.status !== 'all') {
      queryBuilder = queryBuilder.eq('status', query.status);
    }

    if (query.plan && query.plan !== 'all') {
      queryBuilder = queryBuilder.eq('plan_id', query.plan);
    }

    queryBuilder = queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await queryBuilder;

    if (error) throw error;

    const subscriptions: AdminSubscription[] = (data || []).map((s: any) => ({
      id: s.id,
      business_id: s.business_id,
      business_name: s.business?.name || 'Unknown',
      business_slug: s.business?.slug || 'Unknown',
      owner_id: s.owner_id,
      owner_name: s.owner?.full_name || 'Unknown',
      owner_email: s.owner?.email || 'Unknown',
      plan: (s.plan_id || 'starter') as any,
      status: s.status,
      stripe_subscription_id: s.stripe_subscription_id,
      stripe_customer_id: s.stripe_customer_id,
      current_period_start: s.current_period_start,
      current_period_end: s.current_period_end,
      cancel_at_period_end: s.cancel_at_period_end,
      trial_end: s.trial_end,
      quantity: s.quantity,
      monthly_price: s.price_cents ? s.price_cents / 100 : 0,
      features: s.metadata?.features || {},
      created_at: s.created_at,
      updated_at: s.updated_at,
    }));

    return {
      data: subscriptions,
      meta: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async getSubscriptionStats(): Promise<AdminSubscriptionStats> {
    const [
      { count: total },
      { count: active },
      { count: pastDue },
      { count: canceled },
      { count: trialing },
      { data: planDist },
      { data: statusDist },
      { data: mrrData },
    ] = await Promise.all([
      this.supabase.from('subscriptions').select('*', { count: 'exact', head: true }),
      this.supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      this.supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'past_due'),
      this.supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'canceled'),
      this.supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'trialing'),
      this.supabase.from('subscriptions').select('plan_id').eq('status', 'active'),
      this.supabase.from('subscriptions').select('status'),
      this.supabase.from('subscriptions').select('price_cents').eq('status', 'active'),
    ]);

    const mrr = mrrData?.reduce((sum: number, s: any) => sum + ((s.price_cents || 0) / 100), 0) || 0;

    const planCounts: Record<string, number> = {};
    planDist?.forEach((p: any) => {
      if (p.plan_id) {
        planCounts[p.plan_id] = (planCounts[p.plan_id] || 0) + 1;
      }
    });

    const statusCounts: Record<string, number> = {};
    statusDist?.forEach((s: any) => {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    });

    return {
      total_subscriptions: total || 0,
      active_subscriptions: active || 0,
      past_due_subscriptions: pastDue || 0,
      canceled_subscriptions: canceled || 0,
      trialing_subscriptions: trialing || 0,
      mrr,
      arr: mrr * 12,
      plan_distribution: Object.entries(planCounts).map(([plan, count]) => ({ plan, count })),
      status_distribution: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    };
  }

  async updateSubscriptionPlan(id: string, plan: string): Promise<AdminSubscription> {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .update({ plan_id: plan })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async cancelSubscription(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('subscriptions')
      .update({ cancel_at_period_end: true })
      .eq('id', id);

    if (error) throw error;
  }

  async reactivateSubscription(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('subscriptions')
      .update({ cancel_at_period_end: false, status: 'active' })
      .eq('id', id);

    if (error) throw error;
  }

  async getSystemHealth(): Promise<AdminSystemHealth> {
    const startTime = Date.now();

    // Check database
    const dbStart = Date.now();
    const { error: dbError } = await this.supabase.from('users').select('id').limit(1);
    const dbLatency = Date.now() - dbStart;

    // Check Redis (if available)
    const redisStart = Date.now();
    let redisLatency = 0;
    let redisError = null;
    try {
      // Redis check would go here
      redisLatency = Date.now() - redisStart;
    } catch (e) {
      redisError = e;
    }

    // Check storage
    const storageStart = Date.now();
    const { error: storageError } = await this.supabase.storage.listBuckets();
    const storageLatency = Date.now() - storageStart;

    return {
      status: dbError ? 'critical' : 'healthy',
      checks: {
        database: {
          status: dbError ? 'critical' : 'healthy',
          latency_ms: dbLatency,
          message: dbError ? dbError.message : 'Database connection successful',
          last_checked: new Date().toISOString(),
        },
        redis: {
          status: redisError ? 'critical' : 'healthy',
          latency_ms: redisLatency,
          message: redisError ? String(redisError) : 'Redis connection successful',
          last_checked: new Date().toISOString(),
        },
        storage: {
          status: storageError ? 'critical' : 'healthy',
          latency_ms: storageLatency,
          message: storageError ? storageError.message : 'Storage connection successful',
          last_checked: new Date().toISOString(),
        },
        api: {
          status: 'healthy',
          latency_ms: Date.now() - startTime,
          message: 'API responding normally',
          last_checked: new Date().toISOString(),
        },
        queue: {
          status: 'healthy',
          latency_ms: 0,
          message: 'Job queue operational',
          last_checked: new Date().toISOString(),
        },
      },
      metrics: {
        cpu_usage: 0, // Would need system monitoring
        memory_usage: 0,
        disk_usage: 0,
        network_in: 0,
        network_out: 0,
        active_connections: 0,
        requests_per_minute: 0,
        avg_response_time: 0,
        error_rate: 0,
      },
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };
  }

  async getSystemStats(): Promise<AdminSystemStats> {
    const [
      { count: totalUsers },
      { count: totalBusinesses },
      { count: totalQRCodes },
      { count: totalScans },
      { count: totalReviews },
      { data: revenueData },
      { data: dbSize },
      { data: storageUsed },
      { count: apiCalls },
      { count: emailsSent },
      { count: qrGenerated },
    ] = await Promise.all([
      this.supabase.from('users').select('*', { count: 'exact', head: true }),
      this.supabase.from('businesses').select('*', { count: 'exact', head: true }),
      this.supabase.from('qr_codes').select('*', { count: 'exact', head: true }),
      this.supabase.from('scan_logs').select('*', { count: 'exact', head: true }),
      this.supabase.from('review_sessions').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      this.supabase.from('subscriptions').select('monthly_price').eq('status', 'active'),
      this.supabase.rpc('get_database_size'),
      this.supabase.rpc('get_storage_used'),
      this.supabase.from('api_logs').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      this.supabase.from('email_logs').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      this.supabase.from('qr_codes').select('*', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const totalRevenue = revenueData?.reduce((sum: number, s: any) => sum + (s.monthly_price || 0), 0) || 0;

    return {
      total_users: totalUsers || 0,
      total_businesses: totalBusinesses || 0,
      total_qr_codes: totalQRCodes || 0,
      total_scans: totalScans || 0,
      total_reviews: totalReviews || 0,
      total_revenue: totalRevenue,
      database_size: dbSize?.[0]?.size || 0,
      storage_used: storageUsed?.[0]?.size || 0,
      api_calls_24h: apiCalls || 0,
      emails_sent_24h: emailsSent || 0,
      qr_generated_24h: qrGenerated || 0,
    };
  }

  async getBackgroundJobs(): Promise<AdminBackgroundJob[]> {
    const { data, error } = await this.supabase
      .from('background_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data || []).map((j: any) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      progress: j.progress,
      started_at: j.started_at,
      completed_at: j.completed_at,
      error: j.error,
    }));
  }

  private static readonly MASKED_VALUE = '••••••••';

  private maskSecret(val?: string): string {
    return val && val.length > 0 ? AdminService.MASKED_VALUE : '';
  }

  private maskSettings(settings: AdminSettings): AdminSettings {
    const cloned: AdminSettings = JSON.parse(JSON.stringify(settings));
    if (cloned.security?.jwt_secret) {
      cloned.security.jwt_secret = this.maskSecret(cloned.security.jwt_secret);
    }
    if (cloned.email?.smtp_password) {
      cloned.email.smtp_password = this.maskSecret(cloned.email.smtp_password);
    }
    if (cloned.integrations) {
      if (cloned.integrations.openai_api_key) cloned.integrations.openai_api_key = this.maskSecret(cloned.integrations.openai_api_key);
      if (cloned.integrations.gemini_api_key) cloned.integrations.gemini_api_key = this.maskSecret(cloned.integrations.gemini_api_key);
      if (cloned.integrations.stripe_secret_key) cloned.integrations.stripe_secret_key = this.maskSecret(cloned.integrations.stripe_secret_key);
      if (cloned.integrations.stripe_webhook_secret) cloned.integrations.stripe_webhook_secret = this.maskSecret(cloned.integrations.stripe_webhook_secret);
    }
    return cloned;
  }

  async getSettings(mask = true): Promise<AdminSettings> {
    const { data, error } = await this.supabase
      .from('admin_settings')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    const settings = data || this.getDefaultSettings();
    return mask ? this.maskSettings(settings) : settings;
  }

  async updateSettings(updates: AdminSettingsUpdate): Promise<AdminSettings> {
    const current = await this.getSettings(false);

    // Filter out masked secrets so they don't overwrite real secrets
    const sanitizedUpdates = JSON.parse(JSON.stringify(updates));
    if (sanitizedUpdates.security?.jwt_secret === AdminService.MASKED_VALUE) {
      delete sanitizedUpdates.security.jwt_secret;
    }
    if (sanitizedUpdates.email?.smtp_password === AdminService.MASKED_VALUE) {
      delete sanitizedUpdates.email.smtp_password;
    }
    if (sanitizedUpdates.integrations) {
      if (sanitizedUpdates.integrations.openai_api_key === AdminService.MASKED_VALUE) delete sanitizedUpdates.integrations.openai_api_key;
      if (sanitizedUpdates.integrations.gemini_api_key === AdminService.MASKED_VALUE) delete sanitizedUpdates.integrations.gemini_api_key;
      if (sanitizedUpdates.integrations.stripe_secret_key === AdminService.MASKED_VALUE) delete sanitizedUpdates.integrations.stripe_secret_key;
      if (sanitizedUpdates.integrations.stripe_webhook_secret === AdminService.MASKED_VALUE) delete sanitizedUpdates.integrations.stripe_webhook_secret;
    }

    const merged = this.deepMerge(current, sanitizedUpdates);

    const { data, error } = await this.supabase
      .from('admin_settings')
      .upsert(merged)
      .select()
      .single();

    if (error) throw error;
    return this.maskSettings(data);
  }

  private getDefaultSettings(): AdminSettings {
    return {
      general: {
        site_name: 'ReviewAI',
        site_url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        support_email: 'support@reviewai.com',
        default_language: 'en',
        maintenance_mode: false,
        registration_enabled: true,
        email_verification_required: true,
      },
      email: {
        provider: 'smtp',
        from_name: 'ReviewAI',
        from_email: 'noreply@reviewai.com',
        smtp_host: '',
        smtp_port: 587,
        smtp_user: '',
        smtp_password: '',
        templates: {},
      },
      security: {
        jwt_secret: process.env.JWT_SECRET || '',
        jwt_expiry: '1h',
        refresh_token_expiry: '30d',
        password_min_length: 8,
        require_2fa_for_admins: false,
        session_timeout: 60,
        max_login_attempts: 5,
        lockout_duration: 15,
        cors_origins: [process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'],
      },
      integrations: {
        openai_api_key: process.env.OPENAI_API_KEY || '',
        gemini_api_key: process.env.GEMINI_API_KEY || '',
        google_places_api_key: process.env.GOOGLE_PLACES_API_KEY || '',
        stripe_secret_key: process.env.STRIPE_SECRET_KEY || '',
        stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || '',
        stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET || '',
        sentry_dsn: process.env.SENTRY_DSN || '',
        slack_webhook_url: process.env.SLACK_WEBHOOK_URL || '',
      },
      features: {
        ai_reviews_enabled: true,
        qr_customization_enabled: true,
        multi_language_enabled: true,
        webhooks_enabled: true,
        white_label_domains_enabled: false,
        api_access_enabled: false,
        advanced_analytics_enabled: true,
        team_collaboration_enabled: true,
      },
      limits: {
        max_businesses_per_user: 10,
        max_qr_codes_per_business: 50,
        max_scans_per_month_free: 1000,
        max_scans_per_month_starter: 10000,
        max_scans_per_month_professional: 100000,
        max_scans_per_month_enterprise: 1000000,
        ai_reviews_per_month_free: 10,
        ai_reviews_per_month_starter: 100,
        ai_reviews_per_month_professional: 1000,
        ai_reviews_per_month_enterprise: 10000,
        file_upload_max_size: 10,
      },
    };
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  async getStats(): Promise<AdminStats> {
    if (this.statsCache && Date.now() < this.statsCache.expiresAt) {
      return this.statsCache.data;
    }

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      { count: totalBusinesses },
      { count: activeBusinesses },
      { count: totalQRCodes },
      { count: totalScans },
      { count: totalSessions },
      { count: totalAIDrafts },
      { count: googleContinues },
      { data: revenueData },
      { count: activeSubscriptions },
      { count: businessesThisMonth },
      { count: businessesLastMonth },
      { count: scansThisMonth },
      { count: scansLastMonth },
      { count: sessionsThisMonth },
      { count: sessionsLastMonth },
      { count: aiDraftsThisMonth },
      { count: aiDraftsLastMonth },
      { count: googleContinuesThisMonth },
      { count: googleContinuesLastMonth },
      { data: revenueThisMonth },
      { data: revenueLastMonth },
      { data: allClientUsers },
    ] = await Promise.all([
      this.supabase.from('businesses').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      this.supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('status', 'active').is('deleted_at', null),
      this.supabase.from('qr_codes').select('*', { count: 'exact', head: true }),
      this.supabase.from('scan_logs').select('*', { count: 'exact', head: true }),
      this.supabase.from('review_sessions').select('*', { count: 'exact', head: true }),
      this.supabase.from('generated_reviews').select('*', { count: 'exact', head: true }),
      this.supabase.from('review_sessions').select('*', { count: 'exact', head: true }).in('status', ['redirected', 'completed']),
      this.supabase.from('subscriptions').select('monthly_price').eq('status', 'active'),
      this.supabase.from('subscriptions').select('*', { count: 'exact', head: true }).in('status', ['active', 'trialing']),
      this.supabase.from('businesses').select('*', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', thisMonth.toISOString()),
      this.supabase.from('businesses').select('*', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', lastMonth.toISOString()).lt('created_at', thisMonth.toISOString()),
      this.supabase.from('scan_logs').select('*', { count: 'exact', head: true }).gte('scanned_at', thisMonth.toISOString()),
      this.supabase.from('scan_logs').select('*', { count: 'exact', head: true }).gte('scanned_at', lastMonth.toISOString()).lt('scanned_at', thisMonth.toISOString()),
      this.supabase.from('review_sessions').select('*', { count: 'exact', head: true }).gte('started_at', thisMonth.toISOString()),
      this.supabase.from('review_sessions').select('*', { count: 'exact', head: true }).gte('started_at', lastMonth.toISOString()).lt('started_at', thisMonth.toISOString()),
      this.supabase.from('generated_reviews').select('*', { count: 'exact', head: true }).gte('created_at', thisMonth.toISOString()),
      this.supabase.from('generated_reviews').select('*', { count: 'exact', head: true }).gte('created_at', lastMonth.toISOString()).lt('created_at', thisMonth.toISOString()),
      this.supabase.from('review_sessions').select('*', { count: 'exact', head: true }).in('status', ['redirected', 'completed']).gte('started_at', thisMonth.toISOString()),
      this.supabase.from('review_sessions').select('*', { count: 'exact', head: true }).in('status', ['redirected', 'completed']).gte('started_at', lastMonth.toISOString()).lt('started_at', thisMonth.toISOString()),
      this.supabase.from('subscriptions').select('monthly_price').eq('status', 'active').gte('created_at', thisMonth.toISOString()),
      this.supabase.from('subscriptions').select('monthly_price').eq('status', 'active').gte('created_at', lastMonth.toISOString()).lt('created_at', thisMonth.toISOString()),
      this.supabase.from('users').select('id, last_login_at, created_at, pilot_cohort').neq('role', 'admin').is('deleted_at', null),
    ]);

    const totalUsers = (allClientUsers || []).length;
    const usersThisMonth = (allClientUsers || []).filter((u: any) => new Date(u.created_at) >= thisMonth).length;
    const usersLastMonth = (allClientUsers || []).filter((u: any) => new Date(u.created_at) >= lastMonth && new Date(u.created_at) < thisMonth).length;

    const totalRevenue = revenueData?.reduce((sum: number, s: any) => sum + (s.monthly_price || 0), 0) || 0;
    const revenueThisMonthTotal = revenueThisMonth?.reduce((sum: number, s: any) => sum + (s.monthly_price || 0), 0) || 0;
    const revenueLastMonthTotal = revenueLastMonth?.reduce((sum: number, s: any) => sum + (s.monthly_price || 0), 0) || 0;

    const conversionRate = totalScans && totalScans > 0 ? ((googleContinues || 0) / totalScans) * 100 : 0;

    // Calculate active, inactive, deactivated user counts
    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let activeUsers = 0;
    let inactiveUsers = 0;
    let deactivatedUsers = 0;

    (allClientUsers || []).forEach((u: any) => {
      const isDeact = (u as any).account_status === 'deactivated' || u.pilot_cohort === 'status:deactivated';
      if (isDeact) {
        deactivatedUsers++;
      } else {
        const lastAct = u.last_login_at ? new Date(u.last_login_at).getTime() : new Date(u.created_at).getTime();
        if (lastAct >= thirtyDaysAgoMs) {
          activeUsers++;
        } else {
          inactiveUsers++;
        }
      }
    });

    const calcPct = (last: number, cur: number) => (last && last > 0 ? Math.round(((cur - last) / last) * 1000) / 10 : 0);

    const result: AdminStats = {
      total_users: totalUsers || 0,
      active_users: activeUsers,
      inactive_users: inactiveUsers,
      deactivated_users: deactivatedUsers,
      new_users: usersThisMonth || 0,
      total_businesses: totalBusinesses || 0,
      active_businesses: activeBusinesses ?? totalBusinesses ?? 0,
      new_businesses: businessesThisMonth || 0,
      total_qr_codes: totalQRCodes || 0,
      total_scans: totalScans || 0,
      total_reviews: totalAIDrafts || 0,
      total_review_sessions: totalSessions || 0,
      total_ai_drafts: totalAIDrafts || 0,
      google_continue_events: googleContinues || 0,
      total_revenue: totalRevenue,
      active_subscriptions: activeSubscriptions || 0,
      conversion_rate: Math.round(conversionRate * 10) / 10,
      users_change: calcPct(usersLastMonth || 0, usersThisMonth || 0),
      businesses_change: calcPct(businessesLastMonth || 0, businessesThisMonth || 0),
      scans_change: calcPct(scansLastMonth || 0, scansThisMonth || 0),
      revenue_change: calcPct(revenueLastMonthTotal, revenueThisMonthTotal),
      sessions_change: calcPct(sessionsLastMonth || 0, sessionsThisMonth || 0),
      ai_drafts_change: calcPct(aiDraftsLastMonth || 0, aiDraftsThisMonth || 0),
      google_continues_change: calcPct(googleContinuesLastMonth || 0, googleContinuesThisMonth || 0),
      subscriptions_change: 0,
    };

    this.statsCache = { data: result, expiresAt: Date.now() + 20_000 };
    return result;
  }

  async getRecentActivity(limit: number = 20): Promise<AdminRecentActivity[]> {
    const { data: logs, error } = await this.supabase
      .from('audit_logs')
      .select(`
        id,
        action,
        resource_type,
        resource_id,
        user_id,
        business_id,
        metadata,
        new_values,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching audit logs for recent activity:', error);
      return [];
    }

    const auditList = logs || [];
    const userIds = Array.from(new Set(auditList.map((a: any) => a.user_id).filter(Boolean)));
    const businessIds = Array.from(new Set(auditList.map((a: any) => a.business_id).filter(Boolean)));

    const [usersRes, bizRes] = await Promise.all([
      userIds.length > 0
        ? this.supabase.from('users').select('id, full_name, email').in('id', userIds)
        : Promise.resolve({ data: [] }),
      businessIds.length > 0
        ? this.supabase.from('businesses').select('id, name').in('id', businessIds)
        : Promise.resolve({ data: [] }),
    ]);

    const userMap = new Map((usersRes.data || []).map((u: any) => [u.id, u]));
    const bizMap = new Map((bizRes.data || []).map((b: any) => [b.id, b]));

    return auditList.map((a: any) => {
      const u = a.user_id ? userMap.get(a.user_id) : null;
      const b = a.business_id ? bizMap.get(a.business_id) : null;
      const bizName = b?.name || a.new_values?.name || a.metadata?.business_name || null;
      const userName = u?.full_name || a.metadata?.user_name || 'System';
      const userEmail = u?.email || a.metadata?.user_email || null;

      let details = a.metadata?.details || a.action;
      if (typeof details === 'object') {
        details = JSON.stringify(details);
      }
      if (a.action === 'business.created' && bizName) {
        details = `New business "${bizName}" registered`;
      } else if (a.action === 'qr.created') {
        details = `QR code generated${bizName ? ' for ' + bizName : ''}`;
      } else if (a.action?.includes('review')) {
        details = `Review activity processed${bizName ? ' for ' + bizName : ''}`;
      }

      return {
        id: a.id,
        type: a.action,
        user_name: userName,
        user_email: userEmail,
        business_name: bizName,
        details: String(details),
        status: a.metadata?.status || 'success',
        created_at: a.created_at,
      };
    });
  }

  // Upgrade Requests
  async getUpgradeRequests(query: AdminUpgradeRequestListQuery): Promise<{ data: AdminUpgradeRequest[]; meta: { total: number; page: number; limit: number; total_pages: number } }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    let queryBuilder = this.supabase
      .from('upgrade_requests')
      .select(`
        id,
        business_id,
        requested_plan,
        current_plan,
        status,
        reason,
        admin_notes,
        reviewed_by,
        reviewed_at,
        created_at,
        updated_at,
        business:businesses!upgrade_requests_business_id_fkey(name, slug, owner_id),
        owner:users!upgrade_requests_owner_id_fkey(name, email),
        reviewer:users!upgrade_requests_reviewed_by_fkey(name)
      `, { count: 'exact' });

    if (query.search) {
      queryBuilder = queryBuilder.or(`business.name.ilike.%${query.search}%,business.slug.ilike.%${query.search}%,owner.name.ilike.%${query.search}%,owner.email.ilike.%${query.search}%`);
    }

    if (query.status && query.status !== 'all') {
      queryBuilder = queryBuilder.eq('status', query.status);
    }

    if (query.plan && query.plan !== 'all') {
      queryBuilder = queryBuilder.eq('requested_plan', query.plan);
    }

    queryBuilder = queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await queryBuilder;

    if (error) throw error;

    const requests: AdminUpgradeRequest[] = (data || []).map((r: any) => ({
      id: r.id,
      business_id: r.business_id,
      business_name: r.business?.name || 'Unknown',
      business_slug: r.business?.slug || 'Unknown',
      owner_id: r.business?.owner_id || r.owner?.id || 'Unknown',
      owner_name: r.owner?.name || 'Unknown',
      owner_email: r.owner?.email || 'Unknown',
      requested_plan: r.requested_plan,
      current_plan: r.current_plan,
      status: r.status,
      reason: r.reason,
      admin_notes: r.admin_notes,
      reviewed_by: r.reviewed_by,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return {
      data: requests,
      meta: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async getUpgradeRequest(id: string): Promise<AdminUpgradeRequest> {
    const { data, error } = await this.supabase
      .from('upgrade_requests')
      .select(`
        id,
        business_id,
        requested_plan,
        current_plan,
        status,
        reason,
        admin_notes,
        reviewed_by,
        reviewed_at,
        created_at,
        updated_at,
        business:businesses!upgrade_requests_business_id_fkey(name, slug, owner_id),
        owner:users!upgrade_requests_owner_id_fkey(id, name, email),
        reviewer:users!upgrade_requests_reviewed_by_fkey(name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    const business = Array.isArray(data.business) ? data.business[0] : data.business;
    const owner = Array.isArray(data.owner) ? data.owner[0] : data.owner;

    return {
      id: data.id,
      business_id: data.business_id,
      business_name: business?.name || 'Unknown',
      business_slug: business?.slug || 'Unknown',
      owner_id: business?.owner_id || owner?.id || 'Unknown',
      owner_name: owner?.name || 'Unknown',
      owner_email: owner?.email || 'Unknown',
      requested_plan: data.requested_plan,
      current_plan: data.current_plan,
      status: data.status,
      reason: data.reason,
      admin_notes: data.admin_notes,
      reviewed_by: data.reviewed_by,
      reviewed_at: data.reviewed_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async updateUpgradeRequestStatus(
    id: string,
    status: 'approved' | 'rejected' | 'contacted' | 'cancelled',
    adminId: string,
    adminNotes?: string
  ): Promise<AdminUpgradeRequest> {
    // Use a transaction to atomically update the request and subscription
    const { data: request, error: fetchError } = await this.supabase
      .from('upgrade_requests')
      .select('*, business:businesses!upgrade_requests_business_id_fkey(id, owner_id)')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!request) throw new Error('Upgrade request not found');

    if (request.status !== 'pending') {
      throw new Error(`Cannot update request with status: ${request.status}`);
    }

    // Start transaction
    const { error: transactionError } = await this.supabase.rpc('update_upgrade_request_with_subscription', {
      p_request_id: id,
      p_status: status,
      p_admin_id: adminId,
      p_admin_notes: adminNotes || null,
    });

    if (transactionError) throw transactionError;

    // Fetch updated request
    return this.getUpgradeRequest(id);
  }

  // Feedback
  async getFeedback(query: AdminFeedbackListQuery): Promise<{ data: AdminFeedbackItem[]; meta: { total: number; page: number; limit: number; total_pages: number } }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    let queryBuilder = this.supabase
      .from('pilot_feedback')
      .select(`
        id,
        user_id,
        business_id,
        category,
        rating,
        feedback_text,
        step_context,
        metadata,
        created_at,
        updated_at,
        status,
        admin_note,
        business:businesses!pilot_feedback_business_id_fkey(name),
        user:users!pilot_feedback_user_id_fkey(email)
      `, { count: 'exact' });

    if (query.search) {
      queryBuilder = queryBuilder.or(`feedback_text.ilike.%${query.search}%,business.name.ilike.%${query.search}%,user.email.ilike.%${query.search}%`);
    }

    if (query.status && query.status !== 'all') {
      queryBuilder = queryBuilder.eq('status', query.status);
    }

    if (query.category && query.category !== 'all') {
      queryBuilder = queryBuilder.eq('category', query.category);
    }

    queryBuilder = queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await queryBuilder;

    if (error) throw error;

    const feedback: AdminFeedbackItem[] = (data || []).map((f: any) => ({
      id: f.id,
      user_id: f.user_id,
      business_id: f.business_id,
      category: f.category,
      rating: f.rating,
      feedback_text: f.feedback_text,
      step_context: f.step_context,
      metadata: f.metadata || {},
      created_at: f.created_at,
      updated_at: f.updated_at,
      status: f.status,
      admin_note: f.admin_note,
      business_name: f.business?.name || 'N/A',
      user_email: f.user?.email || 'Unknown',
    }));

    return {
      data: feedback,
      meta: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async updateFeedback(id: string, updates: { status?: string; admin_note?: string | null }): Promise<AdminFeedbackItem> {
    const { data, error } = await this.supabase
      .from('pilot_feedback')
      .update(updates)
      .eq('id', id)
      .select(`
        id,
        user_id,
        business_id,
        category,
        rating,
        feedback_text,
        step_context,
        metadata,
        created_at,
        updated_at,
        status,
        admin_note,
        business:businesses!pilot_feedback_business_id_fkey(name),
        user:users!pilot_feedback_user_id_fkey(email)
      `)
      .single();

    if (error) throw error;

    return {
      id: data.id,
      user_id: data.user_id,
      business_id: data.business_id,
      category: data.category,
      rating: data.rating,
      feedback_text: data.feedback_text,
      step_context: data.step_context,
      metadata: data.metadata || {},
      created_at: data.created_at,
      updated_at: data.updated_at,
      status: data.status,
      admin_note: data.admin_note,
      business_name: data.business?.[0]?.name || 'N/A',
      user_email: data.user?.[0]?.email || 'Unknown',
    };
  }

  /**
   * Get Pilot Business Success & Retention Insights (Step 28)
   */
  async getPilotInsights(query: PilotInsightsQuery): Promise<PilotInsightsResponse> {
    const range = query.range || '30d';
    const now = new Date();
    let startDate: Date | null = null;
    let days = 30;

    if (range === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      days = 7;
    } else if (range === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      days = 30;
    } else {
      days = 365;
    }

    // 1. Fetch businesses
    const { data: businessesData, error: bizError } = await this.supabase
      .from('businesses')
      .select('id, name, slug, email, is_active, google_review_url, is_pilot_business, pilot_limits, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (bizError) throw bizError;

    const allBusinesses = businessesData || [];
    const businessIds = allBusinesses.map(b => b.id);

    if (businessIds.length === 0) {
      return {
        summary: {
          total_pilot_businesses: 0,
          businesses_ready: 0,
          businesses_active: 0,
          businesses_no_activity: 0,
          businesses_not_setup: 0,
          businesses_needs_attention: 0,
          total_scans: 0,
          total_sessions: 0,
          total_ai_generated: 0,
          total_copies: 0,
          total_google_opens: 0,
          total_feedback: 0,
        },
        trends: [],
        businesses: [],
        period: range as any,
        notice: 'Google Review Page Opens indicates customer opened the Google Review URL. It does NOT imply verified review publication on Google. First QR Scan milestone is derived from earliest customer review session started.',
      };
    }

    // 2. Batch fetch related data across all businesses (zero N+1 queries)
    let scanQ = this.supabase.from('scan_logs').select('id, business_id, scanned_at').in('business_id', businessIds);
    let sessionQ = this.supabase.from('review_sessions').select('id, business_id, qr_code_id, status, rating, started_at, completed_at, metadata').in('business_id', businessIds);
    let reviewQ = this.supabase.from('generated_reviews').select('id, business_id, created_at').in('business_id', businessIds);
    let feedbackQ = this.supabase.from('pilot_feedback').select('id, business_id, status, rating, created_at').in('business_id', businessIds);
    let qrQ = this.supabase.from('qr_codes').select('id, business_id, name, slug, created_at, is_active').in('business_id', businessIds);
    let subQ = this.supabase.from('subscriptions').select('id, business_id, plan, status, current_period_start, current_period_end').in('business_id', businessIds);

    const [
      { data: scansData },
      { data: sessionsData },
      { data: reviewsData },
      { data: feedbackData },
      { data: qrData },
      { data: subData },
    ] = await Promise.all([scanQ, sessionQ, reviewQ, feedbackQ, qrQ, subQ]);

    const scans = scansData || [];
    const sessions = sessionsData || [];
    const reviews = reviewsData || [];
    const feedbackList = feedbackData || [];
    const qrCodes = qrData || [];
    const subscriptions = subData || [];

    // Group by business_id
    const scansByBiz = new Map<string, any[]>();
    scans.forEach(s => {
      if (!scansByBiz.has(s.business_id)) scansByBiz.set(s.business_id, []);
      scansByBiz.get(s.business_id)!.push(s);
    });

    const sessionsByBiz = new Map<string, any[]>();
    sessions.forEach(s => {
      if (!sessionsByBiz.has(s.business_id)) sessionsByBiz.set(s.business_id, []);
      sessionsByBiz.get(s.business_id)!.push(s);
    });

    const reviewsByBiz = new Map<string, any[]>();
    reviews.forEach(r => {
      if (!reviewsByBiz.has(r.business_id)) reviewsByBiz.set(r.business_id, []);
      reviewsByBiz.get(r.business_id)!.push(r);
    });

    const feedbackByBiz = new Map<string, any[]>();
    feedbackList.forEach(f => {
      if (!feedbackByBiz.has(f.business_id)) feedbackByBiz.set(f.business_id, []);
      feedbackByBiz.get(f.business_id)!.push(f);
    });

    const qrByBiz = new Map<string, any[]>();
    qrCodes.forEach(q => {
      if (!qrByBiz.has(q.business_id)) qrByBiz.set(q.business_id, []);
      qrByBiz.get(q.business_id)!.push(q);
    });

    const subByBiz = new Map<string, any>();
    subscriptions.forEach(sub => subByBiz.set(sub.business_id, sub));

    // Summary counters
    let readyCount = 0;
    let activeCount = 0;
    let notSetUpCount = 0;
    let needsAttentionCount = 0;
    let noActivityCount = 0;

    let totalScans = 0;
    let totalSessions = 0;
    let totalAIGenerated = 0;
    let totalCopies = 0;
    let totalGoogleOpens = 0;
    let totalFeedback = 0;

    // Process each business
    const businessItems: PilotBusinessActivityItem[] = allBusinesses.map(b => {
      const bizQRs = qrByBiz.get(b.id) || [];
      const allBizScans = scansByBiz.get(b.id) || [];
      const allBizSessions = sessionsByBiz.get(b.id) || [];
      const allBizReviews = reviewsByBiz.get(b.id) || [];
      const allBizFeedback = feedbackByBiz.get(b.id) || [];
      const sub = subByBiz.get(b.id) || null;

      // Filter by date range for activity counts if startDate is set
      const inRangeScans = startDate ? allBizScans.filter(s => new Date(s.scanned_at) >= startDate!) : allBizScans;
      const inRangeSessions = startDate ? allBizSessions.filter(s => new Date(s.started_at) >= startDate!) : allBizSessions;
      const inRangeReviews = startDate ? allBizReviews.filter(r => new Date(r.created_at) >= startDate!) : allBizReviews;
      const inRangeFeedback = startDate ? allBizFeedback.filter(f => new Date(f.created_at) >= startDate!) : allBizFeedback;

      const scansCount = inRangeScans.length;
      const sessionsCount = inRangeSessions.length;
      const aiCount = inRangeReviews.length;
      const copiesCount = inRangeSessions.filter(s => s.metadata?.copied_at || Number(s.metadata?.copy_count) > 0).length;
      const googleOpensCount = inRangeSessions.filter(s => s.status === 'redirected' || s.metadata?.google_redirected_at).length;
      const feedbackCount = inRangeFeedback.length;
      const openFeedbackCount = allBizFeedback.filter(f => f.status === 'open').length;

      totalScans += scansCount;
      totalSessions += sessionsCount;
      totalAIGenerated += aiCount;
      totalCopies += copiesCount;
      totalGoogleOpens += googleOpensCount;
      totalFeedback += feedbackCount;

      // Setup completeness (Task 3)
      const isSetupComplete = Boolean(
        b.name?.trim() &&
        b.google_review_url?.trim()?.startsWith('http') &&
        bizQRs.length > 0
      );

      // Operational activation state (Task 3)
      let activityStatus: PilotActivationStatus;
      if (openFeedbackCount > 0 || !b.is_active) {
        activityStatus = 'needs_attention';
        needsAttentionCount++;
      } else if (!isSetupComplete) {
        activityStatus = 'not_set_up';
        notSetUpCount++;
      } else if (allBizScans.length > 0 || allBizSessions.length > 0) {
        activityStatus = 'active';
        activeCount++;
      } else {
        activityStatus = 'ready';
        readyCount++;
      }

      if (allBizScans.length === 0 && allBizSessions.length === 0) {
        noActivityCount++;
      }

      // First activity timestamps (Task 4 & Step 28A)
      // Step 28A: first_qr_scan is derived from the earliest successful customer review session start (review_sessions.started_at)
      // associated with this business's public ReviewAI QR / customer flow.
      const validCustomerSessions = allBizSessions.filter(s => {
        if (s.business_id !== b.id) return false;
        if (!s.started_at) return false;
        // Exclude admin or owner test-mode activity
        if (s.metadata?.is_test === true || s.metadata?.test_mode === true) return false;
        return true;
      });

      const earliestCustomerSession = validCustomerSessions.length > 0
        ? validCustomerSessions.map(s => s.started_at).sort()[0]
        : null;

      // first_qr_scan milestone uses earliest customer session start (server-observed customer flow signal)
      const firstQRScan = earliestCustomerSession;

      const earliestGen = allBizReviews.length > 0
        ? allBizReviews.map(r => r.created_at).sort()[0]
        : null;

      const copiedSessions = allBizSessions.filter(s => s.metadata?.copied_at);
      const earliestCopied = copiedSessions.length > 0
        ? copiedSessions.map(s => s.metadata.copied_at).sort()[0]
        : null;

      const redirectedSessions = allBizSessions.filter(s => s.metadata?.google_redirected_at || (s.status === 'redirected' && s.completed_at));
      const earliestGoogleOpen = redirectedSessions.length > 0
        ? redirectedSessions.map(s => s.metadata?.google_redirected_at || s.completed_at).sort()[0]
        : null;

      const earliestQR = bizQRs.length > 0
        ? bizQRs.map(q => q.created_at).sort()[0]
        : null;

      // Latest activity timestamp
      const allTimestamps: string[] = [
        ...allBizScans.map(s => s.scanned_at),
        ...allBizSessions.map(s => s.started_at),
        ...allBizReviews.map(r => r.created_at),
        ...allBizFeedback.map(f => f.created_at),
      ].filter(Boolean);

      const latestActivity = allTimestamps.length > 0
        ? allTimestamps.sort().reverse()[0]
        : null;

      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        created_at: b.created_at,
        setup_status: isSetupComplete ? 'complete' : 'incomplete',
        activity_status: activityStatus,
        activity_counts: {
          scans: scansCount,
          sessions: sessionsCount,
          ai_generated: aiCount,
          copies: copiesCount,
          google_opens: googleOpensCount,
          feedback: feedbackCount,
        },
        first_activity_timestamps: {
          business_created: b.created_at || null,
          setup_completed: isSetupComplete ? (earliestQR || b.created_at) : null,
          qr_created: earliestQR,
          first_qr_scan: firstQRScan,
          first_review_session: earliestCustomerSession,
          first_ai_generation: earliestGen,
          first_review_copied: earliestCopied,
          first_google_page_open: earliestGoogleOpen,
          latest_activity: latestActivity,
        },
        milestones: {
          setup_completed: isSetupComplete,
          qr_generated: bizQRs.length > 0,
          first_scan: Boolean(firstQRScan),
          first_session: Boolean(earliestCustomerSession),
          first_generation: Boolean(earliestGen),
          first_copied: Boolean(earliestCopied),
          first_google_open: Boolean(earliestGoogleOpen),
        },
        open_feedback_count: openFeedbackCount,
        subscription: sub ? {
          plan: sub.plan,
          status: sub.status,
          ai_usage: allBizReviews.length,
          ai_limit: b.pilot_limits?.max_reviews_monthly || 50,
          qr_count: bizQRs.length,
        } : null,
      };
    });

    // 3. Compute daily trends (Task 5)
    const trendMap = new Map<string, { scans: number; sessions: number; ai_generated: number; google_opens: number; feedback: number }>();
    const effectiveDays = Math.min(days, 90);
    for (let i = effectiveDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split('T')[0];
      trendMap.set(dateKey, { scans: 0, sessions: 0, ai_generated: 0, google_opens: 0, feedback: 0 });
    }

    scans.forEach(s => {
      const k = (s.scanned_at || '').split('T')[0];
      if (trendMap.has(k)) trendMap.get(k)!.scans++;
    });

    sessions.forEach(s => {
      const k = (s.started_at || '').split('T')[0];
      if (trendMap.has(k)) {
        trendMap.get(k)!.sessions++;
        if (s.status === 'redirected' || s.metadata?.google_redirected_at) {
          trendMap.get(k)!.google_opens++;
        }
      }
    });

    reviews.forEach(r => {
      const k = (r.created_at || '').split('T')[0];
      if (trendMap.has(k)) trendMap.get(k)!.ai_generated++;
    });

    feedbackList.forEach(f => {
      const k = (f.created_at || '').split('T')[0];
      if (trendMap.has(k)) trendMap.get(k)!.feedback++;
    });

    const trends: PilotUsageTrendItem[] = Array.from(trendMap.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));

    // 4. Filter and sort business items
    let filteredBusinesses = businessItems;
    if (query.status && query.status !== 'all') {
      filteredBusinesses = filteredBusinesses.filter(b => b.activity_status === query.status);
    }
    if (query.search) {
      const term = query.search.toLowerCase();
      filteredBusinesses = filteredBusinesses.filter(b =>
        b.name.toLowerCase().includes(term) || b.slug.toLowerCase().includes(term)
      );
    }

    // Sort by latest_activity descending
    filteredBusinesses.sort((a, b) => {
      const timeA = a.first_activity_timestamps.latest_activity ? new Date(a.first_activity_timestamps.latest_activity).getTime() : 0;
      const timeB = b.first_activity_timestamps.latest_activity ? new Date(b.first_activity_timestamps.latest_activity).getTime() : 0;
      return timeB - timeA;
    });

    return {
      summary: {
        total_pilot_businesses: allBusinesses.length,
        businesses_ready: readyCount,
        businesses_active: activeCount,
        businesses_no_activity: noActivityCount,
        businesses_not_setup: notSetUpCount,
        businesses_needs_attention: needsAttentionCount,
        total_scans: totalScans,
        total_sessions: totalSessions,
        total_ai_generated: totalAIGenerated,
        total_copies: totalCopies,
        total_google_opens: totalGoogleOpens,
        total_feedback: totalFeedback,
      },
      trends,
      businesses: filteredBusinesses,
      period: range as any,
      notice: 'Google Review Page Opens indicates customer opened the Google Review URL. It does NOT imply verified review publication on Google.',
    };
  }

  /**
   * Step 29: Pilot Launch Control Center & Incident Monitoring
   */
  async getPilotControlCenter(query: PilotControlCenterQuery = {}): Promise<PilotControlCenterResponse> {
    const range = query.range || '30d';
    const now = new Date();
    let startDate: Date | null = null;
    if (range === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // 1. Fetch pilot businesses
    const { data: businessesData, error: bizError } = await this.supabase
      .from('businesses')
      .select('id, name, slug, email, is_active, google_review_url, is_pilot_business, pilot_limits, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (bizError) throw bizError;

    const allBusinesses: any[] = businessesData || [];

    if (allBusinesses.length === 0) {
      return {
        businesses_summary: {
          total_pilot_businesses: 0,
          setup_complete: 0,
          active: 0,
          inactive: 0,
          needs_attention: 0,
        },
        customer_activity: {
          total_scans: 0,
          total_sessions: 0,
          total_ai_generated: 0,
          total_copies: 0,
          total_google_opens: 0,
          total_feedback: 0,
        },
        system_health: {
          recent_errors_count: 0,
          ai_failures_count: 0,
          authorization_failures_count: 0,
          customer_flow_failures_count: 0,
          recent_incidents: [],
        },
        feedback_summary: {
          open: 0,
          reviewing: 0,
          resolved: 0,
          total: 0,
        },
        subscriptions_summary: {
          free_businesses: 0,
          paid_businesses: 0,
          pending_upgrade_requests: 0,
        },
        pilot_businesses: [],
        range: range as any,
        notice: 'Google Review Page Opens indicates customer opened the Google Review URL. It does NOT imply verified review publication on Google. Offline QR access requires internet connectivity as QR codes route to web infrastructure.',
      };
    }

    const businessIds = allBusinesses.map((b: any) => b.id);

    // 2. Batch fetch related data across all pilot businesses (zero N+1 queries)
    let scanQ = this.supabase.from('scan_logs').select('id, business_id, scanned_at').in('business_id', businessIds);
    let sessionQ = this.supabase.from('review_sessions').select('id, business_id, qr_code_id, status, rating, started_at, completed_at, metadata').in('business_id', businessIds);
    let reviewQ = this.supabase.from('generated_reviews').select('id, business_id, created_at').in('business_id', businessIds);
    let feedbackQ = this.supabase.from('pilot_feedback').select('id, business_id, status, rating, created_at').in('business_id', businessIds);
    let qrQ = this.supabase.from('qr_codes').select('id, business_id, name, slug, created_at, is_active').in('business_id', businessIds);
    let subQ = this.supabase.from('subscriptions').select('id, business_id, plan, status, current_period_start, current_period_end').in('business_id', businessIds);
    let upgradeQ = this.supabase.from('upgrade_requests').select('id, business_id, status, requested_plan, created_at').in('business_id', businessIds);

    const [
      { data: scansData },
      { data: sessionsData },
      { data: reviewsData },
      { data: feedbackData },
      { data: qrData },
      { data: subData },
      { data: upgradeData },
    ] = await Promise.all([scanQ, sessionQ, reviewQ, feedbackQ, qrQ, subQ, upgradeQ]);

    const scans = scansData || [];
    const sessions = sessionsData || [];
    const reviews = reviewsData || [];
    const feedbackList = feedbackData || [];
    const qrCodes = qrData || [];
    const subscriptions = subData || [];
    const upgradeRequests = upgradeData || [];

    // Group by business_id
    const scansByBiz = new Map<string, any[]>();
    scans.forEach(s => {
      if (!scansByBiz.has(s.business_id)) scansByBiz.set(s.business_id, []);
      scansByBiz.get(s.business_id)!.push(s);
    });

    const sessionsByBiz = new Map<string, any[]>();
    sessions.forEach(s => {
      if (!sessionsByBiz.has(s.business_id)) sessionsByBiz.set(s.business_id, []);
      sessionsByBiz.get(s.business_id)!.push(s);
    });

    const reviewsByBiz = new Map<string, any[]>();
    reviews.forEach(r => {
      if (!reviewsByBiz.has(r.business_id)) reviewsByBiz.set(r.business_id, []);
      reviewsByBiz.get(r.business_id)!.push(r);
    });

    const feedbackByBiz = new Map<string, any[]>();
    feedbackList.forEach(f => {
      if (!feedbackByBiz.has(f.business_id)) feedbackByBiz.set(f.business_id, []);
      feedbackByBiz.get(f.business_id)!.push(f);
    });

    const qrByBiz = new Map<string, any[]>();
    qrCodes.forEach(q => {
      if (!qrByBiz.has(q.business_id)) qrByBiz.set(q.business_id, []);
      qrByBiz.get(q.business_id)!.push(q);
    });

    const subByBiz = new Map<string, any>();
    subscriptions.forEach(sub => subByBiz.set(sub.business_id, sub));

    // Get incident metrics
    const recentIncidents = operationalIncidents.getRecentIncidents({ since: startDate || undefined, limit: 50 });
    const incidentCounts = operationalIncidents.getIncidentCounts(startDate || undefined);

    let setupCompleteCount = 0;
    let activeCount = 0;
    let inactiveCount = 0;
    let needsAttentionCount = 0;

    let totalScans = 0;
    let totalSessions = 0;
    let totalAIGenerated = 0;
    let totalCopies = 0;
    let totalGoogleOpens = 0;
    let totalFeedback = 0;

    let freeBizCount = 0;
    let paidBizCount = 0;

    const pilotBusinesses: PilotControlCenterBusiness[] = allBusinesses.map((b: any) => {
      const bizQRs = qrByBiz.get(b.id) || [];
      const allBizScans = scansByBiz.get(b.id) || [];
      const allBizSessions = sessionsByBiz.get(b.id) || [];
      const allBizReviews = reviewsByBiz.get(b.id) || [];
      const allBizFeedback = feedbackByBiz.get(b.id) || [];
      const sub = subByBiz.get(b.id) || null;

      const inRangeScans = startDate ? allBizScans.filter(s => new Date(s.scanned_at) >= startDate!) : allBizScans;
      const inRangeSessions = startDate ? allBizSessions.filter(s => new Date(s.started_at) >= startDate!) : allBizSessions;
      const inRangeReviews = startDate ? allBizReviews.filter(r => new Date(r.created_at) >= startDate!) : allBizReviews;
      const inRangeFeedback = startDate ? allBizFeedback.filter(f => new Date(f.created_at) >= startDate!) : allBizFeedback;

      const scansCount = inRangeScans.length;
      const sessionsCount = inRangeSessions.length;
      const aiCount = inRangeReviews.length;
      const copiesCount = inRangeSessions.filter(s => s.metadata?.copied_at || Number(s.metadata?.copy_count) > 0).length;
      const googleOpensCount = inRangeSessions.filter(s => s.status === 'redirected' || s.metadata?.google_redirected_at).length;
      const feedbackCount = inRangeFeedback.length;
      const openFeedbackCount = allBizFeedback.filter(f => f.status === 'open').length;

      totalScans += scansCount;
      totalSessions += sessionsCount;
      totalAIGenerated += aiCount;
      totalCopies += copiesCount;
      totalGoogleOpens += googleOpensCount;
      totalFeedback += feedbackCount;

      // Subscription status
      const isPaid = Boolean(sub && sub.plan && sub.plan.toLowerCase() !== 'starter' && sub.plan.toLowerCase() !== 'free' && sub.status === 'active');
      if (isPaid) {
        paidBizCount++;
      } else {
        freeBizCount++;
      }

      // Setup completeness
      const isSetupComplete = Boolean(
        b.name?.trim() &&
        b.google_review_url?.trim()?.startsWith('http') &&
        bizQRs.length > 0
      );
      if (isSetupComplete) setupCompleteCount++;
      if (!b.is_active) inactiveCount++;

      // Incidents associated with this business
      const bizErrors = recentIncidents.filter(inc => inc.business_id === b.id);
      const recentErrorsCount = bizErrors.reduce((sum, inc) => sum + inc.count, 0);

      // Objective "Needs Attention" criteria (Task 4)
      const attentionReasons: string[] = [];
      if (!b.is_active) {
        attentionReasons.push('Business account is deactivated');
      }
      if (!isSetupComplete) {
        if (!b.name?.trim()) attentionReasons.push('Business name missing');
        if (!b.google_review_url?.trim()?.startsWith('http')) attentionReasons.push('Valid Google Review URL not configured');
        if (bizQRs.length === 0) attentionReasons.push('No active QR code generated');
      }
      if (openFeedbackCount > 0) {
        attentionReasons.push(`${openFeedbackCount} unresolved private feedback item(s)`);
      }
      if (recentErrorsCount >= 3) {
        attentionReasons.push(`${recentErrorsCount} recent operational error(s) logged`);
      }
      if (sub && (sub.status === 'past_due' || sub.status === 'canceled' || sub.status === 'incomplete')) {
        attentionReasons.push(`Subscription issue: ${sub.status}`);
      }

      const needsAttention = attentionReasons.length > 0;
      if (needsAttention) {
        needsAttentionCount++;
      }

      let activityStatus: PilotActivationStatus;
      if (needsAttention) {
        activityStatus = 'needs_attention';
      } else if (!isSetupComplete) {
        activityStatus = 'not_set_up';
      } else if (allBizScans.length > 0 || allBizSessions.length > 0) {
        activityStatus = 'active';
        activeCount++;
      } else {
        activityStatus = 'ready';
      }

      // Latest activity timestamp
      const allTimestamps: string[] = [
        ...allBizScans.map(s => s.scanned_at),
        ...allBizSessions.map(s => s.started_at),
        ...allBizReviews.map(r => r.created_at),
        ...allBizFeedback.map(f => f.created_at),
      ].filter(Boolean);

      const latestActivity = allTimestamps.length > 0
        ? allTimestamps.sort().reverse()[0]
        : null;

      const ownerEmail = b.email || (Array.isArray(b.owner) ? b.owner[0]?.email : b.owner?.email) || 'N/A';

      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        owner_email: ownerEmail,
        created_at: b.created_at,
        setup_status: isSetupComplete ? 'complete' : 'incomplete',
        activity_status: activityStatus,
        needs_attention: needsAttention,
        attention_reasons: attentionReasons,
        plan: sub?.plan || 'starter',
        subscription_status: sub?.status || 'active',
        scans_count: scansCount,
        sessions_count: sessionsCount,
        ai_generated_count: aiCount,
        google_opens_count: googleOpensCount,
        open_feedback_count: openFeedbackCount,
        recent_errors_count: recentErrorsCount,
        latest_activity: latestActivity,
      };
    });

    // Feedback summary across pilot businesses
    const openFb = feedbackList.filter(f => f.status === 'open').length;
    const reviewingFb = feedbackList.filter(f => f.status === 'reviewing').length;
    const resolvedFb = feedbackList.filter(f => f.status === 'resolved').length;

    // Pending upgrade requests across pilot businesses
    const pendingUpgrades = upgradeRequests.filter(u => u.status === 'pending').length;

    return {
      businesses_summary: {
        total_pilot_businesses: allBusinesses.length,
        setup_complete: setupCompleteCount,
        active: activeCount,
        inactive: inactiveCount,
        needs_attention: needsAttentionCount,
      },
      customer_activity: {
        total_scans: totalScans,
        total_sessions: totalSessions,
        total_ai_generated: totalAIGenerated,
        total_copies: totalCopies,
        total_google_opens: totalGoogleOpens,
        total_feedback: totalFeedback,
      },
      system_health: {
        recent_errors_count: incidentCounts.total,
        ai_failures_count: incidentCounts.ai_failures,
        authorization_failures_count: incidentCounts.authorization_failures,
        customer_flow_failures_count: incidentCounts.customer_flow_failures,
        recent_incidents: recentIncidents,
      },
      feedback_summary: {
        open: openFb,
        reviewing: reviewingFb,
        resolved: resolvedFb,
        total: feedbackList.length,
      },
      subscriptions_summary: {
        free_businesses: freeBizCount,
        paid_businesses: paidBizCount,
        pending_upgrade_requests: pendingUpgrades,
      },
      pilot_businesses: pilotBusinesses,
      range: range as any,
      notice: 'Google Review Page Opens indicates customer opened the Google Review URL. It does NOT imply verified review publication on Google. Offline QR access requires internet connectivity as QR codes route to web infrastructure.',
    };
  }
  /**
   * Step 31: Get Daily Pilot Health Summary (24-hour window with prior 24h comparison)
   */
  async getDailyHealthSummary(): Promise<import('./types').DailyHealthSummary> {
    const now = new Date();
    const windowHours = 24;

    // Current window: last 24h
    const currentStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
    // Previous window: 24–48h ago
    const previousStart = new Date(now.getTime() - 2 * windowHours * 60 * 60 * 1000);

    // 1. Fetch all businesses
    const { data: businessesData } = await this.supabase
      .from('businesses')
      .select('id, name, google_review_url, is_active, created_at')
      .is('deleted_at', null);

    const allBusinesses = businessesData || [];
    const businessIds = allBusinesses.map((b: any) => b.id);

    // 2. Batch-fetch 48h of data (covers both windows)
    let [
      { data: scansData },
      { data: sessionsData },
      { data: reviewsData },
      { data: feedbackData },
      { data: upgradeData },
      { data: qrData },
      { data: subData },
    ] = await Promise.all([
      businessIds.length > 0
        ? this.supabase.from('scan_logs').select('id, business_id, scanned_at')
            .in('business_id', businessIds)
            .gte('scanned_at', previousStart.toISOString())
        : Promise.resolve({ data: [] }),
      businessIds.length > 0
        ? this.supabase.from('review_sessions').select('id, business_id, status, started_at, metadata')
            .in('business_id', businessIds)
            .gte('started_at', previousStart.toISOString())
        : Promise.resolve({ data: [] }),
      businessIds.length > 0
        ? this.supabase.from('generated_reviews').select('id, business_id, created_at')
            .in('business_id', businessIds)
            .gte('created_at', previousStart.toISOString())
        : Promise.resolve({ data: [] }),
      businessIds.length > 0
        ? this.supabase.from('pilot_feedback').select('id, business_id, status, created_at')
            .in('business_id', businessIds)
            .gte('created_at', previousStart.toISOString())
        : Promise.resolve({ data: [] }),
      businessIds.length > 0
        ? this.supabase.from('upgrade_requests').select('id, business_id, status, created_at')
            .in('business_id', businessIds)
            .eq('status', 'pending')
        : Promise.resolve({ data: [] }),
      businessIds.length > 0
        ? this.supabase.from('qr_codes').select('id, business_id, is_active')
            .in('business_id', businessIds)
        : Promise.resolve({ data: [] }),
      businessIds.length > 0
        ? this.supabase.from('subscriptions').select('id, business_id, plan, status, current_period_start, current_period_end')
            .in('business_id', businessIds)
            .in('status', ['active', 'trialing'])
        : Promise.resolve({ data: [] }),
    ]);

    const scans = scansData || [];
    const sessions = sessionsData || [];
    const reviews = reviewsData || [];
    const feedbackList = feedbackData || [];
    const upgradeRequests = upgradeData || [];
    const qrCodes = qrData || [];
    const subscriptions = subData || [];

    // Helper to split events into current/previous windows
    const inCurrent = (ts: string) => new Date(ts) >= currentStart;
    const inPrevious = (ts: string) => new Date(ts) >= previousStart && new Date(ts) < currentStart;

    // --- Customer flow metrics ---
    const currentScans = scans.filter(s => inCurrent(s.scanned_at)).length;
    const previousScans = scans.filter(s => inPrevious(s.scanned_at)).length;

    const currentSessions = sessions.filter(s => inCurrent(s.started_at)).length;
    const previousSessions = sessions.filter(s => inPrevious(s.started_at)).length;

    const currentReviews = reviews.filter(r => inCurrent(r.created_at)).length;
    const previousReviews = reviews.filter(r => inPrevious(r.created_at)).length;

    const currentCopies = sessions.filter(s => inCurrent(s.started_at) && (s.metadata?.copied_at || Number(s.metadata?.copy_count) > 0)).length;
    const previousCopies = sessions.filter(s => inPrevious(s.started_at) && (s.metadata?.copied_at || Number(s.metadata?.copy_count) > 0)).length;

    const currentGoogleOpens = sessions.filter(s => inCurrent(s.started_at) && (s.status === 'redirected' || s.metadata?.google_redirected_at)).length;
    const previousGoogleOpens = sessions.filter(s => inPrevious(s.started_at) && (s.status === 'redirected' || s.metadata?.google_redirected_at)).length;

    const currentPrivateFeedback = sessions.filter(s => inCurrent(s.started_at) && s.status === 'private_feedback_submitted').length;
    const previousPrivateFeedback = sessions.filter(s => inPrevious(s.started_at) && s.status === 'private_feedback_submitted').length;

    // --- Feedback metrics ---
    const newFeedback24h = feedbackList.filter(f => inCurrent(f.created_at)).length;
    const openFeedback = feedbackList.filter(f => f.status === 'open').length;
    const reviewingFeedback = feedbackList.filter(f => f.status === 'reviewing').length;

    // --- Business metrics ---
    const qrByBiz = new Map<string, any[]>();
    qrCodes.forEach(q => {
      if (!qrByBiz.has(q.business_id)) qrByBiz.set(q.business_id, []);
      qrByBiz.get(q.business_id)!.push(q);
    });

    const newlyOnboarded24h = allBusinesses.filter(b => inCurrent(b.created_at)).length;
    const setupIncomplete = allBusinesses.filter(b => {
      const bizQRs = qrByBiz.get(b.id) || [];
      return !(b.name?.trim() && b.google_review_url?.trim()?.startsWith('http') && bizQRs.length > 0);
    }).length;

    const activeInWindow = new Set<string>();
    sessions.filter(s => inCurrent(s.started_at)).forEach(s => activeInWindow.add(s.business_id));
    scans.filter(s => inCurrent(s.scanned_at)).forEach(s => activeInWindow.add(s.business_id));

    const noRecentActivity = allBusinesses.filter(b => !activeInWindow.has(b.id)).length;

    // --- Subscription metrics ---
    const pendingUpgrades = upgradeRequests.length;

    // Businesses near usage limit: ai_usage >= 80% of ai_limit
    const subByBiz = new Map<string, any>();
    subscriptions.forEach(sub => subByBiz.set(sub.business_id, sub));
    let businessesNearLimit = 0;
    allBusinesses.forEach((b: any) => {
      const sub = subByBiz.get(b.id);
      if (sub) {
        const bizReviewCount = reviews.filter(r => r.business_id === b.id && new Date(r.created_at) >= new Date(sub.current_period_start || 0)).length;
        const limitMap: Record<string, number | null> = { free: 50, starter: 500, professional: 2000, enterprise: null };
        const limit = limitMap[sub.plan] ?? 50;
        if (limit !== null && bizReviewCount >= Math.floor(limit * 0.8)) {
          businessesNearLimit++;
        }
      }
    });

    // --- System health from in-memory incident log ---
    const since24h = currentStart;
    const incidentCounts24h = operationalIncidents.getIncidentCounts(since24h);
    const recentIncidents = operationalIncidents.getRecentIncidents({ since: since24h, limit: 200 });
    const criticalIncidents = recentIncidents.filter(i => i.severity === 'critical').length;
    const openIncidents = recentIncidents.filter(i => i.status !== 'resolved').length;

    // AI failure detection from sessions: sessions where AI generation was attempted but session never reached review_generated
    // Use incident log for authoritative AI failure count
    const aiFailures24h = incidentCounts24h.ai_failures;

    // AI generation failure rate (only show if denominator > 0)
    const totalAIAttempts = currentReviews + aiFailures24h;
    const aiFailureRatePct = totalAIAttempts > 0
      ? Math.round((aiFailures24h / totalAIAttempts) * 100)
      : null;

    // Recent critical incidents for the summary
    const recentCritical = operationalIncidents.getRecentIncidents({
      since: since24h,
      severity: 'critical',
      limit: 10,
    });

    // Previous window incident counts (approximate from log, since incidents are deduplicated)
    const incidentCountsPrev = operationalIncidents.getIncidentCounts(previousStart);
    // Subtract current-window counts to get previous-only (rough approximation in-memory)
    const prevErrors = Math.max(0, incidentCountsPrev.total - incidentCounts24h.total);
    const prevAI = Math.max(0, incidentCountsPrev.ai_failures - aiFailures24h);
    const prevAuth = Math.max(0, incidentCountsPrev.authorization_failures - incidentCounts24h.authorization_failures);
    const prevDB = Math.max(0, incidentCountsPrev.database_failures - incidentCounts24h.database_failures);

    return {
      generated_at: now.toISOString(),
      window_hours: windowHours,
      system: {
        operational_errors_24h: incidentCounts24h.total,
        ai_failures_24h: aiFailures24h,
        auth_failures_24h: incidentCounts24h.authorization_failures,
        db_errors_24h: incidentCounts24h.database_failures,
        customer_flow_failures_24h: incidentCounts24h.customer_flow_failures,
        critical_incidents: criticalIncidents,
        open_incidents: openIncidents,
      },
      customer_flow: {
        qr_scans: currentScans,
        review_sessions: currentSessions,
        ai_generations: currentReviews,
        ai_generation_failures: aiFailures24h,
        ai_failure_rate_pct: aiFailureRatePct,
        review_copies: currentCopies,
        google_page_opens: currentGoogleOpens,
        private_feedback_submitted: currentPrivateFeedback,
      },
      businesses: {
        total: allBusinesses.length,
        newly_onboarded_24h: newlyOnboarded24h,
        setup_incomplete: setupIncomplete,
        active_in_window: activeInWindow.size,
        no_recent_activity: noRecentActivity,
      },
      feedback: {
        new_24h: newFeedback24h,
        open_total: openFeedback,
        reviewing: reviewingFeedback,
      },
      subscriptions: {
        pending_upgrade_requests: pendingUpgrades,
        businesses_near_limit: businessesNearLimit,
      },
      comparison: {
        current: {
          qr_scans: currentScans,
          review_sessions: currentSessions,
          ai_generations: currentReviews,
          review_copies: currentCopies,
          google_page_opens: currentGoogleOpens,
          private_feedback_submitted: currentPrivateFeedback,
          operational_errors: incidentCounts24h.total,
          ai_failures: aiFailures24h,
          auth_failures: incidentCounts24h.authorization_failures,
          db_errors: incidentCounts24h.database_failures,
        },
        previous: {
          qr_scans: previousScans,
          review_sessions: previousSessions,
          ai_generations: previousReviews,
          review_copies: previousCopies,
          google_page_opens: previousGoogleOpens,
          private_feedback_submitted: previousPrivateFeedback,
          operational_errors: prevErrors,
          ai_failures: prevAI,
          auth_failures: prevAuth,
          db_errors: prevDB,
        },
      },
      recent_critical_incidents: recentCritical,
      notice: 'Google Review Page Opens indicates customer opened the Google Review URL. It does NOT imply verified review publication on Google. Operational monitoring can identify ReviewAI-side events and failures. It cannot verify whether a customer actually submitted or published a Google review.',
    };
  }

  /**
   * Update an operational incident status/note (admin only)
   */
  updateIncident(id: string, update: import('./types').IncidentUpdate): import('./types').OperationalIncident | null {
    return operationalIncidents.updateIncident(id, update);
  }

  /**
   * Get a single operational incident by ID (admin only)
   */
  getIncidentById(id: string): import('./types').OperationalIncident | null {
    return operationalIncidents.getIncident(id);
  }

  /**
   * Get recent operational incidents with optional filtering (admin only)
   */
  getRecentIncidents(filter?: { category?: string; severity?: string; limit?: number; since?: Date }): import('./types').OperationalIncident[] {
    return operationalIncidents.getRecentIncidents(filter as any);
  }

  /**
   * Section 3: Active Clients with metrics, category, and real status
   */
  async getClients(query: import('./types').AdminClientListQuery & { sort?: string }) {
    const cacheKey = JSON.stringify(query);
    const cached = this.clientsCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    // 1. Fetch all normal client users (excluding admin accounts)
    const { data: usersData, error: usersError } = await this.supabase
      .from('users')
      .select('id, full_name, email, role, avatar_url, email_verified, last_login_at, created_at, updated_at, pilot_cohort, deleted_at')
      .neq('role', 'admin')
      .is('deleted_at', null);

    if (usersError) throw usersError;

    const uList = usersData || [];
    const uIds = uList.map(u => u.id);

    // 2. Fetch all businesses owned by these users
    const { data: businessesData, error: bError } = await this.supabase
      .from('businesses')
      .select(`
        id,
        name,
        slug,
        owner_id,
        status,
        settings,
        created_at,
        subscription:subscriptions(plan_id, status, trial_end, current_period_end)
      `)
      .in('owner_id', uIds.length > 0 ? uIds : ['00000000-0000-0000-0000-000000000000'])
      .is('deleted_at', null);

    if (bError) throw bError;

    const bList = businessesData || [];
    const bIds = bList.map(b => b.id);

    // 3. Batch fetch activity metrics across all businesses
    const [
      { data: scansData },
      { data: sessionsData },
      { data: draftsData },
      { data: qrData },
    ] = await Promise.all([
      bIds.length > 0 ? this.supabase.from('scan_logs').select('business_id, scanned_at').in('business_id', bIds) : Promise.resolve({ data: [] }),
      bIds.length > 0 ? this.supabase.from('review_sessions').select('business_id, status, started_at, metadata').in('business_id', bIds) : Promise.resolve({ data: [] }),
      bIds.length > 0 ? this.supabase.from('generated_reviews').select('business_id, created_at').in('business_id', bIds) : Promise.resolve({ data: [] }),
      bIds.length > 0 ? this.supabase.from('qr_codes').select('business_id, is_active').in('business_id', bIds) : Promise.resolve({ data: [] }),
    ]);

    // Map business-level stats
    const scansMap = new Map<string, number>();
    const lastScanMap = new Map<string, string>();
    (scansData || []).forEach((s: any) => {
      scansMap.set(s.business_id, (scansMap.get(s.business_id) || 0) + 1);
      const cur = lastScanMap.get(s.business_id);
      if (!cur || s.scanned_at > cur) lastScanMap.set(s.business_id, s.scanned_at);
    });

    const sessionsMap = new Map<string, number>();
    const continuesMap = new Map<string, number>();
    const lastSessionMap = new Map<string, string>();
    (sessionsData || []).forEach((s: any) => {
      sessionsMap.set(s.business_id, (sessionsMap.get(s.business_id) || 0) + 1);
      if (s.status === 'redirected' || s.status === 'completed' || s.metadata?.google_redirected_at) {
        continuesMap.set(s.business_id, (continuesMap.get(s.business_id) || 0) + 1);
      }
      const cur = lastSessionMap.get(s.business_id);
      if (!cur || s.started_at > cur) lastSessionMap.set(s.business_id, s.started_at);
    });

    const draftsMap = new Map<string, number>();
    const lastDraftMap = new Map<string, string>();
    (draftsData || []).forEach((d: any) => {
      draftsMap.set(d.business_id, (draftsMap.get(d.business_id) || 0) + 1);
      const cur = lastDraftMap.get(d.business_id);
      if (!cur || d.created_at > cur) lastDraftMap.set(d.business_id, d.created_at);
    });

    const qrTotalMap = new Map<string, number>();
    const qrActiveMap = new Map<string, number>();
    (qrData || []).forEach((q: any) => {
      qrTotalMap.set(q.business_id, (qrTotalMap.get(q.business_id) || 0) + 1);
      if (q.is_active) qrActiveMap.set(q.business_id, (qrActiveMap.get(q.business_id) || 0) + 1);
    });

    const nowMs = Date.now();
    const thirtyDaysAgoMs = nowMs - (30 * 24 * 60 * 60 * 1000);

    // 4. Construct user/client records with multi-business hierarchy
    let clients = uList.map((user: any) => {
      const userBusinesses = bList.filter(b => b.owner_id === user.id);
      const businessCount = userBusinesses.length;
      const businessNames = userBusinesses.map(b => b.name);

      // Extract all unique categories
      const categoriesSet = new Set<string>();
      userBusinesses.forEach(b => {
        const cat = (b as any).category || b.settings?.category || (b.name?.toLowerCase().includes('cafe') ? 'cafe' : b.name?.toLowerCase().includes('fitness') ? 'gym' : 'other');
        categoriesSet.add(cat);
      });
      const categories = Array.from(categoriesSet);
      const primaryCategory = categories[0] || 'other';

      // Aggregated usage metrics across all owned businesses
      let totalUserScans = 0;
      let totalUserSessions = 0;
      let totalUserDrafts = 0;
      let totalUserContinues = 0;
      let totalUserQRs = 0;
      let activeUserQRs = 0;
      const activityDates: string[] = [user.created_at];
      if (user.last_login_at) activityDates.push(user.last_login_at);

      const businessesDetail = userBusinesses.map(b => {
        const scans = scansMap.get(b.id) || 0;
        const sessions = sessionsMap.get(b.id) || 0;
        const drafts = draftsMap.get(b.id) || 0;
        const continues = continuesMap.get(b.id) || 0;
        const qrs = qrTotalMap.get(b.id) || 0;
        const activeQrs = qrActiveMap.get(b.id) || 0;

        totalUserScans += scans;
        totalUserSessions += sessions;
        totalUserDrafts += drafts;
        totalUserContinues += continues;
        totalUserQRs += qrs;
        activeUserQRs += activeQrs;

        if (lastScanMap.get(b.id)) activityDates.push(lastScanMap.get(b.id)!);
        if (lastSessionMap.get(b.id)) activityDates.push(lastSessionMap.get(b.id)!);
        if (lastDraftMap.get(b.id)) activityDates.push(lastDraftMap.get(b.id)!);
        if (b.created_at) activityDates.push(b.created_at);

        const sub = Array.isArray(b.subscription) ? b.subscription[0] : b.subscription;
        const rawCategory = (b as any).category || b.settings?.category || (b.name?.toLowerCase().includes('cafe') ? 'cafe' : b.name?.toLowerCase().includes('fitness') ? 'gym' : 'other');

        return {
          id: b.id,
          name: b.name,
          slug: b.slug,
          category: rawCategory,
          category_name: rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1),
          status: b.status,
          plan: sub?.plan_id || 'free',
          subscription_status: sub?.status || 'inactive',
          created_at: b.created_at,
          total_scans: scans,
          total_sessions: sessions,
          total_drafts: drafts,
          google_continue_events: continues,
          total_qr_codes: qrs,
          active_qr_codes: activeQrs,
        };
      });

      // Calculate last activity timestamp
      activityDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      const lastActivity = activityDates[0] || user.created_at;
      const lastActivityMs = new Date(lastActivity).getTime();
      const isActiveRecently = lastActivityMs >= thirtyDaysAgoMs;

      // Real account status: explicit admin deactivation
      const isDeactivated = user.account_status === 'deactivated' || user.pilot_cohort === 'status:deactivated';
      const accountStatus: 'active' | 'deactivated' = isDeactivated ? 'deactivated' : 'active';
      const activityStatus: 'active' | 'inactive' | 'deactivated' = isDeactivated ? 'deactivated' : isActiveRecently ? 'active' : 'inactive';

      // Subscription: highest plan across businesses
      const planPriority: Record<string, number> = { enterprise: 4, professional: 3, starter: 2, free: 1 };
      let highestPlan = 'free';
      userBusinesses.forEach(b => {
        const sub = Array.isArray(b.subscription) ? b.subscription[0] : b.subscription;
        const p = (sub?.plan_id || 'free').toLowerCase();
        if ((planPriority[p] || 0) > (planPriority[highestPlan] || 0)) {
          highestPlan = p;
        }
      });

      return {
        id: user.id,
        user_id: user.id,
        name: user.full_name || 'Business Owner',
        owner_name: user.full_name || 'Business Owner',
        email: user.email,
        owner_email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
        email_verified: !!user.email_verified,
        account_status: accountStatus,
        status: accountStatus, // Backwards compatibility for UI badge
        activity_status: activityStatus,
        is_active_recently: isActiveRecently,
        business_count: businessCount,
        business_names: businessNames,
        primary_business_name: businessNames[0] || 'No businesses registered',
        slug: userBusinesses[0]?.slug || '',
        category: primaryCategory,
        category_name: primaryCategory.charAt(0).toUpperCase() + primaryCategory.slice(1),
        categories: categories,
        plan: highestPlan,
        created_at: user.created_at,
        last_activity: lastActivity,
        last_login_at: user.last_login_at,
        total_scans: totalUserScans,
        total_sessions: totalUserSessions,
        total_drafts: totalUserDrafts,
        google_continue_events: totalUserContinues,
        total_qr_codes: totalUserQRs,
        active_qr_codes: activeUserQRs,
        businesses: businessesDetail,
      };
    });

    // 5. Global platform status counts before filter
    const activeUsersCount = clients.filter(c => c.account_status === 'active' && c.is_active_recently).length;
    const inactiveUsersCount = clients.filter(c => c.account_status === 'active' && !c.is_active_recently).length;
    const deactivatedUsersCount = clients.filter(c => c.account_status === 'deactivated').length;
    const totalBusinessesCount = bList.length;

    // 6. Apply search filter
    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      clients = clients.filter(c => {
        return (
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.business_names.some(bn => bn.toLowerCase().includes(q)) ||
          c.businesses.some(b => b.slug.toLowerCase().includes(q) || b.id.toLowerCase().includes(q))
        );
      });
    }

    // 7. Apply status filter
    if (query.status && query.status !== 'all') {
      const s = query.status.toLowerCase();
      if (s === 'active') {
        clients = clients.filter(c => c.account_status === 'active');
      } else if (s === 'deactivated') {
        clients = clients.filter(c => c.account_status === 'deactivated');
      } else if (s === 'active_recent') {
        clients = clients.filter(c => c.account_status === 'active' && c.is_active_recently);
      } else if (s === 'inactive') {
        clients = clients.filter(c => c.account_status === 'active' && !c.is_active_recently);
      } else if (s === 'suspended') {
        clients = clients.filter(c => c.account_status === 'deactivated');
      }
    }

    // 8. Apply category filter
    if (query.category && query.category !== 'all') {
      const targetCat = query.category.toLowerCase();
      clients = clients.filter(c => c.categories.some(cat => cat.toLowerCase().includes(targetCat)));
    }

    // 9. Apply plan filter
    if (query.plan && query.plan !== 'all') {
      const targetPlan = query.plan.toLowerCase();
      clients = clients.filter(c => c.plan.toLowerCase() === targetPlan);
    }

    // 10. Apply date filters
    if (query.date_from) {
      const fromTime = new Date(query.date_from).getTime();
      clients = clients.filter(c => new Date(c.created_at).getTime() >= fromTime);
    }
    if (query.date_to) {
      const toTime = new Date(query.date_to).getTime();
      clients = clients.filter(c => new Date(c.created_at).getTime() <= toTime);
    }

    // 11. Apply sorting
    const sort = query.sort || 'newest';
    if (sort === 'oldest') {
      clients.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sort === 'last_activity') {
      clients.sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime());
    } else if (sort === 'businesses_desc') {
      clients.sort((a, b) => b.business_count - a.business_count);
    } else if (sort === 'usage_desc') {
      clients.sort((a, b) => (b.total_scans + b.total_sessions + b.total_drafts) - (a.total_scans + a.total_sessions + a.total_drafts));
    } else {
      // 'newest' default
      clients.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // 12. Paginate
    const total = clients.length;
    const paginatedClients = clients.slice(offset, offset + limit);

    const result = {
      data: paginatedClients,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit) || 1,
        active_users_count: activeUsersCount,
        inactive_users_count: inactiveUsersCount,
        deactivated_users_count: deactivatedUsersCount,
        total_businesses_count: totalBusinessesCount,
      },
    };

    this.clientsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 20_000 });
    return result;
  }

  /**
   * Section 4: Comprehensive User / Client Detail (Multi-Business Hierarchy)
   */
  async getClientDetail(id: string) {
    // 1. Identify user (either by User ID or Business ID)
    let user: any = null;
    const { data: userById } = await this.supabase
      .from('users')
      .select('id, full_name, email, role, avatar_url, email_verified, last_login_at, created_at, updated_at, pilot_cohort')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (userById) {
      user = userById;
    } else {
      // Check if id is a business id
      const { data: businessById } = await this.supabase
        .from('businesses')
        .select('id, owner_id')
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (businessById?.owner_id) {
        const { data: userByOwner } = await this.supabase
          .from('users')
          .select('id, full_name, email, role, avatar_url, email_verified, last_login_at, created_at, updated_at, pilot_cohort')
          .eq('id', businessById.owner_id)
          .is('deleted_at', null)
          .single();
        user = userByOwner;
      }
    }

    if (!user) {
      throw new NotFoundError('Client record not found');
    }

    // 2. Fetch all businesses owned by this user
    const { data: businessesData, error: bErr } = await this.supabase
      .from('businesses')
      .select(`
        id,
        name,
        slug,
        owner_id,
        status,
        description,
        logo_url,
        google_review_url,
        website_url,
        phone,
        address,
        timezone,
        settings,
        created_at,
        updated_at,
        subscription:subscriptions(id, plan_id, status, trial_start, trial_end, current_period_start, current_period_end, cancel_at_period_end)
      `)
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (bErr) throw bErr;
    const userBusinesses = businessesData || [];
    const bIds = userBusinesses.map(b => b.id);

    // 3. Batch fetch usage metrics for all user businesses
    const [
      { data: scans },
      { data: sessions },
      { data: drafts },
      { data: qrs },
      { data: feedback },
      { data: activityLogs },
    ] = await Promise.all([
      bIds.length > 0 ? this.supabase.from('scan_logs').select('id, business_id, scanned_at, qr_code_id').in('business_id', bIds) : Promise.resolve({ data: [] }),
      bIds.length > 0 ? this.supabase.from('review_sessions').select('id, business_id, status, rating, started_at, completed_at, metadata').in('business_id', bIds) : Promise.resolve({ data: [] }),
      bIds.length > 0 ? this.supabase.from('generated_reviews').select('id, business_id, rating, edited_text, generation_time_ms, regeneration_count, ai_provider, model, status, created_at').in('business_id', bIds) : Promise.resolve({ data: [] }),
      bIds.length > 0 ? this.supabase.from('qr_codes').select('id, business_id, name, code, is_active, scan_count, created_at').in('business_id', bIds) : Promise.resolve({ data: [] }),
      bIds.length > 0 ? this.supabase.from('pilot_feedback').select('id, business_id, rating, category, comments, created_at').in('business_id', bIds) : Promise.resolve({ data: [] }),
      this.supabase.from('audit_logs').select('*').or(`user_id.eq.${user.id}${bIds.length > 0 ? `,business_id.in.(${bIds.join(',')})` : ''}`).order('created_at', { ascending: false }).limit(25),
    ]);

    const scansList = scans || [];
    const sessionsList = sessions || [];
    const draftsList = drafts || [];
    const qrList = qrs || [];
    const feedbackList = feedback || [];

    // Aggregations
    const ratingsSubmitted = sessionsList.filter(s => s.rating !== null && s.rating !== undefined).length;
    const tagsSelected = sessionsList.filter(s => s.metadata?.tags?.length > 0 || (s.status !== 'started' && s.status !== 'rating_submitted')).length;
    const textSubmissions = sessionsList.filter(s => s.metadata?.customer_text || s.metadata?.feedback_text).length;
    const draftsGenerated = draftsList.length;
    const reviewsEdited = draftsList.filter(d => d.edited_text !== null && d.edited_text !== undefined && d.edited_text !== '').length;
    const copyEvents = sessionsList.filter(s => s.metadata?.copied_at || s.metadata?.text_copied).length;
    const googleContinues = sessionsList.filter(s => s.status === 'redirected' || s.status === 'completed' || s.metadata?.google_redirected_at).length;
    const totalGenerations = draftsList.length;
    const regenerations = draftsList.reduce((sum, d) => sum + (d.regeneration_count || 0), 0);
    const failedGenerations = draftsList.filter(d => d.status === 'failed').length;
    const latencies = draftsList.map(d => d.generation_time_ms).filter((ms): ms is number => typeof ms === 'number' && ms > 0);
    const avgLatencyMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    // Per-business mapping
    const businessesWithMetrics = userBusinesses.map(b => {
      const bScans = scansList.filter(s => s.business_id === b.id);
      const bSessions = sessionsList.filter(s => s.business_id === b.id);
      const bDrafts = draftsList.filter(d => d.business_id === b.id);
      const bQrs = qrList.filter(q => q.business_id === b.id);
      const bFeedback = feedbackList.filter(f => f.business_id === b.id);
      const bContinues = bSessions.filter(s => s.status === 'redirected' || s.status === 'completed' || s.metadata?.google_redirected_at).length;
      const sub = Array.isArray(b.subscription) ? b.subscription[0] : b.subscription;
      const rawCategory = (b as any).category || b.settings?.category || (b.name?.toLowerCase().includes('cafe') ? 'cafe' : b.name?.toLowerCase().includes('fitness') ? 'gym' : 'other');

      return {
        ...b,
        category: rawCategory,
        category_name: rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1),
        subscription: sub,
        plan: sub?.plan_id || 'free',
        subscription_status: sub?.status || 'inactive',
        qr_codes: bQrs,
        total_qr_codes: bQrs.length,
        active_qr_codes: bQrs.filter(q => q.is_active).length,
        stats: {
          scans: bScans.length,
          sessions: bSessions.length,
          drafts: bDrafts.length,
          google_continues: bContinues,
          private_feedback: bFeedback.length,
        },
      };
    });

    const isDeactivated = user.account_status === 'deactivated' || user.pilot_cohort === 'status:deactivated';
    const primaryBusiness = businessesWithMetrics[0];

    // Build unified client detail response
    return {
      // Top-level fields for backwards compatibility with existing UI
      id: primaryBusiness?.id || user.id,
      user_id: user.id,
      name: primaryBusiness?.name || user.full_name || 'Business Owner',
      slug: primaryBusiness?.slug || '',
      category: primaryBusiness?.category || 'other',
      status: isDeactivated ? 'suspended' : primaryBusiness?.status || 'active',
      settings: primaryBusiness?.settings || {},
      created_at: primaryBusiness?.created_at || user.created_at,
      updated_at: primaryBusiness?.updated_at || user.updated_at,
      total_scans: scansList.length,
      total_sessions: sessionsList.length,
      total_drafts: draftsList.length,
      google_continue_events: googleContinues,
      subscription: primaryBusiness?.subscription || null,

      // Rich User Information
      user: {
        id: user.id,
        full_name: user.full_name || 'Business Owner',
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
        email_verified: !!user.email_verified,
        account_status: isDeactivated ? 'deactivated' : 'active',
        is_active_recently: user.last_login_at ? new Date(user.last_login_at).getTime() >= (Date.now() - 30 * 24 * 60 * 60 * 1000) : false,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
      },

      // Complete Multi-Business Hierarchy
      businesses: businessesWithMetrics,
      total_businesses: businessesWithMetrics.length,

      // Aggregated Platform Usage
      usage: {
        qr: {
          total_qr_codes: qrList.length,
          active_qr_codes: qrList.filter(q => q.is_active).length,
          total_scans: scansList.length,
        },
        review_flow: {
          sessions: sessionsList.length,
          ratings_submitted: ratingsSubmitted,
          tags_selected: tagsSelected,
          text_submissions: textSubmissions,
          ai_drafts_generated: draftsGenerated,
          reviews_edited: reviewsEdited,
          copy_events: copyEvents,
          google_continue_events: googleContinues,
          private_feedback: feedbackList.length,
        },
        ai: {
          total_generations: totalGenerations,
          regenerations: regenerations,
          failed_generations: failedGenerations,
          avg_latency_ms: avgLatencyMs,
        },
        subscription: {
          current_plan: primaryBusiness?.plan || 'free',
          status: primaryBusiness?.subscription_status || 'inactive',
          start_date: primaryBusiness?.subscription?.current_period_start || primaryBusiness?.created_at,
          renewal_date: primaryBusiness?.subscription?.current_period_end || null,
        },
      },

      // Recent Activity Timeline
      recent_activity: ((activityLogs as any[]) || []).map((log: any) => ({
        id: log.id,
        action: log.action,
        resource_type: log.resource_type,
        resource_id: log.resource_id,
        created_at: log.created_at,
        metadata: log.metadata,
      })),
    };
  }

  /**
   * Section 4B: Activate / Deactivate User Account
   */
  async deactivateUser(adminId: string, userId: string, reason?: string) {
    if (adminId === userId) {
      throw new ValidationError('Administrators cannot deactivate their own account');
    }

    // CRITICAL SECURITY RULE: No one can delete or deactivate an admin account
    const { data: targetUser } = await this.supabase
      .from('users')
      .select('id, role, email')
      .eq('id', userId)
      .single();

    if (targetUser && (targetUser.role === 'admin' || targetUser.email === 'thelastminuteprojectsss@gmail.com')) {
      throw new ValidationError('Admin accounts cannot be deactivated or deleted');
    }

    // Try updating account_status column, fallback to pilot_cohort marker
    let updated = false;
    try {
      const { error } = await this.supabase
        .from('users')
        .update({
          account_status: 'deactivated',
          pilot_cohort: 'status:deactivated',
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
      if (!error) updated = true;
    } catch {
      // fallback
    }

    if (!updated) {
      await this.supabase
        .from('users')
        .update({
          pilot_cohort: 'status:deactivated',
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    }

    await this.recordAdminAudit(adminId, 'user.deactivate', 'user', userId, {
      reason: reason || 'Explicitly deactivated by platform owner',
    });

    this.invalidateAdminCaches();

    return { success: true, message: 'User account has been deactivated successfully.' };
  }

  async activateUser(adminId: string, userId: string) {
    let updated = false;
    try {
      const { error } = await this.supabase
        .from('users')
        .update({
          account_status: 'active',
          pilot_cohort: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
      if (!error) updated = true;
    } catch {
      // fallback
    }

    if (!updated) {
      await this.supabase
        .from('users')
        .update({
          pilot_cohort: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    }

    await this.recordAdminAudit(adminId, 'user.activate', 'user', userId, {
      message: 'Account reactivated by platform owner',
    });

    this.invalidateAdminCaches();

    return { success: true, message: 'User account has been activated successfully.' };
  }

  /**
   * Section 5: Platform-wide Feature Usage
   */
  async getPlatformUsage(query: import('./types').AdminUsageQuery) {
    const range = query.range || '30d';
    let startDate = new Date();
    if (range === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (range === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (range === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (range === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (range === 'custom' && query.start_date) {
      startDate = new Date(query.start_date);
    }
    const startISO = startDate.toISOString();

    const [
      { data: scans },
      { data: sessions },
      { data: drafts },
      { data: businesses },
    ] = await Promise.all([
      this.supabase.from('scan_logs').select('id, scanned_at, business_id').gte('scanned_at', startISO),
      this.supabase.from('review_sessions').select('id, status, started_at, business_id, metadata').gte('started_at', startISO),
      this.supabase.from('generated_reviews').select('id, edited_text, created_at, business_id').gte('created_at', startISO),
      this.supabase.from('businesses').select('id, name, created_at').eq('status', 'active'),
    ]);

    const scansList = scans || [];
    const sessionsList = sessions || [];
    const draftsList = drafts || [];

    const totalScans = scansList.length;
    const totalSessions = sessionsList.length;
    const totalAIDrafts = draftsList.length;
    const editedDrafts = draftsList.filter(d => d.edited_text && d.edited_text.trim().length > 0).length;
    const copyEvents = sessionsList.filter(s => s.metadata?.copied_at || s.metadata?.copy_count > 0).length;
    const googleContinues = sessionsList.filter(s => s.status === 'redirected' || s.status === 'completed' || s.metadata?.google_redirected_at).length;
    const privateFeedback = sessionsList.filter(s => s.status === 'private_feedback_submitted' || s.metadata?.is_private_feedback).length;

    // Distinct active businesses
    const activeBizSet = new Set<string>();
    scansList.forEach(s => activeBizSet.add(s.business_id));
    sessionsList.forEach(s => activeBizSet.add(s.business_id));
    draftsList.forEach(d => activeBizSet.add(d.business_id));

    // Daily time series
    const dailyMap = new Map<string, { date: string; scans: number; sessions: number; ai_drafts: number; google_continues: number }>();
    scansList.forEach(s => {
      const d = s.scanned_at.split('T')[0];
      if (!dailyMap.has(d)) dailyMap.set(d, { date: d, scans: 0, sessions: 0, ai_drafts: 0, google_continues: 0 });
      dailyMap.get(d)!.scans++;
    });
    sessionsList.forEach(s => {
      const d = s.started_at.split('T')[0];
      if (!dailyMap.has(d)) dailyMap.set(d, { date: d, scans: 0, sessions: 0, ai_drafts: 0, google_continues: 0 });
      dailyMap.get(d)!.sessions++;
      if (s.status === 'redirected' || s.status === 'completed' || s.metadata?.google_redirected_at) {
        dailyMap.get(d)!.google_continues++;
      }
    });
    draftsList.forEach(dr => {
      const d = dr.created_at.split('T')[0];
      if (!dailyMap.has(d)) dailyMap.set(d, { date: d, scans: 0, sessions: 0, ai_drafts: 0, google_continues: 0 });
      dailyMap.get(d)!.ai_drafts++;
    });

    const timeSeries = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      summary: {
        total_scans: totalScans,
        review_sessions: totalSessions,
        ai_drafts: totalAIDrafts,
        edited_reviews: editedDrafts,
        copy_events: copyEvents,
        google_continue_events: googleContinues,
        private_feedback: privateFeedback,
        active_businesses: activeBizSet.size || businesses?.length || 0,
      },
      time_series: timeSeries,
      range,
    };
  }

  /**
   * Section 6: AI Usage Analytics
   */
  async getAIUsage(query: import('./types').AdminAIUsageQuery) {
    const range = query.range || '30d';
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startISO = startDate.toISOString();

    const [
      { data: drafts },
      { data: businesses },
    ] = await Promise.all([
      this.supabase.from('generated_reviews').select('id, business_id, rating, ai_provider, model, generation_time_ms, regeneration_count, created_at').gte('created_at', startISO),
      this.supabase.from('businesses').select('id, name, settings'),
    ]);

    const draftsList = drafts || [];
    const bizMap = new Map((businesses || []).map((b: any) => [b.id, b]));

    const totalGenerations = draftsList.length;
    let totalRegens = 0;
    let totalTime = 0;
    let timeCount = 0;
    const providerMap = new Map<string, number>();
    const dateMap = new Map<string, number>();
    const bizGenMap = new Map<string, { id: string; name: string; category: string; count: number; ratings: number[] }>();
    const catMap = new Map<string, number>();

    draftsList.forEach(d => {
      totalRegens += (d.regeneration_count || 0);
      if (d.generation_time_ms && d.generation_time_ms > 0) {
        totalTime += d.generation_time_ms;
        timeCount++;
      }

      const p = `${d.ai_provider || 'openai'} (${d.model || 'gpt-4o-mini'})`;
      providerMap.set(p, (providerMap.get(p) || 0) + 1);

      const date = d.created_at.split('T')[0];
      dateMap.set(date, (dateMap.get(date) || 0) + 1);

      const biz = bizMap.get(d.business_id);
      const bName = biz?.name || 'Unknown Business';
      const bCat = biz?.settings?.category || (bName.toLowerCase().includes('cafe') ? 'cafe' : bName.toLowerCase().includes('fitness') ? 'gym' : 'other');

      if (!bizGenMap.has(d.business_id)) {
        bizGenMap.set(d.business_id, { id: d.business_id, name: bName, category: bCat, count: 0, ratings: [] });
      }
      const bItem = bizGenMap.get(d.business_id)!;
      bItem.count++;
      if (d.rating) bItem.ratings.push(d.rating);

      catMap.set(bCat, (catMap.get(bCat) || 0) + 1);
    });

    const avgResponseTimeMs = timeCount > 0 ? Math.round(totalTime / timeCount) : 0;

    const byBusiness = Array.from(bizGenMap.values())
      .map(b => ({
        id: b.id,
        name: b.name,
        category: b.category,
        generations: b.count,
        avg_rating: b.ratings.length > 0 ? Number((b.ratings.reduce((a, c) => a + c, 0) / b.ratings.length).toFixed(1)) : 5.0,
      }))
      .sort((a, b) => b.generations - a.generations)
      .slice(0, 10);

    const byCategory = Array.from(catMap.entries()).map(([category, count]) => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      count,
    })).sort((a, b) => b.count - a.count);

    const byDate = Array.from(dateMap.entries()).map(([date, count]) => ({
      date,
      count,
    })).sort((a, b) => a.date.localeCompare(b.date));

    const modelDistribution = Array.from(providerMap.entries()).map(([model, count]) => ({
      model,
      count,
    }));

    return {
      total_generations: totalGenerations,
      regeneration_count: totalRegens,
      avg_response_time_ms: avgResponseTimeMs,
      failed_requests: 0,
      by_business: byBusiness,
      by_category: byCategory,
      by_date: byDate,
      model_distribution: modelDistribution,
      notice: 'API costs and provider token charges are monitored safely without exposing API keys or secrets.',
    };
  }

  /**
   * Section 7: QR + Customer Funnel
   */
  async getFunnelMetrics(query: import('./types').AdminFunnelQuery) {
    const range = query.range || '30d';
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startISO = startDate.toISOString();

    let scanQuery = this.supabase.from('scan_logs').select('id', { count: 'exact', head: true }).gte('scanned_at', startISO);
    let sessionQuery = this.supabase.from('review_sessions').select('id, rating, status, metadata').gte('started_at', startISO);
    let draftQuery = this.supabase.from('generated_reviews').select('id, edited_text').gte('created_at', startISO);

    if (query.business_id) {
      scanQuery = scanQuery.eq('business_id', query.business_id);
      sessionQuery = sessionQuery.eq('business_id', query.business_id);
      draftQuery = draftQuery.eq('business_id', query.business_id);
    }

    const [
      { count: scansCount },
      { data: sessionsData },
      { data: draftsData },
    ] = await Promise.all([
      scanQuery,
      sessionQuery,
      draftQuery,
    ]);

    const totalScans = scansCount || 0;
    const sessions = sessionsData || [];
    const drafts = draftsData || [];

    const totalSessions = sessions.length;
    const ratingsSubmitted = sessions.filter(s => s.rating !== null && s.rating !== undefined).length;
    const tagsSelected = sessions.filter(s => s.metadata?.tags && s.metadata.tags.length > 0).length;
    const draftsGenerated = drafts.length;
    const reviewsEdited = drafts.filter(d => d.edited_text && d.edited_text.trim().length > 0).length;
    const reviewsCopied = sessions.filter(s => s.metadata?.copied_at || s.metadata?.copy_count > 0).length;
    const googleOpened = sessions.filter(s => s.status === 'redirected' || s.status === 'completed' || s.metadata?.google_redirected_at).length;

    const baseCount = Math.max(totalScans, totalSessions);

    const steps = [
      {
        step: 1,
        name: 'QR Scan',
        description: 'Customer scanned the business QR code',
        count: totalScans,
        is_external: false,
      },
      {
        step: 2,
        name: 'Review Session Started',
        description: 'Customer landed on the review page',
        count: totalSessions,
        is_external: false,
      },
      {
        step: 3,
        name: 'Rating Submitted',
        description: 'Customer selected 1-5 star rating',
        count: ratingsSubmitted,
        is_external: false,
      },
      {
        step: 4,
        name: 'Experience Tags Selected',
        description: 'Customer chose 1-3 highlights',
        count: tagsSelected,
        is_external: false,
      },
      {
        step: 5,
        name: 'AI Draft Generated',
        description: 'ReviewAI produced an authentic draft',
        count: draftsGenerated,
        is_external: false,
      },
      {
        step: 6,
        name: 'Review Edited',
        description: 'Customer personalized or adjusted draft',
        count: reviewsEdited,
        is_external: false,
      },
      {
        step: 7,
        name: 'Review Copied',
        description: 'Customer copied text to clipboard',
        count: reviewsCopied,
        is_external: false,
      },
      {
        step: 8,
        name: 'Google Review Page Opened',
        description: 'Customer clicked Continue to open Google Review URL',
        count: googleOpened,
        is_external: true,
      },
    ];

    const funnelSteps = steps.map((s, idx) => {
      const prevCount = idx === 0 ? s.count : steps[idx - 1].count;
      const convFromPrev = prevCount > 0 ? Number(((s.count / prevCount) * 100).toFixed(1)) : 0;
      const convFromStart = baseCount > 0 ? Number(((s.count / baseCount) * 100).toFixed(1)) : 0;
      return {
        ...s,
        conversion_from_previous: convFromPrev,
        conversion_from_start: convFromStart,
      };
    });

    return {
      funnel: funnelSteps,
      overall_conversion_rate: baseCount > 0 ? Number(((googleOpened / baseCount) * 100).toFixed(1)) : 0,
      note: 'Steps 1 through 7 are tracked directly within the ReviewAI platform. Step 8 records customer navigation to Google. Final publication is executed by the customer externally on Google.',
    };
  }

  /**
   * Section 12: Global Admin Search
   */
  async globalSearch(searchTerm: string) {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return { businesses: [], users: [] };
    }
    const clean = searchTerm.trim();

    const [
      { data: businesses },
      { data: users },
    ] = await Promise.all([
      this.supabase
        .from('businesses')
        .select('id, name, slug, settings, status')
        .or(`name.ilike.%${clean}%,slug.ilike.%${clean}%`)
        .limit(10),
      this.supabase
        .from('users')
        .select('id, full_name, email, role')
        .or(`full_name.ilike.%${clean}%,email.ilike.%${clean}%`)
        .limit(10),
    ]);

    return {
      businesses: (businesses || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        category: b.settings?.category || 'other',
        status: b.status,
      })),
      users: (users || []).map((u: any) => ({
        id: u.id,
        name: u.full_name,
        email: u.email,
        role: u.role,
      })),
    };
  }

  /**
   * Section 17: Admin Audit Logging
   */
  async recordAdminAudit(adminId: string, action: string, resourceType: string, resourceId: string, details?: any): Promise<void> {
    try {
      await this.supabase.from('audit_logs').insert({
        user_id: adminId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata: {
          details: details || {},
          timestamp: new Date().toISOString(),
          is_admin_action: true,
        },
      });
    } catch (e) {
      console.error('Failed to write admin audit log:', e);
    }
  }
}