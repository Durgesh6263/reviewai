'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Star, ChevronRight, ChevronLeft, MessageSquare, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';

const RATING_LABELS = [
  { value: 1, label: 'Terrible', emoji: '😞' },
  { value: 2, label: 'Poor', emoji: '😕' },
  { value: 3, label: 'Okay', emoji: '😐' },
  { value: 4, label: 'Great', emoji: '😊' },
  { value: 5, label: 'Excellent', emoji: '😍' },
];

export default function RatingSelectionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const language = searchParams.get('lang') || 'en';
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [businessName, setBusinessName] = useState<string>('');

  useEffect(() => {
    const fetchBusiness = async () => {
      try {
        const response = await api.get<{ data: { business: { name: string } } }>(`/r/${slug}`);
        setBusinessName(response.data.business.name);
      } catch {
        // Business name not critical for this step
      }
    };
    fetchBusiness();
  }, [slug]);

  const handleBack = () => {
    router.push(`/r/${slug}/review/language`);
  };

  const handleContinue = async () => {
    if (!selectedRating) return;
    setIsSubmitting(true);
    try {
      await api.post('/review/sessions/rating', {
        session_id: '',
        rating: selectedRating,
      });
    } catch (error) {
      console.warn('Rating session tracking notice:', error);
    } finally {
      setIsSubmitting(false);
      router.push(`/r/${slug}/review/generate?lang=${language}&rating=${selectedRating}`);
    }
  };

  const getDisplayRating = () => hoveredRating ?? selectedRating ?? 0;

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Back link */}
        <Link
          href={`/r/${slug}/review/language`}
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
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                2
              </div>
              <div className="w-24 h-1 bg-secondary-200 dark:bg-secondary-700 ml-2 hidden sm:block" />
            </div>
            <div className="flex items-center">
              <div className="w-24 h-1 bg-secondary-200 dark:bg-secondary-700 mr-2 hidden sm:block" />
              <div className="w-8 h-8 bg-secondary-200 dark:bg-secondary-700 rounded-full flex items-center justify-center text-secondary-500 text-sm font-medium">
                3
              </div>
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-secondary-500 hidden sm:block">
            <span>Language</span>
            <span className="text-primary-600 dark:text-primary-400 font-medium">Rating</span>
            <span>Review</span>
          </div>
        </div>

        <Card className="border-border/50">
          <CardHeader className="text-center pb-4">
            <Star className="w-12 h-12 text-warning-500 mx-auto mb-4" />
            <CardTitle className="text-2xl">How was your experience?</CardTitle>
            <CardDescription>
              Tap a star to rate {businessName || 'this business'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Star Rating */}
            <div className="flex items-center justify-center gap-1 sm:gap-2.5 md:gap-3 mb-8">
              {RATING_LABELS.map((rating) => (
                <button
                  key={rating.value}
                  onClick={() => setSelectedRating(rating.value)}
                  onMouseEnter={() => setHoveredRating(rating.value)}
                  onMouseLeave={() => setHoveredRating(null)}
                  className="relative group p-1 sm:p-2 rounded-xl transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label={`${rating.label} - ${rating.value} star${rating.value > 1 ? 's' : ''}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={`text-3xl sm:text-4xl md:text-5xl transition-transform duration-200 ${
                        rating.value <= getDisplayRating()
                          ? 'text-warning-400 scale-110'
                          : 'text-secondary-300 dark:text-secondary-600'
                      }`}
                    >
                      {rating.emoji}
                    </span>
                    <span
                      className={`text-[10px] sm:text-xs font-medium transition-colors duration-200 ${
                        rating.value <= getDisplayRating()
                          ? 'text-warning-500'
                          : 'text-secondary-500'
                      }`}
                    >
                      {rating.label}
                    </span>
                  </div>

                  {/* Hidden radio for accessibility */}
                  <input
                    type="radio"
                    name="rating"
                    value={rating.value}
                    checked={selectedRating === rating.value}
                    onChange={() => setSelectedRating(rating.value)}
                    className="sr-only"
                  />
                </button>
              ))}
            </div>

            {/* Selected rating display */}
            {selectedRating && (
              <div className="text-center mb-6 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                <p className="text-lg font-medium text-secondary-900 dark:text-white">
                  You rated: <span className="text-primary-600 dark:text-primary-400">{'★'.repeat(selectedRating)}{'☆'.repeat(5 - selectedRating)}</span>
                </p>
                <p className="text-sm text-secondary-600 dark:text-secondary-400 mt-1">
                  {RATING_LABELS.find(r => r.value === selectedRating)?.label}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                onClick={handleBack}
                variant="outline"
                className="flex-1"
                disabled={isSubmitting}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleContinue}
                className="flex-1"
                size="lg"
                disabled={!selectedRating || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <div className="mt-6 p-4 bg-secondary-100 dark:bg-secondary-800 rounded-xl">
          <h4 className="font-medium text-secondary-900 dark:text-white mb-2">Tips for a great review:</h4>
          <ul className="text-sm text-secondary-600 dark:text-secondary-400 space-y-1">
            <li className="flex items-center gap-2">
              <Star className="w-4 h-4 text-warning-500" />
              Be specific about what you liked or didn&apos;t like
            </li>
            <li className="flex items-center gap-2">
              <Star className="w-4 h-4 text-warning-500" />
              Mention staff, service, atmosphere, or quality
            </li>
            <li className="flex items-center gap-2">
              <Star className="w-4 h-4 text-warning-500" />
              Your honest feedback helps others decide
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}