'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown, Download, Calendar, Filter, BarChart3, QrCode, Star, Users, Globe, Monitor, Building2, ExternalLink, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { formatNumber, formatPercentage, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface AnalyticsData {
  overview: {
    total_scans: number;
    total_reviews: number;
    total_sessions?: number;
    total_copied?: number;
    total_google_opens?: number;
    conversion_rate: number;
    avg_rating: number;
    scans_change: number;
    reviews_change: number;
    conversion_change: number;
    rating_change: number;
  };
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
  trends: Array<{
    date: string;
    scans: number;
    reviews: number;
    conversion_rate: number;
  }>;
  top_qr_codes: Array<{
    id: string;
    name: string;
    scans: number;
    reviews: number;
    conversion_rate: number;
  }>;
  rating_distribution: Record<number, number>;
  language_distribution: Record<string, number>;
  device_distribution: Record<string, number>;
}

interface BusinessOption {
  id: string;
  name: string;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [businessId, setBusinessId] = useState<string>('all');
  const [qrCodeId, setQrCodeId] = useState<string>('');

  useEffect(() => {
    api.get<any>('/businesses')
      .then((res: any) => {
        const list = res?.data?.businesses || res?.data || res?.businesses || [];
        if (Array.isArray(list)) {
          setBusinesses(list.map((b: any) => ({ id: b.id, name: b.name })));
        }
      })
      .catch((err: any) => {
        console.error('Failed to load businesses in analytics:', err);
      });
  }, []);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams({
          range: dateRange,
        });
        if (businessId && businessId !== 'all') params.append('business_id', businessId);
        if (qrCodeId) params.append('qr_code_id', qrCodeId);

        const response = await api.get<{ data: AnalyticsData }>(`/analytics?${params.toString()}`);
        setData(response.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load analytics');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [dateRange, businessId, qrCodeId]);

  const statCards = [
    {
      name: 'Total Scans',
      value: data?.overview.total_scans || 0,
      change: data?.overview.scans_change || 0,
      icon: QrCode,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      description: 'Total QR code scans',
    },
    {
      name: 'AI Reviews Generated',
      value: data?.overview.total_reviews || 0,
      change: data?.overview.reviews_change || 0,
      icon: Sparkles,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      description: 'AI reviews successfully generated',
    },
    {
      name: 'Product Conversion',
      value: data?.overview.conversion_rate || 0,
      isPercentage: true,
      change: data?.overview.conversion_change || 0,
      icon: TrendingUp,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
      description: 'Scans resulting in generated reviews',
    },
    {
      name: 'Google Page Opens',
      value: data?.overview.total_google_opens || 0,
      change: 0,
      icon: ExternalLink,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      description: 'Redirected to Google page',
    },
    {
      name: 'Average Rating',
      value: data?.overview.avg_rating || 0,
      isRating: true,
      change: data?.overview.rating_change || 0,
      icon: Star,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      description: 'Customer rating average',
    },
  ];

  const renderChart = () => {
    if (!data?.trends) return null;

    // Simple ASCII-style chart for now - in production use a charting library like Recharts
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm text-secondary-500">
          <span>Scans</span>
          <span>Reviews</span>
          <span>Conversion</span>
        </div>
        <div className="h-64 flex items-end justify-between gap-1">
          {data.trends.slice(-30).map((day, index) => (
            <div key={day.date} className="flex-1 flex flex-col items-center justify-end gap-1" style={{ height: '100%' }}>
              <div
                className="w-full bg-blue-500 rounded-t transition-all hover:opacity-80"
                style={{ height: `${Math.max(2, (day.scans / (Math.max(...data.trends.map(d => d.scans)) || 1)) * 100)}%` }}
                title={`${formatDate(day.date)}: ${day.scans} scans`}
              />
              <div
                className="w-full bg-yellow-500 rounded-t transition-all hover:opacity-80"
                style={{ height: `${Math.max(2, (day.reviews / (Math.max(...data.trends.map(d => d.reviews)) || 1)) * 100)}%` }}
                title={`${formatDate(day.date)}: ${day.reviews} reviews`}
              />
              <span className="text-xs text-secondary-500 rotate-45 origin-bottom whitespace-nowrap">
                {formatDate(day.date)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-blue-500 rounded" />
            Scans
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-yellow-500 rounded" />
            Reviews
          </div>
        </div>
      </div>
    );
  };

  const renderRatingDistribution = () => {
    if (!data?.rating_distribution) return null;

    const total = Object.values(data.rating_distribution).reduce((a, b) => a + b, 0);
    if (total === 0) return <p className="text-center text-secondary-500 py-8">No rating data available</p>;

    return (
      <div className="space-y-3">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count = data.rating_distribution[rating] || 0;
          const percentage = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={rating} className="flex items-center gap-3">
              <span className="w-8 text-right font-medium text-secondary-900 dark:text-white">
                {rating}★
              </span>
              <div className="flex-1 h-6 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500 rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="w-20 text-right text-sm text-secondary-600 dark:text-secondary-400">
                {count} ({percentage.toFixed(1)}%)
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderLanguageDistribution = () => {
    if (!data?.language_distribution) return null;

    const entries = Object.entries(data.language_distribution);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    if (total === 0) return <p className="text-center text-secondary-500 py-8">No language data available</p>;

    return (
      <div className="space-y-3">
        {entries
          .sort(([, a], [, b]) => b - a)
          .slice(0, 8)
          .map(([lang, count]) => {
            const percentage = (count / total) * 100;
            return (
              <div key={lang} className="flex items-center gap-3">
                <span className="w-20 font-medium text-secondary-900 dark:text-white capitalize">{lang}</span>
                <div className="flex-1 h-6 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="w-20 text-right text-sm text-secondary-600 dark:text-secondary-400">
                  {count} ({percentage.toFixed(1)}%)
                </span>
              </div>
            );
          })}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Analytics</h1>
            <p className="text-secondary-600 dark:text-secondary-400">Track your review collection performance</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4 mb-4" />
                <div className="h-8 bg-secondary-200 dark:bg-secondary-700 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-error-500">{error}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Analytics</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Track your review collection performance</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {businesses.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={businessId} onValueChange={setBusinessId}>
                <SelectTrigger className="w-48">
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
            </div>
          )}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-secondary-400" />
            <Select value={dateRange} onValueChange={(v: '7d' | '30d' | '90d' | '1y') => setDateRange(v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.name} className="hover:shadow-md transition-shadow duration-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400 truncate">{stat.name}</p>
                  <p className="text-secondary-500 dark:text-secondary-400 text-xs mt-0.5 truncate">{stat.description}</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl sm:text-3xl font-bold text-secondary-900 dark:text-white">
                      {stat.isPercentage ? formatPercentage(stat.value) : stat.isRating ? stat.value.toFixed(1) : formatNumber(stat.value)}
                    </span>
                    {stat.change !== 0 && (
                      <span className={cn(
                        'text-xs font-medium flex items-center gap-0.5',
                        stat.change > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}>
                        {stat.change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {Math.abs(stat.change)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className={cn('p-2.5 rounded-xl shrink-0', stat.bgColor)}>
                  <stat.icon className={cn('h-5 w-5', stat.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Product Funnel (Pilot Analytics) */}
      {data?.product_funnel && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary-600" />
                  Product Funnel (Pilot Analytics)
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lightweight conversion metrics across the verified customer review flow.
                </p>
              </div>
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                Data Accuracy Verified
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 font-medium">Scan → Session</span>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {data.product_funnel.conversion_rates.scan_to_session_pct}%
                </p>
                <span className="text-[10px] text-slate-400">Scanned QR & opened form</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 font-medium">Session → AI Review</span>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {data.product_funnel.conversion_rates.session_to_generation_pct}%
                </p>
                <span className="text-[10px] text-slate-400">Selected rating & generated</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 font-medium">AI Review → Copied</span>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {data.product_funnel.conversion_rates.generation_to_copy_pct}%
                </p>
                <span className="text-[10px] text-slate-400">Copied text to clipboard</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 font-medium">Copied → Google Open</span>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                  {data.product_funnel.conversion_rates.copy_to_google_pct}%
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
                {data.product_funnel.steps.map((st) => (
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trends Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary-500" />
              Performance Trends
            </CardTitle>
            <CardDescription>Daily scans, reviews, and conversion over time</CardDescription>
          </CardHeader>
          <CardContent>
            {renderChart()}
          </CardContent>
        </Card>

        {/* Rating Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              Rating Distribution
            </CardTitle>
            <CardDescription>Breakdown of star ratings received</CardDescription>
          </CardHeader>
          <CardContent>
            {renderRatingDistribution()}
          </CardContent>
        </Card>

        {/* Top QR Codes */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary-500" />
              Top Performing QR Codes
            </CardTitle>
            <CardDescription>QR codes generating the most reviews</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.top_qr_codes.length === 0 ? (
              <p className="text-center text-secondary-500 py-8">No QR code data available</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">QR Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Scans</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Reviews</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Conversion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data?.top_qr_codes.map((qr, index) => (
                      <tr key={qr.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="text-secondary-400 font-mono text-lg">#{index + 1}</span>
                            <span className="font-medium text-secondary-900 dark:text-white">{qr.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">{formatNumber(qr.scans)}</td>
                        <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">{formatNumber(qr.reviews)}</td>
                        <td className="px-4 py-3 font-medium text-secondary-900 dark:text-white">{qr.conversion_rate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Language & Device Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary-500" />
              Language Distribution
            </CardTitle>
            <CardDescription>Languages used for review generation</CardDescription>
          </CardHeader>
          <CardContent>
            {renderLanguageDistribution()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary-500" />
              Device Distribution
            </CardTitle>
            <CardDescription>Devices used to scan QR codes</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.device_distribution ? (
              <div className="space-y-3">
                {Object.entries(data.device_distribution)
                  .sort(([, a], [, b]) => b - a)
                  .map(([device, count]) => {
                    const total = Object.values(data.device_distribution).reduce((a, b) => a + b, 0);
                    const percentage = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={device} className="flex items-center gap-3">
                        <span className="w-24 font-medium text-secondary-900 dark:text-white capitalize">{device}</span>
                        <div className="flex-1 h-6 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="w-20 text-right text-sm text-secondary-600 dark:text-secondary-400">
                          {count} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-center text-secondary-500 py-8">No device data available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}