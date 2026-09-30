'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2, ArrowRight, MessageSquare, Star, ExternalLink, Copy, Check, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import { copyTextToClipboard } from '@/lib/clipboard';
import { sendReliableAnalyticsBeacon, openGoogleReviewDestination } from '@/lib/analytics-beacon';

const RATING_LABELS = [
  { value: 1, label: 'Terrible', emoji: '😞' },
  { value: 2, label: 'Poor', emoji: '😕' },
  { value: 3, label: 'Okay', emoji: '😐' },
  { value: 4, label: 'Great', emoji: '😊' },
  { value: 5, label: 'Excellent', emoji: '😍' },
];

export default function ReviewCompletePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const rating = parseInt(searchParams.get('rating') || '5', 10);

  const [isLoading, setIsLoading] = useState(true);
  const [redirectUrl, setRedirectUrl] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [reviewText, setReviewText] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const isOpeningRef = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Load stored review text
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('review_text') : null;
    if (saved) {
      setReviewText(saved);
    }

    const fetchBusiness = async () => {
      try {
        const res = await api.get<any>(`/r/${slug}`);
        const biz = res?.data?.business || res?.business || res?.data;
        if (biz) {
          setBusinessName(biz.name);
          if (biz.google_review_url) {
            setRedirectUrl(biz.google_review_url);
          } else if (biz.google_place_id) {
            setRedirectUrl(`https://search.google.com/local/writereview?placeid=${biz.google_place_id}`);
          } else {
            setRedirectUrl('https://search.google.com/local/writereview');
          }
        }
      } catch {
        setRedirectUrl('https://search.google.com/local/writereview');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBusiness();
  }, [slug]);

  const handleCopyReview = async () => {
    const textToCopy = reviewText || 'Great experience!';
    const res = await copyTextToClipboard(textToCopy, textareaRef.current);
    if (res.success) {
      setIsCopied(true);
      setCopyFallback(null);
      toast.success('Review copied successfully!');
    } else if (res.fallbackRequired) {
      setIsCopied(false);
      setCopyFallback(res.message);
      toast(res.message, { icon: '📋' });
    }

    // Dispatch reliable copy beacon
    const activeSessionId = typeof window !== 'undefined' ? sessionStorage.getItem(`reviewai_session_${slug}`) || sessionStorage.getItem('review_session_id') : null;
    if (activeSessionId) {
      sendReliableAnalyticsBeacon('/review/sessions/copy', { session_id: activeSessionId });
    }
  };

  const handleOpenGoogle = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (isOpeningRef.current || isOpening) {
      return;
    }

    if (!redirectUrl) {
      toast.error('Google Review URL not available.');
      return;
    }

    isOpeningRef.current = true;
    setIsOpening(true);

    const activeSessionId = typeof window !== 'undefined' ? sessionStorage.getItem(`reviewai_session_${slug}`) || sessionStorage.getItem('review_session_id') : null;
    if (activeSessionId) {
      sendReliableAnalyticsBeacon('/review/sessions/complete', {
        session_id: activeSessionId,
        rating,
        review_text: reviewText,
      });
    }

    // Synchronous immediate navigation prevents iOS Safari popup blocking
    openGoogleReviewDestination(redirectUrl);

    setTimeout(() => {
      isOpeningRef.current = false;
      setIsOpening(false);
    }, 2500);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950 px-4 py-8 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-4" />
          <h1 className="text-xl font-bold text-secondary-900 dark:text-white mb-2">Preparing your review...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-success-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                <Check className="w-4 h-4" />
              </div>
              <div className="w-24 h-1 bg-success-500 ml-2 hidden sm:block" />
            </div>
            <div className="flex items-center">
              <div className="w-24 h-1 bg-success-500 mr-2 hidden sm:block" />
              <div className="w-8 h-8 bg-success-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                <Check className="w-4 h-4" />
              </div>
              <div className="w-24 h-1 bg-success-500 ml-2 hidden sm:block" />
            </div>
            <div className="flex items-center">
              <div className="w-24 h-1 bg-success-500 mr-2 hidden sm:block" />
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                3
              </div>
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-secondary-500 hidden sm:block">
            <span className="text-success-600 font-medium">Language & Rating</span>
            <span className="text-success-600 font-medium">Generate Review</span>
            <span className="text-primary-600 font-medium">Post to Google</span>
          </div>
        </div>

        {/* Main Card */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="text-center pb-3">
            <div className="w-14 h-14 bg-success-100 dark:bg-success-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-8 h-8 text-success-600 dark:text-success-400" />
            </div>
            <CardTitle className="text-2xl font-bold">Your Review is Ready!</CardTitle>
            <CardDescription className="text-sm">
              Copy your review below, then tap "Open Google Reviews" to paste and publish.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Rating Display */}
            <div className="flex items-center justify-center gap-2 p-3 bg-secondary-100 dark:bg-secondary-800 rounded-xl">
              <span className="text-xl font-bold text-amber-500">
                {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
              </span>
              <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                {RATING_LABELS.find((r) => r.value === rating)?.label}
              </span>
            </div>

            {/* Editable Text Area */}
            <div>
              <label className="block text-xs font-semibold text-secondary-600 dark:text-secondary-400 mb-1.5">
                Review Text (Editable)
              </label>
              <Textarea
                ref={textareaRef}
                value={reviewText}
                onChange={(e) => {
                  setReviewText(e.target.value);
                  setIsCopied(false);
                }}
                rows={5}
                className="text-base p-3.5 leading-relaxed rounded-xl font-normal"
                placeholder="Your generated review..."
              />
            </div>

            {copyFallback && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-amber-900 dark:text-amber-200 rounded-lg text-xs">
                {copyFallback}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              <Button
                type="button"
                onClick={handleCopyReview}
                className={`w-full h-12 text-base font-semibold shadow-sm transition-all ${
                  isCopied
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-primary-600 hover:bg-primary-700 text-white'
                }`}
              >
                {isCopied ? (
                  <>
                    <Check className="mr-2 h-5 w-5" /> Review Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-5 w-5" /> Copy Review
                  </>
                )}
              </Button>

              {isCopied && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs sm:text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Review copied successfully. Open Google Reviews to post it.</span>
                  </div>

                  <Button
                    type="button"
                    onClick={(e) => handleOpenGoogle(e)}
                    disabled={isOpening}
                    className="w-full h-12 text-base font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-md flex items-center justify-center gap-2"
                  >
                    {isOpening ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" /> Opening Google...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-5 w-5" /> Open Google Reviews
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            <div className="text-center pt-2">
              <Link href={`/r/${slug}`}>
                <Button variant="ghost" size="sm" className="text-xs text-secondary-500">
                  Start Over
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}