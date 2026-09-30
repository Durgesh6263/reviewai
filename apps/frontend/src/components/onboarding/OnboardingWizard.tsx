'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'react-hot-toast';
import { onboardingTracker } from '@/lib/onboarding-tracker';
import type { OnboardingStep, OnboardingStepData, ExperienceTag, OnboardingProgress } from '@/lib/onboarding-types';
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
import { GoogleConfigStep } from './steps/GoogleConfigStep';
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
  const [businessId, setBusinessId] = useState<string | null>(null);

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
        setCurrentStepIndex(ONBOARDING_STEPS.indexOf(prog.current_step));
        setStepData(prog.step_data || {});
        // Extract business_id from step_data if available
        if (prog.step_data?.business_info) {
          // We don't store business_id in step_data, but we can track it
          // The business will be created when user completes business_info step
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
      toast.success('Progress saved');
    } catch (error) {
      console.error('Failed to save step:', error);
      toast.error('Failed to save progress');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBusinessCreated = useCallback((newBusinessId: string) => {
    setBusinessId(newBusinessId);
    // Save the business_id to step data for use in later steps
    setStepData(prev => {
      const currentBusinessInfo = prev.business_info || { name: '', google_review_url: '', timezone: 'UTC' };
      return {
        ...prev,
        business_info: { ...currentBusinessInfo, business_id: newBusinessId }
      };
    });
  }, []);

  const handleNext = useCallback(async () => {
    if (currentStepIndex < ONBOARDING_STEPS.length - 1) {
      // For business_info step, create the business first
      if (currentStep === 'business_info') {
        // The BusinessInfoStep handles creation internally via onBusinessCreated callback
        // Just save the step data and proceed
        await saveStep(currentStep, stepData);
        setCurrentStepIndex(prev => prev + 1);
      } else {
        await saveStep(currentStep, stepData);
        setCurrentStepIndex(prev => prev + 1);
      }
    }
  }, [currentStepIndex, currentStep, stepData, saveStep]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);

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
            onBusinessCreated={handleBusinessCreated}
          />
        );
      case 'google_config':
        return <GoogleConfigStep {...baseProps} stepData={stepData.google_config} />;
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
                disabled={isSaving}
                className="w-48"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
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