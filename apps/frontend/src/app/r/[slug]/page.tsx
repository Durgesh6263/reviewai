'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Star,
  Globe,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Building2,
  AlertCircle,
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import { copyTextToClipboard } from '@/lib/clipboard';
import { sendReliableAnalyticsBeacon, openGoogleReviewDestination } from '@/lib/analytics-beacon';
import { getDefaultTagsForCategory, getCategoryById } from '@/lib/categories';

interface BusinessInfo {
  id: string;
  name: string;
  category?: string;
  category_name?: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  google_review_url: string;
  google_place_id?: string;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  experience_tags?: string[];
  tags?: string[];
  settings?: {
    primary_color?: string;
    logo_url?: string;
    welcome_message?: string;
    review_tone?: string;
    category?: string;
    custom_tags?: string[];
    tags?: string[];
  };
}

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
];

const RATING_DETAILS = [
  { value: 5, label: 'Excellent', emoji: '😍', color: 'text-amber-500' },
  { value: 4, label: 'Great', emoji: '😊', color: 'text-amber-500' },
  { value: 3, label: 'Okay', emoji: '😐', color: 'text-yellow-500' },
  { value: 2, label: 'Poor', emoji: '😕', color: 'text-orange-500' },
  { value: 1, label: 'Terrible', emoji: '😞', color: 'text-red-500' },
];

const DEFAULT_EXPERIENCE_TAGS = [
  'Friendly Staff',
  'Clean Environment',
  'Fast Service',
  'Professional Team',
  'Exceptional Quality',
  'Welcoming Atmosphere',
  'Great Value',
  'Highly Recommended',
];

export default function PublicReviewPage() {
  const params = useParams();
  const rawSlug = (params?.slug as string) || '';
  const slug = decodeURIComponent(rawSlug).trim();
  const normalizedSlug = slug.replace(/\s+/g, '-').toLowerCase();

  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [qrCodeId, setQrCodeId] = useState<string | null>(null);
  const [scanLogId, setScanLogId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Review Flow State
  const [language, setLanguage] = useState<string>('en');
  const [rating, setRating] = useState<number>(5);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customerNotes, setCustomerNotes] = useState<string>('');

  const [reviewText, setReviewText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [regenerationCount, setRegenerationCount] = useState(0);

  // Private Feedback State (1-3 stars)
  const [privateFeedbackText, setPrivateFeedbackText] = useState<string>('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false);

  // Copy & Redirect State
  const [isCopied, setIsCopied] = useState(false);
  const [copyFallbackMessage, setCopyFallbackMessage] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const isRedirectingRef = useRef(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reviewSectionRef = useRef<HTMLDivElement>(null);
  const feedbackSectionRef = useRef<HTMLDivElement>(null);

  // Fetch public business info (No auth needed, deduplicated via sessionStorage)
  useEffect(() => {
    if (!slug) return;
    setIsLoading(true);
    setLoadError(null);

    // If slug had spaces or unencoded characters, update the browser address bar cleanly
    if (typeof window !== 'undefined' && rawSlug !== normalizedSlug && window.history?.replaceState) {
      try {
        window.history.replaceState(null, '', `/r/${encodeURIComponent(normalizedSlug)}`);
      } catch {}
    }

    const cachedScanId = typeof window !== 'undefined'
      ? sessionStorage.getItem(`reviewai_scan_${normalizedSlug}`) || sessionStorage.getItem(`reviewai_scan_${slug}`)
      : null;
    const cachedSessionId = typeof window !== 'undefined'
      ? sessionStorage.getItem(`reviewai_session_${normalizedSlug}`) || sessionStorage.getItem(`reviewai_session_${slug}`)
      : null;
    if (cachedSessionId) {
      setSessionId(cachedSessionId);
    }

    const querySlug = encodeURIComponent(normalizedSlug || slug);
    const queryUrl = cachedScanId ? `/r/${querySlug}?scan_id=${encodeURIComponent(cachedScanId)}` : `/r/${querySlug}`;

    api.get<any>(queryUrl)
      .then((res: any) => {
        const b = res?.data?.business || res?.business || res?.data || res;
        if (!b) {
          throw new Error('Business not found');
        }
        setBusiness(b);
        const qId = res?.data?.qr_code_id || res?.qr_code_id || null;
        const sId = res?.data?.scan_log_id || res?.scan_log_id || null;
        if (qId) setQrCodeId(qId);
        if (sId) {
          setScanLogId(sId);
          try {
            sessionStorage.setItem(`reviewai_scan_${slug}`, sId);
            sessionStorage.setItem(`reviewai_scan_${normalizedSlug}`, sId);
          } catch {}
        }
      })
      .catch((err: any) => {
        setLoadError(err.response?.data?.message || 'Business not found or invalid QR link.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [slug, rawSlug, normalizedSlug]);

  // Helper to start or retrieve session in database (idempotent & cached)
  const ensureSession = async (selectedRating = rating, selectedLang = language): Promise<string | null> => {
    if (sessionId) return sessionId;
    if (!business?.id) return null;

    try {
      const res = await api.post<any>('/review/sessions/start', {
        qr_code_id: qrCodeId,
        business_id: business.id,
        scan_log_id: scanLogId,
        rating: selectedRating,
        language: selectedLang,
        metadata: {
          tags: selectedTags,
          customer_notes: customerNotes || undefined,
        },
      });

      const newSessionId = res?.data?.session_id || res?.session_id || res?.data?.session?.id || null;
      if (newSessionId) {
        setSessionId(newSessionId);
        try {
          sessionStorage.setItem(`reviewai_session_${slug}`, newSessionId);
          sessionStorage.setItem(`reviewai_session_${normalizedSlug}`, newSessionId);
        } catch {}
      }
      return newSessionId;
    } catch (e) {
      console.warn('Session tracking fallback:', e);
      return null;
    }
  };

  // Handle tag selection (1-3 tags)
  const handleTagToggle = async (tag: string) => {
    let newTags: string[];
    if (selectedTags.includes(tag)) {
      newTags = selectedTags.filter((t) => t !== tag);
    } else {
      if (selectedTags.length >= 3) {
        toast('You can select up to 3 highlights', { icon: 'ℹ️' });
        return;
      }
      newTags = [...selectedTags, tag];
    }
    setSelectedTags(newTags);

    const activeSessId = sessionId || await ensureSession(rating, language);
    if (activeSessId) {
      api.post('/review/sessions/tags', { session_id: activeSessId, tags: newTags }).catch(() => {});
    }
  };

  // Generate review suggestion when user changes rating or language (if already started)
  const generateReview = async (selectedRating = rating, selectedLang = language, variation = 0) => {
    setIsGenerating(true);
    setCopyFallbackMessage(null);
    setIsCopied(false);

    try {
      const currentSessId = await ensureSession(selectedRating, selectedLang);

      const res = await api.post<any>('/review/sessions/generate', {
        session_id: currentSessId || sessionId || undefined,
        business_id: business?.id,
        rating: selectedRating,
        language: selectedLang,
        tags: selectedTags,
        customer_text: customerNotes || undefined,
        variation,
      });

      const text = res?.data?.review?.generated_text || res?.review?.generated_text;
      if (text) {
        setReviewText(text);
      } else {
        throw new Error('Fallback review required');
      }
    } catch {
      // Local fallback in case backend is unreachable
      const bizName = business?.name || 'this business';
      const highlights = selectedTags.length > 0 ? ` The ${selectedTags.slice(0, 2).join(' and ').toLowerCase()} was exceptional.` : '';
      if (selectedRating >= 4) {
        if (selectedLang === 'hi') {
          setReviewText(`${bizName} में मेरा अनुभव बहुत ही शानदार रहा! यहाँ का वातावरण, ट्रेनर और सुविधाएँ बहुत अच्छी हैं। सेवा की गुणवत्ता बेहतरीन है। 5 स्टार!`);
        } else if (selectedLang === 'hinglish') {
          setReviewText(`${bizName} me mera experience bohot hi zabardast raha! Clean environment, friendly staff aur service ekdum top-notch hai. Highly recommended!`);
        } else if (selectedLang === 'es') {
          setReviewText(`¡Excelente experiencia en ${bizName}! El personal es muy amable, las instalaciones son de primera calidad y el ambiente es inmejorable. ¡Totalmente recomendado!`);
        } else {
          setReviewText(`I had an amazing experience at ${bizName}! The staff was exceptionally friendly, knowledgeable, and attentive.${highlights} The facilities are modern and clean. Highly recommend to anyone!`);
        }
      } else if (selectedRating === 3) {
        setReviewText(`My experience at ${bizName} was decent overall. The staff was polite and the facilities were okay, though there are a few minor things that could be improved.`);
      } else {
        setReviewText(`My experience at ${bizName} was below expectations. The service and responsiveness could definitely be improved.`);
      }
    } finally {
      setIsGenerating(false);
      setHasGenerated(true);

      // Scroll to review box on mobile
      setTimeout(() => {
        reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const handleRatingSelect = async (star: number) => {
    setRating(star);
    const activeSessionId = await ensureSession(star, language);

    if (activeSessionId) {
      api.post('/review/sessions/rating', { session_id: activeSessionId, rating: star }).catch(() => {});
    }

    if (star <= 3) {
      setHasGenerated(false);
      setIsFeedbackSubmitted(false);
      if (activeSessionId) {
        api.post('/review/sessions/feedback/start', { session_id: activeSessionId }).catch(() => {});
      }
      setTimeout(() => {
        feedbackSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      generateReview(star, language, 0);
    }
  };

  const handleLanguageChange = (code: string) => {
    setLanguage(code);
    if (hasGenerated && rating >= 4) {
      generateReview(rating, code, 0);
    }
  };

  const handleRegenerate = () => {
    const nextCount = regenerationCount + 1;
    setRegenerationCount(nextCount);
    generateReview(rating, language, nextCount);
    toast.success('Generated a new review variation!');
  };

  // Submit private feedback (1-3 stars)
  const handleSubmitPrivateFeedback = async () => {
    if (!privateFeedbackText.trim()) {
      toast.error('Please enter your feedback first');
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      const activeSessionId = await ensureSession(rating, language);
      await api.post('/review/sessions/feedback', {
        session_id: activeSessionId || sessionId || 'guest-session',
        feedback_text: privateFeedbackText.trim(),
        rating,
      });

      setIsFeedbackSubmitted(true);
      toast.success('Thank you! Your feedback has been sent directly to management.');
    } catch (err: any) {
      console.error('Private feedback submission error:', err);
      toast.error(err?.response?.data?.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // Clear "Copy Review" button
  const handleCopyReview = async () => {
    if (!reviewText.trim()) {
      toast.error('Please enter a review first');
      return;
    }

    const result = await copyTextToClipboard(reviewText, textareaRef.current);
    if (result.success) {
      setIsCopied(true);
      setCopyFallbackMessage(null);
      toast.success('Review copied successfully!');
    } else if (result.fallbackRequired) {
      // Do not falsely claim text was copied if clipboard permission was blocked
      setIsCopied(false);
      setCopyFallbackMessage(result.message);
      toast(result.message, { icon: '📋', duration: 4000 });
    }

    // Record review copied and edited events in backend analytics via non-blocking reliable beacon
    const activeSessionId = sessionId || (typeof window !== 'undefined' ? sessionStorage.getItem(`reviewai_session_${slug}`) : null);
    if (activeSessionId) {
      sendReliableAnalyticsBeacon('/review/sessions/edit', { session_id: activeSessionId, edited_text: reviewText });
      sendReliableAnalyticsBeacon('/review/sessions/copy', { session_id: activeSessionId });
    }
  };

  // Open Google Reviews directly using saved URL (EXACTLY ONE navigation, no duplicate tabs/windows)
  const handleOpenGoogleReviews = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Guard against rapid duplicate clicks (synchronous ref + React state)
    if (isRedirectingRef.current || isRedirecting) {
      return;
    }

    const targetUrl = business?.google_review_url?.trim();

    if (!targetUrl) {
      toast.error('Google Review URL has not been configured for this business yet.');
      return;
    }

    // Basic URL check
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      toast.error('The configured Google Review URL is invalid.');
      return;
    }

    // Set lock immediately to prevent duplicate requests
    isRedirectingRef.current = true;
    setIsRedirecting(true);

    const activeSessionId = sessionId || (typeof window !== 'undefined' ? sessionStorage.getItem(`reviewai_session_${slug}`) : null);

    // 1. Dispatch analytics tracking via keepalive/sendBeacon concurrently without blocking customer navigation
    if (activeSessionId) {
      // Record feedback skip if customer was on 1-3 star rating and chose to proceed to Google directly
      if (rating <= 3 && !isFeedbackSubmitted) {
        sendReliableAnalyticsBeacon('/review/sessions/feedback/skip', { session_id: activeSessionId });
      }

      // Track review completion & redirect in backend using keepalive beacon
      sendReliableAnalyticsBeacon('/review/sessions/complete', {
        session_id: activeSessionId,
        rating,
        language,
        review_text: reviewText,
      });
    }

    // 2. Perform IMMEDIATE navigation inside the synchronous user click handler tick
    // This guarantees iOS Safari and popup blockers do not block the window
    openGoogleReviewDestination(targetUrl);

    // Reset lock after delay so duplicate clicks are prevented, but button can be re-used if user returns
    setTimeout(() => {
      isRedirectingRef.current = false;
      setIsRedirecting(false);
    }, 2500);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-primary-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading business review page...</p>
        </div>
      </div>
    );
  }

  if (loadError || !business) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-8">
        <Card className="w-full max-w-md shadow-lg text-center">
          <CardHeader>
            <div className="w-14 h-14 bg-red-100 dark:bg-red-950/40 rounded-full flex items-center justify-center mx-auto mb-2">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-xl">Business Link Not Found</CardTitle>
            <CardDescription className="text-sm">
              {loadError || 'The QR code or review link you scanned is invalid or no longer active.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Please ask the business staff for an updated QR code or visit their official page.
            </p>
            <Link href="/" className="inline-block w-full">
              <Button variant="outline" className="w-full">
                Go to Homepage
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryColor = business.settings?.primary_color || '#2563EB';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between">
      {/* Top Banner / Branding */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur sticky top-0 z-20 shadow-xs">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {business.logo_url ? (
              <img
                src={business.logo_url}
                alt={business.name}
                className="w-8 h-8 rounded-lg object-cover border border-slate-200"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-xs"
                style={{ backgroundColor: primaryColor }}
              >
                {business.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-semibold text-base tracking-tight truncate max-w-[130px] min-[380px]:max-w-[200px] sm:max-w-sm">
              {business.name}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200/60 dark:border-emerald-800/40 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verified</span>
          </div>
        </div>
      </header>

      {/* Main Review Form */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Welcome Section */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {business.settings?.welcome_message || `How was your visit to ${business.name}?`}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Your honest feedback helps our team improve and helps other customers find us!
          </p>
        </div>

        {/* Step 1: Language Selection */}
        <Card className="shadow-xs border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <Globe className="w-4 h-4 text-primary-600" />
                1. Select Language
              </CardTitle>
              <span className="text-xs text-slate-500 font-mono">
                {LANGUAGES.find((l) => l.code === language)?.name}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 min-[380px]:grid-cols-3 gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`flex items-center gap-2 p-2 sm:p-2.5 rounded-lg border text-left transition-all duration-150 active:scale-95 min-h-[44px] ${
                    language === lang.code
                      ? 'border-primary-600 bg-primary-50 dark:bg-primary-950/40 text-primary-900 dark:text-primary-100 font-medium shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="text-lg leading-none shrink-0">{lang.flag}</span>
                  <div className="truncate min-w-0">
                    <p className="text-xs font-semibold leading-tight truncate">{lang.name}</p>
                    <p className="text-[10px] text-slate-500 leading-tight truncate">{lang.native}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Star Rating (1 to 5 stars) */}
        <Card className="shadow-xs border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3 text-center">
            <CardTitle className="text-sm font-semibold flex items-center justify-center gap-2 text-slate-800 dark:text-slate-200">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              2. Rate Your Experience (1 to 5 Stars)
            </CardTitle>
            <CardDescription className="text-xs">
              Tap a star to select your rating
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {/* Interactive Stars */}
            <div className="flex items-center justify-center gap-1 sm:gap-2.5 md:gap-3 py-2">
              {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = star <= (hoveredRating ?? rating);
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleRatingSelect(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(null)}
                    className="p-1 sm:p-1.5 md:p-2 rounded-xl transition-all duration-150 transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 transition-colors ${
                        isFilled
                          ? 'text-amber-400 fill-amber-400 drop-shadow-sm'
                          : 'text-slate-200 dark:text-slate-700'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Selected Rating Badge & Emojis */}
            <div className="flex items-center justify-center gap-2 text-sm font-medium">
              <span className="text-2xl">
                {RATING_DETAILS.find((r) => r.value === rating)?.emoji}
              </span>
              <span className="text-slate-800 dark:text-slate-200 font-semibold">
                {rating} / 5 Stars
              </span>
              <span className="text-slate-500 text-xs">
                — {RATING_DETAILS.find((r) => r.value === rating)?.label}
              </span>
            </div>

            {/* Tag Selection & Notes for 4-5 Stars */}
            {rating >= 4 && (
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    What stood out the most? <span className="text-slate-400 font-normal">(Pick 1–3 highlights)</span>
                  </span>
                  {selectedTags.length > 0 && (
                    <span className="text-primary-600 dark:text-primary-400 font-medium shrink-0 ml-1">
                      {selectedTags.length}/3 selected
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {((business?.experience_tags && business.experience_tags.length > 0)
                    ? business.experience_tags
                    : (business?.tags && business.tags.length > 0)
                    ? business.tags
                    : (business?.settings?.custom_tags && business.settings.custom_tags.length > 0)
                    ? business.settings.custom_tags
                    : (business?.settings?.tags && business.settings.tags.length > 0)
                    ? business.settings.tags
                    : getDefaultTagsForCategory(business?.category || business?.settings?.category)
                  ).map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleTagToggle(tag)}
                        className={`text-xs px-3 py-2 rounded-full border transition-all min-h-[38px] flex items-center ${
                          isSelected
                            ? 'bg-primary-50 dark:bg-primary-950/60 border-primary-500 text-primary-700 dark:text-primary-300 font-medium shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}{tag}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1">
                  <input
                    type="text"
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder="Optional: Mention a staff member, dish, or detail..."
                    className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    maxLength={150}
                  />
                </div>
              </div>
            )}

            {rating >= 4 && !hasGenerated && (
              <Button
                type="button"
                onClick={() => generateReview(rating, language, 0)}
                disabled={isGenerating}
                className="w-full h-11 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-sm"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Review...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" /> Generate Review Suggestion
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Private Feedback for 1 to 3 Stars */}
        {rating <= 3 && (
          <div ref={feedbackSectionRef} className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <Card className="shadow-xs border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <MessageSquare className="w-5 h-5 text-amber-600" />
                  We Want to Make Things Right
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 dark:text-slate-400">
                  We're sorry your experience wasn't 5 stars. Please share your thoughts directly with our leadership team so we can address your concerns immediately.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {isFeedbackSubmitted ? (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      Feedback Sent to Management
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Thank you for helping us improve. A member of our management team will review your feedback carefully.
                    </p>
                    <div className="pt-2 border-t border-emerald-200/50 dark:border-emerald-800/50">
                      <button
                        type="button"
                        onClick={(e) => handleOpenGoogleReviews(e)}
                        disabled={isRedirecting}
                        className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Still want to leave a public review on Google?
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Textarea
                      value={privateFeedbackText}
                      onChange={(e) => setPrivateFeedbackText(e.target.value)}
                      rows={4}
                      placeholder="Please tell us what went wrong, how we can improve, or any details you'd like our management to know..."
                      className="text-sm p-3.5 border-slate-300 dark:border-slate-700 focus:ring-amber-500 rounded-xl resize-y"
                    />
                    <Button
                      type="button"
                      onClick={handleSubmitPrivateFeedback}
                      disabled={isSubmittingFeedback || !privateFeedbackText.trim()}
                      className="w-full h-11 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs flex items-center justify-center gap-2"
                    >
                      {isSubmittingFeedback ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Sending to Management...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4" /> Send Private Feedback
                        </>
                      )}
                    </Button>
                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={(e) => handleOpenGoogleReviews(e)}
                        disabled={isRedirecting}
                        className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Or proceed to Google Reviews anyway
                      </button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Generated Review (for 4 & 5 stars) */}
        {rating >= 4 && hasGenerated && (
          <div ref={reviewSectionRef} className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <Card className="shadow-xs border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                    <Sparkles className="w-4 h-4 text-primary-600" />
                    3. Your Review (Editable)
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRegenerate}
                    disabled={isGenerating}
                    className="h-8 text-xs gap-1.5 text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-950/50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>Regenerate</span>
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  You can edit or personalize this text before copying:
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    value={reviewText}
                    onChange={(e) => {
                      setReviewText(e.target.value);
                      setIsCopied(false);
                      setCopyFallbackMessage(null);
                    }}
                    onBlur={() => {
                      if (sessionId && reviewText.trim()) {
                        api.patch('/review/sessions/edit', { session_id: sessionId, edited_text: reviewText }).catch(() => {});
                      }
                    }}
                    rows={5}
                    placeholder="Write your review here..."
                    className="text-base leading-relaxed p-3.5 border-slate-300 dark:border-slate-700 focus:ring-primary-500 rounded-xl resize-y font-normal"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                    <span>{reviewText.length} characters</span>
                    <span>Tap above to edit text directly</span>
                  </div>
                </div>

                {/* Fallback instruction if browser clipboard permission was blocked */}
                {copyFallbackMessage && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                    {copyFallbackMessage}
                  </div>
                )}

                {/* Step 4: Copy Review Button */}
                <div className="space-y-3 pt-2">
                  <Button
                    type="button"
                    onClick={handleCopyReview}
                    className={`w-full h-12 text-base font-semibold transition-all shadow-sm ${
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

                  {/* Step 8 & 9: Prominent message and Open Google Reviews button */}
                  {isCopied && (
                    <div className="space-y-3 animate-in fade-in duration-200">
                      <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex items-start gap-2.5 text-emerald-900 dark:text-emerald-200">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="text-xs sm:text-sm font-medium">
                          <strong>Review copied successfully.</strong> Open Google Reviews to post it.
                        </div>
                      </div>

                      <Button
                        type="button"
                        onClick={(e) => handleOpenGoogleReviews(e)}
                        disabled={isRedirecting}
                        className="w-full h-12 text-base font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white shadow-md flex items-center justify-center gap-2"
                      >
                        {isRedirecting ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" /> Opening Google...
                          </>
                        ) : (
                          <>
                            <ExternalLink className="h-5 w-5" /> Open Google Reviews
                          </>
                        )}
                      </Button>

                      <p className="text-center text-[11px] text-slate-500">
                        After opening Google, simply long-press or right-click to paste your copied review and click Post!
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-4 px-4 text-center text-xs text-slate-500 bg-white dark:bg-slate-900">
        <p>Powered by ReviewAI • Authentic reviews for {business.name}</p>
      </footer>
    </div>
  );
}