'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, Lightbulb, MessageSquare, Clock, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';

export type FeedbackStatus = 'open' | 'reviewing' | 'resolved' | 'closed';

interface FeedbackItem {
  id: string;
  user_id: string;
  business_id: string;
  category: 'bug' | 'feature' | 'feedback';
  rating: number;
  feedback_text: string | null;
  step_context: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  status?: FeedbackStatus;
  admin_note?: string | null;
}

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

interface FeedbackHistoryProps {
  businessId: string;
}

export function FeedbackHistory({ businessId }: FeedbackHistoryProps) {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchFeedback = async () => {
    try {
      const response = await api.get<{ data: { feedback: FeedbackItem[] } }>(
        `/onboarding/feedback?business_id=${businessId}`
      );
      setFeedback(response.data.feedback || []);
    } catch (error: any) {
      console.error('Failed to fetch feedback:', error);
      toast.error('Failed to load feedback history');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, [businessId]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchFeedback();
  };

  const getStatus = (item: FeedbackItem): FeedbackStatus => {
    // Since the API doesn't return status, we infer from metadata or default to 'open'
    // In the future, the backend will return the status field
    return (item.metadata?.status as FeedbackStatus) || 'open';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary-600" />
            Feedback History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/3" />
                  <div className="h-5 bg-secondary-200 dark:bg-secondary-700 rounded w-20" />
                </div>
                <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-full" />
                <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (feedback.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary-600" />
            Feedback History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <MessageSquare className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
            <p className="text-secondary-600 dark:text-secondary-400">No feedback submitted yet</p>
            <p className="text-sm text-secondary-500 dark:text-secondary-500 mt-1">
              Your feedback submissions will appear here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary-600" />
          Feedback History
        </CardTitle>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {feedback.map((item) => {
            const status = getStatus(item);
            const CategoryIcon = CATEGORY_ICONS[item.category];
            const severity = item.metadata?.severity as string || 'medium';

            return (
              <div
                key={item.id}
                className="p-4 bg-secondary-50 dark:bg-secondary-800/50 rounded-xl border border-secondary-200 dark:border-secondary-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex-shrink-0">
                      <CategoryIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-secondary-900 dark:text-white">
                          {CATEGORY_LABELS[item.category]}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {severity.charAt(0).toUpperCase() + severity.slice(1)}
                        </Badge>
                        <Badge className={STATUS_COLORS[status]} variant="secondary">
                          {STATUS_LABELS[status]}
                        </Badge>
                      </div>
                      <p className="text-secondary-700 dark:text-secondary-300 text-sm mt-1 line-clamp-2">
                        {item.feedback_text || 'No description provided'}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-secondary-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(item.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {item.step_context && (
                          <span className="flex items-center gap-1">
                            <span>Page:</span>
                            <code className="px-1.5 py-0.5 bg-secondary-100 dark:bg-secondary-800 rounded text-secondary-700 dark:text-secondary-300">
                              {item.step_context}
                            </code>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {item.admin_note && status !== 'open' && (
                  <div className="mt-3 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
                    <p className="text-xs font-medium text-primary-700 dark:text-primary-300 mb-1">Admin Note</p>
                    <p className="text-sm text-primary-700 dark:text-primary-300">{item.admin_note}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}