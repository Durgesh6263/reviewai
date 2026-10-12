'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  RefreshCw,
  AlertCircle,
  Loader2,
  Search,
  Filter,
  User,
  Building2,
  Calendar,
  Layers,
  Sparkles,
  QrCode,
  IndianRupee,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api-client';
import { formatDate, formatCurrency, formatNumber } from '@/lib/utils';
import { toast } from 'react-hot-toast';

export interface UpgradeRequestItem {
  id: string;
  business_id: string;
  business_name: string;
  business_slug: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  requested_plan: string;
  requested_plan_name?: string;
  current_plan: string;
  current_plan_name?: string;
  current_plan_slug?: string;
  current_subscription_status?: string;
  current_qr_used?: number;
  current_qr_limit?: number;
  current_ai_used?: number;
  current_ai_limit?: number;
  current_period_end?: string;
  plan_name?: string;
  plan_version_id?: string;
  duration_months?: number;
  price_inr?: number;
  allocated_qr_quota?: number;
  allocated_ai_quota?: number;
  max_qr_codes?: number;
  status: 'pending' | 'approved' | 'rejected' | 'contacted' | 'cancelled';
  reason?: string | null;
  message?: string | null;
  admin_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export function AdminActivationRequests() {
  const [requests, setRequests] = useState<UpgradeRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<UpgradeRequestItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: '1',
        limit: '50',
      });
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const res = await api.get<{ data: UpgradeRequestItem[]; meta: any }>(
        `/admin/upgrade-requests?${params.toString()}`
      );
      setRequests(res.data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load subscription requests');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const handleOpenDetails = async (req: UpgradeRequestItem) => {
    setSelectedRequest(req);
    setShowDetailsModal(true);
    try {
      const res = await api.get<{ data: UpgradeRequestItem }>(`/admin/upgrade-requests/${req.id}`);
      if (res && res.data) {
        setSelectedRequest(res.data);
      }
    } catch (e) {
      // optimistic fallback
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!confirm('Are you sure you want to APPROVE and immediately activate this subscription?')) {
      return;
    }

    setActionLoadingId(requestId);
    try {
      const res = await api.patch<{ data: UpgradeRequestItem }>(`/admin/upgrade-requests/${requestId}/status`, {
        status: 'approved',
      });
      toast.success('Subscription activated successfully!');
      if (selectedRequest?.id === requestId) {
        setSelectedRequest(res.data);
      }
      setShowDetailsModal(false);
      fetchRequests();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Failed to activate subscription';
      toast.error(msg, { duration: 6000 });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePromptReject = (requestId: string) => {
    setRejectingRequestId(requestId);
    setRejectReason('');
    setShowRejectDialog(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectingRequestId) return;
    setActionLoadingId(rejectingRequestId);
    try {
      const res = await api.patch<{ data: UpgradeRequestItem }>(`/admin/upgrade-requests/${rejectingRequestId}/status`, {
        status: 'rejected',
        admin_notes: rejectReason.trim() || undefined,
      });
      toast.success('Request marked as rejected');
      setShowRejectDialog(false);
      setShowDetailsModal(false);
      if (selectedRequest?.id === rejectingRequestId) {
        setSelectedRequest(res.data);
      }
      fetchRequests();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Failed to reject request';
      toast.error(msg);
    } finally {
      setActionLoadingId(null);
      setRejectingRequestId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="warning" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300">PENDING</Badge>;
      case 'approved':
        return <Badge variant="success" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300">APPROVED</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300">REJECTED</Badge>;
      default:
        return <Badge variant="secondary" className="capitalize">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <Card className="border border-border/70 shadow-sm bg-card/60 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search client, business..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') fetchRequests();
                  }}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchRequests} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                Status:
              </Label>
              <Select
                value={statusFilter}
                onValueChange={(v: 'all' | 'pending' | 'approved' | 'rejected') => setStatusFilter(v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">PENDING</SelectItem>
                  <SelectItem value="approved">APPROVED</SelectItem>
                  <SelectItem value="rejected">REJECTED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card className="border border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold">Manual Subscription Activation Requests</CardTitle>
              <CardDescription>
                Review incoming client plan selections, inspect current quota consumption, and manually activate or reject.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-medium">
              {requests.length} Requests
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-16 px-4">
              <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-semibold text-foreground">No subscription requests found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                {statusFilter === 'pending'
                  ? 'There are currently no pending activation requests awaiting Admin review.'
                  : 'No requests matched your filter selection.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border bg-muted/40 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Client / User</th>
                    <th className="px-4 py-3 text-left">Business</th>
                    <th className="px-4 py-3 text-left">Selected Plan</th>
                    <th className="px-4 py-3 text-left">Duration</th>
                    <th className="px-4 py-3 text-left">Price</th>
                    <th className="px-4 py-3 text-left">Request Date</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requests.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div>{r.owner_name || 'User'}</div>
                        <div className="text-xs text-muted-foreground">{r.owner_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{r.business_name}</div>
                        <div className="text-xs text-muted-foreground">/{r.business_slug}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-foreground capitalize">
                          {r.plan_name || r.requested_plan}
                        </span>
                        {r.plan_version_id && (
                          <span className="ml-1.5 text-xs text-muted-foreground font-mono">
                            ({r.plan_version_id})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">
                        {r.duration_months ? `${r.duration_months} Months` : '—'}
                      </td>
                      <td className="px-4 py-3 font-bold text-primary whitespace-nowrap">
                        {r.price_inr ? formatCurrency(r.price_inr) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getStatusBadge(r.status)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDetails(r)}
                            className="h-8 px-2.5 text-xs"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Details
                          </Button>
                          {r.status === 'pending' && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleApprove(r.id)}
                                disabled={actionLoadingId === r.id}
                                className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                {actionLoadingId === r.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                    Approve
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handlePromptReject(r.id)}
                                disabled={actionLoadingId === r.id}
                                className="h-8 px-2.5 text-xs"
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Details Dialog */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedRequest && (
            <div className="space-y-5">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-xl font-bold">Subscription Request Details</DialogTitle>
                  {getStatusBadge(selectedRequest.status)}
                </div>
                <DialogDescription>
                  Review client entitlement history and verify plan snapshot before activation.
                </DialogDescription>
              </DialogHeader>

              <Separator />

              {/* Client & Business Section */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Client & Business Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/30 p-3.5 rounded-lg border border-border/60">
                  <DetailItem label="Business Name" value={selectedRequest.business_name} />
                  <DetailItem label="Business Slug" value={`/${selectedRequest.business_slug}`} />
                  <DetailItem label="Client / Owner" value={selectedRequest.owner_name} />
                  <DetailItem label="Client Email" value={selectedRequest.owner_email} />
                </div>
              </div>

              {/* Current Subscription Status & Usage */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Current Subscription & Usage State
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-muted/30 p-3.5 rounded-lg border border-border/60">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Current Subscription</span>
                    <div className="font-semibold text-foreground capitalize">
                      {selectedRequest.current_subscription_status || 'Trial / Free'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Current QR Consumption</span>
                    <div className="font-semibold text-foreground">
                      {formatNumber(selectedRequest.current_qr_used ?? 0)} / {selectedRequest.current_qr_limit === -1 ? 'Unlimited' : formatNumber(selectedRequest.current_qr_limit ?? 0)} Scans
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Current AI Consumption</span>
                    <div className="font-semibold text-foreground">
                      {formatNumber(selectedRequest.current_ai_used ?? 0)} / {selectedRequest.current_ai_limit === -1 ? 'Unlimited' : formatNumber(selectedRequest.current_ai_limit ?? 0)} Generations
                    </div>
                  </div>
                </div>
              </div>

              {/* Selected Plan Details */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Selected Plan Snapshot (To be Activated)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-primary/5 p-4 rounded-lg border border-primary/20">
                  <DetailItem
                    label="Selected Plan Version"
                    value={
                      <span className="font-bold text-primary">
                        {selectedRequest.plan_name || selectedRequest.requested_plan} ({selectedRequest.plan_version_id || 'v1.0'})
                      </span>
                    }
                  />
                  <DetailItem
                    label="Plan Duration"
                    value={
                      <span className="font-semibold text-foreground">
                        {selectedRequest.duration_months ? `${selectedRequest.duration_months} Months Fixed` : '—'}
                      </span>
                    }
                  />
                  <DetailItem
                    label="Price Captured at Request"
                    value={
                      <span className="font-extrabold text-lg text-primary">
                        {selectedRequest.price_inr ? formatCurrency(selectedRequest.price_inr) : '—'}
                      </span>
                    }
                  />
                  <DetailItem
                    label="Monthly QR Limit"
                    value={
                      <span className="font-medium text-foreground">
                        {selectedRequest.allocated_qr_quota !== undefined
                          ? (selectedRequest.allocated_qr_quota === -1 ? 'Unlimited' : `${formatNumber(selectedRequest.allocated_qr_quota)} / month`)
                          : '—'}
                      </span>
                    }
                  />
                  <DetailItem
                    label="Monthly AI Limit"
                    value={
                      <span className="font-medium text-foreground">
                        {selectedRequest.allocated_ai_quota !== undefined
                          ? (selectedRequest.allocated_ai_quota === -1 ? 'Unlimited' : `${formatNumber(selectedRequest.allocated_ai_quota)} / month`)
                          : '—'}
                      </span>
                    }
                  />
                  <DetailItem
                    label="Requested Date"
                    value={formatDate(selectedRequest.created_at)}
                  />
                </div>
              </div>

              {/* Customer Notes */}
              {selectedRequest.message && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Customer Message
                  </h4>
                  <div className="p-3 bg-muted/40 rounded-md border border-border text-sm text-foreground whitespace-pre-wrap">
                    {selectedRequest.message}
                  </div>
                </div>
              )}

              {/* Admin Notes if rejected/approved */}
              {selectedRequest.admin_notes && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Admin Review Note
                  </h4>
                  <div className="p-3 bg-muted/40 rounded-md border border-border text-sm text-foreground whitespace-pre-wrap">
                    {selectedRequest.admin_notes}
                  </div>
                </div>
              )}

              <Separator />

              {/* Action Buttons */}
              <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
                  Close
                </Button>

                {selectedRequest.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      onClick={() => handlePromptReject(selectedRequest.id)}
                      disabled={actionLoadingId === selectedRequest.id}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Reject Request
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => handleApprove(selectedRequest.id)}
                      disabled={actionLoadingId === selectedRequest.id}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                      {actionLoadingId === selectedRequest.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-1.5" />
                      )}
                      Approve & Activate Subscription
                    </Button>
                  </div>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Subscription Request</DialogTitle>
            <DialogDescription>
              This request will be marked as REJECTED and no subscription will be activated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="rejectReason">Rejection Reason (Optional)</Label>
            <Input
              id="rejectReason"
              placeholder="e.g. Payment unverified, incorrect plan selected"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={Boolean(actionLoadingId)}
            >
              {actionLoadingId ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
