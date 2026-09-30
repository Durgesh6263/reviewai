'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, MoreVertical, QrCode, Download, Copy, ExternalLink, Trash2, Loader2, Eye, BarChart2, Building2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { getQRCodeReviewUrl } from '@/lib/public-url';

interface QRCode {
  id: string;
  name: string;
  slug: string;
  business_id: string;
  business_name: string;
  business_slug: string;
  design: {
    foreground_color: string;
    background_color: string;
    logo_type: string;
    logo_url: string | null;
    frame_text: string | null;
    shape: string;
    dot_style: string;
    corner_style: string;
  };
  stats: {
    total_scans: number;
    total_reviews: number;
    conversion_rate: number;
  };
  is_active: boolean;
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

export default function AdminQRCodesPage() {
  const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [businessFilter, setBusinessFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<{id: string, name: string}[]>([]);

  const fetchQRCodes = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
      });
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (businessFilter !== 'all') params.append('business_id', businessFilter);

      const response = await api.get<PaginatedResponse<QRCode>>(`/admin/qr-codes?${params.toString()}`);
      setQrCodes(response.data);
      setTotalPages(response.meta.total_pages);
      setTotalCount(response.meta.total);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load QR codes');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBusinesses = async () => {
    try {
      const response = await api.get<{ data: { id: string; name: string }[] }>('/admin/businesses?limit=100&status=active');
      setBusinesses(response.data.map((b: any) => ({ id: b.id, name: b.name })));
    } catch (error) {
      console.error('Failed to load businesses for filter', error);
    }
  };

  useEffect(() => {
    fetchQRCodes();
    fetchBusinesses();
  }, [currentPage, searchQuery, statusFilter, businessFilter]);

  const handleStatusChange = async (id: string, currentStatus: boolean) => {
    setUpdatingId(id);
    try {
      await api.patch(`/admin/qr-codes/${id}`, { is_active: !currentStatus });
      toast.success(`QR code ${currentStatus ? 'deactivated' : 'activated'} successfully`);
      fetchQRCodes();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update QR code');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    setUpdatingId(id);
    try {
      await api.delete(`/admin/qr-codes/${id}`);
      toast.success('QR code deleted successfully');
      fetchQRCodes();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete QR code');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDownload = async (qrCode: QRCode) => {
    try {
      const response = await api.get<Blob>(`/admin/qr-codes/${qrCode.id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(response);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${qrCode.name || qrCode.slug}.png`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('QR code downloaded');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to download QR code');
    }
  };

  const handleCopyLink = (slug: string) => {
    const url = getQRCodeReviewUrl(slug);
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  const getStatusBadge = (isActive: boolean) => (
    <Badge variant={isActive ? 'default' : 'secondary'}>
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">QR Code Management</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage all QR codes across the system</p>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
              <Input
                placeholder="Search QR codes..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
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
              <Select value={businessFilter} onValueChange={(v: string) => { setBusinessFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="All businesses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Businesses</SelectItem>
                  {businesses.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* QR Codes Table */}
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
          ) : qrCodes.length === 0 ? (
            <div className="text-center py-12">
              <QrCode className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No QR codes found</h3>
              <p className="text-secondary-500 dark:text-secondary-400 mb-4">
                {searchQuery || statusFilter !== 'all' || businessFilter !== 'all' ? 'Try adjusting your search or filters' : 'No QR codes in the system yet'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b border-border bg-secondary-50 dark:bg-secondary-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">QR Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden md:table-cell">Business</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Design Preview</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden lg:table-cell">Stats</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden sm:table-cell">Created</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {qrCodes.map((qr) => (
                      <tr key={qr.id} className={cn('hover:bg-secondary-50 dark:hover:bg-secondary-800/50', !qr.is_active && 'opacity-60')}>
                        <td className="px-4 py-4">
                          <div>
                            <Link href={`/admin/qr-codes/${qr.id}`} className="font-medium text-secondary-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                              {qr.name || 'Unnamed QR Code'}
                            </Link>
                            <p className="text-sm text-secondary-500 dark:text-secondary-400 font-mono text-xs">
                              /r/{qr.slug}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <Link href={`/admin/businesses/${qr.business_id}`} className="font-medium text-secondary-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
                              {qr.business_name}
                            </Link>
                            <span className="text-secondary-400 text-sm font-mono">/r/{qr.business_slug}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div
                            className="w-12 h-12 rounded-lg flex items-center justify-center border border-border"
                            style={{
                              backgroundColor: qr.design.background_color || '#ffffff',
                            }}
                          >
                            <div
                              className="w-8 h-8 rounded"
                              style={{
                                backgroundColor: qr.design.foreground_color || '#000000',
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {getStatusBadge(qr.is_active)}
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell">
                          <div className="flex items-center gap-3 text-xs text-secondary-600 dark:text-secondary-400">
                            <span>{formatNumber(qr.stats.total_scans)} scans</span>
                            <span>{formatNumber(qr.stats.total_reviews)} reviews</span>
                            <span>{qr.stats.conversion_rate.toFixed(1)}% conv.</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden sm:table-cell text-sm text-secondary-500 dark:text-secondary-400">
                          {formatDate(qr.created_at)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={updatingId === qr.id}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-60">
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/qr-codes/${qr.id}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4" /> View Details
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/r/${qr.slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                  <Globe className="h-4 w-4" /> Public Page
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/analytics?qr_id=${qr.id}`} className="flex items-center gap-2">
                                  <BarChart2 className="h-4 w-4" /> Analytics
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/businesses/${qr.business_id}`} className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4" /> Business
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDownload(qr)}
                                disabled={updatingId === qr.id}
                                className="flex items-center gap-2"
                              >
                                <Download className="h-4 w-4" /> Download PNG
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCopyLink(qr.slug)}
                                className="flex items-center gap-2"
                              >
                                <Copy className="h-4 w-4" /> Copy Link
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {qr.is_active ? (
                                <DropdownMenuItem onClick={() => handleStatusChange(qr.id, qr.is_active)} disabled={updatingId === qr.id} className="flex items-center gap-2">
                                  <Ban className="h-4 w-4" /> Deactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleStatusChange(qr.id, qr.is_active)} disabled={updatingId === qr.id} className="flex items-center gap-2">
                                  <Check className="h-4 w-4" /> Activate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleDelete(qr.id, qr.name || qr.slug)} disabled={updatingId === qr.id} className="text-error-600 dark:text-error-400 flex items-center gap-2">
                                {updatingId === qr.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
                      Showing {(currentPage - 1) * 20 + 1} to {Math.min(currentPage * 20, totalCount)} of {totalCount} QR codes
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
import { Check, Ban } from 'lucide-react';