/**
 * Analytics Module Types
 * ReviewAI SaaS Platform
 */

export interface BusinessAnalytics {
  business_id: string;
  period_start: string;
  period_end: string;
  total_scans: number;
  total_sessions_started: number;
  total_reviews_generated: number;
  total_reviews_edited: number;
  total_google_redirects: number;
  total_reviews_copied?: number;
  product_funnel?: {
    steps: Array<{ name: string; count: number }>;
    conversion_rates: {
      scan_to_session_pct: number;
      session_to_generation_pct: number;
      generation_to_copy_pct: number;
      copy_to_google_pct: number;
    };
    note: string;
  };
  feedback_metrics?: {
    started: number;
    submitted: number;
    skipped: number;
    note: string;
  };
  conversion_rate: number;
  abandonment_rate: number;
  avg_session_duration_seconds: number;
  rating_distribution: RatingDistribution;
  language_distribution: LanguageDistribution;
  device_distribution: DeviceDistribution;
  daily_trends: DailyTrend[];
}

export interface RatingDistribution {
  '1': number;
  '2': number;
  '3': number;
  '4': number;
  '5': number;
}

export interface LanguageDistribution {
  [languageCode: string]: number;
}

export interface DeviceDistribution {
  mobile: number;
  tablet: number;
  desktop: number;
}

export interface DailyTrend {
  date: string;
  scans: number;
  sessions_started: number;
  reviews_generated: number;
  google_redirects: number;
}

export interface QRCodeAnalytics {
  qr_code_id: string;
  business_id: string;
  label: string;
  total_scans: number;
  unique_visitors: number;
  sessions_started: number;
  reviews_generated: number;
  google_redirects: number;
  conversion_rate: number;
  top_countries: CountryStat[];
  top_cities: CityStat[];
  device_breakdown: DeviceDistribution;
  browser_breakdown: BrowserBreakdown;
  os_breakdown: OSBreakdown;
  daily_scans: DailyScan[];
}

export interface CountryStat {
  country: string;
  country_code: string;
  scans: number;
  conversion_rate: number;
}

export interface CityStat {
  city: string;
  country: string;
  scans: number;
}

export interface BrowserBreakdown {
  [browser: string]: number;
}

export interface OSBreakdown {
  [os: string]: number;
}

export interface DailyScan {
  date: string;
  scans: number;
  unique_visitors: number;
}

export interface AnalyticsFilters {
  business_id?: string;
  qr_code_id?: string;
  start_date: string;
  end_date: string;
  group_by?: 'day' | 'week' | 'month';
}

export interface QRAnalyticsFilters {
  start_date: string;
  end_date: string;
  group_by?: 'day' | 'week' | 'month';
}

export interface RealtimeMetrics {
  active_sessions: number;
  scans_last_hour: number;
  reviews_generated_last_hour: number;
  redirects_last_hour: number;
}

export const ANALYTICS_CONSTANTS = {
  DEFAULT_PERIOD_DAYS: 30,
  MAX_PERIOD_DAYS: 365,
  REALTIME_WINDOW_MINUTES: 60,
  CACHE_TTL_SECONDS: 300,
} as const;