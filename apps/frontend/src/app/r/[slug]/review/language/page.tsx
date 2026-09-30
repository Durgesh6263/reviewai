'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Globe, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';

const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', flag: '🇺🇸' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
  { code: 'hinglish', name: 'Hinglish', native: 'Hinglish', flag: '🇮🇳' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Portuguese', native: 'Português', flag: '🇵🇹' },
  { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹' },
  { code: 'ja', name: 'Japanese', native: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', native: '한국어', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', native: '中文', flag: '🇨🇳' },
];

export default function LanguageSelectionPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
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

  const handleContinue = async () => {
    setIsSubmitting(true);
    try {
      await api.post('/review/sessions/language', {
        session_id: '', // Handled gracefully by backend
        language: selectedLanguage,
      });
    } catch (error) {
      console.warn('Language session tracking notice:', error);
    } finally {
      setIsSubmitting(false);
      router.push(`/r/${slug}/review/rating?lang=${selectedLanguage}`);
    }
  };

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Back link */}
        <Link
          href={`/r/${slug}`}
          className="inline-flex items-center gap-2 text-sm text-secondary-500 hover:text-secondary-700 dark:hover:text-secondary-300 mb-6"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Back to {businessName || 'business'}
        </Link>

        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                1
              </div>
              <div className="w-24 h-1 bg-primary-600 ml-2 hidden sm:block" />
            </div>
            <div className="flex items-center">
              <div className="w-24 h-1 bg-secondary-200 dark:bg-secondary-700 mr-2 hidden sm:block" />
              <div className="w-8 h-8 bg-secondary-200 dark:bg-secondary-700 rounded-full flex items-center justify-center text-secondary-500 text-sm font-medium">
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
            <span className="text-primary-600 dark:text-primary-400 font-medium">Language</span>
            <span>Rating</span>
            <span>Review</span>
          </div>
        </div>

        <Card className="border-border/50">
          <CardHeader className="text-center pb-4">
            <Globe className="w-12 h-12 text-primary-500 mx-auto mb-4" />
            <CardTitle className="text-2xl">Choose your language</CardTitle>
            <CardDescription>
              Select the language you'd like to write your review in
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setSelectedLanguage(lang.code)}
                  className={`relative p-2.5 sm:p-4 rounded-xl border-2 transition-all duration-200 text-left min-h-[44px] ${
                    selectedLanguage === lang.code
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-border hover:border-primary-300 dark:hover:border-primary-700'
                  }`}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-xl sm:text-2xl shrink-0">{lang.flag}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-xs sm:text-sm text-secondary-900 dark:text-white truncate">{lang.name}</p>
                      <p className="text-[10px] sm:text-xs text-secondary-500 truncate">{lang.native}</p>
                    </div>
                  </div>
                  {selectedLanguage === lang.code && (
                    <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2">
                      <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            <Button
              onClick={handleContinue}
              className="w-full mt-6"
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Continuing...
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Privacy note */}
        <p className="text-center text-xs text-secondary-500 mt-6">
          We respect your privacy. Your language preference is only used for this review session.
        </p>
      </div>
    </div>
  );
}