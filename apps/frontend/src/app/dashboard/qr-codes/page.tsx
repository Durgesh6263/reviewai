'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, Filter, MoreVertical, Edit, Download, Copy, Trash2, ExternalLink, Loader2, QrCode, Eye, Circle, Square, BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

import { getQRCodeReviewUrl, generateQRCodeImageUrl } from '@/lib/public-url';
import { copyTextToClipboard } from '@/lib/clipboard';

interface QRCode {
  id: string;
  business_id: string;
  business_name: string;
  name: string;
  slug: string;
  google_review_url?: string;
  design: {
    primary_color: string;
    logo_url: string | null;
    frame_text: string;
    shape: string;
    google_review_url?: string;
  };
  is_active: boolean;
  scan_count: number;
  review_count: number;
  conversion_rate: number;
  created_at: string;
  last_scanned_at: string | null;
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

export default function QRCodesPage() {
  const [qrCodes, setQRCodes] = useState<QRCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [businessFilter, setBusinessFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const fetchQRCodes = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
      });
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (businessFilter) params.append('business_id', businessFilter);

      const response = await api.get<any>(`/qr-codes?${params.toString()}`);
      const list = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.qr_codes)
        ? response.data.qr_codes
        : Array.isArray(response)
        ? response
        : [];
      setQRCodes(list);
      setTotalPages(response?.meta?.total_pages || response?.meta?.totalPages || 1);
      setTotalCount(response?.meta?.total || list.length);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load QR codes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQRCodes();
  }, [currentPage, searchQuery, statusFilter, businessFilter]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(id);
    try {
      await api.delete(`/qr-codes/${id}`);
      toast.success('QR code deleted successfully');
      fetchQRCodes();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete QR code');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyUrl = async (qrCode: QRCode) => {
    const url = getQRCodeReviewUrl(qrCode.slug);
    const res = await copyTextToClipboard(url);
    if (res.success) {
      setCopyingId(qrCode.id);
      toast.success('Target URL copied to clipboard!');
      setTimeout(() => setCopyingId(null), 2000);
    } else {
      toast(res.message);
    }
  };

  const handleDownload = async (qrCode: QRCode) => {
    try {
      const qrUrl = getQRCodeReviewUrl(qrCode.slug);
      const color = qrCode.design?.primary_color || '#2563EB';
      const downloadUrl = generateQRCodeImageUrl(qrUrl, {
        color,
        size: 600,
        quietZone: 4,
        ecc: 'M',
      });

      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${qrCode.name || 'review'}-qr-code.png`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('High-resolution QR code downloaded!');
    } catch (error: any) {
      toast.error('Failed to download QR code');
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

  const getShapeIcon = (shape: string) => {
    switch (shape) {
      case 'circle': return <Circle className="h-4 w-4" />;
      case 'rounded': return <Square className="h-4 w-4 rounded-lg" />;
      default: return <Square className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">QR Codes</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage your QR codes for review collection</p>
        </div>
        <Link href="/dashboard/qr-codes/new" className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm h-10 px-4 py-2 text-sm">
          <Plus className="h-4 w-4 mr-2" /> Create QR Code
        </Link>
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
                onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(1)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(v: string) => { setStatusFilter(v as 'all' | 'active' | 'inactive'); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={businessFilter} onValueChange={(v: string) => { setBusinessFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All businesses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Businesses</SelectItem>
                  {/* Business options would be populated from API */}
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
                    <div className="h-12 w-12 bg-secondary-200 dark:bg-secondary-700 rounded-lg" />
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
                {searchQuery || statusFilter !== 'all' || businessFilter ? 'Try adjusting your search or filters' : 'Create your first QR code to start collecting reviews'}
              </p>
              {!searchQuery && statusFilter === 'all' && !businessFilter && (
                <Link href="/dashboard/qr-codes/new" className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm h-10 px-4 py-2 text-sm">
                  Create QR Code
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b border-border bg-secondary-50 dark:bg-secondary-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">QR Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden md:table-cell">Business</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden lg:table-cell">Design</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Stats</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden sm:table-cell">Created</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {qrCodes.map((qr) => (
                      <tr key={qr.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-lg border-2 flex items-center justify-center" style={{ borderColor: qr.design.primary_color }}>
                              <QrCode className="h-6 w-6" style={{ color: qr.design.primary_color }} />
                            </div>
                            <div>
                              <Link href={`/dashboard/qr-codes/${qr.id}`} className="font-medium text-secondary-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                                {qr.name}
                              </Link>
                              <p className="text-sm text-secondary-500 dark:text-secondary-400 font-mono text-xs">
                                /r/{qr.slug}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <Link href={`/dashboard/businesses/${qr.business_id}`} className="font-medium text-secondary-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
                            {qr.business_name}
                          </Link>
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded border" style={{ backgroundColor: qr.design.primary_color }} />
                            <span className="text-xs text-secondary-500 dark:text-secondary-400 capitalize">{qr.design.shape}</span>
                            {qr.design.frame_text && (
                              <span className="text-xs text-secondary-500 dark:text-secondary-400">"{qr.design.frame_text}"</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2 text-secondary-600 dark:text-secondary-400">
                              <span className="font-medium text-secondary-900 dark:text-white">{formatNumber(qr.scan_count)}</span> scans
                            </div>
                            <div className="flex items-center gap-2 text-secondary-600 dark:text-secondary-400">
                              <span className="font-medium text-secondary-900 dark:text-white">{formatNumber(qr.review_count)}</span> reviews
                            </div>
                            <div className="flex items-center gap-2 text-secondary-600 dark:text-secondary-400">
                              {qr.conversion_rate.toFixed(1)}% conversion
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {getStatusBadge(qr.is_active)}
                        </td>
                        <td className="px-4 py-4 text-sm text-secondary-500 dark:text-secondary-400 hidden sm:table-cell">
                          {formatDate(qr.created_at)}
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
                                <Link href={`/r/${qr.slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                  <Eye className="h-4 w-4" /> Preview
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/qr-codes/${qr.id}/edit`} className="flex items-center gap-2">
                                  <Edit className="h-4 w-4" /> Edit Design
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/analytics?qr_code_id=${qr.id}`} className="flex items-center gap-2">
                                  <BarChart2 className="h-4 w-4" /> Analytics
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCopyUrl(qr)} className="flex items-center gap-2" disabled={copyingId === qr.id}>
                                {copyingId === qr.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                                Copy QR Link
                              </DropdownMenuItem>
                              {(qr.google_review_url || qr.design?.google_review_url) && (
                                <DropdownMenuItem
                                  onClick={async () => {
                                    const target = qr.google_review_url || qr.design?.google_review_url;
                                    if (target) {
                                      const res = await copyTextToClipboard(target);
                                      if (res.success) toast.success('Google Review URL copied!');
                                    }
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <ExternalLink className="h-4 w-4" /> Copy Google URL
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleDownload(qr)} className="flex items-center gap-2">
                                <Download className="h-4 w-4" /> Download PNG
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(qr.id, qr.name)}
                                disabled={deletingId === qr.id}
                                className="text-error-600 dark:text-error-400 flex items-center gap-2"
                              >
                                {deletingId === qr.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
                      Showing {(currentPage - 1) * 10 + 1} to {Math.min(currentPage * 10, totalCount)} of {totalCount} QR codes
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