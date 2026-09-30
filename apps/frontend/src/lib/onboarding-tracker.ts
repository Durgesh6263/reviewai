/**
 * Onboarding Tracker
 * ReviewAI Frontend
 * Client-side onboarding progress tracking
 */

import { api } from '@/lib/api-client';
import type {
  OnboardingProgress,
  OnboardingStep,
  OnboardingStepData,
  PilotFeedbackCategory,
} from '@/lib/onboarding-types';

export class OnboardingTracker {
  private static instance: OnboardingTracker;
  private progressCache: OnboardingProgress | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds

  static getInstance(): OnboardingTracker {
    if (!OnboardingTracker.instance) {
      OnboardingTracker.instance = new OnboardingTracker();
    }
    return OnboardingTracker.instance;
  }

  /**
   * Get onboarding progress from API (with caching)
   */
  async getProgress(): Promise<OnboardingProgress | null> {
    // Check cache
    if (this.progressCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.progressCache;
    }

    try {
      const response = await api.get<{ success: boolean; data: { progress: OnboardingProgress | null } }>('/onboarding/progress');
      this.progressCache = response.data.progress;
      this.cacheTimestamp = Date.now();
      return this.progressCache;
    } catch (error) {
      console.error('Failed to fetch onboarding progress:', error);
      return null;
    }
  }

  /**
   * Update onboarding step
   */
  async updateStep(step: OnboardingStep, stepData: Partial<OnboardingStepData> = {}): Promise<OnboardingProgress> {
    const response = await api.post<{ success: boolean; data: { progress: OnboardingProgress } }>('/onboarding/progress/step', {
      step,
      step_data: stepData,
    });

    this.progressCache = response.data.progress;
    this.cacheTimestamp = Date.now();
    return this.progressCache;
  }

  /**
   * Complete onboarding
   */
  async completeOnboarding(): Promise<OnboardingProgress> {
    const response = await api.post<{ success: boolean; data: { progress: OnboardingProgress } }>('/onboarding/progress/complete', {});
    this.progressCache = response.data.progress;
    this.cacheTimestamp = Date.now();
    return this.progressCache;
  }

  /**
   * Submit pilot feedback
   */
  async submitFeedback(data: {
    business_id?: string;
    category: PilotFeedbackCategory;
    rating: number;
    feedback_text?: string;
    step_context?: OnboardingStep;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await api.post('/onboarding/feedback', data);
  }

  /**
   * Check if user has completed onboarding
   */
  async isOnboardingComplete(): Promise<boolean> {
    const progress = await this.getProgress();
    return progress?.current_step === 'completed' && progress?.completed_at !== null;
  }

  /**
   * Get current step
   */
  async getCurrentStep(): Promise<OnboardingStep | null> {
    const progress = await this.getProgress();
    return progress?.current_step || null;
  }

  /**
   * Check if step is completed
   */
  async isStepCompleted(step: OnboardingStep): Promise<boolean> {
    const progress = await this.getProgress();
    return progress?.completed_steps.includes(step) || false;
  }

  /**
   * Get step data
   */
  async getStepData<K extends keyof OnboardingStepData>(step: K): Promise<OnboardingStepData[K] | undefined> {
    const progress = await this.getProgress();
    return progress?.step_data[step];
  }

  /**
   * Clear cache (call after logout or manual refresh)
   */
  clearCache(): void {
    this.progressCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Get all completed steps
   */
  async getCompletedSteps(): Promise<OnboardingStep[]> {
    const progress = await this.getProgress();
    return progress?.completed_steps || [];
  }

  /**
   * Check if user is a pilot user
   */
  async isPilotUser(): Promise<boolean> {
    const progress = await this.getProgress();
    return progress?.is_pilot_user || false;
  }

  /**
   * Get pilot cohort
   */
  async getPilotCohort(): Promise<string | null> {
    const progress = await this.getProgress();
    return progress?.pilot_cohort || null;
  }
}

// Export singleton instance
export const onboardingTracker = OnboardingTracker.getInstance();