'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  ArrowLeft,
  Calendar,
  CreditCard,
  Mail,
  Phone,
  Globe,
  MapPin,
  ExternalLink,
  QrCode,
  Sparkles,
  MessageSquare,
  TrendingUp,
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Shield,
  Layers,
  User,
  UserCheck,
  UserX,
  AlertTriangle,
  Clock,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { formatNumber, cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

export default function AdminClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [data, setData] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'usage' | 'activity'>('profile');

  // Deactivation confirmation modal state
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const fetchClientData = async (isRef = false) => {
    try {
      if (isRef) setIsRefreshing(true);
      else setIsLoading(true);

      const [detailRes, funnelRes] = await Promise.all([
        api.get<{ data: any }>(`/admin/clients/${clientId}`),
        api.get<{ data: any }>(`/admin/funnel?business_id=${clientId}`),
      ]);

      setData(detailRes.data);
      setFunnel(funnelRes.data);
    } catch (e) {
      console.error('Error fetching client details:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (clientId) fetchClientData();
  }, [clientId]);

  // Activate / Deactivate handlers
  const handleConfirmDeactivate = async () => {
    const targetUserId = data?.user?.id || clientId;
    try {
      setIsProcessingAction(true);
      await api.post(`/admin/users/${targetUserId}/deactivate`, {
        reason: 'Deactivated by Platform Administrator',
      });
      toast.success('User account has been deactivated.');
      setShowDeactivateModal(false);
      fetchClientData(true);
    } catch (err: any) {
      console.error('Failed to deactivate user:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to deactivate user.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleActivateUser = async () => {
    const targetUserId = data?.user?.id || clientId;
    try {
      setIsProcessingAction(true);
      await api.post(`/admin/users/${targetUserId}/activate`, {});
      toast.success('User account has been activated.');
      fetchClientData(true);
    } catch (err: any) {
      console.error('Failed to activate user:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to activate user.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        <p className="text-sm">Loading client profile &amp; usage...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white">Client Not Found</h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">No client record found matching ID {clientId}.</p>
        <Link href="/admin/clients">
          <Button variant="outline" size="sm" className="border-slate-800 text-slate-300">
            Back to Clients
          </Button>
        </Link>
      </div>
    );
  }

  const user = data.user || {
    id: data.user_id || clientId,
    full_name: data.owner_name || data.name || 'Business Owner',
    email: data.owner_email || 'No email',
    role: 'business_owner',
    email_verified: true,
    account_status: data.status === 'suspended' ? 'deactivated' : 'active',
    created_at: data.created_at,
  };

  const isDeactivated = user.account_status === 'deactivated';
  const businesses = data.businesses || [];
  const usage = data.usage || {
    qr: { total_qr_codes: 0, active_qr_codes: 0, total_scans: data.total_scans || 0 },
    review_flow: {
      sessions: data.total_sessions || 0,
      ratings_submitted: data.total_sessions || 0,
      tags_selected: 0,
      text_submissions: 0,
      ai_drafts_generated: data.total_drafts || 0,
      reviews_edited: 0,
      copy_events: 0,
      google_continue_events: data.google_continue_events || 0,
      private_feedback: 0,
    },
    ai: { total_generations: data.total_drafts || 0, regenerations: 0, failed_generations: 0, avg_latency_ms: 0 },
    subscription: { current_plan: 'free', status: 'inactive' },
  };

  const recentActivity = data.recent_activity || [];

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/clients">
            <Button variant="outline" size="icon" className="h-9 w-9 border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">{user.full_name}</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {businesses.length} {businesses.length === 1 ? 'business' : 'businesses'}
              </span>
              <span className={cn('px-2.5 py-0.5 text-[11px] font-semibold rounded-full border', !isDeactivated ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20')}>
                {!isDeactivated ? 'Active Account' : 'Deactivated'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{user.email} &bull; ID: {user.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user.role === 'admin' ? (
            <span className="px-3 py-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Protected Admin
            </span>
          ) : isDeactivated ? (
            <Button
              size="sm"
              onClick={handleActivateUser}
              disabled={isProcessingAction}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 rounded-xl"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Activate User</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeactivateModal(true)}
              disabled={isProcessingAction}
              className="border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs gap-1.5 rounded-xl"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Deactivate User</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchClientData(true)}
            disabled={isRefreshing}
            className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs gap-1.5 rounded-xl"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('profile')}
          className={cn(
            'px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors',
            activeTab === 'profile'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          User Profile &amp; Businesses ({businesses.length})
        </button>
        <button
          onClick={() => setActiveTab('usage')}
          className={cn(
            'px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors',
            activeTab === 'usage'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          Aggregated Usage &amp; Funnel
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={cn(
            'px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors',
            activeTab === 'activity'
              ? 'border-primary-500 text-primary-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          Recent Activity ({recentActivity.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* User Account Information Card */}
            <Card className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <CardHeader className="p-5 border-b border-slate-800/80">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-primary-400" />
                  <span>User Account Information</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3.5 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Full Name</span>
                  <span className="font-semibold text-white">{user.full_name}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Email Address</span>
                  <span className="font-mono text-slate-200">{user.email}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Account Status</span>
                  <span className={cn('px-2 py-0.5 rounded font-semibold text-[11px]', !isDeactivated ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20')}>
                    {!isDeactivated ? 'Active' : 'Deactivated'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">User Role</span>
                  <span className="font-medium text-slate-200 capitalize">{user.role}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Email Verification</span>
                  <span className="text-emerald-400 font-medium">{user.email_verified ? 'Verified' : 'Pending'}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Account Created</span>
                  <span className="text-slate-300">{new Date(user.created_at).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Last Login</span>
                  <span className="text-slate-300">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never logged in'}</span>
                </div>
              </CardContent>
            </Card>

            {/* Platform Overview Summary Card */}
            <Card className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <CardHeader className="p-5 border-b border-slate-800/80">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>Platform Overview</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3.5 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Total Businesses Owned</span>
                  <span className="font-bold text-white text-sm">{businesses.length}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Total QR Scans (All Businesses)</span>
                  <span className="font-mono font-medium text-slate-200">{formatNumber(usage.qr.total_scans)}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Total Customer Review Sessions</span>
                  <span className="font-mono font-medium text-slate-200">{formatNumber(usage.review_flow.sessions)}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">AI Draft Reviews Generated</span>
                  <span className="font-mono font-medium text-slate-200">{formatNumber(usage.ai.total_generations)}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Google Review Continues</span>
                  <span className="font-mono font-medium text-emerald-400">{formatNumber(usage.review_flow.google_continue_events)}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Subscription Status</span>
                  <span className="capitalize font-medium text-indigo-300">{usage.subscription.status} ({usage.subscription.current_plan})</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Owned Businesses List (Multi-Business Hierarchy) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary-400" />
                  <span>Businesses Owned by {user.full_name}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Individual business locations, operational statuses, and dedicated customer review performance.
                </p>
              </div>
              <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 rounded-full">
                {businesses.length} total
              </span>
            </div>

            {businesses.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                This user has not registered any businesses yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {businesses.map((b: any, idx: number) => (
                  <div key={b.id} className="py-4 first:pt-2 last:pb-2 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-[11px] font-mono text-slate-400">
                          {idx + 1}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <span>{b.name}</span>
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                              {b.category_name || b.category}
                            </span>
                            <span className={cn('px-2 py-0.5 text-[10px] font-medium rounded border', b.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700')}>
                              {b.status}
                            </span>
                          </h4>
                          <span className="text-[11px] text-slate-500 font-mono">Slug: {b.slug} &bull; ID: {b.id}</span>
                        </div>
                      </div>

                      {b.google_review_url && (
                        <a
                          href={b.google_review_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary-400 hover:text-primary-300 transition-colors"
                        >
                          <span>Google Review URL</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {/* Business Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs">
                      <div>
                        <span className="block text-[10px] uppercase tracking-wider text-slate-500">QR Scans</span>
                        <span className="font-mono font-semibold text-slate-200">{formatNumber(b.stats?.scans || 0)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wider text-slate-500">Review Sessions</span>
                        <span className="font-mono font-semibold text-slate-200">{formatNumber(b.stats?.sessions || 0)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wider text-slate-500">AI Drafts</span>
                        <span className="font-mono font-semibold text-slate-200">{formatNumber(b.stats?.drafts || 0)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wider text-slate-500">Google Continues</span>
                        <span className="font-mono font-semibold text-emerald-400">{formatNumber(b.stats?.google_continues || 0)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wider text-slate-500">Plan Tier</span>
                        <span className="font-medium text-indigo-300 capitalize">{b.plan || 'Free'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Aggregated Usage & Funnel */}
      {activeTab === 'usage' && (
        <div className="space-y-6">
          {/* Usage Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block mb-1">
                QR Codes &amp; Scans
              </span>
              <div className="text-2xl font-extrabold text-white font-mono">
                {formatNumber(usage.qr.total_scans)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {usage.qr.total_qr_codes} codes created ({usage.qr.active_qr_codes} active)
              </p>
            </Card>

            <Card className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block mb-1">
                Customer Flow Sessions
              </span>
              <div className="text-2xl font-extrabold text-white font-mono">
                {formatNumber(usage.review_flow.sessions)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {usage.review_flow.ratings_submitted} ratings &bull; {usage.review_flow.tags_selected} tags
              </p>
            </Card>

            <Card className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block mb-1">
                AI Reviews Generated
              </span>
              <div className="text-2xl font-extrabold text-white font-mono">
                {formatNumber(usage.ai.total_generations)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {usage.ai.regenerations} regenerations &bull; {usage.ai.avg_latency_ms}ms avg latency
              </p>
            </Card>

            <Card className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block mb-1">
                Google Review Continues
              </span>
              <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                {formatNumber(usage.review_flow.google_continue_events)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {usage.review_flow.private_feedback} private feedback events
              </p>
            </Card>
          </div>

          {/* Funnel Visualizer */}
          {funnel?.stages && (
            <Card className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-400" />
                <span>Customer Review Flow Funnel</span>
              </h3>
              <div className="space-y-3">
                {funnel.stages.map((st: any, i: number) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">{st.name}</span>
                      <span className="text-slate-400 font-mono">{formatNumber(st.count)} ({st.conversion_pct}%)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary-500 to-indigo-500 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(2, st.conversion_pct))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Tab 3: Recent Activity */}
      {activeTab === 'activity' && (
        <Card className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-400" />
              <span>Activity Timeline</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">{recentActivity.length} recent events</span>
          </div>

          {recentActivity.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No recent audit activity logged for this user.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {recentActivity.map((log: any) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-white">{log.action}</span>
                    <p className="text-[11px] text-slate-400">
                      Resource: <span className="font-mono text-slate-300">{log.resource_type} ({log.resource_id})</span>
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Deactivation Confirmation Modal */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white">Deactivate this user?</h3>
                <p className="text-xs text-slate-400 mt-1">
                  The user <span className="font-semibold text-slate-200">{user.email}</span> will no longer be able to use protected ReviewAI functionality.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-400 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Historical Data Preservation</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                All {businesses.length} businesses, customer review history, QR codes, scans, and analytics will remain completely intact. You can reactivate this account at any time.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeactivateModal(false)}
                disabled={isProcessingAction}
                className="border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmDeactivate}
                disabled={isProcessingAction}
                className="bg-red-600 hover:bg-red-500 text-white text-xs gap-1.5"
              >
                {isProcessingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Deactivate User</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
