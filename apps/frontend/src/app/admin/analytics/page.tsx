'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown, Users, Building2, QrCode, Star, Globe, Monitor, Smartphone, Download, Calendar, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api-client';
import { formatNumber, formatPercentage, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface SystemAnalytics {
  overview: {
    total_scans: number;
    total_reviews: number;
    conversion_rate: number;
    total_users: number;
    total_businesses: number;
    total_qr_codes: number;
    active_subscriptions: number;
    mrr: number;
  };
  trends: {
    date: string;
    scans: number;
    reviews: number;
    conversions: number;
    new_users: number;
    new_businesses: number;
  }[];
  rating_distribution: { rating: number; count: number }[];
  language_distribution: { language: string; count: number }[];
  device_distribution: { device: string; count: number }[];
  top_businesses: {
    id: string;
    name: string;
    slug: string;
    scans: number;
    reviews: number;
    conversion_rate: number;
  }[];
  top_qr_codes: {
    id: string;
    name: string;
    slug: string;
    business_name: string;
    scans: number;
    reviews: number;
    conversion_rate: number;
  }[];
}

interface TimeRange {
  value: string;
  label: string;
}

const timeRanges: TimeRange[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last year' },
];

export default function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<SystemAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'distribution' | 'leaderboards'>('overview');

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<{ data: SystemAnalytics }>(`/admin/analytics?range=${timeRange}`);
      setAnalytics(response.data);
    } catch (error: any) {
      console.error('Failed to load analytics', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const getChangeIndicator = (current: number, previous: number) => {
    if (previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return {
      value: Math.abs(change).toFixed(1),
      isPositive: change >= 0,
    };
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">System Analytics</h1>
            <p className="text-secondary-600 dark:text-secondary-400">System-wide performance metrics and insights</p>
          </div>
          <Select value={timeRange} onValueChange={(v: '7d' | '30d' | '90d' | '1y') => setTimeRange(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeRanges.map((range) => (
                <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <p className="text-error-500">Failed to load analytics</p>
        <Button onClick={fetchAnalytics} className="mt-4">Retry</Button>
      </div>
    );
  }

  const overviewStats = [
    {
      name: 'Total Scans',
      value: analytics.overview.total_scans,
      icon: QrCode,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      name: 'Reviews Generated',
      value: analytics.overview.total_reviews,
      icon: Star,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
    {
      name: 'Conversion Rate',
      value: analytics.overview.conversion_rate,
      isPercentage: true,
      icon: TrendingUp,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      name: 'MRR',
      value: analytics.overview.mrr,
      isCurrency: true,
      icon: DollarSign,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
  ];

  const metricStats = [
    {
      name: 'Total Users',
      value: analytics.overview.total_users,
      icon: Users,
      color: 'text-indigo-500',
    },
    {
      name: 'Total Businesses',
      value: analytics.overview.total_businesses,
      icon: Building2,
      color: 'text-teal-500',
    },
    {
      name: 'QR Codes',
      value: analytics.overview.total_qr_codes,
      icon: QrCode,
      color: 'text-pink-500',
    },
    {
      name: 'Active Subscriptions',
      value: analytics.overview.active_subscriptions,
      icon: CreditCard,
      color: 'text-orange-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">System Analytics</h1>
          <p className="text-secondary-600 dark:text-secondary-400">System-wide performance metrics and insights</p>
        </div>
        <Select value={timeRange} onValueChange={(v: '7d' | '30d' | '90d' | '1y') => setTimeRange(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timeRanges.map((range) => (
              <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'trends' | 'distribution' | 'leaderboards')} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="leaderboards">Leaderboards</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Main Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {overviewStats.map((stat) => (
              <Card key={stat.name} className="hover:shadow-md transition-shadow duration-200">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">{stat.name}</p>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-3xl font-bold text-secondary-900 dark:text-white">
                          {stat.isPercentage ? formatPercentage(stat.value) : stat.isCurrency ? formatCurrency(stat.value) : formatNumber(stat.value)}
                        </span>
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

          {/* Additional Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {metricStats.map((stat) => (
              <Card key={stat.name}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">{stat.name}</p>
                      <span className="text-2xl font-bold text-secondary-900 dark:text-white mt-1">
                        {formatNumber(stat.value)}
                      </span>
                    </div>
                    <div className={cn('p-3 rounded-xl bg-secondary-100 dark:bg-secondary-800', stat.color.replace('text-', 'bg-') + '/10')}>
                      <stat.icon className={cn('h-6 w-6', stat.color)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary-500" />
                Scans & Reviews Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80" id="trends-chart">
                {/* Chart placeholder - would integrate with Recharts or similar */}
                <div className="h-full flex items-center justify-center text-secondary-400">
                  <p>Chart visualization would be rendered here (Recharts/Chart.js)</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
                  <p className="text-secondary-500 dark:text-secondary-400">Avg. Daily Scans</p>
                  <p className="text-2xl font-bold text-secondary-900 dark:text-white">
                    {analytics.trends.length > 0
                      ? formatNumber(Math.round(analytics.trends.reduce((a, b) => a + b.scans, 0) / analytics.trends.length))
                      : '0'}
                  </p>
                </div>
                <div className="p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
                  <p className="text-secondary-500 dark:text-secondary-400">Avg. Daily Reviews</p>
                  <p className="text-2xl font-bold text-secondary-900 dark:text-white">
                    {analytics.trends.length > 0
                      ? formatNumber(Math.round(analytics.trends.reduce((a, b) => a + b.reviews, 0) / analytics.trends.length))
                      : '0'}
                  </p>
                </div>
                <div className="p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
                  <p className="text-secondary-500 dark:text-secondary-400">Avg. Conversion</p>
                  <p className="text-2xl font-bold text-secondary-900 dark:text-white">
                    {analytics.trends.length > 0
                      ? formatPercentage(analytics.trends.reduce((a, b) => a + b.conversions, 0) / analytics.trends.length)
                      : '0%'}
                  </p>
                </div>
                <div className="p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
                  <p className="text-secondary-500 dark:text-secondary-400">New Users</p>
                  <p className="text-2xl font-bold text-secondary-900 dark:text-white">
                    {formatNumber(analytics.trends.reduce((a, b) => a + b.new_users, 0))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary-500" />
                  New Users & Businesses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-secondary-400">
                  <p>User/Business growth chart</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary-500" />
                  Conversion Rate Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-secondary-400">
                  <p>Conversion rate chart</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Distribution Tab */}
        <TabsContent value="distribution" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Rating Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  Rating Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.rating_distribution.length === 0 ? (
                    <p className="text-secondary-500 text-center py-4">No rating data</p>
                  ) : (
                    analytics.rating_distribution.map((item) => {
                      const total = analytics.rating_distribution.reduce((a, b) => a + b.count, 0);
                      const percentage = total > 0 ? (item.count / total) * 100 : 0;
                      return (
                        <div key={item.rating} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{'★'.repeat(item.rating)}</span>
                            <span className="text-secondary-500">{formatNumber(item.count)} ({percentage.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-yellow-500 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Language Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-blue-500" />
                  Language Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.language_distribution.length === 0 ? (
                    <p className="text-secondary-500 text-center py-4">No language data</p>
                  ) : (
                    analytics.language_distribution.slice(0, 10).map((item) => {
                      const total = analytics.language_distribution.reduce((a, b) => a + b.count, 0);
                      const percentage = total > 0 ? (item.count / total) * 100 : 0;
                      return (
                        <div key={item.language} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium capitalize">{item.language}</span>
                            <span className="text-secondary-500">{formatNumber(item.count)} ({percentage.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Device Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-green-500" />
                  Device Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.device_distribution.length === 0 ? (
                    <p className="text-secondary-500 text-center py-4">No device data</p>
                  ) : (
                    analytics.device_distribution.map((item) => {
                      const total = analytics.device_distribution.reduce((a, b) => a + b.count, 0);
                      const percentage = total > 0 ? (item.count / total) * 100 : 0;
                      const IconComponent = item.device === 'mobile' ? Smartphone : item.device === 'desktop' ? Monitor : Globe;
                      return (
                        <div key={item.device} className="space-y-1">
                          <div className="flex justify-between text-sm items-center">
                            <span className="flex items-center gap-2 font-medium">
                              <IconComponent className="h-4 w-4 text-secondary-400" />
                              {item.device.charAt(0).toUpperCase() + item.device.slice(1)}
                            </span>
                            <span className="text-secondary-500">{formatNumber(item.count)} ({percentage.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Leaderboards Tab */}
        <TabsContent value="leaderboards" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Businesses */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary-500" />
                  Top Businesses by Scans
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase">Rank</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase">Business</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase">Scans</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase">Reviews</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase">Conv. Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {analytics.top_businesses.slice(0, 10).map((business, index) => (
                        <tr key={business.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                          <td className="px-4 py-3 text-sm font-medium text-secondary-900 dark:text-white">
                            #{index + 1}
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/admin/businesses/${business.id}`} className="font-medium text-secondary-900 dark:text-white hover:text-primary-600">
                              {business.name}
                            </Link>
                            <p className="text-xs text-secondary-400 font-mono">/r/{business.slug}</p>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-secondary-600 dark:text-secondary-400">
                            {formatNumber(business.scans)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-secondary-600 dark:text-secondary-400">
                            {formatNumber(business.reviews)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-secondary-900 dark:text-white">
                            {business.conversion_rate.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                      {analytics.top_businesses.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-secondary-500">No data available</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Top QR Codes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary-500" />
                  Top QR Codes by Scans
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase">Rank</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase">QR Code</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase hidden sm:table-cell">Business</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase">Scans</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase">Reviews</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase">Conv. Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {analytics.top_qr_codes.slice(0, 10).map((qr, index) => (
                        <tr key={qr.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                          <td className="px-4 py-3 text-sm font-medium text-secondary-900 dark:text-white">
                            #{index + 1}
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/admin/qr-codes/${qr.id}`} className="font-medium text-secondary-900 dark:text-white hover:text-primary-600">
                              {qr.name || 'Unnamed'}
                            </Link>
                            <p className="text-xs text-secondary-400 font-mono">/r/{qr.slug}</p>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-sm text-secondary-500 dark:text-secondary-400">
                            {qr.business_name}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-secondary-600 dark:text-secondary-400">
                            {formatNumber(qr.scans)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-secondary-600 dark:text-secondary-400">
                            {formatNumber(qr.reviews)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-secondary-900 dark:text-white">
                            {qr.conversion_rate.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                      {analytics.top_qr_codes.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-secondary-500">No data available</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import Link from 'next/link';
import { DollarSign, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';