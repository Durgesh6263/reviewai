'use client';

import { useState } from 'react';
import { AlertCircle, Lightbulb, MessageSquare, Send, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';

export type FeedbackCategory = 'bug' | 'feature' | 'feedback';
export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';

interface FeedbackFormProps {
  businessId: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

const CATEGORY_OPTIONS: { value: FeedbackCategory; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { value: 'bug', label: 'Bug / Problem', icon: AlertCircle, description: 'Something is broken or not working as expected' },
  { value: 'feature', label: 'Feature Suggestion', icon: Lightbulb, description: 'I have an idea for a new feature or improvement' },
  { value: 'feedback', label: 'General Feedback', icon: MessageSquare, description: 'General comments, confusion, or suggestions' },
];

const SEVERITY_OPTIONS: { value: FeedbackSeverity; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: 'Minor issue, cosmetic, or nice-to-have' },
  { value: 'medium', label: 'Medium', description: 'Affects workflow but has workaround' },
  { value: 'high', label: 'High', description: 'Significant impact, blocks important tasks' },
  { value: 'critical', label: 'Critical', description: 'System unusable, data loss, or security issue' },
];

export function FeedbackForm({ businessId, onSuccess, onClose }: FeedbackFormProps) {
  const [category, setCategory] = useState<FeedbackCategory>('feedback');
  const [severity, setSeverity] = useState<FeedbackSeverity>('medium');
  const [message, setMessage] = useState('');
  const [pageContext, setPageContext] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCategory = CATEGORY_OPTIONS.find(c => c.value === category);
  const selectedSeverity = SEVERITY_OPTIONS.find(s => s.value === severity);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      toast.error('Please enter your feedback');
      return;
    }

    if (message.length > 2000) {
      toast.error('Feedback is too long (max 2000 characters)');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/onboarding/feedback', {
        business_id: businessId,
        category,
        rating: severity === 'critical' ? 1 : severity === 'high' ? 2 : severity === 'medium' ? 3 : 4,
        feedback_text: message,
        step_context: pageContext || undefined,
        metadata: { severity, page_url: typeof window !== 'undefined' ? window.location.href : '' },
      });

      toast.success('Feedback submitted successfully! 🎉');
      onSuccess?.();
      if (onClose) onClose();
    } catch (error: any) {
      console.error('Failed to submit feedback:', error);
      toast.error(error.response?.data?.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose?.();
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary-600" />
            Send Feedback
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category Selection */}
          <div>
            <Label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Category <span className="text-error-500">*</span>
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {CATEGORY_OPTIONS.map((cat) => (
                <Button
                  key={cat.value}
                  type="button"
                  variant={category === cat.value ? 'default' : 'outline'}
                  className="h-24 flex flex-col gap-2 text-left p-3"
                  onClick={() => setCategory(cat.value)}
                >
                  <cat.icon className="h-5 w-5 mx-auto" />
                  <span className="font-medium text-sm">{cat.label}</span>
                  <span className="text-xs text-secondary-500">{cat.description}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Severity Selection */}
          <div>
            <Label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Severity
            </Label>
            <Select value={severity} onValueChange={setSeverity as (value: FeedbackSeverity) => void}>
              <SelectTrigger>
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((sev) => (
                  <SelectItem key={sev.value} value={sev.value}>
                    <div className="flex flex-col gap-1">
                      <span>{sev.label}</span>
                      <span className="text-xs text-secondary-500">{sev.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Message */}
          <div>
            <Label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Your Feedback <span className="text-error-500">*</span>
            </Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Describe the issue, suggestion, or feedback..."
              rows={4}
              className="min-h-[120px]"
              maxLength={2000}
            />
            <p className="text-xs text-secondary-500 mt-1 text-right">
              {message.length}/2000 characters
            </p>
          </div>

          {/* Page Context (auto-filled) */}
          <div>
            <Label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Page / Context (optional)
            </Label>
            <Textarea
              value={pageContext}
              onChange={e => setPageContext(e.target.value)}
              placeholder="e.g., QR code creation page, analytics dashboard, etc."
              rows={2}
              className="min-h-[70px]"
              maxLength={500}
            />
            <p className="text-xs text-secondary-500 mt-1">
              Current page: {typeof window !== 'undefined' ? window.location.pathname : 'loading...'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !message.trim()} className="flex-1">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Feedback
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}