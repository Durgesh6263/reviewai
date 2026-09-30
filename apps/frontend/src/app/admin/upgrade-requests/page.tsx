'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, MoreVertical, CreditCard, Loader2, AlertCircle, CheckCircle, XCircle, Clock, Eye, RefreshCw, MessageSquare, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber, cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface UpgradeRequest {
  id: string;
  business_id: string;
  business_name: string;
  business_slug: string;
  requested_plan: string;
  requested_plan_name: string;
  current_plan_name: string;
  current_plan_slug: string;
  message: string | null;
  status: 'pending' | 'contacted' | 'approved' | 'rejected' | 'canceled';
  created_at: string;
  updated_at: string;
  owner_email: string;
  owner_name: string;
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

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  pending: 'warning',
  contacted: 'default',
  approved: 'success',
  rejected: 'destructive',
  canceled: 'secondary',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  contacted: 'Contacted',
  approved: 'Approved',
  rejected: 'Rejected',
  canceled: 'Canceled',
};

const PLAN_COLORS: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
  free: 'secondary',
  starter: 'default',
  pro: 'success',
  enterprise: 'warning',
};

const VALID_STATUSES = ['pending', 'contacted', 'approved', 'rejected', 'canceled'] as const;

export default function AdminUpgradeRequestsPage() {
  const [requests, setRequests] = useState<UpgradeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'contacted' | 'approved' | 'rejected' | 'canceled'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<UpgradeRequest | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
      });
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await api.get<PaginatedResponse<UpgradeRequest>>(`/admin/upgrade-requests?${params.toString()}`);
      setRequests(response.data);
      setTotalPages(response.meta.total_pages);
      setTotalCount(response.meta.total);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load upgrade requests');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [currentPage, searchQuery, statusFilter]);

  const handleStatusChange = async (requestId: string, newStatus: typeof VALID_STATUSES[number], adminNote?: string) => {
    if (!confirm(`Are you sure you want to mark this request as ${STATUS_LABELS[newStatus]}?`)) {
      return;
    }

    setUpdatingId(requestId);
    try {
      const response = await api.patch<{ data: UpgradeRequest }>(`/admin/upgrade-requests/${requestId}/status`, {
        status: newStatus,
        admin_note: adminNote,
      });

      toast.success(`Request marked as ${STATUS_LABELS[newStatus]}`);
      fetchRequests();
      if (selectedRequest?.id === requestId) {
        setSelectedRequest(response.data);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || `Failed to update status`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleViewDetails = (request: UpgradeRequest) => {
    setSelectedRequest(request);
    setShowDetailDialog(true);
  };

  const getStatusBadge = (status: string) => {
    return (
      <Badge variant={STATUS_COLORS[status] || 'secondary'}>
        {STATUS_LABELS[status]}
      </Badge>
    );
  };

  const getPlanBadge = (plan: string) => {
    return (
      <Badge variant={PLAN_COLORS[plan] || 'secondary'}>
        {plan.charAt(0).toUpperCase() + plan.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Upgrade Requests</h1>
            <p className="text-secondary-600 dark:text-secondary-400">Review and manage business upgrade requests</p>
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
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Upgrade Requests</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Review and manage business upgrade requests</p>
        </div>
        <Button variant="outline" onClick={fetchRequests} disabled={isLoading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total" count={totalCount} icon={CreditCard} color="blue" />
        <StatCard title="Pending" count={requests.filter(r => r.status === 'pending').length} icon={Clock} color="amber" />
        <StatCard title="Contacted" count={requests.filter(r => r.status === 'contacted').length} icon={MessageSquare} color="blue" />
        <StatCard title="Approved" count={requests.filter(r => r.status === 'approved').length} icon={CheckCircle} color="green" />
        <StatCard title="Rejected" count={requests.filter(r => r.status === 'rejected').length} icon={XCircle} color="red" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
              <Input
                placeholder="Search business name, owner email..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v: 'all' | 'pending' | 'contacted' | 'approved' | 'rejected' | 'canceled') => { setStatusFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card>
        <CardContent className="pt-0">
          {requests.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No upgrade requests found</h3>
              <p className="text-secondary-500 dark:text-secondary-400">
                {searchQuery || statusFilter !== 'all' ? 'Try adjusting your search or filters' : 'No upgrade requests in the system yet'}
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Current Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Requested Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden md:table-cell">Requested</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider hidden lg:table-cell">Updated</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {requests.map((request) => (
                      <tr key={request.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-secondary-900 dark:text-white">{request.business_name}</p>
                            <p className="text-sm text-secondary-500 dark:text-secondary-400 font-mono text-xs">
                              /r/{request.business_slug}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <p className="text-sm font-medium text-secondary-900 dark:text-white">{request.owner_name}</p>
                            <p className="text-xs text-secondary-500 dark:text-secondary-400">{request.owner_email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {getPlanBadge(request.current_plan_slug)}
                        </td>
                        <td className="px-4 py-4">
                          {getPlanBadge(request.requested_plan)}
                        </td>
                        <td className="px-4 py-4">
                          {getStatusBadge(request.status)}
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell text-sm text-secondary-500 dark:text-secondary-400">
                          {formatDate(request.created_at)}
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell text-sm text-secondary-500 dark:text-secondary-400">
                          {request.updated_at !== request.created_at ? formatDate(request.updated_at) : '—'}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={updatingId === request.id}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                              <DropdownMenuItem onClick={() => handleViewDetails(request)} className="flex items-center gap-2">
                                <Eye className="h-4 w-4" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {VALID_STATUSES.map((status) => (
                                request.status !== status && (
                                  <DropdownMenuItem
                                    key={status}
                                    onClick={() => {
                                      if (status === 'approved' || status === 'rejected') {
                                        const note = prompt(`Add an internal note for ${STATUS_LABELS[status]} (optional):`);
                                        handleStatusChange(request.id, status, note || undefined);
                                      } else {
                                        handleStatusChange(request.id, status);
                                      }
                                    }}
                                    disabled={updatingId === request.id}
                                    className={cn('flex items-center gap-2', status === 'approved' && 'text-green-600', status === 'rejected' && 'text-red-600')}
                                  >
                                    {status === 'approved' && <CheckCircle className="h-4 w-4" />}
                                    {status === 'rejected' && <XCircle className="h-4 w-4" />}
                                    {status === 'contacted' && <MessageSquare className="h-4 w-4" />}
                                    {status === 'pending' && <Clock className="h-4 w-4" />}
                                    {status === 'canceled' && <X className="h-4 w-4" />}
                                    {STATUS_LABELS[status]}
                                  </DropdownMenuItem>
                                ))
                              )}
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
                      Showing {(currentPage - 1) * 20 + 1} to {Math.min(currentPage * 20, totalCount)} of {totalCount} requests
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

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedRequest && (
            <div className="space-y-6">
              <DialogHeader>
                <DialogTitle>Upgrade Request Details</DialogTitle>
                <DialogDescription>
                  Business: {selectedRequest.business_name} • Request ID: {selectedRequest.id.slice(0, 8)}...
                </DialogDescription>
              </DialogHeader>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Business" value={selectedRequest.business_name} />
                <DetailField label="Business Slug" value={`/r/${selectedRequest.business_slug}`} />
                <DetailField label="Owner Name" value={selectedRequest.owner_name} />
                <DetailField label="Owner Email" value={selectedRequest.owner_email} />
                <DetailField label="Current Plan" value={
                  <span>{getPlanBadge(selectedRequest.current_plan_slug)}</span>
                } />
                <DetailField label="Requested Plan" value={
                  <span>{getPlanBadge(selectedRequest.requested_plan)}</span>
                } />
                <DetailField label="Status" value={
                  <span>{getStatusBadge(selectedRequest.status)}</span>
                } />
                <DetailField label="Requested" value={formatDate(selectedRequest.created_at)} />
                <DetailField label="Last Updated" value={
                  selectedRequest.updated_at !== selectedRequest.created_at
                    ? formatDate(selectedRequest.updated_at)
                    : 'Not updated'
                } />
              </div>

              {selectedRequest.message && (
                <div className="space-y-2">
                  <Label className="font-medium text-secondary-700 dark:text-secondary-300">Customer Message</Label>
                  <div className="p-4 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg border border-secondary-200 dark:border-secondary-700">
                    <p className="text-secondary-700 dark:text-secondary-300 whitespace-pre-wrap">{selectedRequest.message}</p>
                  </div>
                </div>
              )}

              <Separator />

              <DialogFooter className="flex flex-col sm:flex-row gap-3 w-full">
                {VALID_STATUSES.map((status) => (
                  selectedRequest.status !== status && (
                    <Button
                      key={status}
                      variant={status === 'approved' ? 'default' : status === 'rejected' ? 'destructive' : 'outline'}
                      className="flex-1"
                      onClick={() => {
                        if (status === 'approved' || status === 'rejected') {
                          const note = prompt(`Add an internal note for ${STATUS_LABELS[status]} (optional):`);
                          handleStatusChange(selectedRequest!.id, status, note || undefined);
                        } else {
                          handleStatusChange(selectedRequest!.id, status);
                        }
                        setShowDetailDialog(false);
                      }}
                      disabled={updatingId === selectedRequest.id}
                    >
                      {updatingId === selectedRequest.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          {status === 'approved' && <CheckCircle className="mr-2 h-4 w-4" />}
                          {status === 'rejected' && <XCircle className="mr-2 h-4 w-4" />}
                          {status === 'contacted' && <MessageSquare className="mr-2 h-4 w-4" />}
                          {status === 'pending' && <Clock className="mr-2 h-4 w-4" />}
                          {status === 'canceled' && <X className="mr-2 h-4 w-4" />}
                        </>
                      )}
                      {STATUS_LABELS[status]}
                    </Button>
                  )
                ))}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ title, count, icon: Icon, color }: { title: string; count: number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">{title}</p>
            <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatNumber(count)}</span>
          </div>
          <div className={`p-3 rounded-xl ${colorMap[color].replace('bg-', 'bg-')} /20`}>
            <Icon className={`h-6 w-6 ${colorMap[color]}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium text-secondary-500 dark:text-secondary-400">{label}</Label>
      <div className="text-secondary-900 dark:text-white">{value}</div>
    </div>
  );
}

import { X } from 'lucide-react';