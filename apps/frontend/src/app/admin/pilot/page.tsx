'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Building2,
  QrCode,
  Sparkles,
  ExternalLink,
  Copy,
  MessageSquare,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Info,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldAlert,
  Zap,
  Activity,
  Check,
  X,
  CreditCard,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { formatNumber, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

export type PilotActivationStatus = 'not_set_up' | 'ready' | 'active' | 'needs_attention';

export interface OperationalIncident {
  id: string;
  timestamp: string;
  first_seen: string;
  category: 'AUTH' | 'AUTHORIZATION' | 'DATABASE' | 'AI' | 'CUSTOMER_FLOW' | 'QR' | 'SUBSCRIPTION' | 'CONFIGURATION' | 'UNKNOWN';
  route: string;
  severity: 'error' | 'warning' | 'critical';
  business_id: string | null;
  business_name?: string | null;
  message: string;
  count: number;
  status: 'active' | 'investigating' | 'resolved';
}

export interface PilotControlCenterBusiness {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  created_at: string;
  setup_status: 'complete' | 'incomplete';
  activity_status: PilotActivationStatus;
  needs_attention: boolean;
  attention_reasons: string[];
  plan: string;
  subscription_status: string;
  scans_count: number;
  sessions_count: number;
  ai_generated_count: number;
  google_opens_count: number;
  open_feedback_count: number;
  recent_errors_count: number;
  latest_activity: string | null;
}

export interface PilotControlCenterData {
  businesses_summary: {
    total_pilot_businesses: number;
    setup_complete: number;
    active: number;
    inactive: number;
    needs_attention: number;
  };
  customer_activity: {
    total_scans: number;
    total_sessions: number;
    total_ai_generated: number;
    total_copies: number;
    total_google_opens: number;
    total_feedback: number;
  };
  system_health: {
    recent_errors_count: number;
    ai_failures_count: number;
    authorization_failures_count: number;
    customer_flow_failures_count: number;
    recent_incidents: OperationalIncident[];
  };
  feedback_summary: {
    open: number;
    reviewing: number;
    resolved: number;
    total: number;
  };
  subscriptions_summary: {
    free_businesses: number;
    paid_businesses: number;
    pending_upgrade_requests: number;
  };
  pilot_businesses: PilotControlCenterBusiness[];
  range: '7d' | '30d' | 'all';
  notice: string;
}

export default function PilotControlCenterPage() {
  const [data, setData] = useState<PilotControlCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_attention' | 'active' | 'ready' | 'not_set_up'>('all');
  const [incidentCategoryFilter, setIncidentCategoryFilter] = useState<string>('all');

  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await api.get<any>(`/admin/pilot?range=${range}`);
      const payload: PilotControlCenterData = res.data?.data || res.data || res;
      setData(payload);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      console.error('Failed to load pilot control center data:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load control center data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [range]);

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return ts;
    }
  };

  const filteredBusinesses = (data?.pilot_businesses || []).filter(b => {
    if (statusFilter === 'needs_attention' && !b.needs_attention) return false;
    if (statusFilter !== 'all' && statusFilter !== 'needs_attention' && b.activity_status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = b.name.toLowerCase().includes(q);
      const matchSlug = b.slug.toLowerCase().includes(q);
      const matchEmail = b.owner_email.toLowerCase().includes(q);
      if (!matchName && !matchSlug && !matchEmail) return false;
    }
    return true;
  });

  const filteredIncidents = (data?.system_health.recent_incidents || []).filter(inc => {
    if (incidentCategoryFilter !== 'all' && inc.category !== incidentCategoryFilter) return false;
    return true;
  });

  const getStatusBadge = (status: PilotActivationStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            ACTIVE
          </span>
        );
      case 'ready':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            READY
          </span>
        );
      case 'not_set_up':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            NOT SET UP
          </span>
        );
      case 'needs_attention':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            NEEDS ATTENTION
          </span>
        );
      default:
        return null;
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'AI':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'CUSTOMER_FLOW':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'DATABASE':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      case 'AUTH':
      case 'AUTHORIZATION':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'QR':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
      case 'SUBSCRIPTION':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Zap className="h-7 w-7 text-amber-500" />
              Pilot Launch Control Center
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              Live Pilot (Cohort 1)
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time operational monitoring, failure triage, and business activity oversight.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date range filter */}
          <div className="flex rounded-lg border border-border bg-card p-1 text-xs">
            <button
              onClick={() => setRange('7d')}
              className={cn(
                'px-3 py-1.5 rounded-md font-medium transition-colors',
                range === '7d' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              7 Days
            </button>
            <button
              onClick={() => setRange('30d')}
              className={cn(
                'px-3 py-1.5 rounded-md font-medium transition-colors',
                range === '30d' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              30 Days
            </button>
            <button
              onClick={() => setRange('all')}
              className={cn(
                'px-3 py-1.5 rounded-md font-medium transition-colors',
                range === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              All Time
            </button>
          </div>

          {/* Manual Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 text-xs h-9"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', (refreshing || loading) && 'animate-spin')} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>

          <Link href="/admin/pilot-insights">
            <Button variant="default" size="sm" className="flex items-center gap-1.5 text-xs h-9">
              <Layers className="h-3.5 w-3.5" />
              Pilot Insights
            </Button>
          </Link>
        </div>
      </div>

      {lastRefreshedAt && (
        <div className="text-xs text-muted-foreground -mt-3 flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          Last updated: {lastRefreshedAt.toLocaleTimeString()}
        </div>
      )}

      {/* Semantic Rule & Architecture Notice */}
      <div className="p-3.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 text-xs flex items-start gap-2.5">
        <Info className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div className="space-y-1">
          <p>
            <strong>Operational Boundaries:</strong> "Google Review Page Opens" measures customer clicks redirecting to Google.
            ReviewAI does NOT verify review completion on Google.
          </p>
          <p className="text-blue-800 dark:text-blue-300">
            <strong>Network Routing:</strong> QR codes require active internet connectivity to contact ReviewAI infrastructure.
            Zero-activity states do NOT imply business failure; freshly onboarded businesses are naturally in <code className="font-semibold">READY</code> status.
          </p>
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && !refreshing && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
          <p className="text-sm text-muted-foreground">Gathering operational metrics across pilot cohort...</p>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="text-sm font-medium">{error}</div>
          <Button variant="outline" size="sm" onClick={() => fetchData()} className="ml-auto text-xs">
            Retry
          </Button>
        </div>
      )}

      {!loading && data && (
        <>
          {/* SECTION 1: Operational Summary KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Card 1: Businesses */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Pilot Businesses</span>
                  <Building2 className="w-4 h-4 text-primary" />
                </CardDescription>
                <CardTitle className="text-3xl font-extrabold text-foreground mt-1">
                  {data.businesses_summary.total_pilot_businesses}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Active:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{data.businesses_summary.active}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Setup Complete:</span>
                  <span className="font-semibold text-foreground">{data.businesses_summary.setup_complete}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Needs Attention:</span>
                  <span className={cn('font-semibold', data.businesses_summary.needs_attention > 0 ? 'text-rose-600 font-bold' : 'text-foreground')}>
                    {data.businesses_summary.needs_attention}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Customer Activity */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Customer Activity</span>
                  <Activity className="w-4 h-4 text-emerald-600" />
                </CardDescription>
                <CardTitle className="text-3xl font-extrabold text-foreground mt-1">
                  {formatNumber(data.customer_activity.total_sessions)}
                  <span className="text-xs font-normal text-muted-foreground ml-1.5">sessions</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>QR Scans:</span>
                  <span className="font-semibold text-foreground">{formatNumber(data.customer_activity.total_scans)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>AI Generated:</span>
                  <span className="font-semibold text-foreground">{formatNumber(data.customer_activity.total_ai_generated)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Google Page Opens:</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{formatNumber(data.customer_activity.total_google_opens)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Card 3: System Health & Incidents */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>System Health</span>
                  <ShieldAlert className={cn('w-4 h-4', data.system_health.recent_errors_count > 0 ? 'text-rose-500' : 'text-emerald-500')} />
                </CardDescription>
                <CardTitle className="text-3xl font-extrabold text-foreground mt-1 flex items-center gap-2">
                  {data.system_health.recent_errors_count}
                  <span className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                    data.system_health.recent_errors_count === 0
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  )}>
                    {data.system_health.recent_errors_count === 0 ? 'Healthy' : 'Incidents'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>AI Failures:</span>
                  <span className={cn('font-semibold', data.system_health.ai_failures_count > 0 ? 'text-rose-600' : 'text-foreground')}>
                    {data.system_health.ai_failures_count}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Auth Failures:</span>
                  <span className="font-semibold text-foreground">{data.system_health.authorization_failures_count}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Flow Failures:</span>
                  <span className="font-semibold text-foreground">{data.system_health.customer_flow_failures_count}</span>
                </div>
              </CardContent>
            </Card>

            {/* Card 4: Feedback Summary */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Pilot Feedback</span>
                  <MessageSquare className="w-4 h-4 text-purple-600" />
                </CardDescription>
                <CardTitle className="text-3xl font-extrabold text-foreground mt-1 flex items-center justify-between">
                  <span>{data.feedback_summary.open}</span>
                  <span className="text-xs font-medium text-muted-foreground">open</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Reviewing:</span>
                  <span className="font-semibold text-foreground">{data.feedback_summary.reviewing}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Resolved:</span>
                  <span className="font-semibold text-emerald-600">{data.feedback_summary.resolved}</span>
                </div>
                <div className="pt-1">
                  <Link href="/admin/feedback" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
                    Feedback triage <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Card 5: Subscriptions */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Subscriptions</span>
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                </CardDescription>
                <CardTitle className="text-3xl font-extrabold text-foreground mt-1">
                  {data.subscriptions_summary.paid_businesses}
                  <span className="text-xs font-normal text-muted-foreground ml-1.5">paid</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Free / Starter:</span>
                  <span className="font-semibold text-foreground">{data.subscriptions_summary.free_businesses}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Pending Upgrades:</span>
                  <span className={cn('font-semibold', data.subscriptions_summary.pending_upgrade_requests > 0 ? 'text-amber-600 font-bold' : 'text-foreground')}>
                    {data.subscriptions_summary.pending_upgrade_requests}
                  </span>
                </div>
                <div className="pt-1">
                  <Link href="/admin/upgrade-requests" className="text-xs text-primary hover:underline flex items-center gap-1 font-medium">
                    Upgrade requests <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* SECTION 2: Operational Incident Monitoring Feed (Tasks 5, 6, 7) */}
          <Card className="border-border shadow-sm">
            <CardHeader className="border-b border-border pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-500" />
                    Operational Error & Incident Monitor
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Deduplicated operational errors and customer-flow failures observed by the server.
                  </CardDescription>
                </div>

                {/* Incident category filter tabs */}
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {['all', 'AI', 'CUSTOMER_FLOW', 'QR', 'AUTH', 'DATABASE'].map(cat => (
                    <button
                      key={cat}
                      onClick={() => setIncidentCategoryFilter(cat)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                        incidentCategoryFilter === cat
                          ? 'bg-secondary text-secondary-foreground font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {cat.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredIncidents.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground flex flex-col items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/80 mb-2" />
                  <p className="font-semibold text-foreground">No recent operational errors.</p>
                  <p className="text-muted-foreground mt-0.5">All customer-flow operations and services are operating nominally.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredIncidents.map(inc => (
                    <div key={inc.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs hover:bg-muted/40 transition-colors">
                      <div className="space-y-1.5 max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold border', getCategoryBadgeClass(inc.category))}>
                            {inc.category}
                          </span>
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase',
                            inc.severity === 'critical' ? 'bg-rose-600 text-white' : inc.severity === 'warning' ? 'bg-amber-500 text-white' : 'bg-slate-600 text-white'
                          )}>
                            {inc.severity}
                          </span>
                          <span className="font-mono text-xs text-foreground font-medium bg-muted px-1.5 py-0.5 rounded">
                            {inc.route}
                          </span>
                          {inc.count > 1 && (
                            <span className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700 px-2 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              {inc.count} occurrences (Deduplicated)
                            </span>
                          )}
                        </div>
                        <p className="text-foreground text-xs font-mono">{inc.message}</p>
                        {inc.business_id && (
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <span>Associated Business ID:</span>
                            <Link href={`/admin/businesses/${inc.business_id}`} className="font-mono text-primary hover:underline">
                              {inc.business_id}
                            </Link>
                          </div>
                        )}
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground shrink-0 self-end sm:self-center">
                        <p className="font-medium text-foreground">{formatTimestamp(inc.timestamp)}</p>
                        {inc.count > 1 && (
                          <p className="text-[10px] text-muted-foreground">First seen: {formatTimestamp(inc.first_seen)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECTION 3: Pilot Businesses Operational Table (Tasks 2, 4, 8) */}
          <Card className="border-border shadow-sm">
            <CardHeader className="border-b border-border pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    Pilot Cohort Businesses
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Operational state, customer funnel counts, and attention status across pilot businesses.
                  </CardDescription>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px]">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search business..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-8 h-9 text-xs"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                    className="h-9 px-2.5 rounded-md border border-input bg-background text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="all">All Statuses ({data.pilot_businesses.length})</option>
                    <option value="needs_attention">Needs Attention Only ({data.businesses_summary.needs_attention})</option>
                    <option value="active">Active ({data.businesses_summary.active})</option>
                    <option value="ready">Ready ({data.businesses_summary.total_pilot_businesses - data.businesses_summary.active - data.businesses_summary.needs_attention})</option>
                    <option value="not_set_up">Not Set Up ({data.businesses_summary.total_pilot_businesses - data.businesses_summary.setup_complete})</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredBusinesses.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-foreground">No pilot businesses match your filter.</p>
                  <p className="mt-0.5">Try clearing your search query or selecting a different status filter.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border">
                      <tr>
                        <th className="p-3">Business</th>
                        <th className="p-3">Operational Status</th>
                        <th className="p-3">Needs Attention</th>
                        <th className="p-3 text-center">QR Scans</th>
                        <th className="p-3 text-center">Sessions</th>
                        <th className="p-3 text-center">AI Gen</th>
                        <th className="p-3 text-center">Google Opens*</th>
                        <th className="p-3 text-center">Feedback</th>
                        <th className="p-3">Plan / Status</th>
                        <th className="p-3">Latest Activity</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredBusinesses.map(b => (
                        <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-medium">
                            <div className="text-foreground font-semibold">{b.name}</div>
                            <div className="text-muted-foreground text-[11px] font-mono">{b.slug}</div>
                            <div className="text-muted-foreground text-[10px]">{b.owner_email}</div>
                          </td>
                          <td className="p-3">
                            {getStatusBadge(b.activity_status)}
                          </td>
                          <td className="p-3">
                            {b.needs_attention ? (
                              <div className="space-y-1 max-w-xs">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                                  <AlertCircle className="w-3 h-3" /> Attention Required
                                </span>
                                <ul className="text-[10px] text-rose-700 dark:text-rose-300 list-disc list-inside space-y-0.5">
                                  {b.attention_reasons.map((r, rIdx) => (
                                    <li key={rIdx}>{r}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                <Check className="w-3.5 h-3.5" /> OK
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono font-medium">{b.scans_count}</td>
                          <td className="p-3 text-center font-mono font-medium">{b.sessions_count}</td>
                          <td className="p-3 text-center font-mono font-medium">{b.ai_generated_count}</td>
                          <td className="p-3 text-center font-mono font-medium text-blue-600 dark:text-blue-400">
                            {b.google_opens_count}
                          </td>
                          <td className="p-3 text-center">
                            {b.open_feedback_count > 0 ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                {b.open_feedback_count} open
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="capitalize font-medium">{b.plan}</span>
                            <div className="text-[10px] text-muted-foreground capitalize">{b.subscription_status}</div>
                          </td>
                          <td className="p-3 text-muted-foreground text-[11px]">
                            {formatTimestamp(b.latest_activity)}
                          </td>
                          <td className="p-3 text-right">
                            <Link href={`/admin/businesses/${b.id}`}>
                              <Button variant="outline" size="sm" className="h-7 text-xs flex items-center gap-1">
                                Detail <ChevronRight className="w-3 h-3" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
