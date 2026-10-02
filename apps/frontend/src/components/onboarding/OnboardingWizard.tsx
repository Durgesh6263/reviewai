'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api-client';
import { onboardingTracker } from '@/lib/onboarding-tracker';
import type { OnboardingStep, OnboardingStepData, BusinessInfoStepData, ExperienceTag, OnboardingProgress } from '@/lib/onboarding-types';
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEP_DESCRIPTIONS,
  DEFAULT_TAGS,
  TIMEZONES,
} from '@/lib/onboarding-types';
import { getCategoryExperienceTags } from '@/lib/categories';
import { WelcomeStep } from './steps/WelcomeStep';
import { BusinessInfoStep } from './steps/BusinessInfoStep';
import { ExperienceTagsStep } from './steps/ExperienceTagsStep';
import { QRGenerationStep } from './steps/QRGenerationStep';
import { QRTestStep } from './steps/QRTestStep';
import { DashboardTourStep } from './steps/DashboardTourStep';
import { CompletedStep } from './steps/CompletedStep';

interface OnboardingWizardProps {
  onComplete?: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepData, setStepData] = useState<OnboardingStepData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingBusiness, setIsCheckingBusiness] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [duplicateBlocked, setDuplicateBlocked] = useState<{
    isBlocked: boolean;
    googleReviewUrl?: string;
    existingAccount?: string;
  } | null>(null);
  const [businessInfoErrors, setBusinessInfoErrors] = useState<Partial<Record<keyof BusinessInfoStepData, string>>>({});

  const currentStep = ONBOARDING_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === ONBOARDING_STEPS.length - 1;

  // Load progress on mount
  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    setIsLoading(true);
    try {
      const prog = await onboardingTracker.getProgress();
      if (prog) {
        setProgress(prog);

        // Check if server indicated duplicate blocked
        if (prog.status === 'duplicate_blocked' || (prog.step_data as any)?.duplicate_blocked) {
          const dupBlock = (prog.step_data as any)?.duplicate_blocked || {};
          const rawAccount =
            dupBlock.maskedExistingAccount ||
            dupBlock.existing_account ||
            (prog.step_data as any)?.duplicate_existing_account ||
            (prog.step_data as any)?.existing_account;

          const maskedAccount =
            rawAccount && rawAccount !== 'Protected Account' && rawAccount !== 'Protected'
              ? rawAccount
              : 'du************le@gmail.com';

          const safeUrl =
            dupBlock.googleReviewUrl ||
            dupBlock.google_review_url ||
            (prog.step_data as any)?.google_review_url ||
            prog.step_data?.business_info?.google_review_url ||
            '';

          setDuplicateBlocked({
            isBlocked: true,
            googleReviewUrl: safeUrl,
            existingAccount: maskedAccount,
          });
          setCurrentStepIndex(ONBOARDING_STEPS.indexOf('business_info'));
        } else {
          // Handle legacy google_config if present
          let step = prog.current_step as string;
          if (step === 'google_config') {
            step = 'experience_tags';
          }
          const stepIdx = ONBOARDING_STEPS.indexOf(step as OnboardingStep);
          setCurrentStepIndex(stepIdx >= 0 ? stepIdx : 0);
        }

        setStepData(prog.step_data || {});
        if (prog.business_id) {
          setBusinessId(prog.business_id);
        }
      }
    } catch (error) {
      console.error('Failed to load onboarding progress:', error);
      toast.error('Failed to load onboarding progress');
    } finally {
      setIsLoading(false);
    }
  };

  const saveStep = async (step: OnboardingStep, data: Partial<OnboardingStepData>) => {
    setIsSaving(true);
    try {
      const updatedProgress = await onboardingTracker.updateStep(step, data);
      setProgress(updatedProgress);
      setStepData(updatedProgress.step_data);
    } catch (error) {
      console.error('Failed to save step:', error);
      toast.error('Failed to save progress');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearDuplicateWarning = useCallback(() => {
    setDuplicateBlocked(null);
  }, []);

  const handleNext = useCallback(async () => {
    if (currentStepIndex < ONBOARDING_STEPS.length - 1) {
      // Step 2: Business Info validation and creation
      if (currentStep === 'business_info') {
        if (duplicateBlocked?.isBlocked) {
          toast.error('Please resolve the duplicate business issue or contact support.');
          return;
        }

        const bInfo = stepData.business_info || {
          name: '',
          category: '',
          address: '',
          phone: '',
          google_review_url: '',
          website_url: '',
          timezone: 'UTC',
        };

        const errors: Partial<Record<keyof BusinessInfoStepData, string>> = {};
        if (!bInfo.name?.trim()) {
          errors.name = 'Business name is required';
        }
        if (!bInfo.address?.trim()) {
          errors.address = 'Business address is required';
        }
        if (!bInfo.phone?.trim()) {
          errors.phone = 'Business phone number is required';
        } else if (!/^[\d\s\-\+\(\)]{7,}$/.test(bInfo.phone.trim())) {
          errors.phone = 'Please enter a valid phone number (min 7 digits)';
        }
        if (!bInfo.google_review_url?.trim()) {
          errors.google_review_url = 'Google Review URL is required';
        } else {
          try {
            const url = new URL(bInfo.google_review_url.trim());
            const host = url.hostname.toLowerCase();
            const isGoogle =
              host === 'g.page' ||
              host.endsWith('.g.page') ||
              host === 'maps.app.goo.gl' ||
              host === 'goo.gl' ||
              host.endsWith('.goo.gl') ||
              host === 'google.com' ||
              host.endsWith('.google.com') ||
              /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);
            if (!isGoogle) {
              errors.google_review_url = 'Please enter a valid Google Review or Google Maps business URL';
            }
          } catch {
            errors.google_review_url = 'Please enter a valid URL';
          }
        }

        if (Object.keys(errors).length > 0) {
          setBusinessInfoErrors(errors);
          toast.error('Please complete all required fields: Business Name, Address, Phone, and Google Review URL.');
          return;
        }

        setBusinessInfoErrors({});
        setIsCheckingBusiness(true);

        try {
          const payload = {
            name: bInfo.name.trim(),
            category: bInfo.category || 'other',
            address: bInfo.address.trim(),
            address_line1: bInfo.address.trim(),
            phone: bInfo.phone.trim(),
            google_review_url: bInfo.google_review_url.trim(),
            website_url: bInfo.website_url?.trim() || undefined,
            timezone: bInfo.timezone || 'UTC',
          };

          const res = await api.post<{ success: boolean; data: { id: string } }>('/businesses', payload);
          const newBizId = res.data?.id;

          if (newBizId) {
            setBusinessId(newBizId);
            setDuplicateBlocked(null);

            const updatedStepData = {
              ...stepData,
              business_info: {
                ...bInfo,
                business_id: newBizId,
              },
            };
            setStepData(updatedStepData);

            // Advance step to experience_tags
            await saveStep('experience_tags', updatedStepData);
            setCurrentStepIndex(ONBOARDING_STEPS.indexOf('experience_tags'));
            toast.success('Business verified and saved!');
          }
        } catch (err: any) {
          console.error('Business creation/verification failed:', err?.message || err);
          const resData = err.response?.data;
          const isDuplicate =
            err.response?.status === 409 ||
            resData?.code === 'GOOGLE_BUSINESS_ALREADY_REGISTERED' ||
            resData?.error?.code === 'GOOGLE_BUSINESS_ALREADY_REGISTERED';

          if (isDuplicate) {
            const details = resData?.details || (typeof resData?.error === 'object' ? resData.error.details : {}) || resData || {};
            const rawAccount =
              details.maskedExistingAccount ||
              details.existing_account ||
              details.masked_existing_account ||
              resData?.maskedExistingAccount ||
              resData?.existing_account;

            const maskedAccount =
              rawAccount && rawAccount !== 'Protected Account' && rawAccount !== 'Protected'
                ? rawAccount
                : 'du************le@gmail.com';

            const safeUrl =
              details.googleReviewUrl ||
              details.google_review_url ||
              resData?.googleReviewUrl ||
              resData?.google_review_url ||
              bInfo.google_review_url;

            setDuplicateBlocked({
              isBlocked: true,
              googleReviewUrl: safeUrl,
              existingAccount: maskedAccount,
            });
            const errorMsg =
              typeof resData?.error === 'string'
                ? resData.error
                : (resData?.error?.message || 'This Google Business is already registered with ReviewAI.');
            toast.error(errorMsg);
          } else if (err.response?.status === 400) {
            const msg = typeof resData?.error === 'string' ? resData.error : (resData?.error?.message || 'Please check the entered business details.');
            toast.error(msg);
          } else {
            const msg = typeof resData?.error === 'string' ? resData.error : (resData?.error?.message || 'Failed to validate business. Please check details and try again.');
            toast.error(msg);
          }
        } finally {
          setIsCheckingBusiness(false);
        }
      } else {
        await saveStep(currentStep, stepData);
        setCurrentStepIndex(prev => prev + 1);
      }
    }
  }, [currentStepIndex, currentStep, stepData, duplicateBlocked, saveStep]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      if (duplicateBlocked?.isBlocked) {
        setDuplicateBlocked(null);
      }
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex, duplicateBlocked]);

  const handleComplete = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await onboardingTracker.completeOnboarding();
      toast.success('Onboarding completed! 🎉');
      onComplete?.();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      toast.error('Failed to complete onboarding');
    } finally {
      setIsSubmitting(false);
    }
  }, [onComplete]);

  const updateStepData = useCallback((
    key: string,
    value: unknown
  ) => {
    setStepData(prev => {
      const next = { ...prev };
      if (value === undefined) {
        delete next[key];
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
      return next;
    });
  }, []);

  const renderStep = () => {
    const baseProps = {
      onDataChange: updateStepData,
      isSaving,
    };

    switch (currentStep) {
      case 'welcome':
        return <WelcomeStep {...baseProps} stepData={undefined} />;
      case 'business_info':
        return (
          <BusinessInfoStep
            {...baseProps}
            stepData={stepData.business_info}
            timezones={TIMEZONES}
            defaultTags={DEFAULT_TAGS}
            duplicateBlocked={duplicateBlocked}
            onClearDuplicateWarning={handleClearDuplicateWarning}
            validationErrors={businessInfoErrors}
          />
        );
      case 'experience_tags': {
        const categoryTags = getCategoryExperienceTags(stepData.business_info?.category);
        return <ExperienceTagsStep {...baseProps} stepData={stepData.tags} defaultTags={categoryTags.length >= 6 ? categoryTags : DEFAULT_TAGS} />;
      }
      case 'qr_generation':
        return <QRGenerationStep {...baseProps} stepData={stepData.qr_design} businessId={businessId ?? undefined} />;
      case 'qr_test':
        return <QRTestStep {...baseProps} stepData={stepData.qr_test} businessId={businessId ?? undefined} />;
      case 'dashboard_tour':
        return <DashboardTourStep {...baseProps} stepData={stepData.dashboard_tour} />;
      case 'completed':
        return <CompletedStep {...baseProps} stepData={stepData.completed} onComplete={handleComplete} />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-950">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary-600 dark:text-secondary-400">Loading onboarding...</p>
        </div>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-950">
        <div className="text-center">
          <X className="h-12 w-12 text-error-500 mx-auto mb-4" />
          <p className="text-secondary-600 dark:text-secondary-400">Failed to load onboarding</p>
          <Button onClick={loadProgress} className="mt-4">Retry</Button>
        </div>
      </div>
    );
  }

  const stepProgress = ((currentStepIndex + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950">
      {/* Progress Bar */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-white/95 dark:bg-secondary-900/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <Progress value={stepProgress} className="h-2" />
          {/* Mobile Step Indicator */}
          <div className="sm:hidden flex justify-between items-center mt-1.5 text-xs text-secondary-500">
            <span>Step {currentStepIndex + 1} of {ONBOARDING_STEPS.length}</span>
            <span className="font-semibold text-primary-600 dark:text-primary-400 truncate max-w-[200px]">
              {ONBOARDING_STEP_LABELS[currentStep]}
            </span>
          </div>

          {/* Desktop Step Indicator */}
          <div className="hidden sm:flex justify-between mt-2 text-xs text-secondary-500">
            {ONBOARDING_STEPS.map((step, index) => (
              <span
                key={step}
                className={`flex-1 text-center transition-colors truncate px-1 ${
                  index <= currentStepIndex
                    ? 'text-primary-600 dark:text-primary-400 font-medium'
                    : 'text-secondary-400 dark:text-secondary-500'
                }`}
              >
                {ONBOARDING_STEP_LABELS[step]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="pt-20 pb-16 px-4 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-secondary-900 dark:text-white">
            {ONBOARDING_STEP_LABELS[currentStep]}
          </h1>
          <p className="text-secondary-600 dark:text-secondary-400 mt-1">
            {ONBOARDING_STEP_DESCRIPTIONS[currentStep]}
          </p>
        </div>

        <Card className="bg-white dark:bg-secondary-900">
          <CardContent className="p-6">
            {renderStep()}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={isFirstStep || isSaving}
            className={isFirstStep ? 'invisible' : ''}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-4">
            {isLastStep ? (
              <Button
                onClick={handleComplete}
                disabled={isSubmitting}
                className="w-48"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Completing...
                  </>
                ) : (
                  'Finish'
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={isSaving || isCheckingBusiness || (currentStep === 'business_info' && duplicateBlocked?.isBlocked)}
                className="w-48"
              >
                {isCheckingBusiness ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Checking business...
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Pilot Badge */}
        {progress.is_pilot_user && (
          <div className="mt-6 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
            <p className="text-sm text-primary-700 dark:text-primary-300">
              <strong>Pilot Mode:</strong> You&apos;re part of the {progress.pilot_cohort} cohort.
              Your feedback helps us improve ReviewAI!
            </p>
          </div>
        )}
      </main>
    </div>
  );
}