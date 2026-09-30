'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  CheckCircle2,
  UserPlus,
  CreditCard,
  QrCode,
  MessageSquare,
  Sparkles,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Activity,
  AlertCircle,
  ShieldCheck,
  BarChart3,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface AdminStats {
  total_users: number;
  total_businesses: number;
  active_businesses?: number;
  new_businesses?: number;
  total_qr_codes: number;
  total_scans: number;
  total_reviews: number;
  total_review_sessions?: number;
  total_ai_drafts?: number;
  google_continue_events?: number;
  total_revenue: number;
  active_subscriptions: number;
  conversion_rate: number;
  active_users?: number;
  inactive_users?: number;
  deactivated_users?: number;
  new_users?: number;
  users_change: number;
  businesses_change: number;
  scans_change: number;
  sessions_change?: number;
  ai_drafts_change?: number;
  google_continues_change?: number;
  revenue_change: number;
}

interface RecentActivity {
  id: string;
  type: string;
  user_name: string;
  user_email: string;
  details: string;
  created_at: string;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async (refresh = false) => {
    try {
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      const [statsRes, activityRes] = await Promise.all([
        api.get<{ data: AdminStats }>('/admin/stats'),
        api.get<{ data: RecentActivity[] }>('/admin/recent-activity?limit=8'),
      ]);

      setStats(statsRes.data);
      setRecentActivity(activityRes.data || []);
    } catch (err: any) {
      console.error('Failed to load admin stats:', err);
      setError(err.response?.data?.message || 'Failed to load platform control metrics.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Format trend badge
  const renderTrend = (change?: number) => {
    if (change === undefined || isNaN(change)) {
      return <span className="text-[11px] text-slate-500">Period comparison unavailable</span>;
    }
    if (change === 0) {
      return <span className="text-[11px] text-slate-400 font-medium">0% vs last period</span>;
    }
    const isPositive = change > 0;
    return (
      <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold', isPositive ? 'text-emerald-400' : 'text-red-400')}>
        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {isPositive ? '+' : ''}{change.toFixed(1)}% vs last period
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-800/60 rounded-xl w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-32 bg-slate-900 border border-slate-800 rounded-2xl p-5" />
          ))}
        </div>
      </div>
    );
  }

  // 8 Top-Level KPI Cards specified in Step 51
  const kpiCards = [
    {
      title: 'Total Businesses',
      value: stats?.total_businesses ?? 'Data unavailable',
      trend: renderTrend(stats?.businesses_change),
      icon: Building2,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/20',
      link: '/admin/clients',
    },
    {
      title: 'Active Businesses',
      value: stats?.active_businesses ?? 'Data unavailable',
      trend: <span className="text-[11px] text-slate-400 font-medium">Operational businesses</span>,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/20',
      link: '/admin/clients?status=active',
    },
    {
      title: 'New Businesses',
      value: stats?.new_businesses ?? 'Data unavailable',
      trend: renderTrend(stats?.businesses_change),
      icon: UserPlus,
      color: 'text-violet-400',
      bgColor: 'bg-violet-500/10 border-violet-500/20',
      link: '/admin/clients',
    },
    {
      title: 'Active Subscriptions',
      value: stats?.active_subscriptions ?? 0,
      trend: <span className="text-[11px] text-slate-400 font-medium">Live paying or trial accounts</span>,
      icon: CreditCard,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
      link: '/admin/subscriptions',
    },
    {
      title: 'Total QR Scans',
      value: stats?.total_scans !== undefined ? formatNumber(stats.total_scans) : 'Data unavailable',
      trend: renderTrend(stats?.scans_change),
      icon: QrCode,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10 border-cyan-500/20',
      link: '/admin/usage',
    },
    {
      title: 'Review Sessions',
      value: stats?.total_review_sessions !== undefined ? formatNumber(stats.total_review_sessions) : 'Data unavailable',
      trend: renderTrend(stats?.sessions_change),
      icon: MessageSquare,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10 border-indigo-500/20',
      link: '/admin/qr-reviews',
    },
    {
      title: 'AI Drafts Generated',
      value: stats?.total_ai_drafts !== undefined ? formatNumber(stats.total_ai_drafts) : 'Data unavailable',
      trend: renderTrend(stats?.ai_drafts_change),
      icon: Sparkles,
      color: 'text-fuchsia-400',
      bgColor: 'bg-fuchsia-500/10 border-fuchsia-500/20',
      link: '/admin/ai-usage',
    },
    {
      title: 'Google Review Continues',
      value: stats?.google_continue_events !== undefined ? formatNumber(stats.google_continue_events) : 'Data unavailable',
      trend: renderTrend(stats?.google_continues_change),
      icon: ExternalLink,
      color: 'text-teal-400',
      bgColor: 'bg-teal-500/10 border-teal-500/20',
      link: '/admin/qr-reviews',
    },
  ];

  // User / Client KPI Cards (Step 53)
  const userKpiCards = [
    {
      title: 'Total Clients',
      value: stats?.total_users ?? 0,
      trend: renderTrend(stats?.users_change),
      icon: Users,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/20',
      link: '/admin/clients',
    },
    {
      title: 'Active Users',
      value: stats?.active_users ?? 0,
      trend: <span className="text-[11px] text-emerald-400 font-medium">Activity in last 30 days</span>,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/20',
      link: '/admin/clients?status=active_recent',
    },
    {
      title: 'Inactive Users',
      value: stats?.inactive_users ?? 0,
      trend: <span className="text-[11px] text-slate-400 font-medium">No activity in last 30 days</span>,
      icon: AlertCircle,
      color: 'text-slate-400',
      bgColor: 'bg-slate-800 border-slate-700',
      link: '/admin/clients?status=inactive',
    },
    {
      title: 'Deactivated Users',
      value: stats?.deactivated_users ?? 0,
      trend: <span className="text-[11px] text-red-400 font-medium">Explicitly disabled by admin</span>,
      icon: AlertCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10 border-red-500/20',
      link: '/admin/clients?status=deactivated',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Platform Control Panel</h1>
            <span className="px-2 py-0.5 text-[11px] font-semibold bg-primary-500/15 text-primary-400 border border-primary-500/30 rounded-full">
              Real-time
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Complete platform-wide operations, client activity, and AI review flow status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboardData(true)}
            disabled={isRefreshing}
            className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs gap-2 rounded-xl"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Metrics'}</span>
          </Button>

          <Link href="/admin/clients">
            <Button size="sm" className="bg-primary-600 hover:bg-primary-500 text-white text-xs gap-1.5 rounded-xl shadow-lg shadow-primary-600/20">
              <span>View Clients</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 8 Top-Level KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, i) => (
          <Link key={i} href={card.link}>
            <Card className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all duration-200 rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-black/40 group">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-slate-200 transition-colors">
                    {card.title}
                  </span>
                  <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center border', card.bgColor)}>
                    <card.icon className={cn('w-4 h-4', card.color)} />
                  </div>
                </div>

                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
                    {card.value}
                  </div>
                  <div>{card.trend}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* User / Client Status Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-400">
            Client &amp; User Account Status
          </h2>
          <Link href="/admin/clients" className="text-xs text-primary-400 hover:text-primary-300 font-medium">
            Manage Clients &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {userKpiCards.map((card, i) => (
            <Link key={i} href={card.link}>
              <Card className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all duration-200 rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-black/40 group">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-slate-200 transition-colors">
                      {card.title}
                    </span>
                    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center border', card.bgColor)}>
                      <card.icon className={cn('w-4 h-4', card.color)} />
                    </div>
                  </div>

                  <div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
                      {card.value}
                    </div>
                    <div>{card.trend}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Navigation Sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/admin/usage">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 hover:border-primary-500/40 transition-all group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-primary-400 transition-colors">Feature Usage</h3>
                <p className="text-xs text-slate-400">Scans, sessions, and conversion rates</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Filter platform feature adoption across Today, 7d, 30d, and 90d periods.</p>
          </div>
        </Link>

        <Link href="/admin/ai-usage">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 hover:border-primary-500/40 transition-all group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-primary-400 transition-colors">AI Generation Usage</h3>
                <p className="text-xs text-slate-400">Drafts by category, business &amp; speed</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Detailed metrics on AI review response times and regeneration frequency.</p>
          </div>
        </Link>

        <Link href="/admin/system">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 hover:border-primary-500/40 transition-all group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-primary-400 transition-colors">System Health</h3>
                <p className="text-xs text-slate-400">DB, Auth, AI &amp; API services status</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Live operational checks and incident reporting across core infrastructure.</p>
          </div>
        </Link>
      </div>

      {/* Recent Platform Activity */}
      <Card className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden">
        <CardHeader className="p-5 border-b border-slate-800/80 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-primary-400" />
            <CardTitle className="text-base font-bold text-white">Recent Platform Activity</CardTitle>
          </div>
          <Link href="/admin/activity" className="text-xs text-primary-400 hover:underline inline-flex items-center gap-1 font-medium">
            <span>View Full Feed</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {recentActivity.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No recent audit activity recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {recentActivity.map((act) => (
                <div key={act.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center flex-shrink-0 text-slate-300">
                      <Activity className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-200 truncate">
                        {act.details || act.type}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2">
                        <span>{act.user_name || act.user_email || 'System'}</span>
                        <span>•</span>
                        <span>{new Date(act.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60 flex-shrink-0">
                    {act.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}