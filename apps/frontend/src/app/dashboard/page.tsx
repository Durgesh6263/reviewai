'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  QrCode,
  FileText,
  Sparkles,
  ExternalLink,
  MessageSquare,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Heart,
  MessageCircle,
  RefreshCw,
  Building2,
  Star,
  Copy,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'react-hot-toast';
import { SessionsChart } from '@/components/ui/chart';
import { api } from '@/lib/api-client';
import { formatNumber, cn } from '@/lib/utils';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';

interface DashboardMetrics {
  total_scans: number;
  total_sessions: number;
  total_generated: number;
  total_google_opens: number;
  total_feedback: number;
  total_copied?: number;
}

interface ProductFunnelData {
  steps: Array<{ name: string; count: number }>;
  conversion_rates: {
    scan_to_session_pct: number;
    session_to_generation_pct: number;
    generation_to_copy_pct: number;
    copy_to_google_pct: number;
  };
  note: string;
}

interface FeedbackMetricsData {
  started: number;
  submitted: number;
  skipped: number;
  note: string;
}

interface SubscriptionStatus {
  plan: {
    name: string;
    slug: string;
    monthly_qr_scans: number;
    monthly_ai_generations: number;
  };
  qr_scans: {
    limit: number;
    used: number;
    remaining: number;
    percentage: number;
  };
  ai_generations: {
    limit: number;
    used: number;
    remaining: number;
    percentage: number;
  };
  is_active: boolean;
  current_period_end?: string;
}

interface DashboardChanges {
  scans_change: number;
  sessions_change: number;
  generated_change: number;
  google_opens_change: number;
  feedback_change: number;
}

interface ChartDataPoint {
  date: string;
  sessions: number;
}

interface FeedbackItem {
  id: string;
  rating: number;
  feedback_text: string;
  created_at: string;
}

interface ActivityItem {
  id: string;
  rating: number;
  language: string;
  status: string;
  tags: Array<{ id: string; label: string }>;
  created_at: string;
}

interface BusinessOption {
  id: string;
  name: string;
}

type Period = 'today' | '7d' | '30d' | '90d' | 'month' | 'all';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

const RATING_LABELS = {
  1: 'Very Poor',
  2: 'Poor',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

const STATUS_LABELS: Record<string, string> = {
  started: 'Started',
  input_collected: 'Input Collected',
  private_feedback_submitted: 'Private Feedback',
  pending: 'Pending',
  generated: 'Generated',
  edited: 'Edited',
  approved: 'Approved',
  redirected: 'Redirected',
  submitted: 'Submitted',
  generation_failed: 'Generation Failed',
  draft: 'Draft',
  completed: 'Completed',
};

const LANGUAGE_LABELS: Record<string, string> = {
  english: 'English',
  hindi: 'Hindi',
  hinglish: 'Hinglish',
  en: 'English',
  hi: 'Hindi',
};

export default function DashboardOverviewPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('all');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [changes, setChanges] = useState<DashboardChanges | null>(null);
  const [funnel, setFunnel] = useState<ProductFunnelData | null>(null);
  const [feedbackMetrics, setFeedbackMetrics] = useState<FeedbackMetricsData | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [recentFeedback, setRecentFeedback] = useState<FeedbackItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(true);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);

  // Load user businesses on mount
  useEffect(() => {
    api.get<any>('/businesses')
      .then((res: any) => {
        const list = res?.data?.businesses || res?.data || res?.businesses || [];
        if (Array.isArray(list)) {
          setBusinesses(list.map((b: any) => ({ id: b.id, name: b.name })));
        }
      })
      .catch((err: any) => {
        console.error('Failed to load businesses:', err);
      });
  }, []);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsChartLoading(true);
      setIsFeedbackLoading(true);
      setIsActivityLoading(true);

      const queryParams = new URLSearchParams();
      queryParams.set('period', period);
      if (selectedBusinessId !== 'all') {
        queryParams.set('business_id', selectedBusinessId);
      }
      const queryString = queryParams.toString();
      const subQueryString = selectedBusinessId !== 'all' ? `?business_id=${selectedBusinessId}` : '';

      const [metricsRes, chartRes, feedbackRes, activityRes, subRes] = await Promise.allSettled([
        api.get<{ data: { metrics: DashboardMetrics; changes: DashboardChanges; product_funnel?: ProductFunnelData; feedback_metrics?: FeedbackMetricsData } }>(
          `/analytics/overview?${queryString}`
        ),
        api.get<{ data: ChartDataPoint[] }>(
          `/analytics/sessions-chart?${queryString}`
        ),
        api.get<{ data: { feedback: FeedbackItem[] } }>(
          `/analytics/recent-feedback?limit=5${selectedBusinessId !== 'all' ? `&business_id=${selectedBusinessId}` : ''}`
        ),
        api.get<{ data: { activity: ActivityItem[] } }>(
          `/analytics/recent-activity?limit=10${selectedBusinessId !== 'all' ? `&business_id=${selectedBusinessId}` : ''}`
        ),
        api.get<{ data: SubscriptionStatus }>(
          `/subscription/status${subQueryString}`
        ),
      ]);

      if (metricsRes.status === 'fulfilled' && metricsRes.value?.data?.metrics) {
        setMetrics(metricsRes.value.data.metrics);
        setChanges(metricsRes.value.data.changes || {
          scans_change: 0,
          sessions_change: 0,
          generated_change: 0,
          google_opens_change: 0,
          feedback_change: 0,
        });
        if ((metricsRes.value.data as any)?.product_funnel) {
          setFunnel((metricsRes.value.data as any).product_funnel);
        }
        if ((metricsRes.value.data as any)?.feedback_metrics) {
          setFeedbackMetrics((metricsRes.value.data as any).feedback_metrics);
        }
      } else if (metricsRes.status === 'rejected') {
        console.error('Metrics fetch rejected:', metricsRes.reason);
        setError('Failed to load dashboard metrics. Please check your connection and retry.');
      }

      if (chartRes.status === 'fulfilled' && Array.isArray(chartRes.value?.data)) {
        setChartData(chartRes.value.data);
      } else {
        setChartData([]);
      }
      setIsChartLoading(false);

      if (feedbackRes.status === 'fulfilled' && Array.isArray(feedbackRes.value?.data?.feedback)) {
        setRecentFeedback(feedbackRes.value.data.feedback);
      } else {
        setRecentFeedback([]);
      }
      setIsFeedbackLoading(false);

      if (activityRes.status === 'fulfilled' && Array.isArray(activityRes.value?.data?.activity)) {
        setRecentActivity(activityRes.value.data.activity);
      } else {
        setRecentActivity([]);
      }
      setIsActivityLoading(false);

      if (subRes.status === 'fulfilled' && subRes.value?.data?.plan) {
        setSubscription(subRes.value.data);
      }
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setError('Unable to load dashboard data. Please try again.');
    } finally {
      setIsLoading(false);
      setIsChartLoading(false);
      setIsFeedbackLoading(false);
      setIsActivityLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    await fetchDashboardData();
    setIsManualRefreshing(false);
  };

  useEffect(() => {
    fetchDashboardData();
  }, [period, selectedBusinessId]);

  const statCards = [
    {
      name: 'QR Scans',
      value: metrics?.total_scans || 0,
      change: changes?.scans_change || 0,
      icon: QrCode,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      description: 'Total QR code scans',
    },
    {
      name: 'Review Sessions',
      value: metrics?.total_sessions || 0,
      change: changes?.sessions_change || 0,
      icon: FileText,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
      description: 'Sessions started by customers',
    },
    {
      name: 'AI Reviews Generated',
      value: metrics?.total_generated || 0,
      change: changes?.generated_change || 0,
      icon: Sparkles,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      description: 'AI reviews successfully generated',
    },
    {
      name: 'Google Review Page Opens',
      value: metrics?.total_google_opens || 0,
      change: changes?.google_opens_change || 0,
      icon: ExternalLink,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      description: 'Customers directed to Google',
    },
    {
      name: 'Private Feedback',
      value: metrics?.total_feedback || 0,
      change: changes?.feedback_change || 0,
      icon: MessageSquare,
      color: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      description: 'Feedback from 1-3 star ratings',
    },
  ];

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600 dark:text-green-400';
    if (change < 0) return 'text-red-600 dark:text-red-400';
    return 'text-secondary-500 dark:text-secondary-400';
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-3 w-3" />;
    if (change < 0) return <TrendingDown className="h-3 w-3" />;
    return null;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Dashboard</h1>
            <p className="text-secondary-600 dark:text-secondary-400">See how customers are using your ReviewAI QR.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod as (value: Period) => void}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Skeleton loading for KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4 mb-4" />
                <div className="h-8 bg-secondary-200 dark:bg-secondary-700 rounded w-1/2" />
                <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Skeleton for chart */}
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-5 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4" />
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-secondary-200 dark:bg-secondary-700 rounded-lg" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-error-500 mx-auto mb-4" />
        <p className="text-error-500 mb-4">{error}</p>
        <Button onClick={fetchDashboardData}>Retry</Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Dashboard</h1>
          <p className="text-secondary-600 dark:text-secondary-400">See how customers are using your ReviewAI QR.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {businesses.length > 0 && (
            <Select value={selectedBusinessId} onValueChange={setSelectedBusinessId}>
              <SelectTrigger className="w-[180px]">
                <Building2 className="h-4 w-4 mr-2 text-secondary-500 shrink-0" />
                <SelectValue placeholder="All Businesses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Businesses</SelectItem>
                {businesses.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={period} onValueChange={setPeriod as (value: Period) => void}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isLoading || isManualRefreshing}
            className="h-10 px-3"
            title="Refresh dashboard data"
          >
            <RefreshCw className={cn('h-4 w-4', (isLoading || isManualRefreshing) && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.name} className="hover:shadow-md transition-shadow duration-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400 truncate">{stat.name}</p>
                  <p className="text-secondary-500 dark:text-secondary-400 text-xs mt-0.5 truncate">{stat.description}</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold text-secondary-900 dark:text-white">
                      {formatNumber(stat.value)}
                    </span>
                    {stat.change !== 0 && (
                      <span className={cn('text-sm font-medium flex items-center gap-1', getChangeColor(stat.change))}>
                        {getChangeIcon(stat.change)}
                        {Math.abs(stat.change)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className={cn('p-3 rounded-xl', stat.bgColor)}>
                  <stat.icon className={cn('h-6 w-6', stat.color)} />
                </div>
              </div>
            </CardContent>
            </Card>
        ))}
      </div>

      {/* Product Funnel (Pilot Analytics) */}
      {funnel && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary-600" />
                  Product Funnel (Pilot Analytics)
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tracks actual customer progress through the ReviewAI QR experience.
                </p>
              </div>
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                Data Verified
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Funnel conversion percentages */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 font-medium">Scan → Session</span>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {funnel.conversion_rates.scan_to_session_pct}%
                </p>
                <span className="text-[10px] text-slate-400">Scanned QR & opened form</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 font-medium">Session → AI Review</span>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {funnel.conversion_rates.session_to_generation_pct}%
                </p>
                <span className="text-[10px] text-slate-400">Selected rating & generated</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 font-medium">AI Review → Copied</span>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {funnel.conversion_rates.generation_to_copy_pct}%
                </p>
                <span className="text-[10px] text-slate-400">Copied text to clipboard</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 font-medium">Copied → Google Open</span>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {funnel.conversion_rates.copy_to_google_pct}%
                </p>
                <span className="text-[10px] text-slate-400">Redirected to Google page</span>
              </div>
            </div>

            {/* Step breakdown */}
            <div className="p-3 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
                Funnel Steps Count:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600 dark:text-slate-400">
                {funnel.steps.map((st) => (
                  <div key={st.name} className="flex justify-between border-b border-slate-200/50 dark:border-slate-700/50 pb-1">
                    <span className="truncate pr-1">{st.name}:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{st.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Critical Disclaimer for Pilot Accuracy */}
            <div className="p-3 bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Pilot Accuracy Notice: </span>
                <span>
                  <strong>Google Review Page Opens ≠ Google Review Submissions.</strong> ReviewAI tracks when a customer clicks to open your Google Review URL. ReviewAI does not claim or guess whether a customer completed publishing on Google, as Google does not provide public external submission confirmation callbacks.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pilot Feedback CTA */}
      <Card className="border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-xl text-primary-600 dark:text-primary-400">
                <MessageCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-secondary-900 dark:text-white">Help Shape ReviewAI</h3>
                <p className="text-sm text-secondary-600 dark:text-secondary-400">You're part of our pilot program. Your feedback directly shapes the product.</p>
              </div>
            </div>
            <Button
              variant="default"
              onClick={() => setShowFeedbackForm(true)}
              className="flex items-center gap-2"
            >
              <Heart className="h-4 w-4" />
              Share Feedback
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subscription & Usage */}
      {subscription && (
        <Card className="border-primary-200 dark:border-primary-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-primary-600 dark:text-primary-400">★</span>
              Current Plan: {subscription.plan.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* QR Scans Usage */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">QR Scans</span>
                  <span className="text-sm text-secondary-500 dark:text-secondary-400">
                    {subscription.qr_scans.limit === -1 ? 'Unlimited' : `${subscription.qr_scans.used} / ${subscription.qr_scans.limit}`}
                  </span>
                </div>
                <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${subscription.qr_scans.percentage}%` }}
                  />
                </div>
                {subscription.qr_scans.limit !== -1 && subscription.qr_scans.percentage >= 80 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    {subscription.qr_scans.percentage >= 100 ? 'Limit reached' : 'Approaching limit'}
                  </p>
                )}
              </div>

              {/* AI Generations Usage */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">AI Generations</span>
                  <span className="text-sm text-secondary-500 dark:text-secondary-400">
                    {subscription.ai_generations.limit === -1 ? 'Unlimited' : `${subscription.ai_generations.used} / ${subscription.ai_generations.limit}`}
                  </span>
                </div>
                <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-all duration-300"
                    style={{ width: `${subscription.ai_generations.percentage}%` }}
                  />
                </div>
                {subscription.ai_generations.limit !== -1 && subscription.ai_generations.percentage >= 80 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    {subscription.ai_generations.percentage >= 100 ? 'Limit reached' : 'Approaching limit'}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-700 flex items-center justify-between">
              <span className="text-sm text-secondary-600 dark:text-secondary-400">
                Resets on{' '}
                {subscription.current_period_end
                  ? new Date(subscription.current_period_end).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Next billing cycle'}
              </span>
              <Link href="/dashboard/billing">
                <Button variant="outline" size="sm">Manage Plan</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart & Recent Feedback */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sessions Chart */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Review Sessions Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionsChart data={chartData} isLoading={isChartLoading} />
          </CardContent>
        </Card>

        {/* Recent Private Feedback */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Private Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            {isFeedbackLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/2" />
                    <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-full" />
                    <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : recentFeedback.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
                <p className="text-secondary-600 dark:text-secondary-400">No private feedback yet.</p>
                <p className="text-sm text-secondary-500 dark:text-secondary-500 mt-1">
                  Feedback from customers who rated 1-3 stars will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentFeedback.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedFeedback(item)}
                    className="p-4 bg-secondary-50 hover:bg-secondary-100/70 dark:bg-secondary-800/50 dark:hover:bg-secondary-800 rounded-xl border border-secondary-200 dark:border-secondary-700 hover:border-amber-500/50 dark:hover:border-amber-500/50 transition-all cursor-pointer group shadow-sm hover:shadow"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium">
                          <MessageSquare className="h-3 w-3" />
                          {RATING_LABELS[item.rating as keyof typeof RATING_LABELS] || `${item.rating} star`}
                        </span>
                        <div className="flex items-center text-amber-400 text-xs">
                          {Array.from({ length: item.rating || 3 }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-current" />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-secondary-500 dark:text-secondary-400">
                        <span>
                          {new Date(item.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-primary-500" />
                      </div>
                    </div>
                    <p className="text-secondary-800 dark:text-secondary-200 text-sm line-clamp-2 italic font-normal">
                      "{item.feedback_text}"
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-primary-600 dark:text-primary-400 font-medium group-hover:underline flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Click to view full feedback
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Customer Feedback Detail Dialog Modal */}
      <Dialog open={!!selectedFeedback} onOpenChange={(open) => !open && setSelectedFeedback(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-amber-500" />
              Customer Private Feedback
            </DialogTitle>
            <DialogDescription>
              Direct, private feedback submitted by a customer during their QR review experience.
            </DialogDescription>
          </DialogHeader>

          {selectedFeedback && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-secondary-100 dark:bg-secondary-800/80 border border-secondary-200 dark:border-secondary-700">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">
                    Customer Rating
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex text-amber-400">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${
                            s <= selectedFeedback.rating ? 'fill-amber-400 text-amber-400' : 'text-secondary-300 dark:text-secondary-600'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                      {RATING_LABELS[selectedFeedback.rating as keyof typeof RATING_LABELS] || `${selectedFeedback.rating} Stars`}
                    </span>
                  </div>
                </div>

                <div className="text-right space-y-0.5">
                  <div className="text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">
                    Submitted
                  </div>
                  <div className="text-xs text-secondary-700 dark:text-secondary-300 font-medium">
                    {new Date(selectedFeedback.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider block mb-2">
                  Customer Message
                </label>
                <div className="p-4 rounded-xl bg-secondary-50 dark:bg-secondary-900/90 border border-secondary-200 dark:border-secondary-800 text-secondary-900 dark:text-secondary-100 text-sm whitespace-pre-wrap leading-relaxed shadow-inner">
                  "{selectedFeedback.feedback_text}"
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-xs text-secondary-500">
                  Private to leadership &bull; Not posted to Google
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedFeedback.feedback_text);
                      toast.success('Feedback copied to clipboard!');
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </Button>
                  <Button size="sm" onClick={() => setSelectedFeedback(null)}>
                    Done
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Recent Review Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Review Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isActivityLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 p-3">
                  <div className="h-10 w-10 bg-secondary-200 dark:bg-secondary-700 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/3" />
                    <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
              <p className="text-secondary-600 dark:text-secondary-400">No review sessions yet.</p>
              <p className="text-sm text-secondary-500 dark:text-secondary-500 mt-1">
                When customers start a review session, it will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-colors"
                >
                  <div className={cn(
                    'p-2 rounded-lg',
                    item.rating >= 4 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                    item.rating === 3 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                    'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  )}>
                    <span className="font-bold text-lg">{item.rating}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-secondary-900 dark:text-white truncate">
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-secondary-100 dark:bg-secondary-800 rounded text-secondary-600 dark:text-secondary-400">
                        {LANGUAGE_LABELS[item.language] || item.language}
                      </span>
                      {item.tags.slice(0, 2).map((tag) => (
                        <span key={tag.id} className="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/30 rounded text-primary-600 dark:text-primary-400">
                          {tag.label}
                        </span>
                      ))}
                      {item.tags.length > 2 && (
                        <span className="px-2 py-0.5 text-xs bg-secondary-100 dark:bg-secondary-800 rounded text-secondary-600 dark:text-secondary-400">
                          +{item.tags.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-secondary-500 dark:text-secondary-400 whitespace-nowrap">
                    {new Date(item.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href="/dashboard/businesses/new"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-colors group"
            >
              <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg text-primary-600 dark:text-primary-400 group-hover:scale-110 transition-transform">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-secondary-900 dark:text-white">Add Business</p>
                <p className="text-sm text-secondary-500 dark:text-secondary-400">Register a new location</p>
              </div>
            </Link>
            <Link
              href="/dashboard/qr-codes/new"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-colors group"
            >
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-secondary-900 dark:text-white">Create QR Code</p>
                <p className="text-sm text-secondary-500 dark:text-secondary-400">Generate review collection codes</p>
              </div>
            </Link>
            <Link
              href="/dashboard/analytics"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-colors group"
            >
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-secondary-900 dark:text-white">View Full Analytics</p>
                <p className="text-sm text-secondary-500 dark:text-secondary-400">Detailed performance metrics</p>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>

    {showFeedbackForm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowFeedbackForm(false)}>
        <div className="w-full max-w-2xl" onClick={e => e.stopPropagation()}>
          <FeedbackForm
            businessId=""
            onClose={() => setShowFeedbackForm(false)}
            onSuccess={() => setShowFeedbackForm(false)}
          />
        </div>
      </div>
    )}
    </>
  );
}