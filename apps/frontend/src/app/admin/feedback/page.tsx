'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, Loader2, AlertCircle, Lightbulb, MessageSquare, CheckCircle, Clock, Building2, User, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

export type FeedbackStatus = 'open' | 'reviewing' | 'resolved' | 'closed';
export type FeedbackCategory = 'bug' | 'feature' | 'feedback';

interface AdminFeedbackItem {
  id: string;
  user_id: string;
  business_id: string | null;
  category: FeedbackCategory;
  rating: number;
  feedback_text: string | null;
  step_context: string | null;
  metadata: Record<string, unknown> & { severity?: string };
  created_at: string;
  updated_at: string;
  status: FeedbackStatus;
  admin_note: string | null;
  business_name?: string;
  user_email?: string;
}

interface FeedbackFilters {
  status?: FeedbackStatus | 'all';
  category?: FeedbackCategory | 'all';
  search?: string;
}

const STATUS_OPTIONS: { value: FeedbackStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'open', label: 'Open' },
  { value: 'reviewing', label: 'Under Review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const CATEGORY_OPTIONS: { value: FeedbackCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'bug', label: 'Bug / Problem' },
  { value: 'feature', label: 'Feature Suggestion' },
  { value: 'feedback', label: 'General Feedback' },
];

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: 'Open',
  reviewing: 'Under Review',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_COLORS: Record<FeedbackStatus, string> = {
  open: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  reviewing: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  resolved: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  closed: 'bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300',
};

const CATEGORY_ICONS = {
  bug: AlertCircle,
  feature: Lightbulb,
  feedback: MessageSquare,
};

const CATEGORY_LABELS = {
  bug: 'Bug / Problem',
  feature: 'Feature Suggestion',
  feedback: 'General Feedback',
};

const ITEMS_PER_PAGE = 20;

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<AdminFeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FeedbackFilters>({ status: 'all', category: 'all', search: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedItem, setSelectedItem] = useState<AdminFeedbackItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [newStatus, setNewStatus] = useState<FeedbackStatus>('open');

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const fetchFeedback = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters.status && filters.status !== 'all') params.append('status', filters.status);
      if (filters.category && filters.category !== 'all') params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);
      params.append('page', currentPage.toString());
      params.append('limit', ITEMS_PER_PAGE.toString());

      const response = await api.get<{ data: { feedback: AdminFeedbackItem[]; total: number } }>(
        `/admin/feedback?${params.toString()}`
      );

      setFeedback(response.data.feedback || []);
      setTotalCount(response.data.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch feedback:', err);
      setError(err.response?.data?.message || 'Failed to load feedback');
    } finally {
      setIsLoading(false);
    }
  }, [filters, currentPage]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const handleStatusChange = async (item: AdminFeedbackItem, status: FeedbackStatus) => {
    try {
      setIsUpdating(true);
      await api.patch(`/admin/feedback/${item.id}`, { status });
      toast.success(`Status updated to ${STATUS_LABELS[status]}`);
      fetchFeedback();
    } catch (err: any) {
      console.error('Failed to update status:', err);
      toast.error(err.response?.data?.message || 'Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenDialog = (item: AdminFeedbackItem) => {
    setSelectedItem(item);
    setAdminNote(item.admin_note || '');
    setNewStatus(item.status);
    setIsDialogOpen(true);
  };

  const handleSaveDialog = async () => {
    if (!selectedItem) return;

    try {
      setIsUpdating(true);
      await api.patch(`/admin/feedback/${selectedItem.id}`, {
        status: newStatus,
        admin_note: adminNote || null,
      });
      toast.success('Feedback updated successfully');
      setIsDialogOpen(false);
      setSelectedItem(null);
      fetchFeedback();
    } catch (err: any) {
      console.error('Failed to update feedback:', err);
      toast.error(err.response?.data?.message || 'Failed to update feedback');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSearch = (value: string) => {
    setFilters(prev => ({ ...prev, search: value }));
    setCurrentPage(1);
  };

  const handleFilterChange = (key: keyof FeedbackFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  if (isLoading && feedback.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Pilot Feedback</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage and review pilot user feedback</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-secondary-200 dark:bg-secondary-700 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4" />
                    <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-1/2" />
                  </div>
                  <div className="h-5 bg-secondary-200 dark:bg-secondary-700 rounded w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-error-500 mx-auto mb-4" />
        <p className="text-error-500 mb-4">{error}</p>
        <Button onClick={fetchFeedback}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Pilot Feedback</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage and review pilot user feedback</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-secondary-600 dark:text-secondary-400">
            {totalCount} total
          </span>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
              <Input
                placeholder="Search feedback..."
                value={filters.search || ''}
                onChange={e => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filters.status || 'all'} onValueChange={v => handleFilterChange('status', v as FeedbackStatus | 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.category || 'all'} onValueChange={v => handleFilterChange('category', v as FeedbackCategory | 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['open', 'reviewing', 'resolved', 'closed'].map((status) => {
          const count = feedback.filter(f => f.status === status).length;
          return (
            <Card key={status} className={`border-l-4 ${STATUS_COLORS[status as FeedbackStatus].replace('bg-', 'border-').replace('text-', '')}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">{STATUS_LABELS[status as FeedbackStatus]}</p>
                    <p className="text-2xl font-bold text-secondary-900 dark:text-white">{count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Feedback Table */}
      <Card>
        <CardContent className="p-0">
          {feedback.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
              <p className="text-secondary-600 dark:text-secondary-400">No feedback found</p>
              <p className="text-sm text-secondary-500 dark:text-secondary-500 mt-1">
                {filters.search || filters.status !== 'all' || filters.category !== 'all'
                  ? 'Try adjusting your filters'
                  : 'No pilot feedback has been submitted yet'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-secondary-200 dark:border-secondary-700">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Business / User</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-36">Status</TableHead>
                    <TableHead className="w-40">Created</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feedback.map((item, index) => {
                    const CategoryIcon = CATEGORY_ICONS[item.category];
                    return (
                      <TableRow key={item.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                        <TableCell className="text-secondary-500 text-sm">
                          {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CategoryIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                            <Badge variant="secondary" className="text-xs capitalize">
                              {CATEGORY_LABELS[item.category]}
                            </Badge>
                            {item.metadata?.severity && (
                              <Badge variant="outline" className="text-xs">
                                {item.metadata.severity as React.ReactNode}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {item.business_name && (
                              <div className="flex items-center gap-1 text-sm">
                                <Building2 className="h-3 w-3 text-secondary-400" />
                                <span className="font-medium text-secondary-900 dark:text-white truncate max-w-[200px]">
                                  {item.business_name}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-1 text-sm text-secondary-500">
                              <User className="h-3 w-3" />
                              <span className="truncate max-w-[200px]">{item.user_email || item.user_id}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-secondary-700 dark:text-secondary-300 line-clamp-1 max-w-[300px]">
                            {item.feedback_text || 'No description'}
                          </p>
                          {item.step_context && (
                            <p className="text-xs text-secondary-500 mt-0.5">
                              Page: <code className="px-1 py-0.5 bg-secondary-100 dark:bg-secondary-800 rounded">{item.step_context}</code>
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[item.status]} variant="secondary">
                            {STATUS_LABELS[item.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-secondary-500">
                          {new Date(item.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(item)}
                            className="h-8 w-8 p-0"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-secondary-200 dark:border-secondary-700">
              <p className="text-sm text-secondary-600 dark:text-secondary-400">
                Page {currentPage} of {totalPages} ({totalCount} total)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Feedback Details</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Category</label>
                  <p className="font-medium text-secondary-900 dark:text-white capitalize">{CATEGORY_LABELS[selectedItem.category]}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Severity</label>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {String(selectedItem.metadata?.severity || 'medium')}
                  </Badge>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Status</label>
                  <Select value={newStatus} onValueChange={setNewStatus as (value: FeedbackStatus) => void}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['open', 'reviewing', 'resolved', 'closed'] as const).map(s => (
                        <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Business</label>
                  <p className="font-medium text-secondary-900 dark:text-white">{selectedItem.business_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">User</label>
                  <p className="font-medium text-secondary-900 dark:text-white">{selectedItem.user_email || selectedItem.user_id}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Submitted</label>
                  <p className="font-medium text-secondary-900 dark:text-white">
                    {new Date(selectedItem.created_at).toLocaleString()}
                  </p>
                </div>
                {selectedItem.step_context && (
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Page Context</label>
                    <code className="px-2 py-1 bg-secondary-100 dark:bg-secondary-800 rounded text-sm text-secondary-700 dark:text-secondary-300">
                      {selectedItem.step_context}
                    </code>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Feedback Message</label>
                <p className="mt-1 p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg text-secondary-700 dark:text-secondary-300 whitespace-pre-wrap">
                  {selectedItem.feedback_text || 'No description provided'}
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Admin Note</label>
                <Textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="Add internal note for the team..."
                  rows={3}
                  className="mt-1"
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveDialog} disabled={isUpdating}>
                  {isUpdating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}