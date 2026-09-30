/**
 * Analytics Module Service
 * ReviewAI SaaS Platform
 * Business logic for analytics calculations
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  BusinessAnalytics,
  QRCodeAnalytics,
  AnalyticsFilters,
  RealtimeMetrics,
  RatingDistribution,
  LanguageDistribution,
  DeviceDistribution,
  DailyTrend,
  CountryStat,
  CityStat,
  BrowserBreakdown,
  OSBreakdown,
  DailyScan,
  ANALYTICS_CONSTANTS,
  QRAnalyticsFilters,
} from './types';
import { NotFoundError, ValidationError } from '../../shared/exceptions';
import { getDaysInRange, getWeeksInRange, getMonthsInRange, startOfDay, endOfDay } from '../../shared/utils/date';

export class AnalyticsService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get business analytics overview
   */
  async getBusinessAnalytics(
    businessId: string,
    filters: AnalyticsFilters
  ): Promise<BusinessAnalytics> {
    // Verify business exists
    const { data: business } = await this.supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .single();

    if (!business) {
      throw new NotFoundError('Business');
    }

    const { start_date, end_date, group_by } = filters;

    // Get scan logs in date range
    const { data: scans } = await this.supabase
      .from('scan_logs')
      .select(`
        id,
        qr_code_id,
        business_id,
        country,
        city,
        device_type,
        browser,
        os,
        scanned_at
      `)
      .eq('business_id', businessId)
      .gte('scanned_at', start_date)
      .lte('scanned_at', end_date);

    // Get review sessions in date range
    const { data: sessions } = await this.supabase
      .from('review_sessions')
      .select(`
        id,
        qr_code_id,
        business_id,
        language,
        rating,
        status,
        metadata,
        started_at,
        completed_at,
        abandoned_at
      `)
      .eq('business_id', businessId)
      .gte('started_at', start_date)
      .lte('started_at', end_date);

    // Get generated reviews in date range
    const { data: reviews } = await this.supabase
      .from('generated_reviews')
      .select(`
        id,
        session_id,
        business_id,
        language,
        rating,
        edited_text,
        created_at
      `)
      .eq('business_id', businessId)
      .gte('created_at', start_date)
      .lte('created_at', end_date);

    // Calculate metrics
    const totalScans = scans?.length || 0;
    const totalSessionsStarted = sessions?.length || 0;
    const totalReviewsGenerated = reviews?.length || 0;
    const totalReviewsEdited = reviews?.filter(r => r.edited_text).length || sessions?.filter(s => s.status === 'review_edited').length || 0;
    const totalReviewsCopied = sessions?.filter(s => s.metadata?.copied_at || (Number(s.metadata?.copy_count) > 0)).length || 0;
    const totalGoogleRedirects = sessions?.filter(s => s.status === 'redirected' || s.metadata?.google_redirected_at).length || 0;
    const totalRatings = sessions?.filter(s => s.rating != null).length || 0;
    const totalTagsSelected = sessions?.filter(s => Array.isArray(s.metadata?.tags) && s.metadata.tags.length > 0).length || 0;

    // Private feedback metrics (1-3 stars)
    const totalFeedbackStarted = sessions?.filter(s => s.metadata?.feedback_started_at || (s.rating && s.rating <= 3)).length || 0;
    const totalFeedbackSubmitted = sessions?.filter(s => s.metadata?.feedback_submitted_at || s.status === 'private_feedback_submitted').length || 0;
    const totalFeedbackSkipped = sessions?.filter(s => s.metadata?.feedback_skipped_at).length || 0;

    // Conversion rate: redirects / sessions_started (not scans)
    // This tracks the funnel: scans -> sessions -> redirects
    const conversionRate = totalSessionsStarted > 0
      ? (totalGoogleRedirects / totalSessionsStarted) * 100
      : 0;

    // Abandonment rate: only count sessions that have ended (completed or abandoned)
    const endedSessions = sessions?.filter(s => s.status === 'completed' || s.status === 'abandoned' || s.completed_at || s.abandoned_at) || [];
    const abandonedSessions = endedSessions.filter(s => s.status === 'abandoned' || (s.abandoned_at && !s.completed_at));
    const abandonmentRate = endedSessions.length > 0
      ? (abandonedSessions.length / endedSessions.length) * 100
      : 0;

    // Average session duration - use completed_at for completed, abandoned_at for abandoned
    const finishedSessions = sessions?.filter(s => s.completed_at || s.abandoned_at) || [];
    const avgSessionDuration = finishedSessions.length > 0
      ? finishedSessions.reduce((sum, s) => {
          const start = new Date(s.started_at).getTime();
          const end = s.completed_at ? new Date(s.completed_at).getTime() : new Date(s.abandoned_at!).getTime();
          return sum + (end - start) / 1000;
        }, 0) / finishedSessions.length
      : 0;

    // Rating distribution - use generated_reviews.rating (actual submitted reviews)
    const ratingDistribution: RatingDistribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    reviews?.forEach(r => {
      if (r.rating) {
        ratingDistribution[r.rating as keyof RatingDistribution]++;
      }
    });

    // Language distribution
    const languageDistribution: LanguageDistribution = {};
    sessions?.forEach(s => {
      languageDistribution[s.language] = (languageDistribution[s.language] || 0) + 1;
    });

    // Device distribution
    const deviceDistribution: DeviceDistribution = { mobile: 0, tablet: 0, desktop: 0 };
    scans?.forEach(s => {
      if (s.device_type in deviceDistribution) {
        deviceDistribution[s.device_type as keyof DeviceDistribution]++;
      }
    });

    // Product funnel calculation
    const scanToSessionPct = totalScans > 0 ? Math.round((totalSessionsStarted / totalScans) * 100) : 0;
    const sessionToGenPct = totalSessionsStarted > 0 ? Math.round((totalReviewsGenerated / totalSessionsStarted) * 100) : 0;
    const genToCopyPct = totalReviewsGenerated > 0 ? Math.round((totalReviewsCopied / totalReviewsGenerated) * 100) : 0;
    const copyToGooglePct = totalReviewsCopied > 0 ? Math.round((totalGoogleRedirects / totalReviewsCopied) * 100) : 0;

    const productFunnel = {
      steps: [
        { name: 'QR Scan', count: totalScans },
        { name: 'Review Session Started', count: totalSessionsStarted },
        { name: 'Rating Selected', count: totalRatings },
        { name: 'Tags Selected', count: totalTagsSelected },
        { name: 'AI Review Generated', count: totalReviewsGenerated },
        { name: 'Review Edited', count: totalReviewsEdited },
        { name: 'Review Copied', count: totalReviewsCopied },
        { name: 'Google Review Page Opened', count: totalGoogleRedirects },
      ],
      conversion_rates: {
        scan_to_session_pct: scanToSessionPct,
        session_to_generation_pct: sessionToGenPct,
        generation_to_copy_pct: genToCopyPct,
        copy_to_google_pct: copyToGooglePct,
      },
      note: 'Product funnel metrics measure customer interaction within ReviewAI. Google Review Page Opened indicates the customer was redirected to Google and does NOT imply a review was published or received by Google.',
    };

    const feedbackMetrics = {
      started: totalFeedbackStarted,
      submitted: totalFeedbackSubmitted,
      skipped: totalFeedbackSkipped,
      note: 'Private feedback from customers rating 1-3 stars. Low-rating customers retain access to Google review page if they choose.',
    };

    // Daily trends
    const dailyTrends = this.calculateDailyTrends(
      scans || [],
      sessions || [],
      reviews || [],
      start_date,
      end_date,
      group_by || 'day'
    );

    return {
      business_id: businessId,
      period_start: start_date,
      period_end: end_date,
      total_scans: totalScans,
      total_sessions_started: totalSessionsStarted,
      total_reviews_generated: totalReviewsGenerated,
      total_reviews_edited: totalReviewsEdited,
      total_reviews_copied: totalReviewsCopied,
      total_google_redirects: totalGoogleRedirects,
      product_funnel: productFunnel,
      feedback_metrics: feedbackMetrics,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      abandonment_rate: Math.round(abandonmentRate * 100) / 100,
      avg_session_duration_seconds: Math.round(avgSessionDuration),
      rating_distribution: ratingDistribution,
      language_distribution: languageDistribution,
      device_distribution: deviceDistribution,
      daily_trends: dailyTrends,
    };
  }

  /**
   * Get QR code specific analytics
   */
  async getQRCodeAnalytics(
    qrCodeId: string,
    filters: QRAnalyticsFilters
  ): Promise<QRCodeAnalytics> {
    // Verify QR code exists
    const { data: qrCode } = await this.supabase
      .from('qr_codes')
      .select('id, business_id, label')
      .eq('id', qrCodeId)
      .single();

    if (!qrCode) {
      throw new NotFoundError('QR Code');
    }

    const { start_date, end_date, group_by } = filters;

    // Get scans for this QR code
    const { data: scans } = await this.supabase
      .from('scan_logs')
      .select(`
        id,
        qr_code_id,
        country,
        city,
        device_type,
        browser,
        os,
        scanned_at
      `)
      .eq('qr_code_id', qrCodeId)
      .gte('scanned_at', start_date)
      .lte('scanned_at', end_date);

    // Get sessions for this QR code
    const { data: sessions } = await this.supabase
      .from('review_sessions')
      .select(`
        id,
        qr_code_id,
        scan_log_id,
        language,
        rating,
        status,
        started_at,
        completed_at
      `)
      .eq('qr_code_id', qrCodeId)
      .gte('started_at', start_date)
      .lte('started_at', end_date);

    // Get reviews for this QR code
    const { data: reviews } = await this.supabase
      .from('generated_reviews')
      .select(`
        id,
        session_id,
        edited_text
      `)
      .in('session_id', sessions?.map(s => s.id) || [])
      .gte('created_at', start_date)
      .lte('created_at', end_date);

    const totalScans = scans?.length || 0;
    // Note: unique_visitors uses scan ID as fallback - should use visitor_hash when available
    const uniqueVisitors = new Set(scans?.map(s => s.id) || []).size;
    const sessionsStarted = sessions?.length || 0;
    const reviewsGenerated = reviews?.length || 0;
    const googleRedirects = sessions?.filter(s => s.status === 'redirected').length || 0;

    // Conversion rate: redirects / sessions_started (not scans)
    // This tracks the funnel: scans -> sessions -> redirects
    const conversionRate = sessionsStarted > 0 ? (googleRedirects / sessionsStarted) * 100 : 0;

    // Top countries - use sessions as denominator for conversion
    const countryMap = new Map<string, { sessions: number; redirects: number }>();
    sessions?.forEach(s => {
      const scan = scans?.find(sc => sc.id === s.scan_log_id);
      const country = scan?.country || 'unknown';
      const existing = countryMap.get(country) || { sessions: 0, redirects: 0 };
      existing.sessions++;
      if (s.status === 'redirected') {
        existing.redirects++;
      }
      countryMap.set(country, existing);
    });

    const topCountries: CountryStat[] = Array.from(countryMap.entries())
      .map(([country, data]) => ({
        country,
        country_code: country,
        scans: data.sessions, // Using sessions as "scans" equivalent
        conversion_rate: data.sessions > 0 ? Math.round((data.redirects / data.sessions) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.scans - a.scans)
      .slice(0, 10);

    // Top cities
    const cityMap = new Map<string, number>();
    scans?.forEach(s => {
      const key = `${s.city},${s.country}`;
      cityMap.set(key, (cityMap.get(key) || 0) + 1);
    });
    const topCities: CityStat[] = Array.from(cityMap.entries())
      .map(([key, scans]) => {
        const [city, country] = key.split(',');
        return { city, country, scans };
      })
      .sort((a, b) => b.scans - a.scans)
      .slice(0, 10);

    // Browser breakdown
    const browserBreakdown: BrowserBreakdown = {};
    scans?.forEach(s => {
      browserBreakdown[s.browser] = (browserBreakdown[s.browser] || 0) + 1;
    });

    // OS breakdown
    const osBreakdown: OSBreakdown = {};
    scans?.forEach(s => {
      osBreakdown[s.os] = (osBreakdown[s.os] || 0) + 1;
    });

    // Device breakdown
    const deviceBreakdown: DeviceDistribution = { mobile: 0, tablet: 0, desktop: 0 };
    scans?.forEach(s => {
      if (s.device_type in deviceBreakdown) {
        deviceBreakdown[s.device_type as keyof DeviceDistribution]++;
      }
    });

    // Daily scans
    const dailyScans = this.calculateDailyScans(scans || [], start_date, end_date, group_by || 'day');

    return {
      qr_code_id: qrCodeId,
      business_id: qrCode.business_id,
      label: qrCode.label,
      total_scans: totalScans,
      unique_visitors: uniqueVisitors,
      sessions_started: sessionsStarted,
      reviews_generated: reviewsGenerated,
      google_redirects: googleRedirects,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      top_countries: topCountries,
      top_cities: topCities,
      device_breakdown: deviceBreakdown,
      browser_breakdown: browserBreakdown,
      os_breakdown: osBreakdown,
      daily_scans: dailyScans,
    };
  }

  /**
   * Get realtime metrics for a business
   */
  async getRealtimeMetrics(businessId: string): Promise<RealtimeMetrics> {
    const now = new Date().toISOString();
    const windowStart = new Date(Date.now() - ANALYTICS_CONSTANTS.REALTIME_WINDOW_MINUTES * 60 * 1000).toISOString();

    const [scansResult, sessionsResult, reviewsResult, redirectsResult] = await Promise.all([
      this.supabase
        .from('scan_logs')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .gte('scanned_at', windowStart)
        .lte('scanned_at', now),
      this.supabase
        .from('review_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .gte('started_at', windowStart)
        .lte('started_at', now),
      this.supabase
        .from('generated_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .gte('created_at', windowStart)
        .lte('created_at', now),
      this.supabase
        .from('review_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('status', 'redirected')
        .gte('completed_at', windowStart)
        .lte('completed_at', now),
    ]);

    // Active sessions (started but not completed/abandoned in last hour)
    const { count: activeSessions } = await this.supabase
      .from('review_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .in('status', ['started', 'language_selected', 'rating_selected', 'review_generated', 'review_edited'])
      .gte('started_at', windowStart)
      .lte('started_at', now);

    return {
      active_sessions: activeSessions || 0,
      scans_last_hour: scansResult.count || 0,
      reviews_generated_last_hour: reviewsResult.count || 0,
      redirects_last_hour: redirectsResult.count || 0,
    };
  }

  /**
   * Calculate daily trends
   */
  private calculateDailyTrends(
    scans: any[],
    sessions: any[],
    reviews: any[],
    startDate: string,
    endDate: string,
    groupBy: 'day' | 'week' | 'month'
  ): DailyTrend[] {
    const trends: DailyTrend[] = [];

    let periods: string[];
    let getPeriodStart: (date: string) => string;
    let getPeriodEnd: (date: string) => string;

    switch (groupBy) {
      case 'day':
        periods = getDaysInRange(startDate, endDate);
        getPeriodStart = (d) => d;
        getPeriodEnd = (d) => new Date(new Date(d).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'week':
        periods = getWeeksInRange(startDate, endDate);
        getPeriodStart = (d) => d;
        getPeriodEnd = (d) => new Date(new Date(d).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'month':
        periods = getMonthsInRange(startDate, endDate);
        getPeriodStart = (d) => d;
        getPeriodEnd = (d) => {
          const dt = new Date(d);
          dt.setMonth(dt.getMonth() + 1);
          return dt.toISOString().split('T')[0];
        };
        break;
    }

    for (const period of periods) {
      const periodStart = getPeriodStart(period);
      const periodEnd = getPeriodEnd(period);

      const periodScans = scans.filter(s => {
        const t = s.scanned_at || s.created_at;
        return t && t >= periodStart && t < periodEnd;
      }).length;
      const periodSessions = sessions.filter(s => s.started_at >= periodStart && s.started_at < periodEnd).length;
      const periodReviews = reviews.filter(r => r.created_at >= periodStart && r.created_at < periodEnd).length;
      const periodRedirects = sessions.filter(
        s => s.status === 'redirected' && s.completed_at && s.completed_at >= periodStart && s.completed_at < periodEnd
      ).length;

      trends.push({
        date: period,
        scans: periodScans,
        sessions_started: periodSessions,
        reviews_generated: periodReviews,
        google_redirects: periodRedirects,
      });
    }

    return trends;
  }

  /**
   * Calculate daily scans for QR code
   */
  private calculateDailyScans(
    scans: any[],
    startDate: string,
    endDate: string,
    groupBy: 'day' | 'week' | 'month'
  ): DailyScan[] {
    const daily: DailyScan[] = [];

    let periods: string[];
    let getPeriodStart: (date: string) => string;
    let getPeriodEnd: (date: string) => string;

    switch (groupBy) {
      case 'day':
        periods = getDaysInRange(startDate, endDate);
        getPeriodStart = (d) => d;
        getPeriodEnd = (d) => new Date(new Date(d).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'week':
        periods = getWeeksInRange(startDate, endDate);
        getPeriodStart = (d) => d;
        getPeriodEnd = (d) => new Date(new Date(d).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'month':
        periods = getMonthsInRange(startDate, endDate);
        getPeriodStart = (d) => d;
        getPeriodEnd = (d) => {
          const dt = new Date(d);
          dt.setMonth(dt.getMonth() + 1);
          return dt.toISOString().split('T')[0];
        };
        break;
    }

    for (const period of periods) {
      const periodStart = getPeriodStart(period);
      const periodEnd = getPeriodEnd(period);

      const periodScans = scans.filter(s => {
        const t = s.scanned_at || s.created_at;
        return t && t >= periodStart && t < periodEnd;
      });
      // Note: unique_visitors uses scan ID as fallback - should use visitor_hash when available
      const uniqueVisitors = new Set(periodScans.map(s => s.id)).size;

      daily.push({
        date: period,
        scans: periodScans.length,
        unique_visitors: uniqueVisitors,
      });
    }

    return daily;
  }
}