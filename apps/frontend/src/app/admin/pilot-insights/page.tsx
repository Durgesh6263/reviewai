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
  CheckCircle2,
  Clock,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { formatNumber, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

export type PilotActivationStatus = 'not_set_up' | 'ready' | 'active' | 'needs_attention';

export interface PilotBusinessActivityItem {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  setup_status: 'complete' | 'incomplete';
  activity_status: PilotActivationStatus;
  activity_counts: {
    scans: number;
    sessions: number;
    ai_generated: number;
    copies: number;
    google_opens: number;
    feedback: number;
  };
  first_activity_timestamps: {
    business_created: string | null;
    setup_completed: string | null;
    qr_created: string | null;
    first_qr_scan: string | null;
    first_review_session: string | null;
    first_ai_generation: string | null;
    first_review_copied: string | null;
    first_google_page_open: string | null;
    latest_activity: string | null;
  };
  milestones: {
    setup_completed: boolean;
    qr_generated: boolean;
    first_scan: boolean;
    first_session: boolean;
    first_generation: boolean;
    first_copied: boolean;
    first_google_open: boolean;
  };
  open_feedback_count: number;
  subscription: {
    plan: string;
    status: string;
    ai_usage: number;
    ai_limit: number;
    qr_count: number;
  } | null;
}

export interface PilotUsageSummary {
  total_pilot_businesses: number;
  businesses_ready: number;
  businesses_active: number;
  businesses_no_activity: number;
  businesses_not_setup: number;
  businesses_needs_attention: number;
  total_scans: number;
  total_sessions: number;
  total_ai_generated: number;
  total_copies: number;
  total_google_opens: number;
  total_feedback: number;
}

export interface PilotUsageTrendItem {
  date: string;
  scans: number;
  sessions: number;
  ai_generated: number;
  google_opens: number;
  feedback: number;
}

export interface PilotInsightsData {
  summary: PilotUsageSummary;
  trends: PilotUsageTrendItem[];
  businesses: PilotBusinessActivityItem[];
  period: '7d' | '30d' | 'all';
  notice: string;
}

export default function AdminPilotInsightsPage() {
  const [data, setData] = useState<PilotInsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBizId, setExpandedBizId] = useState<string | null>(null);
  const [activeTrendMetric, setActiveTrendMetric] = useState<'scans' | 'sessions' | 'ai_generated' | 'google_opens' | 'feedback'>('scans');

  const fetchInsights = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<{ data: PilotInsightsData }>(`/admin/pilot-insights?range=${range}`);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load pilot insights:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [range]);

  const filteredBusinesses = (data?.businesses || []).filter((b) => {
    if (statusFilter !== 'all' && b.activity_status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q);
    }
    return true;
  });

  const getStatusBadge = (status: PilotActivationStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            ACTIVE
          </span>
        );
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-300 dark:border-blue-800">
            <Clock className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            READY
          </span>
        );
      case 'not_set_up':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
            <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            NOT SET UP
          </span>
        );
      case 'needs_attention':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-300 dark:border-rose-800">
            <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            NEEDS ATTENTION
          </span>
        );
      default:
        return null;
    }
  };

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading pilot insights...</p>
        </div>
      </div>
    );
  }

  const summary = data?.summary;
  const hasBusinesses = summary && summary.total_pilot_businesses > 0;
  const hasActivity = summary && (summary.total_scans > 0 || summary.total_sessions > 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-950 flex items-center justify-center text-primary-600 dark:text-primary-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Pilot Business Insights
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Operational activation, customer funnel progress, and retention metrics for initial pilot businesses.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Date range toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-sm">
            {(['7d', '30d', 'all'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-md transition-all',
                  range === r
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : 'All Time'}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={fetchInsights} disabled={isLoading}>
            <RefreshCw className={cn('w-4 h-4 mr-1.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Mandatory Accuracy Disclaimer Notice */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900 dark:text-blue-200 space-y-1">
            <span className="font-semibold block text-sm">Pilot Measurement Transparency & Definition Notice</span>
            <p>
              <strong>Google Review Page Opens ≠ Google Review Submissions.</strong> ReviewAI tracks customer clicks to open a business&apos;s Google Review URL. ReviewAI does not verify, scrape, or claim customer submission or publication on Google. All metrics below represent direct interactions within the ReviewAI platform.
            </p>
          </div>
        </div>
      </div>

      {/* Overall Pilot Usage Summary Cards (Task 2) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
        <Card className="p-4 shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Pilot Businesses</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary?.total_pilot_businesses || 0}</p>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{summary?.businesses_active || 0} active</span>
            <span>•</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold">{summary?.businesses_ready || 0} ready</span>
          </div>
        </Card>

        <Card className="p-4 shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total QR Scans</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary?.total_scans || 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">Debounced QR interactions</p>
        </Card>

        <Card className="p-4 shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Review Sessions</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary?.total_sessions || 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">Started review journeys</p>
        </Card>

        <Card className="p-4 shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">AI Reviews Generated</p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{summary?.total_ai_generated || 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">Successful completions</p>
        </Card>

        <Card className="p-4 shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Review Copies</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{summary?.total_copies || 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">Copied to clipboard</p>
        </Card>

        <Card className="p-4 shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Google Review Page Opens</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{summary?.total_google_opens || 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">Redirected to Google URL</p>
        </Card>
      </div>

      {/* Usage Trends Chart (Task 5) */}
      <Card className="shadow-sm border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                Pilot Usage Over Time ({range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : 'All Time'})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                Daily activity timeline across all pilot businesses
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'scans', label: 'QR Scans', color: 'bg-slate-700' },
                { key: 'sessions', label: 'Sessions', color: 'bg-primary-600' },
                { key: 'ai_generated', label: 'AI Generated', color: 'bg-indigo-600' },
                { key: 'google_opens', label: 'Google Page Opens', color: 'bg-blue-600' },
                { key: 'feedback', label: 'Private Feedback', color: 'bg-rose-500' },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setActiveTrendMetric(m.key as any)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                    activeTrendMetric === m.key
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {!hasActivity ? (
            <div className="py-12 text-center">
              <Clock className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Pilot businesses are configured, but no customer activity has been recorded yet.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Activity timelines will populate once pilot QR codes are scanned by customers.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Simple lightweight bar chart */}
              <div className="grid grid-cols-7 sm:grid-cols-14 md:grid-cols-30 gap-1.5 items-end h-40 pt-4 px-2">
                {(data?.trends || []).map((t, idx) => {
                  const val = t[activeTrendMetric] || 0;
                  const maxVal = Math.max(...(data?.trends || []).map((item) => item[activeTrendMetric] || 0), 5);
                  const heightPercent = Math.max(Math.round((val / maxVal) * 100), 4);
                  return (
                    <div
                      key={t.date}
                      className="group relative flex flex-col items-center h-full justify-end"
                      title={`${t.date}: ${val} ${activeTrendMetric}`}
                    >
                      <div
                        style={{ height: `${val === 0 ? 4 : heightPercent}%` }}
                        className={cn(
                          'w-full rounded-t transition-all',
                          val > 0
                            ? activeTrendMetric === 'scans'
                              ? 'bg-slate-700 dark:bg-slate-300'
                              : activeTrendMetric === 'ai_generated'
                              ? 'bg-indigo-600 dark:bg-indigo-400'
                              : activeTrendMetric === 'google_opens'
                              ? 'bg-blue-600 dark:bg-blue-400'
                              : activeTrendMetric === 'feedback'
                              ? 'bg-rose-500 dark:bg-rose-400'
                              : 'bg-primary-600 dark:bg-primary-400'
                            : 'bg-slate-100 dark:bg-slate-800'
                        )}
                      />
                      <span className="text-[9px] text-slate-400 mt-1 truncate max-w-full hidden md:block">
                        {idx % 3 === 0 ? t.date.slice(5) : ''}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 px-2">
                <span>Showing metric: <strong className="capitalize text-slate-700 dark:text-slate-300">{activeTrendMetric.replace('_', ' ')}</strong></span>
                <span>Date range: {range === '7d' ? '7 days' : range === '30d' ? '30 days' : 'All available history'}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Business Activity Table (Task 6) */}
      <Card className="shadow-sm border border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                Pilot Business Operational Activity
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                Detailed activation status, customer funnel counts, and engagement milestones.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search business..."
                  className="pl-8 h-8 text-xs w-44 sm:w-52"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 px-2.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
              >
                <option value="all">All Operational Statuses</option>
                <option value="active">Active (Has customer traffic)</option>
                <option value="ready">Ready (Setup complete, awaiting scans)</option>
                <option value="not_set_up">Not Set Up (Config incomplete)</option>
                <option value="needs_attention">Needs Attention (Unresolved issues)</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!hasBusinesses ? (
            <div className="py-16 text-center">
              <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No pilot businesses yet.</p>
              <p className="text-xs text-slate-400 mt-1">Configure pilot businesses in Business Management to view insights.</p>
            </div>
          ) : filteredBusinesses.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No businesses match the selected filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Business</th>
                    <th className="py-3 px-3">Setup</th>
                    <th className="py-3 px-3">Activity Status</th>
                    <th className="py-3 px-3 text-right">QR Scans</th>
                    <th className="py-3 px-3 text-right">Sessions</th>
                    <th className="py-3 px-3 text-right">AI Gen</th>
                    <th className="py-3 px-3 text-right">Copies</th>
                    <th className="py-3 px-3 text-right">Google Opens</th>
                    <th className="py-3 px-3 text-right">Feedback</th>
                    <th className="py-3 px-4">Last Activity</th>
                    <th className="py-3 px-4 text-center">Milestones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredBusinesses.map((b) => {
                    const isExpanded = expandedBizId === b.id;
                    return (
                      <React.Fragment key={b.id}>
                        <tr
                          onClick={() => setExpandedBizId(isExpanded ? null : b.id)}
                          className={cn(
                            'hover:bg-slate-50/80 dark:hover:bg-slate-900/40 cursor-pointer transition-colors',
                            isExpanded && 'bg-slate-50/90 dark:bg-slate-900/60'
                          )}
                        >
                          <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                              <div>
                                <span className="font-semibold block">{b.name}</span>
                                <span className="text-[11px] text-slate-400">/{b.slug}</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            {b.setup_status === 'complete' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Complete
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Incomplete
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3">{getStatusBadge(b.activity_status)}</td>

                          <td className="py-3 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                            {b.activity_counts.scans}
                          </td>

                          <td className="py-3 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                            {b.activity_counts.sessions}
                          </td>

                          <td className="py-3 px-3 text-right font-medium text-indigo-600 dark:text-indigo-400">
                            {b.activity_counts.ai_generated}
                          </td>

                          <td className="py-3 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                            {b.activity_counts.copies}
                          </td>

                          <td className="py-3 px-3 text-right font-medium text-blue-600 dark:text-blue-400">
                            {b.activity_counts.google_opens}
                          </td>

                          <td className="py-3 px-3 text-right font-medium">
                            {b.open_feedback_count > 0 ? (
                              <Link
                                href={`/admin/feedback?search=${encodeURIComponent(b.name)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-rose-600 hover:underline font-semibold"
                                title="Click to view open feedback in Feedback System"
                              >
                                {b.activity_counts.feedback} ({b.open_feedback_count} open)
                                <ArrowUpRight className="w-3 h-3" />
                              </Link>
                            ) : (
                              <span className="text-slate-500">{b.activity_counts.feedback}</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-500 text-[11px]">
                            {formatTimestamp(b.first_activity_timestamps.latest_activity)}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs font-medium text-slate-600 dark:text-slate-300"
                            >
                              {isExpanded ? (
                                <>Hide Details <ChevronUp className="w-3.5 h-3.5 ml-1" /></>
                              ) : (
                                <>Milestones <ChevronDown className="w-3.5 h-3.5 ml-1" /></>
                              )}
                            </Button>
                          </td>
                        </tr>

                        {/* Collapsible Operational Milestones & Timestamps Drawer (Task 7 & 4) */}
                        {isExpanded && (
                          <tr className="bg-slate-50/60 dark:bg-slate-900/40">
                            <td colSpan={11} className="p-4 border-t border-b border-slate-200 dark:border-slate-800">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Milestones Checklist */}
                                <div className="space-y-2">
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    Operational Milestones
                                  </h4>
                                  <div className="space-y-1.5 text-xs">
                                    {[
                                      { label: 'Setup Completed', done: b.milestones.setup_completed },
                                      { label: 'QR Code Generated', done: b.milestones.qr_generated },
                                      { label: 'First QR Scan', done: b.milestones.first_scan },
                                      { label: 'First Review Session', done: b.milestones.first_session },
                                      { label: 'First AI Review Generated', done: b.milestones.first_generation },
                                      { label: 'First Review Copied', done: b.milestones.first_copied },
                                      { label: 'First Google Review Page Open', done: b.milestones.first_google_open },
                                    ].map((m, mIdx) => (
                                      <div key={mIdx} className="flex items-center gap-2">
                                        {m.done ? (
                                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                        ) : (
                                          <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 shrink-0" />
                                        )}
                                        <span className={cn(m.done ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-400')}>
                                          {m.label}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Timestamps List */}
                                <div className="space-y-2">
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    Activity Timestamps
                                  </h4>
                                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                                    <p><strong>Created:</strong> {formatTimestamp(b.first_activity_timestamps.business_created)}</p>
                                    <p><strong>Setup Complete:</strong> {formatTimestamp(b.first_activity_timestamps.setup_completed)}</p>
                                    <p><strong>QR Created:</strong> {formatTimestamp(b.first_activity_timestamps.qr_created)}</p>
                                    <p><strong>First QR Scan:</strong> {formatTimestamp(b.first_activity_timestamps.first_qr_scan)}</p>
                                    <p><strong>First Session:</strong> {formatTimestamp(b.first_activity_timestamps.first_review_session)}</p>
                                    <p><strong>First AI Gen:</strong> {formatTimestamp(b.first_activity_timestamps.first_ai_generation)}</p>
                                    <p><strong>First Google Open:</strong> {formatTimestamp(b.first_activity_timestamps.first_google_page_open)}</p>
                                  </div>
                                </div>

                                {/* Context & Actions */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    Subscription & Context
                                  </h4>
                                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-1.5 text-xs">
                                    <p><strong>Plan:</strong> <span className="capitalize">{b.subscription?.plan || 'Starter'}</span> ({b.subscription?.status || 'Active'})</p>
                                    <p><strong>AI Usage:</strong> {b.subscription?.ai_usage || 0} / {b.subscription?.ai_limit || 50} reviews</p>
                                    <p><strong>Active QR Codes:</strong> {b.subscription?.qr_count || 0}</p>
                                    {b.open_feedback_count > 0 && (
                                      <p className="text-rose-600 font-semibold pt-1">
                                        ⚠️ {b.open_feedback_count} unresolved private feedback item(s) pending.
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 pt-1">
                                    <Link href={`/admin/businesses/${b.id}`}>
                                      <Button variant="outline" size="sm" className="h-8 text-xs">
                                        View Business Detail
                                      </Button>
                                    </Link>
                                    {b.open_feedback_count > 0 && (
                                      <Link href={`/admin/feedback?search=${encodeURIComponent(b.name)}`}>
                                        <Button variant="default" size="sm" className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white">
                                          Manage Feedback ({b.open_feedback_count})
                                        </Button>
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
