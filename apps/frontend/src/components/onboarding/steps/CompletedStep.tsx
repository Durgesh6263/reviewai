'use client';

import { useState } from 'react';
import { CheckCircle, Sparkles, ArrowRight, Star, MessageSquare, Share2, Download, RefreshCw, Heart, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import type { PilotFeedbackCategory, OnboardingStepData } from '@/lib/onboarding-types';

interface CompletedStepProps {
  stepData: { pilot_feedback_submitted?: boolean } | undefined;
  onDataChange: (key: string, value: unknown) => void;
  isSaving: boolean;
  onComplete: () => void;
}

const FEEDBACK_CATEGORIES: { value: PilotFeedbackCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'overall', label: 'Overall Experience', icon: Sparkles },
  { value: 'signup', label: 'Signup Process', icon: ArrowRight },
  { value: 'business_setup', label: 'Business Setup', icon: Sparkles },
  { value: 'google_config', label: 'Google Config', icon: CheckCircle },
  { value: 'tags', label: 'Experience Tags', icon: Star },
  { value: 'qr_design', label: 'QR Design', icon: Sparkles },
  { value: 'qr_test', label: 'QR Testing', icon: CheckCircle },
  { value: 'dashboard', label: 'Dashboard Tour', icon: Sparkles },
];

export function CompletedStep({ stepData, onDataChange, isSaving, onComplete }: CompletedStepProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<PilotFeedbackCategory>('overall');
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(stepData?.pilot_feedback_submitted || false);

  const handleSubmitFeedback = async () => {
    if (rating < 1 || rating > 5) return;

    setIsSubmittingFeedback(true);
    try {
      await api.post('/onboarding/feedback', {
        category: selectedCategory,
        rating,
        feedback_text: feedbackText || null,
        step_context: selectedCategory,
        metadata: { completed_onboarding: true },
      });

      setFeedbackSubmitted(true);
      onDataChange('completed', { pilot_feedback_submitted: true });
      toast.success('Thank you for your feedback! 🎉');
      setShowFeedback(false);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      toast.error('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleSkipFeedback = () => {
    setShowFeedback(false);
    onComplete();
  };

  const handleFinish = () => {
    if (!feedbackSubmitted) {
      setShowFeedback(true);
    } else {
      onComplete();
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="text-center py-8">
        <div className="w-20 h-20 mx-auto mb-4 bg-success-100 dark:bg-success-900/30 rounded-full flex items-center justify-center">
          <CheckCircle className="h-10 w-10 text-success-600 dark:text-success-400" />
        </div>
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-2">
          You&apos;re All Set! 🎉
        </h2>
        <p className="text-secondary-600 dark:text-secondary-400 max-w-md mx-auto">
          Your ReviewAI account is ready. Start collecting reviews and growing your business today.
        </p>
      </div>

      {/* What's Been Set Up */}
      <Card className="border-secondary-200 dark:border-secondary-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary-600" />
            What&apos;s Ready
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {[
            { icon: CheckCircle, label: 'Business profile created', color: 'text-success-500' },
            { icon: CheckCircle, label: 'Google Review URL connected & verified', color: 'text-success-500' },
            { icon: CheckCircle, label: 'Experience tags configured', color: 'text-success-500' },
            { icon: CheckCircle, label: 'QR code designed & generated', color: 'text-success-500' },
            { icon: CheckCircle, label: 'QR code tested & verified', color: 'text-success-500' },
            { icon: CheckCircle, label: 'Dashboard tour completed', color: 'text-success-500' },
          ].map((item, index) => (
            <div key={index} className="flex items-center gap-3 p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
              <div className="w-8 h-8 bg-success-100 dark:bg-success-900/30 rounded-full flex items-center justify-center">
                <item.icon className="h-4 w-4" style={{ color: item.color }} />
              </div>
              <span className="text-secondary-700 dark:text-secondary-300">{item.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="border-secondary-200 dark:border-secondary-700">
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button
              variant="outline"
              onClick={() => window.open('/dashboard/qr-codes/new', '_blank')}
              className="h-20 flex flex-col gap-2"
            >
              <QrCode className="h-6 w-6 mx-auto" />
              <span className="text-sm">Create More QR Codes</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open('/dashboard/analytics', '_blank')}
              className="h-20 flex flex-col gap-2"
            >
              <CheckCircle className="h-6 w-6 mx-auto" />
              <span className="text-sm">View Analytics</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open('/dashboard/team', '_blank')}
              className="h-20 flex flex-col gap-2"
            >
              <MessageSquare className="h-6 w-6 mx-auto" />
              <span className="text-sm">Invite Team</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open('/dashboard/settings', '_blank')}
              className="h-20 flex flex-col gap-2"
            >
              <Share2 className="h-6 w-6 mx-auto" />
              <span className="text-sm">Settings</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* QR Code Download */}
      <Card className="border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-5 w-5 text-primary-600" />
            Download Your QR Code
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-4">
            Your main QR code is ready to print and display. Download high-resolution versions for different use cases.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => window.open('/api/qr-codes/main/download?format=png', '_blank')}>
              <Download className="h-4 w-4 mr-2" />
              PNG (300 DPI)
            </Button>
            <Button variant="outline" onClick={() => window.open('/api/qr-codes/main/download?format=svg', '_blank')}>
              <Download className="h-4 w-4 mr-2" />
              SVG (Vector)
            </Button>
            <Button variant="outline" onClick={() => window.open('/api/qr-codes/main/download?format=pdf', '_blank')}>
              <Download className="h-4 w-4 mr-2" />
              PDF (Print Ready)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <Card className="border-secondary-200 dark:border-secondary-700">
        <CardHeader>
          <CardTitle className="text-base">Recommended Next Steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {[
            'Print and display QR codes at key customer touchpoints (entrance, tables, receipts)',
            'Train your team on how to encourage reviews naturally',
            'Set up review response templates in Settings',
            'Enable email/SMS notifications for new reviews',
            'Share your ReviewAI profile on social media',
            'Schedule weekly analytics review with your team',
          ].map((step, index) => (
            <div key={index} className="flex items-start gap-3 p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-400 text-sm font-bold">
                {index + 1}
              </span>
              <span className="text-sm text-secondary-700 dark:text-secondary-300 mt-0.5">{step}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Pilot Feedback */}
      {!feedbackSubmitted && (
        <Card className="border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary-600" />
                Help Us Improve (Pilot Feedback)
              </CardTitle>
              <Badge variant="outline">Optional</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-4">
              As a pilot user, your feedback directly shapes ReviewAI. Takes less than a minute!
            </p>

            {showFeedback ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Category
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {FEEDBACK_CATEGORIES.map(cat => (
                      <Button
                        key={cat.value}
                        variant={selectedCategory === cat.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedCategory(cat.value)}
                        className="h-8"
                      >
                        <cat.icon className="h-3 w-3 mr-1" />
                        {cat.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Rating: {rating}/5
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Button
                        key={star}
                        variant={star <= rating ? 'default' : 'outline'}
                        size="icon"
                        onClick={() => setRating(star)}
                        className="h-10 w-10 text-yellow-500"
                      >
                        <Star className={`h-5 w-5 ${star <= rating ? 'fill-current' : ''}`} />
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Feedback (Optional)
                  </label>
                  <Textarea
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                    placeholder="What did you like? What could be better? Any bugs?"
                    rows={3}
                    className="min-h-[80px]"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleSubmitFeedback}
                    disabled={isSubmittingFeedback || isSaving}
                    className="flex-1"
                  >
                    {isSubmittingFeedback ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Feedback'
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleSkipFeedback} className="flex-1">
                    Skip
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setShowFeedback(true)} className="w-full">
                <Heart className="h-4 w-4 mr-2" />
                Share Feedback
              </Button>
            )}

            {feedbackSubmitted && (
              <div className="p-3 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg flex items-center gap-2 text-success-700 dark:text-success-300">
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">Thank you! Your feedback has been submitted.</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Finish Button */}
      <div className="pt-4">
        <Button
          onClick={handleFinish}
          disabled={isSaving || isSubmittingFeedback}
          size="lg"
          className="w-full py-3 text-lg"
        >
          {feedbackSubmitted || !showFeedback ? (
            <>
              <ArrowRight className="h-5 w-5 mr-2" />
              Go to Dashboard
            </>
          ) : (
            'Complete Onboarding'
          )}
        </Button>
      </div>
    </div>
  );
}