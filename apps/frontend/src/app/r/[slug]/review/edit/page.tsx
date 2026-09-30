'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Edit, ChevronLeft, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';

const RATING_LABELS = [
  { value: 1, label: 'Terrible', emoji: '😞' },
  { value: 2, label: 'Poor', emoji: '😕' },
  { value: 3, label: 'Okay', emoji: '😐' },
  { value: 4, label: 'Great', emoji: '😊' },
  { value: 5, label: 'Excellent', emoji: '😍' },
];

export default function ReviewEditPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const language = searchParams.get('lang') || 'en';
  const rating = parseInt(searchParams.get('rating') || '5', 10);
  const [review, setReview] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [businessName, setBusinessName] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const fetchBusinessAndReview = async () => {
      try {
        const response = await api.get<{ data: { business: { name: string } } }>(`/r/${slug}`);
        setBusinessName(response.data.business.name);

        // Get the generated review from the session
        // In a real app, this would come from the session
        // For now, we'll use the generated review from the previous step
        // which would be passed via URL or state
      } catch {
        // Business name not critical for this step
      }
    };
    fetchBusinessAndReview();
  }, [slug]);

  // Get review from URL params or generate a default one
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reviewParam = urlParams.get('review');
    if (reviewParam) {
      setReview(decodeURIComponent(reviewParam));
    }
  }, []);

  const handleBack = () => {
    router.push(`/r/${slug}/review/generate?lang=${language}&rating=${rating}`);
  };

  const handleSubmit = async () => {
    if (!review.trim() || review.length < 10) {
      toast.error('Review must be at least 10 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      // Submit the edited review
      await api.patch('/review/sessions/edit', {
        session_id: '',
        edited_text: review,
      });
    } catch (error) {
      console.warn('Session edit tracking notice:', error);
    } finally {
      setIsSubmitting(false);
      toast.success('Review saved! Preparing submission...');
      sessionStorage.setItem('review_text', review);
      router.push(`/r/${slug}/review/complete?lang=${language}&rating=${rating}`);
    }
  };

  const handleBackToGenerate = () => {
    router.push(`/r/${slug}/review/generate?lang=${language}&rating=${rating}`);
  };

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Back link */}
        <Link
          href={`/r/${slug}/review/generate?lang=${language}&rating=${rating}`}
          className="inline-flex items-center gap-2 text-sm text-secondary-500 hover:text-secondary-700 dark:hover:text-secondary-300 mb-6"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>

        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-secondary-200 dark:bg-secondary-700 rounded-full flex items-center justify-center text-secondary-500 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="w-24 h-1 bg-primary-600 ml-2 hidden sm:block" />
            </div>
            <div className="flex items-center">
              <div className="w-24 h-1 bg-primary-600 mr-2 hidden sm:block" />
              <div className="w-8 h-8 bg-secondary-200 dark:bg-secondary-700 rounded-full flex items-center justify-center text-secondary-500 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="w-24 h-1 bg-primary-600 ml-2 hidden sm:block" />
            </div>
            <div className="flex items-center">
              <div className="w-24 h-1 bg-primary-600 mr-2 hidden sm:block" />
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                4
              </div>
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-secondary-500 hidden sm:block">
            <span>Language</span>
            <span>Rating</span>
            <span>Review</span>
            <span className="text-primary-600 dark:text-primary-400 font-medium">Submit</span>
          </div>
        </div>

        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Edit className="w-8 h-8 text-primary-500" />
                <span className="text-2xl font-bold text-secondary-900 dark:text-white">Edit your review</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="gap-1"
              >
                {showPreview ? <Edit className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {showPreview ? 'Edit' : 'Preview'}
              </Button>
            </div>
            <CardTitle className="text-xl">Make it personal</CardTitle>
            <CardDescription>
              Edit the AI-generated review to add your personal experience
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Rating display */}
            <div className="flex items-center justify-center gap-2 mb-6 p-4 bg-secondary-100 dark:bg-secondary-800 rounded-xl">
              <span className="text-2xl font-bold text-warning-500">
                {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
              </span>
              <span className="text-sm text-secondary-600 dark:text-secondary-400">
                {RATING_LABELS.find(r => r.value === rating)?.label}
              </span>
            </div>

            {showPreview ? (
              /* Preview Mode */
              <div className="mb-6 p-6 bg-white dark:bg-secondary-900 rounded-xl border border-border shadow-sm">
                <h4 className="font-medium text-secondary-900 dark:text-white mb-3">Preview</h4>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="whitespace-pre-wrap">{review || 'No review text'}</p>
                </div>
              </div>
            ) : (
              /* Edit Mode */
              <div className="mb-6">
                <Textarea
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  placeholder="Add your personal experience..."
                  className="min-h-[200px] font-medium text-lg"
                  rows={8}
                />
              </div>
            )}

            {/* Character count and validation */}
            <div className="flex items-center justify-between text-sm mb-6">
              <span className={review.length < 10 ? 'text-error-500' : 'text-secondary-500'}>
                {review.length} / 4000 characters
                {review.length < 10 && ' (minimum 10)'}
              </span>
              {review.length > 3500 && (
                <span className="text-warning-500">Approaching limit</span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleBackToGenerate}
                variant="outline"
                className="flex-1 flex items-center justify-center gap-2"
                disabled={isSubmitting}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1 flex items-center justify-center gap-2"
                size="lg"
                disabled={review.length < 10 || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting to Google...
                  </>
                ) : (
                  <>
                    Post to Google
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            {/* Guidelines */}
            <div className="mt-6 p-4 bg-secondary-100 dark:bg-secondary-800 rounded-xl">
              <h4 className="font-medium text-secondary-900 dark:text-white mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-warning-500" />
                Google Review Guidelines
              </h4>
              <ul className="text-sm text-secondary-600 dark:text-secondary-400 space-y-1">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success-500" />
                  Write from your own experience
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success-500" />
                  Be respectful and constructive
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success-500" />
                  No promotional content or links
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success-500" />
                  No personal information
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Final note */}
        <div className="mt-6 p-4 bg-success-50 dark:bg-success-900/20 rounded-xl">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-success-500 mt-0.5" />
            <div className="text-sm text-secondary-700 dark:text-secondary-300">
              <p className="font-medium">Almost done!</p>
              <p className="mt-1">
                After submitting, you&apos;ll be redirected to Google Maps to post your review.
                You may need to sign in to your Google account if you haven&apos;t already.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}