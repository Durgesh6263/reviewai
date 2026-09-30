/**
 * Analytics Module Controller
 * ReviewAI SaaS Platform
 * HTTP handlers for analytics endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from './service';
import { AuthenticatedRequest } from '../auth/middleware';
import {
  analyticsFiltersSchema,
  qrAnalyticsFiltersSchema,
  businessIdParamSchema,
  qrCodeIdParamSchema,
} from './validators';
import { successResponse } from '../../shared/utils/apiResponse';
import { AuthorizationError } from '../../shared/exceptions';

export class AnalyticsController {
  private overviewCache = new Map<string, { data: any; expiresAt: number }>();
  private chartCache = new Map<string, { data: any; expiresAt: number }>();
  private feedbackCache = new Map<string, { data: any; expiresAt: number }>();
  private activityCache = new Map<string, { data: any; expiresAt: number }>();
  private analyticsCache = new Map<string, { data: any; expiresAt: number }>();
  private userBizCache = new Map<string, { ids: string[]; expiresAt: number }>();

  constructor(private analyticsService: AnalyticsService) {}

  /**
   * GET /analytics/businesses/:businessId
   * Get business analytics overview
   */
  async getBusinessAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId } = businessIdParamSchema.parse(req.params).params;
      const filters = analyticsFiltersSchema.parse(req.query).query;

      // Verify user has access to this business
      await this.verifyBusinessAccess(req, businessId);

      const analytics = await this.analyticsService.getBusinessAnalytics(businessId, filters);
      res.json(successResponse(analytics, 'Business analytics retrieved'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /analytics/qr-codes/:qrCodeId
   * Get QR code specific analytics
   */
  async getQRCodeAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { qrCodeId } = qrCodeIdParamSchema.parse(req.params).params;
      const filters = qrAnalyticsFiltersSchema.parse(req.query).query;

      // Verify user has access to this QR code's business
      const { data: qrCode } = await this.analyticsService['supabase']
        .from('qr_codes')
        .select('business_id')
        .eq('id', qrCodeId)
        .single();

      if (qrCode) {
        await this.verifyBusinessAccess(req, qrCode.business_id);
      }

      const analytics = await this.analyticsService.getQRCodeAnalytics(qrCodeId, filters);
      res.json(successResponse(analytics, 'QR code analytics retrieved'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /analytics/businesses/:businessId/realtime
   * Get realtime metrics for a business
   */
  async getRealtimeMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { businessId } = businessIdParamSchema.parse(req.params).params;

      // Verify user has access to this business
      await this.verifyBusinessAccess(req, businessId);

      const metrics = await this.analyticsService.getRealtimeMetrics(businessId);
      res.json(successResponse(metrics, 'Realtime metrics retrieved'));
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

    const supabase = (this.analyticsService as any).supabase;

    // Check if user owns the business
    const { data: owned } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('owner_id', user.sub)
      .maybeSingle();

    if (owned) return;

    // Check if user is in business staff
    const { data: staff } = await supabase
      .from('business_staff')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.sub)
      .maybeSingle();

    if (!staff) {
      throw new AuthorizationError('Access denied: not authorized for this business');
    }
  }

  /**
   * Helper to retrieve all business IDs accessible to the current user
   */
  private async getUserBusinessIds(userId: string, role?: string, requestedBusinessId?: string): Promise<string[]> {
    try {
      const cacheKey = `${userId}:${role || 'user'}`;
      const cached = this.userBizCache.get(cacheKey);
      let allIds: string[];

      if (cached && Date.now() < cached.expiresAt) {
        allIds = cached.ids;
      } else {
        const supabase = (this.analyticsService as any).supabase;
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

        allIds = Array.from(ids);
        this.userBizCache.set(cacheKey, { ids: allIds, expiresAt: Date.now() + 30_000 });
      }

      if (requestedBusinessId) {
        if (allIds.includes(requestedBusinessId) || role === 'admin') {
          return [requestedBusinessId];
        }
        return [];
      }

      return allIds;
    } catch {
      return [];
    }
  }

  /**
   * Helper to compute date filter boundaries and comparison periods
   */
  private getDateRangeFilter(period?: string): {
    currentStart?: Date;
    currentEnd?: Date;
    previousStart?: Date;
    previousEnd?: Date;
    days: number;
  } {
    const now = new Date();
    const p = (period || '30d').toLowerCase();

    if (p === 'today') {
      const currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - 1);
      const previousEnd = new Date(currentStart);
      return { currentStart, currentEnd: now, previousStart, previousEnd, days: 1 };
    } else if (p === '7d') {
      const currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const previousStart = new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { currentStart, currentEnd: now, previousStart, previousEnd: currentStart, days: 7 };
    } else if (p === '90d') {
      const currentStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const previousStart = new Date(currentStart.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { currentStart, currentEnd: now, previousStart, previousEnd: currentStart, days: 90 };
    } else if (p === 'month' || p === 'this_month') {
      const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousEnd = currentStart;
      const days = Math.ceil((now.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000)) || 1;
      return { currentStart, currentEnd: now, previousStart, previousEnd, days };
    } else if (p === 'all') {
      return { days: 365 };
    } else {
      // Default: 30d
      const currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const previousStart = new Date(currentStart.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { currentStart, currentEnd: now, previousStart, previousEnd: currentStart, days: 30 };
    }
  }

  /**
   * Helper to calculate percentage change between two values
   */
  private calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100);
  }

  /**
   * GET /analytics/overview
   * Dashboard KPI metrics and percentage changes connected to real database records
   */
  getOverview = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestedBusinessId = req.query.business_id as string | undefined;
      const period = (req.query.period as string) || '30d';

      const cacheKey = `${req.user!.sub}:${requestedBusinessId || 'all'}:${period}`;
      const cached = this.overviewCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        res.json(successResponse(cached.data, 'Dashboard overview retrieved'));
        return;
      }

      if (requestedBusinessId && requestedBusinessId !== 'all') {
        await this.verifyBusinessAccess(req, requestedBusinessId);
      }

      const businessIds = await this.getUserBusinessIds(req.user!.sub, req.user!.role, requestedBusinessId);

      const { currentStart, currentEnd, previousStart, previousEnd } = this.getDateRangeFilter(period);

      let total_scans = 0;
      let total_sessions = 0;
      let total_generated = 0;
      let total_google_opens = 0;
      let total_feedback = 0;
      let total_copied = 0;
      let total_ratings = 0;
      let total_tags = 0;
      let total_edited = 0;
      let total_feedback_started = 0;
      let total_feedback_skipped = 0;

      let scans_change = 0;
      let sessions_change = 0;
      let generated_change = 0;
      let google_opens_change = 0;
      let feedback_change = 0;

      if (businessIds.length > 0) {
        const supabase = (this.analyticsService as any).supabase;

        // --- 1. QR Scans (scan_logs) ---
        let currScanQ = supabase.from('scan_logs').select('id', { count: 'exact', head: true }).in('business_id', businessIds);
        if (currentStart) currScanQ = currScanQ.gte('scanned_at', currentStart.toISOString());
        if (currentEnd) currScanQ = currScanQ.lte('scanned_at', currentEnd.toISOString());

        const prevScanQ = previousStart ? supabase.from('scan_logs').select('id', { count: 'exact', head: true }).in('business_id', businessIds).gte('scanned_at', previousStart.toISOString()).lte('scanned_at', previousEnd!.toISOString()) : null;

        // --- 2. Review Sessions with Metadata ---
        let currSessQ = supabase.from('review_sessions').select('id, rating, status, metadata, started_at').in('business_id', businessIds);
        if (currentStart) currSessQ = currSessQ.gte('started_at', currentStart.toISOString());
        if (currentEnd) currSessQ = currSessQ.lte('started_at', currentEnd.toISOString());

        const prevSessQ = previousStart ? supabase.from('review_sessions').select('id', { count: 'exact', head: true }).in('business_id', businessIds).gte('started_at', previousStart.toISOString()).lte('started_at', previousEnd!.toISOString()) : null;

        // --- 3. AI Reviews Generated (generated_reviews) ---
        let currGenQ = supabase.from('generated_reviews').select('id, edited_text, created_at').in('business_id', businessIds);
        if (currentStart) currGenQ = currGenQ.gte('created_at', currentStart.toISOString());
        if (currentEnd) currGenQ = currGenQ.lte('created_at', currentEnd.toISOString());

        const prevGenQ = previousStart ? supabase.from('generated_reviews').select('id', { count: 'exact', head: true }).in('business_id', businessIds).gte('created_at', previousStart.toISOString()).lte('created_at', previousEnd!.toISOString()) : null;

        // Previous period counts for changes
        const prevGoogleQ = previousStart ? supabase.from('review_sessions').select('id', { count: 'exact', head: true }).in('business_id', businessIds).eq('status', 'redirected').gte('started_at', previousStart.toISOString()).lte('started_at', previousEnd!.toISOString()) : null;
        const prevFeedQ = previousStart ? supabase.from('review_sessions').select('id', { count: 'exact', head: true }).in('business_id', businessIds).lte('rating', 3).gte('started_at', previousStart.toISOString()).lte('started_at', previousEnd!.toISOString()) : null;

        const [
          { count: cScans },
          pScansRes,
          { data: sessionsData },
          pSessRes,
          { data: reviewsData },
          pGenRes,
          pGoogleRes,
          pFeedRes,
        ] = await Promise.all([
          currScanQ,
          prevScanQ || Promise.resolve({ count: 0 }),
          currSessQ,
          prevSessQ || Promise.resolve({ count: 0 }),
          currGenQ,
          prevGenQ || Promise.resolve({ count: 0 }),
          prevGoogleQ || Promise.resolve({ count: 0 }),
          prevFeedQ || Promise.resolve({ count: 0 }),
        ]);

        total_scans = cScans || 0;
        const sessions = sessionsData || [];
        const reviews = reviewsData || [];

        total_sessions = sessions.length;
        total_generated = reviews.length;

        sessions.forEach((s: any) => {
          if (s.rating != null) total_ratings++;
          if (Array.isArray(s.metadata?.tags) && s.metadata.tags.length > 0) total_tags++;
          if (s.status === 'review_edited') total_edited++;
          if (s.metadata?.copied_at || Number(s.metadata?.copy_count) > 0) total_copied++;
          if (s.status === 'redirected' || s.metadata?.google_redirected_at) total_google_opens++;

          if (s.metadata?.feedback_started_at || (s.rating && s.rating <= 3)) total_feedback_started++;
          if (s.metadata?.feedback_submitted_at || s.status === 'private_feedback_submitted' || (s.rating && s.rating <= 3)) total_feedback++;
          if (s.metadata?.feedback_skipped_at) total_feedback_skipped++;
        });

        // Also check reviews with edited_text for total_edited
        reviews.forEach((r: any) => {
          if (r.edited_text) total_edited++;
        });

        scans_change = this.calculatePercentageChange(total_scans, pScansRes?.count || 0);
        sessions_change = this.calculatePercentageChange(total_sessions, pSessRes?.count || 0);
        generated_change = this.calculatePercentageChange(total_generated, pGenRes?.count || 0);
        google_opens_change = this.calculatePercentageChange(total_google_opens, pGoogleRes?.count || 0);
        feedback_change = this.calculatePercentageChange(total_feedback, pFeedRes?.count || 0);
      }

      // Lightweight product funnel metrics (Task 4 & Task 8)
      const scanToSessionPct = total_scans > 0 ? Math.round((total_sessions / total_scans) * 100) : 0;
      const sessionToGenPct = total_sessions > 0 ? Math.round((total_generated / total_sessions) * 100) : 0;
      const genToCopyPct = total_generated > 0 ? Math.round((total_copied / total_generated) * 100) : 0;
      const copyToGooglePct = total_copied > 0 ? Math.round((total_google_opens / total_copied) * 100) : 0;

      const product_funnel = {
        steps: [
          { name: 'QR Scan', count: total_scans },
          { name: 'Review Session Started', count: total_sessions },
          { name: 'Rating Selected', count: total_ratings },
          { name: 'Tags Selected', count: total_tags },
          { name: 'AI Review Generated', count: total_generated },
          { name: 'Review Edited', count: total_edited },
          { name: 'Review Copied', count: total_copied },
          { name: 'Google Review Page Opened', count: total_google_opens },
        ],
        conversion_rates: {
          scan_to_session_pct: scanToSessionPct,
          session_to_generation_pct: sessionToGenPct,
          generation_to_copy_pct: genToCopyPct,
          copy_to_google_pct: copyToGooglePct,
        },
        note: 'Product funnel metrics measure customer interaction within ReviewAI. Google Review Page Opened indicates the customer was redirected to Google and does NOT imply a review was published or received by Google.',
      };

      const feedback_metrics = {
        started: total_feedback_started,
        submitted: total_feedback,
        skipped: total_feedback_skipped,
        note: 'Private feedback from customers rating 1-3 stars. Low-rating customers retain access to Google review page if they choose.',
      };

      const responseData = {
        metrics: {
          total_scans,
          total_sessions,
          total_generated,
          total_google_opens,
          total_feedback,
          total_copied,
        },
        changes: {
          scans_change,
          sessions_change,
          generated_change,
          google_opens_change,
          feedback_change,
        },
        product_funnel,
        feedback_metrics,
      };

      this.overviewCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 20_000 });
      res.json(successResponse(responseData, 'Dashboard overview retrieved'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /analytics/sessions-chart
   * Daily breakdown of sessions for chart across the requested period
   */
  getSessionsChart = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestedBusinessId = req.query.business_id as string | undefined;
      const period = (req.query.period as string) || '30d';

      const cacheKey = `${req.user!.sub}:${requestedBusinessId || 'all'}:${period}`;
      const cached = this.chartCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        res.json(successResponse(cached.data, 'Sessions chart data retrieved'));
        return;
      }

      if (requestedBusinessId && requestedBusinessId !== 'all') {
        await this.verifyBusinessAccess(req, requestedBusinessId);
      }

      const businessIds = await this.getUserBusinessIds(req.user!.sub, req.user!.role, requestedBusinessId);

      const { currentStart, days } = this.getDateRangeFilter(period);

      const chartMap: Record<string, number> = {};
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        chartMap[dateStr] = 0;
      }

      if (businessIds.length > 0) {
        const supabase = (this.analyticsService as any).supabase;
        let query = supabase
          .from('review_sessions')
          .select('started_at')
          .in('business_id', businessIds);

        if (currentStart) {
          query = query.gte('started_at', currentStart.toISOString());
        }

        const { data: sessions } = await query;

        if (sessions) {
          sessions.forEach((s: any) => {
            const dateStr = (s.started_at || '').split('T')[0];
            if (dateStr && chartMap[dateStr] !== undefined) {
              chartMap[dateStr]++;
            }
          });
        }
      }

      const chartData = Object.entries(chartMap).map(([date, sessions]) => ({
        date,
        sessions,
      }));

      this.chartCache.set(cacheKey, { data: chartData, expiresAt: Date.now() + 20_000 });
      res.json(successResponse(chartData, 'Sessions chart data retrieved'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /analytics/recent-feedback
   * Recent customer private feedback (1-3 stars or private_feedback_submitted)
   */
  getRecentFeedback = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 5;
      const requestedBusinessId = req.query.business_id as string | undefined;

      const cacheKey = `${req.user!.sub}:${requestedBusinessId || 'all'}:${limit}`;
      const cached = this.feedbackCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        res.json(successResponse(cached.data, 'Recent feedback retrieved'));
        return;
      }

      if (requestedBusinessId && requestedBusinessId !== 'all') {
        await this.verifyBusinessAccess(req, requestedBusinessId);
      }

      const businessIds = await this.getUserBusinessIds(req.user!.sub, req.user!.role, requestedBusinessId);

      let feedback: any[] = [];
      if (businessIds.length > 0) {
        const supabase = (this.analyticsService as any).supabase;

        // 1. Fetch from pilot_feedback table
        const { data: pilotData } = await supabase
          .from('pilot_feedback')
          .select('id, business_id, rating, feedback_text, created_at, metadata')
          .in('business_id', businessIds)
          .order('created_at', { ascending: false })
          .limit(limit);

        // 2. Fetch from review_sessions with private feedback
        const { data: sessionData } = await supabase
          .from('review_sessions')
          .select('id, business_id, rating, metadata, started_at, completed_at, status')
          .in('business_id', businessIds)
          .or('status.eq.private_feedback_submitted,rating.lte.3')
          .order('started_at', { ascending: false })
          .limit(limit * 2);

        const seenSessionIds = new Set<string>();
        const merged: any[] = [];

        // Add pilot feedback items
        if (pilotData) {
          for (const item of pilotData) {
            const sessId = item.metadata?.session_id;
            if (sessId) seenSessionIds.add(sessId);
            merged.push({
              id: item.id,
              session_id: sessId,
              business_id: item.business_id,
              rating: item.rating || 3,
              feedback_text: item.feedback_text,
              created_at: item.created_at,
              source: 'pilot_feedback',
            });
          }
        }

        // Add session items that have actual feedback text or status private_feedback_submitted
        if (sessionData) {
          for (const item of sessionData) {
            if (seenSessionIds.has(item.id)) continue;
            const fbText = item.metadata?.feedback_text;
            if (fbText || item.status === 'private_feedback_submitted') {
              seenSessionIds.add(item.id);
              merged.push({
                id: item.id,
                session_id: item.id,
                business_id: item.business_id,
                rating: item.rating || 3,
                feedback_text: fbText || 'Customer provided private feedback.',
                created_at: item.completed_at || item.started_at,
                source: 'review_session',
              });
            }
          }
        }

        // Sort by created_at descending and take limit
        merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        feedback = merged.slice(0, limit);
      }

      const responsePayload = { feedback };
      this.feedbackCache.set(cacheKey, { data: responsePayload, expiresAt: Date.now() + 15_000 });
      res.json(successResponse(responsePayload, 'Recent feedback retrieved'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /analytics/recent-activity
   * Recent review sessions activity stream
   */
  getRecentActivity = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const requestedBusinessId = req.query.business_id as string | undefined;

      const cacheKey = `${req.user!.sub}:${requestedBusinessId || 'all'}:${limit}`;
      const cached = this.activityCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        res.json(successResponse(cached.data, 'Recent activity retrieved'));
        return;
      }

      if (requestedBusinessId && requestedBusinessId !== 'all') {
        await this.verifyBusinessAccess(req, requestedBusinessId);
      }

      const businessIds = await this.getUserBusinessIds(req.user!.sub, req.user!.role, requestedBusinessId);

      let activity: any[] = [];
      if (businessIds.length > 0) {
        const supabase = (this.analyticsService as any).supabase;
        const { data } = await supabase
          .from('review_sessions')
          .select('id, rating, language, status, metadata, started_at')
          .in('business_id', businessIds)
          .order('started_at', { ascending: false })
          .limit(limit);

        if (data) {
          activity = data.map((item: any) => ({
            id: item.id,
            rating: item.rating || 5,
            language: item.language || 'en',
            status: item.status || 'started',
            tags: Array.isArray(item.metadata?.tags) ? item.metadata.tags : [],
            created_at: item.started_at || new Date().toISOString(),
          }));
        }
      }

      const responsePayload = { activity };
      this.activityCache.set(cacheKey, { data: responsePayload, expiresAt: Date.now() + 15_000 });
      res.json(successResponse(responsePayload, 'Recent activity retrieved'));
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /analytics
   * Detailed analytics endpoint for /dashboard/analytics
   */
  getAnalytics = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestedBusinessId = (req.query.business_id as string) || (req.query.businessId as string);
      const range = (req.query.range as string) || (req.query.period as string) || '30d';

      const cacheKey = `${req.user!.sub}:${requestedBusinessId || 'all'}:${range}`;
      const cached = this.analyticsCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        res.json(successResponse(cached.data, 'Analytics retrieved'));
        return;
      }

      if (requestedBusinessId && requestedBusinessId !== 'all') {
        await this.verifyBusinessAccess(req, requestedBusinessId);
      }

      const businessIds = await this.getUserBusinessIds(req.user!.sub, req.user!.role, requestedBusinessId);

      const { currentStart, currentEnd } = this.getDateRangeFilter(range);

      const supabase = (this.analyticsService as any).supabase;

      let total_scans = 0;
      let total_reviews = 0;
      let total_sessions = 0;
      let total_copied = 0;
      let total_google_opens = 0;
      let total_ratings = 0;
      let total_tags = 0;
      let total_edited = 0;
      let total_feedback_started = 0;
      let total_feedback_submitted = 0;
      let total_feedback_skipped = 0;

      let avg_rating = 0;
      let top_qr_codes: any[] = [];
      const rating_distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const language_distribution: Record<string, number> = {};
      const device_distribution: Record<string, number> = { mobile: 0, desktop: 0, tablet: 0 };

      if (businessIds.length > 0) {
        // 1. Total scans and device distribution from scan_logs
        let scanQ = supabase
          .from('scan_logs')
          .select('id, qr_code_id, device_type, scanned_at')
          .in('business_id', businessIds);
        if (currentStart) scanQ = scanQ.gte('scanned_at', currentStart.toISOString());
        if (currentEnd) scanQ = scanQ.lte('scanned_at', currentEnd.toISOString());

        // 2. Reviews generated from generated_reviews
        let genQ = supabase
          .from('generated_reviews')
          .select('id, rating, language, edited_text, created_at')
          .in('business_id', businessIds);
        if (currentStart) genQ = genQ.gte('created_at', currentStart.toISOString());
        if (currentEnd) genQ = genQ.lte('created_at', currentEnd.toISOString());

        // 3. Sessions with metadata for funnel & rating distribution
        let sessQ = supabase
          .from('review_sessions')
          .select('id, qr_code_id, rating, language, status, metadata, started_at')
          .in('business_id', businessIds);
        if (currentStart) sessQ = sessQ.gte('started_at', currentStart.toISOString());
        if (currentEnd) sessQ = sessQ.lte('started_at', currentEnd.toISOString());

        // 4. QR codes list
        const qrQ = supabase
          .from('qr_codes')
          .select('id, label, slug, created_at')
          .in('business_id', businessIds)
          .eq('is_active', true);

        const [{ data: scans }, { data: generated }, { data: sessions }, { data: qrList }] = await Promise.all([
          scanQ,
          genQ,
          sessQ,
          qrQ,
        ]);

        total_scans = scans?.length || 0;
        total_reviews = generated?.length || 0;
        total_sessions = sessions?.length || 0;

        // Device distribution
        (scans || []).forEach((s: any) => {
          const dt = (s.device_type || 'mobile').toLowerCase();
          if (device_distribution[dt] !== undefined) {
            device_distribution[dt]++;
          } else {
            device_distribution.mobile++;
          }
        });

        // Review edits
        (generated || []).forEach((g: any) => {
          if (g.edited_text) total_edited++;
        });

        // Rating, Language, and Funnel distributions
        let sumRating = 0;
        let countRating = 0;
        (sessions || []).forEach((s: any) => {
          if (s.rating && s.rating >= 1 && s.rating <= 5) {
            rating_distribution[s.rating] = (rating_distribution[s.rating] || 0) + 1;
            sumRating += s.rating;
            countRating++;
            total_ratings++;
          }
          const lang = s.language || 'en';
          language_distribution[lang] = (language_distribution[lang] || 0) + 1;

          if (Array.isArray(s.metadata?.tags) && s.metadata.tags.length > 0) total_tags++;
          if (s.status === 'review_edited') total_edited++;
          if (s.metadata?.copied_at || Number(s.metadata?.copy_count) > 0) total_copied++;
          if (s.status === 'redirected' || s.metadata?.google_redirected_at) total_google_opens++;

          if (s.metadata?.feedback_started_at || (s.rating && s.rating <= 3)) total_feedback_started++;
          if (s.metadata?.feedback_submitted_at || s.status === 'private_feedback_submitted' || (s.rating && s.rating <= 3)) total_feedback_submitted++;
          if (s.metadata?.feedback_skipped_at) total_feedback_skipped++;
        });

        avg_rating = countRating > 0 ? Math.round((sumRating / countRating) * 10) / 10 : 5.0;

        // Top QR codes
        const scanCountsByQR: Record<string, number> = {};
        (scans || []).forEach((s: any) => {
          if (s.qr_code_id) {
            scanCountsByQR[s.qr_code_id] = (scanCountsByQR[s.qr_code_id] || 0) + 1;
          }
        });

        const reviewCountsByQR: Record<string, number> = {};
        (sessions || []).forEach((s: any) => {
          if (s.qr_code_id && (s.status === 'review_generated' || s.status === 'redirected' || s.status === 'completed')) {
            reviewCountsByQR[s.qr_code_id] = (reviewCountsByQR[s.qr_code_id] || 0) + 1;
          }
        });

        top_qr_codes = (qrList || []).map((q: any) => {
          const qScans = scanCountsByQR[q.id] || 0;
          const qReviews = reviewCountsByQR[q.id] || 0;
          return {
            id: q.id,
            name: q.label || q.slug,
            scans: qScans,
            reviews: qReviews,
            conversion_rate: qScans > 0 ? Math.round((qReviews / qScans) * 100) : 0,
          };
        }).sort((a: any, b: any) => b.scans - a.scans);
      }

      // Product conversion rate: AI reviews generated divided by scans
      const conversion_rate = total_scans > 0 ? Math.round((total_reviews / total_scans) * 100) : 0;

      // Product funnel metrics
      const scanToSessionPct = total_scans > 0 ? Math.round((total_sessions / total_scans) * 100) : 0;
      const sessionToGenPct = total_sessions > 0 ? Math.round((total_reviews / total_sessions) * 100) : 0;
      const genToCopyPct = total_reviews > 0 ? Math.round((total_copied / total_reviews) * 100) : 0;
      const copyToGooglePct = total_copied > 0 ? Math.round((total_google_opens / total_copied) * 100) : 0;

      const product_funnel = {
        steps: [
          { name: 'QR Scan', count: total_scans },
          { name: 'Review Session Started', count: total_sessions },
          { name: 'Rating Selected', count: total_ratings },
          { name: 'Tags Selected', count: total_tags },
          { name: 'AI Review Generated', count: total_reviews },
          { name: 'Review Edited', count: total_edited },
          { name: 'Review Copied', count: total_copied },
          { name: 'Google Review Page Opened', count: total_google_opens },
        ],
        conversion_rates: {
          scan_to_session_pct: scanToSessionPct,
          session_to_generation_pct: sessionToGenPct,
          generation_to_copy_pct: genToCopyPct,
          copy_to_google_pct: copyToGooglePct,
        },
        note: 'Product funnel metrics measure customer interaction within ReviewAI. Google Review Page Opened indicates the customer was redirected to Google and does NOT imply a review was published or received by Google.',
      };

      const feedback_metrics = {
        started: total_feedback_started,
        submitted: total_feedback_submitted,
        skipped: total_feedback_skipped,
        note: 'Private feedback from customers rating 1-3 stars. Low-rating customers retain access to Google review page if they choose.',
      };

      const analyticsData = {
        overview: {
          total_scans,
          total_reviews,
          total_sessions,
          total_copied,
          total_google_opens,
          conversion_rate,
          avg_rating: avg_rating || 5.0,
          scans_change: 0,
          reviews_change: 0,
          conversion_change: 0,
          rating_change: 0,
        },
        product_funnel,
        feedback_metrics,
        trends: [],
        top_qr_codes,
        rating_distribution: Object.keys(rating_distribution).length > 0 ? rating_distribution : { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        language_distribution: Object.keys(language_distribution).length > 0 ? language_distribution : { en: 0 },
        device_distribution: device_distribution.mobile + device_distribution.desktop + device_distribution.tablet > 0
          ? device_distribution
          : { mobile: 0, desktop: 0, tablet: 0 },
      };

      this.analyticsCache.set(cacheKey, { data: analyticsData, expiresAt: Date.now() + 20_000 });
      res.json(successResponse(analyticsData, 'Analytics retrieved'));
    } catch (error) {
      next(error);
    }
  };
}