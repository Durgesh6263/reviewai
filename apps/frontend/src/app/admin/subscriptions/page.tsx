'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Filter, MoreVertical, CreditCard, Loader2, Trash2, Edit, Eye, Calendar, AlertCircle, CheckCircle, XCircle, Clock, IndianRupee, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api-client';
import { formatDate, formatCurrency, formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { PlanAndTrialManagement } from '@/components/subscription/PlanAndTrialManagement';
import { AdminActivationRequests } from '@/components/subscription/AdminActivationRequests';

interface Subscription {
  id: string;
  business_id: string;
  business_name: string;
  business_slug: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  plan: string;
  plan_name?: string;
  plan_version_id?: string;
  duration?: string;
  status: string;
  display_status?: string;
  is_active?: boolean;
  days_remaining?: number;
  monthly_qr_limit?: number;
  monthly_ai_limit?: number;
  current_month_qr_used?: number;
  current_month_ai_used?: number;
  current_month_qr_remaining?: number;
  current_month_ai_remaining?: number;
  next_monthly_reset?: string;
  current_period_index?: number;
  total_qr_quota?: number;
  used_qr?: number;
  remaining_qr?: number;
  total_ai_quota?: number;
  used_ai?: number;
  remaining_ai?: number;
  exhaustion_reason?: string | null;
  exhaustion_message?: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string;
  current_period_end: string;
  start_date?: string;
  end_date?: string;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  quantity: number;
  monthly_price: number;
  price_paid?: number;
  features: Record<string, any>;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  payment_status?: string | null;
  payment_date?: string | null;
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

interface UserSubscriptionUsage {
  user_id: string;
  user_name: string;
  email: string;
  business_count: number;
  plan: string;
  duration: string;
  subscription_status: string;
  monthly_qr_limit: number;
  qr_used: number;
  qr_remaining: number;
  qr_usage_percent: number;
  monthly_ai_limit: number;
  ai_used: number;
  ai_remaining: number;
  ai_usage_percent: number;
  expiry_date: string | null;
  businesses?: any[];
}

interface SubscriptionStats {
  total_subscriptions: number;
  active_subscriptions: number;
  past_due_subscriptions: number;
  canceled_subscriptions: number;
  trialing_subscriptions: number;
  mrr: number;
  arr: number;
  plan_distribution: { plan: string; count: number }[];
  status_distribution: { status: string; count: number }[];
  user_subscriptions?: UserSubscriptionUsage[];
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'past_due' | 'canceled' | 'trialing'>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'requests' | 'overview' | 'plans'>('list');

  // Overview Tab: User Subscription Usage Search & Filters
  const [overviewSearch, setOverviewSearch] = useState('');
  const [debouncedOverviewSearch, setDebouncedOverviewSearch] = useState('');
  const [overviewPlanFilter, setOverviewPlanFilter] = useState('all');
  const [overviewStatusFilter, setOverviewStatusFilter] = useState('all');

  // Debounce overview search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedOverviewSearch(overviewSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [overviewSearch]);

  const fetchSubscriptions = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
      });
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (planFilter !== 'all') params.append('plan', planFilter);

      const statsParams = new URLSearchParams();
      if (debouncedOverviewSearch.trim()) statsParams.append('search', debouncedOverviewSearch.trim());
      if (overviewPlanFilter !== 'all') statsParams.append('plan', overviewPlanFilter);
      if (overviewStatusFilter !== 'all') statsParams.append('status', overviewStatusFilter);

      const [subsResponse, statsResponse] = await Promise.all([
        api.get<PaginatedResponse<Subscription>>(`/admin/subscriptions?${params.toString()}`),
        api.get<{ data: SubscriptionStats }>(`/admin/subscriptions/stats${statsParams.toString() ? '?' + statsParams.toString() : ''}`),
      ]);

      setSubscriptions(subsResponse.data);
      setTotalPages(subsResponse.meta.total_pages);
      setTotalCount(subsResponse.meta.total);
      setStats(statsResponse.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load subscriptions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [currentPage, searchQuery, statusFilter, planFilter, debouncedOverviewSearch, overviewPlanFilter, overviewStatusFilter]);

  const handleCancel = async (id: string, businessName: string) => {
    if (!confirm(`Are you sure you want to cancel the subscription for "${businessName}"? This will take effect at the end of the billing period.`)) {
      return;
    }

    setUpdatingId(id);
    try {
      await api.post(`/admin/subscriptions/${id}/cancel`);
      toast.success('Subscription cancellation scheduled');
      fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to cancel subscription');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleReactivate = async (id: string, businessName: string) => {
    if (!confirm(`Reactivate subscription for "${businessName}"?`)) {
      return;
    }

    setUpdatingId(id);
    try {
      await api.post(`/admin/subscriptions/${id}/reactivate`);
      toast.success('Subscription reactivated');
      fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to reactivate subscription');
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePlanChange = async (id: string, newPlan: string) => {
    setUpdatingId(id);
    try {
      await api.patch(`/admin/subscriptions/${id}`, { plan: newPlan });
      toast.success('Plan updated successfully');
      fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update plan');
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'ACTIVE') {
      return <Badge className="bg-green-600 text-white hover:bg-green-600">ACTIVE</Badge>;
    }
    if (s === 'FREE_TRIAL' || s === 'TRIALING') {
      return <Badge className="bg-blue-600 text-white hover:bg-blue-600">FREE_TRIAL</Badge>;
    }
    if (s === 'QR_QUOTA_EXHAUSTED') {
      return <Badge className="bg-red-600 text-white hover:bg-red-600">QR_QUOTA_EXHAUSTED</Badge>;
    }
    if (s === 'AI_QUOTA_EXHAUSTED') {
      return <Badge className="bg-red-600 text-white hover:bg-red-600">AI_QUOTA_EXHAUSTED</Badge>;
    }
    if (s === 'EXPIRED') {
      return <Badge className="bg-amber-600 text-white hover:bg-amber-600">EXPIRED</Badge>;
    }
    if (s === 'CANCELED') {
      return <Badge variant="secondary">CANCELED</Badge>;
    }
    if (s === 'SUSPENDED') {
      return <Badge className="bg-red-800 text-white hover:bg-red-800">SUSPENDED</Badge>;
    }
    return (
      <Badge variant="secondary">
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getPlanBadge = (plan: string) => {
    const p = (plan || '').toLowerCase();
    if (p.includes('unlimited')) {
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Unlimited</Badge>;
    }
    if (p.includes('pro') || p.includes('professional')) {
      return <Badge className="bg-purple-600 text-white hover:bg-purple-600">Pro</Badge>;
    }
    if (p.includes('base') || p.includes('starter')) {
      return <Badge className="bg-blue-600 text-white hover:bg-blue-600">Base</Badge>;
    }
    if (p.includes('free') || p.includes('trial')) {
      return <Badge variant="secondary">Free Trial</Badge>;
    }
    return (
      <Badge variant="secondary">
        {plan.charAt(0).toUpperCase() + plan.slice(1)}
      </Badge>
    );
  };

  const isPastDue = (status: string, endDate: string) => {
    return status === 'active' && new Date(endDate) < new Date();
  };

  const daysUntilRenewal = (endDate: string) => {
    const diff = new Date(endDate).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Subscription Management</h1>
            <p className="text-secondary-600 dark:text-secondary-400">Manage all subscriptions and billing</p>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Subscription Management</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage all subscriptions and billing</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/upgrade-requests">
            <Button variant="outline" className="flex items-center gap-2 border-primary-500/40 hover:border-primary-500 text-primary-600 dark:text-primary-400">
              <Clock className="h-4 w-4 text-amber-500" />
              <span>Client Activation Requests</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'list' | 'requests' | 'overview' | 'plans')} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="list">All Subscriptions</TabsTrigger>
            <TabsTrigger value="requests">Activation Requests</TabsTrigger>
            <TabsTrigger value="plans">Plans & Free Trial</TabsTrigger>
            <TabsTrigger value="overview">Overview & Analytics</TabsTrigger>
          </TabsList>

          {/* Activation Requests Tab */}
          <TabsContent value="requests" className="space-y-6">
            <AdminActivationRequests />
          </TabsContent>

          {/* Plans & Free Trial Configuration Tab */}
          <TabsContent value="plans" className="space-y-6">
            <PlanAndTrialManagement />
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">MRR</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatCurrency(stats.mrr)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20">
                      <IndianRupee className="h-6 w-6 text-green-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">ARR</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatCurrency(stats.arr)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                      <TrendingUp className="h-6 w-6 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Active Subscriptions</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatNumber(stats.active_subscriptions)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20">
                      <CheckCircle className="h-6 w-6 text-purple-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Total Subscriptions</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatNumber(stats.total_subscriptions)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20">
                      <Users className="h-6 w-6 text-orange-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Plan User Count</CardTitle>
                  <CardDescription className="text-xs text-secondary-500">Users on each plan (each user counted once)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.plan_distribution.map((item) => {
                      const totalUsers = stats.plan_distribution.reduce((acc, p) => acc + p.count, 0) || 1;
                      const percentage = (item.count / totalUsers) * 100;
                      return (
                        <div key={item.plan} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-2 font-medium">
                              {getPlanBadge(item.plan)}
                              <span>{item.plan}</span>
                            </span>
                            <span className="text-secondary-500 font-mono text-xs">
                              {item.plan} — {item.count} {item.count === 1 ? 'user' : 'users'} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Status Distribution</CardTitle>
                  <CardDescription className="text-xs text-secondary-500">User account subscription statuses</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.status_distribution.map((item) => {
                      const totalStatusUsers = stats.status_distribution.reduce((acc, s) => acc + s.count, 0) || 1;
                      const percentage = (item.count / totalStatusUsers) * 100;
                      return (
                        <div key={item.status} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-2 font-medium">
                              {getStatusBadge(item.status)}
                              <span>{item.status.replace('_', ' ')}</span>
                            </span>
                            <span className="text-secondary-500 font-mono text-xs">
                              {item.status} — {item.count} {item.count === 1 ? 'user' : 'users'} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* User Subscription Usage Section */}
            <div className="space-y-4 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-secondary-900 dark:text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary-500" />
                    User Subscription Usage
                  </h3>
                  <p className="text-secondary-500 text-xs mt-0.5">
                    User-wise monthly quotas, current usage, percentages, and subscription status.
                  </p>
                </div>

                {/* Search & Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary-400" />
                    <Input
                      placeholder="Search name, email, business..."
                      value={overviewSearch}
                      onChange={(e) => setOverviewSearch(e.target.value)}
                      className="pl-8 h-9 text-xs"
                    />
                  </div>

                  <Select value={overviewPlanFilter} onValueChange={setOverviewPlanFilter}>
                    <SelectTrigger className="w-[125px] h-9 text-xs">
                      <SelectValue placeholder="All Plans" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Plans</SelectItem>
                      <SelectItem value="base">Base</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="unlimited">Unlimited</SelectItem>
                      <SelectItem value="free_trial">Free Trial</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={overviewStatusFilter} onValueChange={setOverviewStatusFilter}>
                    <SelectTrigger className="w-[130px] h-9 text-xs">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="active">ACTIVE</SelectItem>
                      <SelectItem value="free_trial">FREE_TRIAL</SelectItem>
                      <SelectItem value="expired">EXPIRED</SelectItem>
                      <SelectItem value="canceled">CANCELED</SelectItem>
                      <SelectItem value="suspended">SUSPENDED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Table Card */}
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-secondary-700 dark:text-secondary-300">
                    <thead className="bg-secondary-50 dark:bg-secondary-800/60 border-b border-border text-secondary-500 font-semibold uppercase text-[11px] tracking-wider">
                      <tr>
                        <th className="px-4 py-3.5">User</th>
                        <th className="px-4 py-3.5">Businesses</th>
                        <th className="px-4 py-3.5">Plan</th>
                        <th className="px-4 py-3.5">Duration</th>
                        <th className="px-4 py-3.5">Status</th>
                        <th className="px-4 py-3.5 min-w-[170px]">Monthly QR Quota</th>
                        <th className="px-4 py-3.5 min-w-[170px]">Monthly AI Quota</th>
                        <th className="px-4 py-3.5">Expiry Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-normal">
                      {!stats?.user_subscriptions || stats.user_subscriptions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-10 text-center text-secondary-500">
                            {overviewSearch || overviewPlanFilter !== 'all' || overviewStatusFilter !== 'all'
                              ? 'No users match the search/filter criteria.'
                              : 'No user subscriptions available.'}
                          </td>
                        </tr>
                      ) : (
                        stats.user_subscriptions.map((u) => {
                          return (
                            <tr key={u.user_id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/40 transition-colors">
                              {/* User Name & Email */}
                              <td className="px-4 py-3.5">
                                <div className="font-medium text-secondary-900 dark:text-white">{u.user_name}</div>
                                <div className="text-secondary-500 text-[11px]">{u.email}</div>
                              </td>

                              {/* Business Count */}
                              <td className="px-4 py-3.5">
                                <Badge variant="outline" className="text-[11px]">
                                  {u.business_count} {u.business_count === 1 ? 'business' : 'businesses'}
                                </Badge>
                              </td>

                              {/* Plan */}
                              <td className="px-4 py-3.5">
                                {getPlanBadge(u.plan)}
                              </td>

                              {/* Duration */}
                              <td className="px-4 py-3.5 font-medium text-secondary-800 dark:text-secondary-200">
                                {u.duration}
                              </td>

                              {/* Subscription Status */}
                              <td className="px-4 py-3.5">
                                {getStatusBadge(u.subscription_status)}
                              </td>

                              {/* Monthly QR Limit / Used / Usage % */}
                              <td className="px-4 py-3.5">
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="font-semibold text-secondary-900 dark:text-white">
                                      {u.qr_used} / {u.monthly_qr_limit === -1 ? '∞' : u.monthly_qr_limit}
                                    </span>
                                    <span className="font-bold text-primary-600 dark:text-primary-400 text-[11px]">
                                      {u.qr_usage_percent}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-secondary-200 dark:bg-secondary-700 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-1.5 rounded-full transition-all duration-300 ${
                                        u.qr_usage_percent >= 90
                                          ? 'bg-rose-500'
                                          : u.qr_usage_percent >= 75
                                          ? 'bg-amber-500'
                                          : 'bg-primary-500'
                                      }`}
                                      style={{ width: `${Math.min(100, u.qr_usage_percent)}%` }}
                                    />
                                  </div>
                                  <div className="text-[10px] text-secondary-500">
                                    {u.monthly_qr_limit === -1 ? 'Unlimited' : `${u.qr_remaining} remaining`}
                                  </div>
                                </div>
                              </td>

                              {/* Monthly AI Limit / Used / Usage % */}
                              <td className="px-4 py-3.5">
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="font-semibold text-secondary-900 dark:text-white">
                                      {u.ai_used} / {u.monthly_ai_limit === -1 ? '∞' : u.monthly_ai_limit}
                                    </span>
                                    <span className="font-bold text-amber-600 dark:text-amber-400 text-[11px]">
                                      {u.ai_usage_percent}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-secondary-200 dark:bg-secondary-700 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-1.5 rounded-full transition-all duration-300 ${
                                        u.ai_usage_percent >= 90
                                          ? 'bg-rose-500'
                                          : u.ai_usage_percent >= 75
                                          ? 'bg-amber-500'
                                          : 'bg-amber-500'
                                      }`}
                                      style={{ width: `${Math.min(100, u.ai_usage_percent)}%` }}
                                    />
                                  </div>
                                  <div className="text-[10px] text-secondary-500">
                                    {u.monthly_ai_limit === -1 ? 'Unlimited' : `${u.ai_remaining} remaining`}
                                  </div>
                                </div>
                              </td>

                              {/* Expiry Date */}
                              <td className="px-4 py-3.5 text-secondary-600 dark:text-secondary-400 text-[11px] whitespace-nowrap">
                                {u.expiry_date
                                  ? new Date(u.expiry_date).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })
                                  : '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* List Tab */}
          <TabsContent value="list" className="space-y-6">
            {/* Search and Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
                    <Input
                      placeholder="Search subscriptions..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Select value={statusFilter} onValueChange={(v: 'all' | 'active' | 'past_due' | 'canceled' | 'trialing') => { setStatusFilter(v); setCurrentPage(1); }}>
                      <SelectTrigger className="w-full sm:w-40">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="past_due">Past Due</SelectItem>
                        <SelectItem value="canceled">Canceled</SelectItem>
                        <SelectItem value="trialing">Trialing</SelectItem>
                        <SelectItem value="incomplete">Incomplete</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={planFilter} onValueChange={(v: string) => { setPlanFilter(v); setCurrentPage(1); }}>
                      <SelectTrigger className="w-full sm:w-40">
                        <SelectValue placeholder="All plans" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Plans</SelectItem>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subscriptions Table */}
            <Card>
              <CardContent className="pt-0">
                {subscriptions.length === 0 ? (
                  <div className="text-center py-12">
                    <CreditCard className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No subscriptions found</h3>
                    <p className="text-secondary-500 dark:text-secondary-400">
                      {searchQuery || statusFilter !== 'all' || planFilter !== 'all' ? 'Try adjusting your search or filters' : 'No subscriptions in the system yet'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full" role="table">
                        <thead>
                          <tr className="border-b border-border bg-secondary-50 dark:bg-secondary-800/50">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Business</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Client</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Plan</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Period & Next Reset</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Monthly QR (Limit / Used / Rem)</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Monthly AI (Limit / Used / Rem)</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {subscriptions.map((sub) => {
                            const daysLeft = sub.days_remaining !== undefined ? sub.days_remaining : daysUntilRenewal(sub.current_period_end);

                            return (
                              <tr key={sub.id} className={cn('hover:bg-secondary-50 dark:hover:bg-secondary-800/50', sub.status === 'canceled' && 'opacity-50')}>
                                <td className="px-4 py-4">
                                  <div>
                                    <Link href={`/admin/businesses/${sub.business_id}`} className="font-medium text-secondary-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                                      {sub.business_name}
                                    </Link>
                                    <p className="text-sm text-secondary-500 dark:text-secondary-400 font-mono text-xs">
                                      /r/{sub.business_slug}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src="" alt={sub.owner_name} />
                                      <AvatarFallback className="text-xs">
                                        {sub.owner_name ? sub.owner_name.charAt(0).toUpperCase() : 'U'}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-sm font-medium text-secondary-900 dark:text-white">{sub.owner_name}</p>
                                      <p className="text-xs text-secondary-500 dark:text-secondary-400">{sub.owner_email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <div className="space-y-0.5">
                                    <div className="font-semibold text-sm text-secondary-900 dark:text-white flex items-center justify-between">
                                      <span>{sub.plan_name || (sub.plan ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : 'Base')}</span>
                                      {sub.price_paid !== undefined && sub.price_paid > 0 && (
                                        <span className="text-xs font-mono font-bold text-primary-600 dark:text-primary-400">
                                          ₹{sub.price_paid}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-secondary-500">
                                      {sub.duration ? sub.duration.replace('_', ' ') : '6 Months'}
                                      {sub.plan_version_id && ` • ${sub.plan_version_id}`}
                                    </p>
                                    {sub.razorpay_payment_id && (
                                      <div className="text-[10px] font-mono text-secondary-500 pt-0.5 space-y-0.5">
                                        <div className="truncate max-w-[200px]" title={sub.razorpay_payment_id}>
                                          RZP: <span className="font-semibold text-secondary-700 dark:text-secondary-300">{sub.razorpay_payment_id}</span>
                                        </div>
                                        {sub.razorpay_order_id && (
                                          <div className="truncate max-w-[200px] text-secondary-400" title={sub.razorpay_order_id}>
                                            Ord: {sub.razorpay_order_id}
                                          </div>
                                        )}
                                        <div className="flex items-center gap-1 text-[9px]">
                                          <Badge variant="outline" className="text-[9px] py-0 px-1 border-blue-400 text-blue-600 dark:text-blue-400">
                                            {sub.payment_status || 'PAID'}
                                          </Badge>
                                          {sub.payment_date && <span>{formatDate(sub.payment_date)}</span>}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  {getStatusBadge(sub.status)}
                                </td>
                                <td className="px-4 py-4 text-xs">
                                  <div className="font-medium text-secondary-900 dark:text-white">
                                    {formatDate(sub.current_period_start || sub.start_date || '')} – {formatDate(sub.current_period_end || sub.end_date || '')}
                                  </div>
                                  <div className="text-[11px] text-primary-600 dark:text-primary-400 mt-0.5 font-medium">
                                    Reset: {sub.next_monthly_reset ? formatDate(sub.next_monthly_reset) : 'None'}
                                  </div>
                                  <div className="text-[10px] text-secondary-500 mt-0.5">
                                    Expiry: {formatDate(sub.end_date || sub.current_period_end || '')} ({daysLeft > 0 ? `${daysLeft}d left` : 'Expired'})
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-xs font-mono">
                                  <span className="font-semibold text-secondary-900 dark:text-white">
                                    {(sub.monthly_qr_limit ?? sub.total_qr_quota) === -1 ? 'Unlimited' : `${formatNumber(sub.monthly_qr_limit ?? sub.total_qr_quota ?? 0)} / mo`}
                                  </span>
                                  <p className="text-[11px] text-secondary-500 font-sans">
                                    {(sub.monthly_qr_limit ?? sub.total_qr_quota) === -1 
                                      ? 'Unlimited remaining' 
                                      : `${formatNumber(sub.current_month_qr_used ?? sub.used_qr ?? 0)} used | ${formatNumber(sub.current_month_qr_remaining ?? sub.remaining_qr ?? 0)} rem`}
                                  </p>
                                </td>
                                <td className="px-4 py-4 text-xs font-mono">
                                  <span className="font-semibold text-secondary-900 dark:text-white">
                                    {(sub.monthly_ai_limit ?? sub.total_ai_quota) === -1 ? 'Unlimited' : `${formatNumber(sub.monthly_ai_limit ?? sub.total_ai_quota ?? 0)} / mo`}
                                  </span>
                                  <p className="text-[11px] text-secondary-500 font-sans">
                                    {(sub.monthly_ai_limit ?? sub.total_ai_quota) === -1 
                                      ? 'Unlimited remaining' 
                                      : `${formatNumber(sub.current_month_ai_used ?? sub.used_ai ?? 0)} used | ${formatNumber(sub.current_month_ai_remaining ?? sub.remaining_ai ?? 0)} rem`}
                                  </p>
                                </td>
                                <td className="px-4 py-4 text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={updatingId === sub.id}>
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                      <DropdownMenuItem asChild>
                                        <Link href={`/admin/subscriptions/${sub.id}`} className="flex items-center gap-2">
                                          <Eye className="h-4 w-4" /> View Details
                                        </Link>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem asChild>
                                        <Link href={`/admin/businesses/${sub.business_id}`} className="flex items-center gap-2">
                                          <Building2 className="h-4 w-4" /> Business
                                        </Link>
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => handlePlanChange(sub.id, 'free')} disabled={updatingId === sub.id || sub.plan === 'free'} className="flex items-center gap-2">
                                        <CreditCard className="h-4 w-4" /> Change to Free
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handlePlanChange(sub.id, 'starter')} disabled={updatingId === sub.id || sub.plan === 'starter'} className="flex items-center gap-2">
                                        <CreditCard className="h-4 w-4" /> Change to Starter
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handlePlanChange(sub.id, 'professional')} disabled={updatingId === sub.id || sub.plan === 'professional'} className="flex items-center gap-2">
                                        <CreditCard className="h-4 w-4" /> Change to Professional
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handlePlanChange(sub.id, 'enterprise')} disabled={updatingId === sub.id || sub.plan === 'enterprise'} className="flex items-center gap-2">
                                        <CreditCard className="h-4 w-4" /> Change to Enterprise
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      {sub.status === 'canceled' && sub.cancel_at_period_end ? (
                                        <DropdownMenuItem onClick={() => handleReactivate(sub.id, sub.business_name)} disabled={updatingId === sub.id} className="flex items-center gap-2">
                                          <CheckCircle className="h-4 w-4" /> Reactivate
                                        </DropdownMenuItem>
                                      ) : sub.status === 'active' ? (
                                        <DropdownMenuItem onClick={() => handleCancel(sub.id, sub.business_name)} disabled={updatingId === sub.id} className="text-error-600 dark:text-error-400 flex items-center gap-2">
                                          <XCircle className="h-4 w-4" /> Cancel at Period End
                                        </DropdownMenuItem>
                                      ) : null}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="px-4 py-4 border-t border-border">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-secondary-600 dark:text-secondary-400">
                            Showing {(currentPage - 1) * 20 + 1} to {Math.min(currentPage * 20, totalCount)} of {totalCount} subscriptions
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              disabled={currentPage === 1}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              disabled={currentPage === totalPages}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

import { Building2 } from 'lucide-react';