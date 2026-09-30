'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { onboardingTracker } from '@/lib/onboarding-tracker';
import { useAuth } from '@/lib/auth-provider';

export default function OnboardingPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    const checkOnboarding = async () => {
      if (authLoading) return;

      if (!user) {
        // Redirect to login if not authenticated
        window.location.href = '/login?redirect=/onboarding';
        return;
      }

      try {
        const progress = await onboardingTracker.getProgress();

        if (progress?.current_step === 'completed') {
          // Already completed, redirect to dashboard
          window.location.href = '/dashboard';
          return;
        }
      } catch (error) {
        console.error('Failed to check onboarding status:', error);
      } finally {
        setShowWizard(true);
        setIsLoading(false);
      }
    };

    checkOnboarding();
  }, [user, authLoading]);

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-950">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary-600 dark:text-secondary-400 font-medium">Loading onboarding...</p>
        </div>
      </div>
    );
  }

  return (
    <OnboardingWizard
      onComplete={() => {
        window.location.href = '/dashboard';
      }}
    />
  );
}