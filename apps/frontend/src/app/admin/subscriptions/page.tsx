'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, MoreVertical, CreditCard, Loader2, Trash2, Edit, Eye, Calendar, AlertCircle, CheckCircle, XCircle, Clock, DollarSign, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface Subscription {
  id: string;
  business_id: string;
  business_name: string;
  business_slug: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing';
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  quantity: number;
  monthly_price: number;
  features: {
    max_businesses: number;
    max_qr_codes: number;
    max_scans_per_month: number;
    ai_reviews_per_month: number;
    custom_domains: boolean;
    white_label: boolean;
    api_access: boolean;
    priority_support: boolean;
  };
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
  const [activeTab, setActiveTab] = useState<'list' | 'overview'>('list');

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

      const [subsResponse, statsResponse] = await Promise.all([
        api.get<PaginatedResponse<Subscription>>(`/admin/subscriptions?${params.toString()}`),
        api.get<{ data: SubscriptionStats }>('/admin/subscriptions/stats'),
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
  }, [currentPage, searchQuery, statusFilter, planFilter]);

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
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
      active: 'default',
      past_due: 'destructive',
      canceled: 'secondary',
      incomplete: 'outline',
      trialing: 'warning',
    };
    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </Badge>
    );
  };

  const getPlanBadge = (plan: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
      free: 'secondary',
      starter: 'default',
      professional: 'success',
      enterprise: 'warning',
    };
    return (
      <Badge variant={variants[plan] || 'secondary'}>
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
      </div>

      {/* Stats Overview */}
      {stats && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'list' | 'overview')} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="list">All Subscriptions</TabsTrigger>
          </TabsList>

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
                      <DollarSign className="h-6 w-6 text-green-500" />
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
                  <CardTitle>Plan Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.plan_distribution.map((item) => {
                      const percentage = stats.total_subscriptions > 0 ? (item.count / stats.total_subscriptions) * 100 : 0;
                      return (
                        <div key={item.plan} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-2 font-medium">
                              {getPlanBadge(item.plan)}
                              <span>{item.plan}</span>
                            </span>
                            <span className="text-secondary-500">{item.count} ({percentage.toFixed(1)}%)</span>
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
                  <CardTitle>Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.status_distribution.map((item) => {
                      const percentage = stats.total_subscriptions > 0 ? (item.count / stats.total_subscriptions) * 100 : 0;
                      return (
                        <div key={item.status} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-2 font-medium">
                              {getStatusBadge(item.status)}
                              <span>{item.status.replace('_', ' ')}</span>
                            </span>
                            <span className="text-secondary-500">{item.count} ({percentage.toFixed(1)}%)</span>
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
                            <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Owner</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Plan</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden sm:table-cell">Monthly</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden md:table-cell">Renewal</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {subscriptions.map((sub) => {
                            const daysLeft = daysUntilRenewal(sub.current_period_end);
                            const isRenewalSoon = daysLeft <= 7 && daysLeft > 0 && sub.status === 'active';
                            const isOverdue = isPastDue(sub.status, sub.current_period_end);

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
                                        {sub.owner_name.charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-sm font-medium text-secondary-900 dark:text-white">{sub.owner_name}</p>
                                      <p className="text-xs text-secondary-500 dark:text-secondary-400">{sub.owner_email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  {getPlanBadge(sub.plan)}
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-2">
                                    {getStatusBadge(sub.status)}
                                    {sub.cancel_at_period_end && sub.status === 'active' && (
                                      <Badge variant="outline" className="text-xs">
                                        <Clock className="h-3 w-3 mr-1" />
                                        Canceling
                                      </Badge>
                                    )}
                                    {isOverdue && (
                                      <Badge variant="destructive" className="text-xs">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        Overdue
                                      </Badge>
                                    )}
                                    {isRenewalSoon && (
                                      <Badge variant="warning" className="text-xs">
                                        <Calendar className="h-3 w-3 mr-1" />
                                        Renews in {daysLeft}d
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-right hidden sm:table-cell text-sm text-secondary-600 dark:text-secondary-400">
                                  {formatCurrency(sub.monthly_price)}/mo
                                </td>
                                <td className="px-4 py-4 hidden md:table-cell text-sm text-secondary-500 dark:text-secondary-400">
                                  {sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due' ? (
                                    <>
                                      <span>{formatDate(sub.current_period_end)}</span>
                                      {sub.trial_end && sub.status === 'trialing' && (
                                        <p className="text-xs text-blue-600 dark:text-blue-400">Trial ends: {formatDate(sub.trial_end)}</p>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-secondary-400">—</span>
                                  )}
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

import Link from 'next/link';
import { Building2 } from 'lucide-react';