'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart2,
  Calendar,
  QrCode,
  Users,
  Sparkles,
  Edit3,
  Copy,
  ExternalLink,
  MessageSquareWarning,
  Building2,
  Loader2,
  RefreshCw,
  TrendingUp,
  Search,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';

interface UsageSummary {
  total_scans: number;
  review_sessions: number;
  ai_drafts: number;
  edited_reviews: number;
  copy_events: number;
  google_continue_events: number;
  private_feedback: number;
  active_businesses: number;
  period: string;
}

interface DailyTimeSeries {
  date: string;
  scans: number;
  sessions: number;
  ai_drafts: number;
  google_continues: number;
}

interface BusinessUsageDetail {
  id: string;
  name: string;
  slug?: string;
  plan: string;
  status: string;
  monthly_qr_limit: number;
  qr_used: number;
  qr_remaining: number;
  qr_usage_percent: number;
  monthly_ai_limit: number;
  ai_used: number;
  ai_remaining: number;
  ai_usage_percent: number;
  last_activity: string;
}

interface UserUsageItem {
  user_id: string;
  user_name: string;
  email: string;
  business_count: number;
  plan: string;
  subscription_status: string;
  monthly_qr_limit: number;
  qr_used: number;
  qr_remaining: number;
  qr_usage_percent: number;
  monthly_ai_limit: number;
  ai_used: number;
  ai_remaining: number;
  ai_usage_percent: number;
  last_activity: string;
  businesses: BusinessUsageDetail[];
}

export default function AdminUsagePage() {
  const [range, setRange] = useState<string>('30d');
  const [customStart, setCustomStart] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [timeSeries, setTimeSeries] = useState<DailyTimeSeries[]>([]);
  const [users, setUsers] = useState<UserUsageItem[]>([]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set());

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchUsageData = async () => {
    try {
      setLoading(true);
      let queryUrl = `/admin/usage?range=${range}`;
      if (range === 'custom' && customStart) {
        queryUrl += `&start_date=${encodeURIComponent(customStart)}`;
      }
      if (debouncedSearch.trim()) {
        queryUrl += `&search=${encodeURIComponent(debouncedSearch.trim())}`;
      }
      if (planFilter !== 'all') {
        queryUrl += `&plan=${encodeURIComponent(planFilter)}`;
      }
      if (statusFilter !== 'all') {
        queryUrl += `&status=${encodeURIComponent(statusFilter)}`;
      }

      const res = await api.get<{
        data: {
          summary: UsageSummary;
          time_series: DailyTimeSeries[];
          users?: UserUsageItem[];
        };
      }>(queryUrl);

      if (res?.data) {
        setSummary(res.data.summary);
        setTimeSeries(res.data.time_series || []);
        setUsers(res.data.users || []);
      }
    } catch (e) {
      console.error('Failed to load platform usage:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageData();
  }, [range, debouncedSearch, planFilter, statusFilter]);

  const toggleUserExpand = (userId: string) => {
    setExpandedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const maxScans = Math.max(...timeSeries.map((d) => d.scans), 1);


  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10 text-xs">
              Platform Analytics
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart2 className="h-8 w-8 text-indigo-400" />
            Feature Usage Analytics
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Platform-wide activity tracking across QR scans, review flows, AI generations, and conversion events.
          </p>
        </div>

        {/* Time filters */}
        <div className="flex flex-wrap items-center gap-2">
          {['today', '7d', '30d', '90d'].map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? 'default' : 'outline'}
              onClick={() => setRange(r)}
              className={
                range === r
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
              }
            >
              {r === 'today' ? 'Today' : r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={fetchUsageData}
            disabled={loading}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading && !summary ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          {/* 8 Feature Usage Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total QR Scans */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Total QR Scans</CardTitle>
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <QrCode className="h-4 w-4 text-blue-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.total_scans || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Physical QR engagement</p>
              </CardContent>
            </Card>

            {/* Review Sessions */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Review Sessions</CardTitle>
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Users className="h-4 w-4 text-purple-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.review_sessions || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Flow initiated by visitors</p>
              </CardContent>
            </Card>

            {/* AI Generations */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">AI Drafts Generated</CardTitle>
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.ai_drafts || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Authentic drafts composed</p>
              </CardContent>
            </Card>

            {/* Edited Reviews */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Edited Reviews</CardTitle>
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Edit3 className="h-4 w-4 text-emerald-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.edited_reviews || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Drafts modified by customer</p>
              </CardContent>
            </Card>

            {/* Copy Events */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Review Copy Events</CardTitle>
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                  <Copy className="h-4 w-4 text-indigo-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.copy_events || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Copied to clipboard</p>
              </CardContent>
            </Card>

            {/* Google Continue Events */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Google Continue Clicks</CardTitle>
                <div className="p-2 bg-rose-500/10 rounded-lg">
                  <ExternalLink className="h-4 w-4 text-rose-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.google_continue_events || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Direct to Google Review URL</p>
              </CardContent>
            </Card>

            {/* Private Feedback */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Private Feedback</CardTitle>
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <MessageSquareWarning className="h-4 w-4 text-orange-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.private_feedback || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Prevented public negative reviews</p>
              </CardContent>
            </Card>

            {/* Active Businesses */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Active Businesses</CardTitle>
                <div className="p-2 bg-teal-500/10 rounded-lg">
                  <Building2 className="h-4 w-4 text-teal-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.active_businesses || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Businesses with activity in period</p>
              </CardContent>
            </Card>
          </div>

          {/* Activity Over Time Chart */}
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center justify-between">
                <span>Daily Activity Breakdown</span>
                <span className="text-xs font-normal text-slate-400">Scans vs Sessions vs AI vs Google</span>
              </CardTitle>
              <CardDescription className="text-slate-400">
                Daily volume of customer touchpoints across the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timeSeries.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  No recorded usage events within this selected time window.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {timeSeries.slice(-9).map((d) => (
                      <div key={d.date} className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg space-y-2">
                        <div className="flex justify-between items-center text-xs font-medium text-slate-400">
                          <span>{d.date}</span>
                          <span className="text-indigo-400 font-semibold">{d.scans} scans</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, (d.scans / maxScans) * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                          <span>Sessions: {d.sessions}</span>
                          <span>AI: {d.ai_drafts}</span>
                          <span>Google: {d.google_continues}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* User-Wise Usage Section */}
          <div className="space-y-4 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-400" />
                  User-Wise Usage & Quota
                </h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  Current month QR & AI limits, consumption, and balance per user account.
                </p>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search name, email, business..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-9 text-xs bg-slate-900/80 border-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                  />
                </div>

                <Select value={planFilter} onValueChange={setPlanFilter}>
                  <SelectTrigger className="w-[125px] h-9 text-xs bg-slate-900/80 border-slate-800 text-slate-300">
                    <SelectValue placeholder="Plan" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-200 text-xs">
                    <SelectItem value="all">All Plans</SelectItem>
                    <SelectItem value="base">Base</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                    <SelectItem value="free">Free Trial</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[125px] h-9 text-xs bg-slate-900/80 border-slate-800 text-slate-300">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-200 text-xs">
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* User-Wise Usage Table Card */}
            <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3.5">User</th>
                      <th className="px-4 py-3.5">Businesses</th>
                      <th className="px-4 py-3.5">Plan</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 min-w-[190px]">Monthly QR Usage</th>
                      <th className="px-4 py-3.5 min-w-[190px]">Monthly AI Usage</th>
                      <th className="px-4 py-3.5">Last Activity</th>
                      <th className="px-4 py-3.5 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-normal">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                          {searchQuery || planFilter !== 'all' || statusFilter !== 'all'
                            ? 'No users match your filter criteria.'
                            : 'No client users registered yet.'}
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => {
                        const isExpanded = expandedUserIds.has(u.user_id);
                        const qrLimitLabel = u.monthly_qr_limit === -1 ? 'Unlimited' : `${u.monthly_qr_limit}/month`;
                        const qrRemLabel = u.monthly_qr_limit === -1 ? 'Unlimited' : `${u.qr_remaining} remaining`;
                        const aiLimitLabel = u.monthly_ai_limit === -1 ? 'Unlimited' : `${u.monthly_ai_limit}/month`;
                        const aiRemLabel = u.monthly_ai_limit === -1 ? 'Unlimited' : `${u.ai_remaining} remaining`;

                        return (
                          <React.Fragment key={u.user_id}>
                            <tr className="hover:bg-slate-800/40 transition-colors">
                              {/* User Name & Email */}
                              <td className="px-4 py-3.5">
                                <div className="font-medium text-white">{u.user_name}</div>
                                <div className="text-slate-400 text-[11px]">{u.email}</div>
                              </td>

                              {/* Business Count */}
                              <td className="px-4 py-3.5">
                                <Badge variant="outline" className="border-slate-700 bg-slate-800/50 text-slate-300 text-[11px]">
                                  {u.business_count} {u.business_count === 1 ? 'business' : 'businesses'}
                                </Badge>
                              </td>

                              {/* Plan */}
                              <td className="px-4 py-3.5">
                                <Badge
                                  variant="outline"
                                  className={
                                    u.plan.toLowerCase().includes('pro')
                                      ? 'border-purple-500/30 text-purple-300 bg-purple-500/10'
                                      : u.plan.toLowerCase().includes('unlimited')
                                      ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                                      : u.plan.toLowerCase().includes('base')
                                      ? 'border-blue-500/30 text-blue-300 bg-blue-500/10'
                                      : 'border-slate-700 text-slate-300 bg-slate-800/40'
                                  }
                                >
                                  {u.plan}
                                </Badge>
                              </td>

                              {/* Subscription Status */}
                              <td className="px-4 py-3.5">
                                <Badge
                                  className={
                                    u.subscription_status === 'active'
                                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                      : u.subscription_status === 'trialing'
                                      ? 'bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
                                      : u.subscription_status === 'expired'
                                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                                      : 'bg-slate-700/30 text-slate-400 border-slate-700 hover:bg-slate-700/40'
                                  }
                                >
                                  {u.subscription_status.charAt(0).toUpperCase() + u.subscription_status.slice(1)}
                                </Badge>
                              </td>

                              {/* Monthly QR Limit / Used / Remaining / Usage % */}
                              <td className="px-4 py-3.5">
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="font-semibold text-white">{u.qr_used} used</span>
                                    <span className="text-slate-400 font-mono text-[11px]">{qrLimitLabel}</span>
                                  </div>
                                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-1.5 rounded-full transition-all duration-300 ${
                                        u.qr_usage_percent >= 90
                                          ? 'bg-rose-500'
                                          : u.qr_usage_percent >= 75
                                          ? 'bg-amber-500'
                                          : 'bg-indigo-500'
                                      }`}
                                      style={{ width: `${Math.min(100, u.qr_usage_percent)}%` }}
                                    />
                                  </div>
                                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                                    <span>{qrRemLabel}</span>
                                    <span className="font-medium text-indigo-300">{u.qr_usage_percent}%</span>
                                  </div>
                                </div>
                              </td>

                              {/* Monthly AI Limit / Used / Remaining / Usage % */}
                              <td className="px-4 py-3.5">
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="font-semibold text-white">{u.ai_used} used</span>
                                    <span className="text-slate-400 font-mono text-[11px]">{aiLimitLabel}</span>
                                  </div>
                                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-1.5 rounded-full transition-all duration-300 ${
                                        u.ai_usage_percent >= 90
                                          ? 'bg-rose-500'
                                          : u.ai_usage_percent >= 75
                                          ? 'bg-amber-500'
                                          : 'bg-amber-400'
                                      }`}
                                      style={{ width: `${Math.min(100, u.ai_usage_percent)}%` }}
                                    />
                                  </div>
                                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                                    <span>{aiRemLabel}</span>
                                    <span className="font-medium text-amber-300">{u.ai_usage_percent}%</span>
                                  </div>
                                </div>
                              </td>

                              {/* Last Activity */}
                              <td className="px-4 py-3.5 text-slate-400 text-[11px] whitespace-nowrap">
                                {u.last_activity ? new Date(u.last_activity).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}
                              </td>

                              {/* Details Toggle Button */}
                              <td className="px-4 py-3.5 text-right">
                                {u.businesses && u.businesses.length > 0 ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => toggleUserExpand(u.user_id)}
                                    className="h-7 px-2 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                                  >
                                    {isExpanded ? (
                                      <>
                                        Hide <ChevronUp className="h-3.5 w-3.5 ml-1" />
                                      </>
                                    ) : (
                                      <>
                                        View ({u.businesses.length}) <ChevronDown className="h-3.5 w-3.5 ml-1" />
                                      </>
                                    )}
                                  </Button>
                                ) : (
                                  <span className="text-slate-600 text-[11px]">No businesses</span>
                                )}
                              </td>
                            </tr>

                            {/* Expanded Row: Business Details */}
                            {isExpanded && u.businesses && u.businesses.length > 0 && (
                              <tr className="bg-slate-950/40">
                                <td colSpan={8} className="px-4 py-3 border-y border-slate-800/80">
                                  <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-3">
                                    <div className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                                      <Building2 className="h-4 w-4 text-indigo-400" />
                                      Businesses owned by {u.user_name} ({u.businesses.length})
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {u.businesses.map((b) => (
                                        <div
                                          key={b.id}
                                          className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-md space-y-2 text-xs"
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-semibold text-white truncate max-w-[150px]">{b.name}</span>
                                            <Badge
                                              variant="outline"
                                              className={
                                                b.status === 'active'
                                                  ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]'
                                                  : b.status === 'trialing'
                                                  ? 'border-blue-500/30 text-blue-400 bg-blue-500/10 text-[10px]'
                                                  : 'border-rose-500/30 text-rose-400 bg-rose-500/10 text-[10px]'
                                              }
                                            >
                                              {b.status}
                                            </Badge>
                                          </div>
                                          <div className="text-[11px] text-slate-400">Plan: <span className="text-slate-200">{b.plan}</span></div>
                                          
                                          {/* QR breakdown */}
                                          <div className="space-y-1 pt-1 border-t border-slate-800/60">
                                            <div className="flex justify-between text-[11px]">
                                              <span className="text-slate-400">QR:</span>
                                              <span className="font-medium text-slate-200">
                                                {b.qr_used} / {b.monthly_qr_limit === -1 ? '∞' : b.monthly_qr_limit} ({b.qr_usage_percent}%)
                                              </span>
                                            </div>
                                            <div className="text-[10px] text-slate-500">
                                              Remaining: {b.monthly_qr_limit === -1 ? 'Unlimited' : b.qr_remaining}
                                            </div>
                                          </div>

                                          {/* AI breakdown */}
                                          <div className="space-y-1 pt-1 border-t border-slate-800/60">
                                            <div className="flex justify-between text-[11px]">
                                              <span className="text-slate-400">AI:</span>
                                              <span className="font-medium text-slate-200">
                                                {b.ai_used} / {b.monthly_ai_limit === -1 ? '∞' : b.monthly_ai_limit} ({b.ai_usage_percent}%)
                                              </span>
                                            </div>
                                            <div className="text-[10px] text-slate-500">
                                              Remaining: {b.monthly_ai_limit === -1 ? 'Unlimited' : b.ai_remaining}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
