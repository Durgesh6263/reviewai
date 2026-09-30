'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Activity,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  RefreshCw,
  QrCode,
  Sparkles,
  Copy,
  ExternalLink,
  MessageSquare,
  Building2,
  CreditCard,
  Clock,
  ShieldAlert,
  Database,
  Zap,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  XCircle,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type IncidentSeverity = 'info' | 'warning' | 'error' | 'critical';
type IncidentStatus = 'active' | 'investigating' | 'resolved';
type IncidentCategory =
  | 'AUTH'
  | 'AUTHORIZATION'
  | 'DATABASE'
  | 'AI'
  | 'CUSTOMER_FLOW'
  | 'QR'
  | 'SUBSCRIPTION'
  | 'CONFIGURATION'
  | 'UNKNOWN';

interface OperationalIncident {
  id: string;
  timestamp: string;
  first_seen: string;
  category: IncidentCategory;
  route: string;
  severity: IncidentSeverity;
  business_id: string | null;
  business_name?: string | null;
  message: string;
  count: number;
  status: IncidentStatus;
  admin_note?: string | null;
  resolved_at?: string | null;
}

interface DailyHealthPeriod {
  qr_scans: number;
  review_sessions: number;
  ai_generations: number;
  review_copies: number;
  google_page_opens: number;
  private_feedback_submitted: number;
  operational_errors: number;
  ai_failures: number;
  auth_failures: number;
  db_errors: number;
}

interface DailyHealthSummary {
  generated_at: string;
  window_hours: number;
  system: {
    operational_errors_24h: number;
    ai_failures_24h: number;
    auth_failures_24h: number;
    db_errors_24h: number;
    customer_flow_failures_24h: number;
    critical_incidents: number;
    open_incidents: number;
  };
  customer_flow: {
    qr_scans: number;
    review_sessions: number;
    ai_generations: number;
    ai_generation_failures: number;
    ai_failure_rate_pct: number | null;
    review_copies: number;
    google_page_opens: number;
    private_feedback_submitted: number;
  };
  businesses: {
    total: number;
    newly_onboarded_24h: number;
    setup_incomplete: number;
    active_in_window: number;
    no_recent_activity: number;
  };
  feedback: {
    new_24h: number;
    open_total: number;
    reviewing: number;
  };
  subscriptions: {
    pending_upgrade_requests: number;
    businesses_near_limit: number;
  };
  comparison: {
    current: DailyHealthPeriod;
    previous: DailyHealthPeriod;
  };
  recent_critical_incidents: OperationalIncident[];
  notice: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityBorderColor(s: IncidentSeverity) {
  switch (s) {
    case 'critical': return 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10';
    case 'error':    return 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/10';
    case 'warning':  return 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/10';
    default:         return 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10';
  }
}

function severityBadgeClass(s: IncidentSeverity) {
  switch (s) {
    case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'error':    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    case 'warning':  return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    default:         return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  }
}

function statusBadgeClass(status: IncidentStatus) {
  switch (status) {
    case 'resolved':      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'investigating': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    default:              return 'bg-secondary-100 text-secondary-600 dark:bg-secondary-800 dark:text-secondary-300';
  }
}

/** Absolute delta with sign, no percentage when previous is 0 */
function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="text-xs text-secondary-400">—</span>;
  const delta = current - previous;
  if (delta === 0) return <span className="text-xs text-secondary-400">= prev</span>;
  const sign = delta > 0 ? '+' : '';
  const color = delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
  return <span className={cn('text-xs font-medium', color)}>{sign}{delta} vs prev</span>;
}

function ComparisonRow({ label, current, previous }: { label: string; current: number; previous: number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-secondary-600 dark:text-secondary-400">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-secondary-900 dark:text-white w-10 text-right">{current}</span>
        <div className="w-28 text-right">
          <Delta current={current} previous={previous} />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  alert = false,
  subtext,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  alert?: boolean;
  subtext?: string;
}) {
  return (
    <div className={cn(
      'bg-white dark:bg-secondary-900 rounded-xl p-4 border transition-colors',
      alert && Number(value) > 0
        ? 'border-orange-200 dark:border-orange-800'
        : 'border-border'
    )}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('w-4 h-4', alert && Number(value) > 0 ? 'text-orange-400' : 'text-secondary-400')} />
        <span className="text-xs text-secondary-500 dark:text-secondary-400 leading-tight">{label}</span>
      </div>
      <p className={cn(
        'text-2xl font-bold',
        alert && Number(value) > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-secondary-900 dark:text-white'
      )}>{value}</p>
      {subtext && <p className="text-xs text-secondary-400 mt-0.5">{subtext}</p>}
    </div>
  );
}

// ─── IncidentRow ──────────────────────────────────────────────────────────────

function IncidentRow({
  incident,
  onUpdate,
}: {
  incident: OperationalIncident;
  onUpdate: (id: string, status: IncidentStatus, note?: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(incident.admin_note ?? '');
  const [saving, setSaving] = useState(false);

  const act = async (status: IncidentStatus) => {
    setSaving(true);
    await onUpdate(incident.id, status, note || undefined);
    setSaving(false);
  };

  const saveNote = async () => {
    setSaving(true);
    await onUpdate(incident.id, incident.status, note);
    setSaving(false);
  };

  return (
    <div
      id={`incident-${incident.id}`}
      className={cn('border rounded-xl overflow-hidden', severityBorderColor(incident.severity))}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:brightness-95 transition-all"
        aria-expanded={expanded}
        aria-controls={`incident-body-${incident.id}`}
      >
        <div className="shrink-0 mt-0.5">
          {incident.severity === 'critical' && <XCircle className="w-4 h-4 text-red-500" />}
          {incident.severity === 'error'    && <AlertCircle className="w-4 h-4 text-orange-500" />}
          {incident.severity === 'warning'  && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
          {incident.severity === 'info'     && <Info className="w-4 h-4 text-blue-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={cn('text-xs font-bold uppercase px-1.5 py-0.5 rounded', severityBadgeClass(incident.severity))}>
              {incident.severity}
            </span>
            <span className="text-xs font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-secondary-700 dark:text-secondary-300">
              {incident.category}
            </span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded', statusBadgeClass(incident.status))}>
              {incident.status === 'investigating' ? '🔍 Investigating' : incident.status === 'resolved' ? '✓ Resolved' : 'Open'}
            </span>
            {incident.count > 1 && (
              <span className="text-xs bg-secondary-100 dark:bg-secondary-800 px-1.5 py-0.5 rounded text-secondary-600 dark:text-secondary-300">
                ×{incident.count}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-secondary-900 dark:text-white leading-snug line-clamp-2">
            {incident.message}
          </p>
          <p className="text-xs text-secondary-500 mt-0.5">{formatDateTime(incident.timestamp)}</p>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 shrink-0 mt-0.5 text-secondary-400" />
          : <ChevronDown className="w-4 h-4 shrink-0 mt-0.5 text-secondary-400" />}
      </button>

      {expanded && (
        <div
          id={`incident-body-${incident.id}`}
          className="border-t border-current/10 bg-white/70 dark:bg-secondary-900/70 px-4 pb-4"
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm">
            <div>
              <dt className="text-xs text-secondary-500">Route / Service</dt>
              <dd className="font-mono text-xs mt-0.5 break-all text-secondary-800 dark:text-secondary-200">{incident.route}</dd>
            </div>
            <div>
              <dt className="text-xs text-secondary-500">Business</dt>
              <dd className="text-xs mt-0.5 text-secondary-800 dark:text-secondary-200">
                {incident.business_name
                  ? <>{incident.business_name}</>
                  : <span className="italic text-secondary-400">Business: Unknown</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-secondary-500">First seen</dt>
              <dd className="text-xs mt-0.5 text-secondary-800 dark:text-secondary-200">{formatDateTime(incident.first_seen)}</dd>
            </div>
            <div>
              <dt className="text-xs text-secondary-500">Last seen</dt>
              <dd className="text-xs mt-0.5 text-secondary-800 dark:text-secondary-200">{formatDateTime(incident.timestamp)}</dd>
            </div>
            {incident.resolved_at && (
              <div>
                <dt className="text-xs text-secondary-500">Resolved at</dt>
                <dd className="text-xs mt-0.5 text-secondary-800 dark:text-secondary-200">{formatDateTime(incident.resolved_at)}</dd>
              </div>
            )}
          </dl>

          <div className="mt-3">
            <label
              htmlFor={`note-${incident.id}`}
              className="text-xs font-medium text-secondary-600 dark:text-secondary-400 block mb-1"
            >
              Internal note (admin only, not shown to business owners)
            </label>
            <textarea
              id={`note-${incident.id}`}
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={1000}
              rows={2}
              className="w-full text-xs rounded-lg border border-border bg-white dark:bg-secondary-800 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 text-secondary-900 dark:text-white resize-none"
              placeholder="Add an internal admin note…"
            />
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {incident.status !== 'investigating' && incident.status !== 'resolved' && (
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => act('investigating')}
                id={`btn-investigating-${incident.id}`}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Mark Investigating
              </Button>
            )}
            {incident.status !== 'resolved' && (
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => act('resolved')}
                id={`btn-resolve-${incident.id}`}
                className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Mark Resolved
              </Button>
            )}
            {incident.status === 'resolved' && (
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => act('active')}
                id={`btn-reopen-${incident.id}`}
              >
                Reopen
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={saveNote}
              id={`btn-note-${incident.id}`}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Save note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DailyHealthPage() {
  const [data, setData] = useState<DailyHealthSummary | null>(null);
  const [incidents, setIncidents] = useState<OperationalIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [incLoading, setIncLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: DailyHealthSummary }>('/admin/daily-health');
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load daily health data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadIncidents = useCallback(async () => {
    setIncLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: OperationalIncident[] }>('/admin/incidents?limit=100');
      setIncidents(res.data || []);
    } catch {
      /* non-fatal */
    } finally {
      setIncLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    loadIncidents();
  }, [loadHealth, loadIncidents]);

  const handleUpdate = useCallback(async (id: string, status: IncidentStatus, note?: string) => {
    await api.patch<{ success: boolean; data: OperationalIncident }>(`/admin/incidents/${id}`, {
      status,
      ...(note !== undefined ? { admin_note: note || null } : {}),
    });
    await loadIncidents();
  }, [loadIncidents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">Failed to load daily health</p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">{error}</p>
            <Button size="sm" variant="outline" onClick={loadHealth} className="mt-3" id="btn-retry-health">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const cf  = data.customer_flow;
  const sys = data.system;
  const biz = data.businesses;
  const cur = data.comparison.current;
  const prv = data.comparison.previous;

  const openIncidentCount = incidents.filter(i => i.status !== 'resolved').length;
  const displayedIncidents = showAll ? incidents : incidents.slice(0, 10);

  return (
    <div className="p-6 space-y-7 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-6 h-6 text-primary-500" />
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Daily Pilot Health</h1>
          </div>
          <p className="text-sm text-secondary-500">
            Last {data.window_hours}h · Generated {formatDateTime(data.generated_at)}
          </p>
        </div>
        <Button
          variant="outline"
          id="btn-refresh-health"
          onClick={() => { loadHealth(); loadIncidents(); }}
        >
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* ── Critical banner ── */}
      {sys.critical_incidents > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-r-xl p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">
              {sys.critical_incidents} CRITICAL incident{sys.critical_incidents !== 1 ? 's' : ''} in the last 24 hours
            </p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-0.5">
              Scroll to the incident list below to review and update status.
            </p>
          </div>
        </div>
      )}

      {/* ── SYSTEM ── */}
      <section id="section-system">
        <h2 className="text-base font-semibold text-secondary-700 dark:text-secondary-300 uppercase tracking-wide mb-3">System</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Operational errors" value={sys.operational_errors_24h} icon={AlertCircle} alert />
          <MetricCard label="AI failures" value={sys.ai_failures_24h} icon={Sparkles} alert />
          <MetricCard label="Auth failures" value={sys.auth_failures_24h} icon={ShieldAlert} alert />
          <MetricCard label="DB errors" value={sys.db_errors_24h} icon={Database} alert />
          <MetricCard label="Critical incidents" value={sys.critical_incidents} icon={XCircle} alert />
          <MetricCard label="Open incidents" value={sys.open_incidents} icon={Clock} alert />
        </div>
      </section>

      {/* ── CUSTOMER FLOW ── */}
      <section id="section-customer-flow">
        <h2 className="text-base font-semibold text-secondary-700 dark:text-secondary-300 uppercase tracking-wide mb-3">Customer Flow</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <MetricCard label="QR scans" value={cf.qr_scans} icon={QrCode} />
          <MetricCard label="Review sessions" value={cf.review_sessions} icon={Activity} />
          <MetricCard label="AI generations" value={cf.ai_generations} icon={Sparkles} />
          <MetricCard
            label="AI failures"
            value={cf.ai_generation_failures}
            icon={AlertTriangle}
            alert
            subtext={
              cf.ai_failure_rate_pct !== null
                ? `${cf.ai_failure_rate_pct}% failure rate`
                : (cf.ai_generations === 0 && cf.ai_generation_failures === 0)
                  ? 'No AI generations'
                  : undefined
            }
          />
          <MetricCard label="Review copies" value={cf.review_copies} icon={Copy} />
          <MetricCard label="Google page opens" value={cf.google_page_opens} icon={ExternalLink} />
          <MetricCard label="Private feedback" value={cf.private_feedback_submitted} icon={MessageSquare} />
        </div>

        {cf.ai_generations === 0 && cf.ai_generation_failures === 0 && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            No AI generations recorded in the last 24 hours.
          </p>
        )}
      </section>

      {/* ── BUSINESSES ── */}
      <section id="section-businesses">
        <h2 className="text-base font-semibold text-secondary-700 dark:text-secondary-300 uppercase tracking-wide mb-3">Businesses</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard label="Total" value={biz.total} icon={Building2} />
          <MetricCard label="Newly onboarded (24h)" value={biz.newly_onboarded_24h} icon={Building2} />
          <MetricCard label="Setup incomplete" value={biz.setup_incomplete} icon={AlertTriangle} alert />
          <MetricCard label="Active in window" value={biz.active_in_window} icon={Zap} />
          <MetricCard label="No recent activity" value={biz.no_recent_activity} icon={Clock} />
        </div>
      </section>

      {/* ── FEEDBACK + SUBSCRIPTIONS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card id="section-feedback">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-secondary-500">New in last 24h</span>
              <span className="font-semibold text-secondary-900 dark:text-white">{data.feedback.new_24h}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary-500">Open (unresolved)</span>
              <span className={cn('font-semibold', data.feedback.open_total > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-secondary-900 dark:text-white')}>
                {data.feedback.open_total}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary-500">Under review</span>
              <span className="font-semibold text-secondary-900 dark:text-white">{data.feedback.reviewing}</span>
            </div>
            <Link href="/admin/feedback" className="text-xs text-primary-500 hover:underline flex items-center gap-1 mt-1">
              Manage feedback <ArrowRight className="w-3 h-3" />
            </Link>
          </CardContent>
        </Card>

        <Card id="section-subscriptions">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-secondary-500">Pending upgrade requests</span>
              <span className={cn('font-semibold', data.subscriptions.pending_upgrade_requests > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-secondary-900 dark:text-white')}>
                {data.subscriptions.pending_upgrade_requests}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary-500">Near usage limit (≥ 80%)</span>
              <span className={cn('font-semibold', data.subscriptions.businesses_near_limit > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-secondary-900 dark:text-white')}>
                {data.subscriptions.businesses_near_limit}
              </span>
            </div>
            <Link href="/admin/upgrade-requests" className="text-xs text-primary-500 hover:underline flex items-center gap-1 mt-1">
              Manage upgrade requests <ArrowRight className="w-3 h-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* ── 24H COMPARISON ── */}
      <Card id="section-comparison">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">24-Hour Comparison</CardTitle>
          <CardDescription>
            Current 24h vs. previous 24h. Absolute deltas only — percentages are suppressed when the previous period had zero events.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary-400 mb-2">Customer flow</p>
            <ComparisonRow label="QR scans"         current={cur.qr_scans}          previous={prv.qr_scans} />
            <ComparisonRow label="Review sessions"  current={cur.review_sessions}    previous={prv.review_sessions} />
            <ComparisonRow label="AI generations"   current={cur.ai_generations}     previous={prv.ai_generations} />
            <ComparisonRow label="Review copies"    current={cur.review_copies}      previous={prv.review_copies} />
            <ComparisonRow label="Google page opens" current={cur.google_page_opens} previous={prv.google_page_opens} />
          </div>
          <div className="mt-5 md:mt-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary-400 mb-2">Errors</p>
            <ComparisonRow label="Operational errors" current={cur.operational_errors} previous={prv.operational_errors} />
            <ComparisonRow label="AI failures"        current={cur.ai_failures}        previous={prv.ai_failures} />
            <ComparisonRow label="Auth failures"      current={cur.auth_failures}      previous={prv.auth_failures} />
            <ComparisonRow label="DB errors"          current={cur.db_errors}          previous={prv.db_errors} />
          </div>
        </CardContent>
      </Card>

      {/* ── INCIDENT LIST ── */}
      <section id="section-incidents">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-secondary-900 dark:text-white">Operational Incidents</h2>
            <p className="text-xs text-secondary-500 mt-0.5">
              {incLoading ? 'Loading…' : `${openIncidentCount} open · ${incidents.length} total tracked`}
            </p>
          </div>
          <Link href="/admin/pilot" className="text-xs text-primary-500 hover:underline flex items-center gap-1">
            Pilot control center <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {incLoading ? (
          <div className="flex items-center gap-2 text-secondary-500 text-sm p-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading incidents…
          </div>
        ) : incidents.length === 0 ? (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-center gap-3 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            No incidents recorded. System is clean.
          </div>
        ) : (
          <div className="space-y-2">
            {displayedIncidents.map(inc => (
              <IncidentRow key={inc.id} incident={inc} onUpdate={handleUpdate} />
            ))}
            {incidents.length > 10 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(v => !v)}
                id="btn-show-all-incidents"
                className="w-full text-xs text-secondary-500"
              >
                {showAll ? 'Show fewer' : `Show all ${incidents.length} incidents`}
              </Button>
            )}
          </div>
        )}
      </section>

      {/* ── NOTICE ── */}
      <div className="bg-secondary-50 dark:bg-secondary-900/50 border border-border rounded-xl p-4 flex gap-3 text-sm text-secondary-600 dark:text-secondary-400">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
        <p>{data.notice}</p>
      </div>
    </div>
  );
}

