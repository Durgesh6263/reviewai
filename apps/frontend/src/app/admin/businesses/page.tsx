'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, MoreVertical, Edit, Building2, QrCode, BarChart2, Trash2, Loader2, Eye, ExternalLink, Ban, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface Business {
  id: string;
  name: string;
  slug: string;
  email: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  is_active: boolean;
  google_place_id: string;
  is_pilot_business: boolean;
  pilot_readiness_score: number;
  pilot_readiness_status: 'not_started' | 'in_progress' | 'ready' | 'launched';
  health_score: number;
  health_status: 'healthy' | 'at_risk' | 'critical';
  open_feedback_count: number;
  stats: {
    total_scans: number;
    total_reviews: number;
    conversion_rate: number;
    qr_codes_count: number;
  };
  subscription: {
    plan: string;
    status: string;
  } | null;
  created_at: string;
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

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [readinessFilter, setReadinessFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchBusinesses = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
      });
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (planFilter !== 'all') params.append('plan', planFilter);
      if (readinessFilter !== 'all') params.append('readiness', readinessFilter);
      if (healthFilter !== 'all') params.append('health', healthFilter);

      const response = await api.get<PaginatedResponse<Business>>(`/admin/businesses?${params.toString()}`);
      setBusinesses(response.data);
      setTotalPages(response.meta.total_pages);
      setTotalCount(response.meta.total);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load businesses');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinesses();
  }, [currentPage, searchQuery, statusFilter, planFilter, readinessFilter, healthFilter]);

  const handleStatusChange = async (id: string, currentStatus: boolean) => {
    setUpdatingId(id);
    try {
      await api.patch(`/admin/businesses/${id}`, { is_active: !currentStatus });
      toast.success(`Business ${currentStatus ? 'deactivated' : 'activated'} successfully`);
      fetchBusinesses();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update business');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This will also delete all associated QR codes and analytics.`)) {
      return;
    }

    setUpdatingId(id);
    try {
      await api.delete(`/admin/businesses/${id}`);
      toast.success('Business deleted successfully');
      fetchBusinesses();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete business');
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (isActive: boolean) => (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      isActive
        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
        : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
    )}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );

  const getPlanBadge = (plan: string | null) => {
    if (!plan) return <span className="text-secondary-400">Free</span>;
    return (
      <span className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        plan === 'starter' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',
        plan === 'professional' && 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400',
        plan === 'enterprise' && 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400',
      )}>
        {plan.charAt(0).toUpperCase() + plan.slice(1)}
      </span>
    );
  };

  const getReadinessBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      not_started: { label: 'Not Started', className: 'bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300' },
      in_progress: { label: 'In Progress', className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' },
      ready: { label: 'Ready', className: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' },
      launched: { label: 'Launched', className: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400' },
    };
    const c = config[status] || config.not_started;
    return (
      <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', c.className)}>
        {c.label}
      </span>
    );
  };

  const getHealthBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      healthy: { label: 'Healthy', className: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' },
      at_risk: { label: 'At Risk', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400' },
      critical: { label: 'Critical', className: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' },
    };
    const c = config[status] || config.healthy;
    return (
      <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', c.className)}>
        {c.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Business Management</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage all businesses in the system</p>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
              <Input
                placeholder="Search businesses..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={(v: 'all' | 'active' | 'inactive') => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={planFilter} onValueChange={(v: string) => { setPlanFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All plans" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
              <Select value={readinessFilter} onValueChange={(v: string) => { setReadinessFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All readiness" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Readiness</SelectItem>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="launched">Launched</SelectItem>
                </SelectContent>
              </Select>
              <Select value={healthFilter} onValueChange={(v: string) => { setHealthFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All health" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Health</SelectItem>
                  <SelectItem value="healthy">Healthy</SelectItem>
                  <SelectItem value="at_risk">At Risk</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Businesses Table */}
      <Card>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="p-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse border-b border-border last:border-0">
                  <div className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 bg-secondary-200 dark:bg-secondary-700 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4" />
                      <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-1/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : businesses.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No businesses found</h3>
              <p className="text-secondary-500 dark:text-secondary-400 mb-4">
                {searchQuery || statusFilter !== 'all' || planFilter !== 'all' ? 'Try adjusting your search or filters' : 'No businesses in the system yet'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b border-border bg-secondary-50 dark:bg-secondary-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Business</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden md:table-cell">Owner</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden lg:table-cell">Readiness</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden lg:table-cell">Health</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden xl:table-cell">Stats</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden sm:table-cell">Created</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {businesses.map((business) => (
                      <tr key={business.id} className={cn('hover:bg-secondary-50 dark:hover:bg-secondary-800/50', !business.is_active && 'opacity-60')}>
                        <td className="px-4 py-4">
                          <div>
                            <Link href={`/admin/businesses/${business.id}`} className="font-medium text-secondary-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                              {business.name}
                            </Link>
                            <p className="text-sm text-secondary-500 dark:text-secondary-400 font-mono text-xs">
                              /r/{business.slug}
                            </p>
                            {business.is_pilot_business && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-400 mt-1">
                                Pilot
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <div className="text-sm">
                            <p className="text-secondary-900 dark:text-white">{business.owner_name}</p>
                            <p className="text-secondary-500 dark:text-secondary-400">{business.owner_email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {getPlanBadge(business.subscription?.plan || null)}
                        </td>
                        <td className="px-4 py-4">
                          {getStatusBadge(business.is_active)}
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell">
                          {getReadinessBadge(business.pilot_readiness_status)}
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell">
                          {getHealthBadge(business.health_status)}
                        </td>
                        <td className="px-4 py-4 hidden xl:table-cell">
                          <div className="flex items-center gap-3 text-xs text-secondary-600 dark:text-secondary-400">
                            <span>{formatNumber(business.stats.total_scans)} scans</span>
                            <span>{formatNumber(business.stats.total_reviews)} reviews</span>
                            <span>{business.stats.conversion_rate.toFixed(1)}% conv.</span>
                            <span>{business.stats.qr_codes_count} QR codes</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden sm:table-cell text-sm text-secondary-500 dark:text-secondary-400">
                          {formatDate(business.created_at)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={updatingId === business.id}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-60">
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/businesses/${business.id}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4" /> View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/r/${business.slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                  <ExternalLink className="h-4 w-4" /> Public Page
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/qr-codes?business_id=${business.id}`} className="flex items-center gap-2">
                                  <QrCode className="h-4 w-4" /> QR Codes
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/analytics?business_id=${business.id}`} className="flex items-center gap-2">
                                  <BarChart2 className="h-4 w-4" /> Analytics
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {business.is_active ? (
                                <DropdownMenuItem onClick={() => handleStatusChange(business.id, business.is_active)} disabled={updatingId === business.id} className="flex items-center gap-2">
                                  <Ban className="h-4 w-4" /> Deactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleStatusChange(business.id, business.is_active)} disabled={updatingId === business.id} className="flex items-center gap-2">
                                  <UserCheck className="h-4 w-4" /> Activate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleDelete(business.id, business.name)} disabled={updatingId === business.id} className="text-error-600 dark:text-error-400 flex items-center gap-2">
                                {updatingId === business.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 py-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-secondary-600 dark:text-secondary-400">
                      Showing {(currentPage - 1) * 20 + 1} to {Math.min(currentPage * 20, totalCount)} of {totalCount} businesses
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
    </div>
  );
}

import Link from 'next/link';
import { cn } from '@/lib/utils';