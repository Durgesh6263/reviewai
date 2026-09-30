'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, Filter, MoreVertical, Edit, QrCode, BarChart2, Trash2, ExternalLink, Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface Business {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: string;
  google_place_id: string;
  timezone: string;
  is_active: boolean;
  created_at: string;
  stats: {
    total_scans: number;
    total_reviews: number;
    conversion_rate: number;
  };
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

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchBusinesses = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
      });
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await api.get<any>(`/businesses?${params.toString()}`);
      const rawList = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.businesses)
        ? response.data.businesses
        : Array.isArray(response?.businesses)
        ? response.businesses
        : Array.isArray(response)
        ? response
        : [];
      const list = rawList.map((b: any) => ({
        ...b,
        is_active: b.is_active !== undefined ? b.is_active : b.status === 'active',
        stats: b.stats || {
          total_scans: 0,
          total_reviews: 0,
          conversion_rate: 0,
        },
      }));
      setBusinesses(list);
      setTotalPages(response?.meta?.total_pages || response?.meta?.totalPages || 1);
      setTotalCount(response?.meta?.total || list.length);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load businesses');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinesses();
  }, [currentPage, searchQuery, statusFilter]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(id);
    try {
      await api.delete(`/businesses/${id}`);
      toast.success('Business deleted successfully');
      fetchBusinesses();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete business');
    } finally {
      setDeletingId(null);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Businesses</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage your business locations</p>
        </div>
        <Link href="/dashboard/businesses/new" className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm h-10 px-4 py-2 text-sm">
            <Plus className="h-4 w-4 mr-2" /> Add Business
          </Link>
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
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(1)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v: 'all' | 'active' | 'inactive') => setStatusFilter(v)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
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
                {searchQuery || statusFilter !== 'all' ? 'Try adjusting your search or filters' : 'Get started by adding your first business'}
              </p>
              {!searchQuery && statusFilter === 'all' && (
                <Link href="/dashboard/businesses/new" className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm h-10 px-4 py-2 text-sm">
                  Add Business
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b border-border bg-secondary-50 dark:bg-secondary-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Business</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden md:table-cell">Contact</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden lg:table-cell">Stats</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Created</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {businesses.map((business) => (
                      <tr key={business.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                        <td className="px-4 py-4">
                          <Link href={`/dashboard/businesses/${business.id}`} className="font-medium text-secondary-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                            {business.name}
                          </Link>
                          <p className="text-sm text-secondary-500 dark:text-secondary-400 truncate max-w-xs">
                            {business.slug}
                          </p>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <div className="text-sm text-secondary-600 dark:text-secondary-400">
                            <p>{business.email}</p>
                            {business.phone && <p>{business.phone}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell">
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-secondary-600 dark:text-secondary-400">
                              <span className="font-medium text-secondary-900 dark:text-white">{formatNumber(business.stats?.total_scans || 0)}</span> scans
                            </span>
                            <span className="text-secondary-600 dark:text-secondary-400">
                              <span className="font-medium text-secondary-900 dark:text-white">{formatNumber(business.stats?.total_reviews || 0)}</span> reviews
                            </span>
                            <span className="text-secondary-600 dark:text-secondary-400">
                              {(business.stats?.conversion_rate || 0).toFixed(1)}% conversion
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {getStatusBadge(business.is_active)}
                        </td>
                        <td className="px-4 py-4 text-sm text-secondary-500 dark:text-secondary-400 hidden sm:table-cell">
                          {formatDate(business.created_at)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/businesses/${business.id}`} className="flex items-center gap-2">
                                  <ExternalLink className="h-4 w-4" /> View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/businesses/${business.id}/edit`} className="flex items-center gap-2">
                                  <Edit className="h-4 w-4" /> Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/qr-codes?business_id=${business.id}`} className="flex items-center gap-2">
                                  <QrCode className="h-4 w-4" /> QR Codes
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/analytics?business_id=${business.id}`} className="flex items-center gap-2">
                                  <BarChart2 className="h-4 w-4" /> Analytics
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(business.id, business.name)}
                                disabled={deletingId === business.id}
                                className="text-error-600 dark:text-error-400 flex items-center gap-2"
                              >
                                {deletingId === business.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
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
                      Showing {(currentPage - 1) * 10 + 1} to {Math.min(currentPage * 10, totalCount)} of {totalCount} businesses
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

