/**
 * Onboarding Module Validators
 * ReviewAI SaaS Platform
 * Zod validation schemas for onboarding API
 */

import { z } from 'zod';
import {
  OnboardingStep,
  PilotFeedbackCategory,
  ONBOARDING_STEPS,
} from './types';

// ============================================================================
// Onboarding Progress Validators
// ============================================================================

export const updateOnboardingStepSchema = z.object({
  body: z.object({
    step: z.enum(ONBOARDING_STEPS as [OnboardingStep, ...OnboardingStep[]]),
    step_data: z.record(z.unknown()).optional(),
  }),
});

export const completeOnboardingSchema = z.object({
  body: z.object({
    // Empty body - completion just marks current step as done
  }),
});

export const verifyGoogleUrlSchema = z.object({
  body: z.object({
    google_review_url: z.string().url('Invalid URL format'),
  }),
});

// ============================================================================
// Pilot Feedback Validators
// ============================================================================

export const submitPilotFeedbackSchema = z.object({
  body: z.object({
    business_id: z.string().uuid().optional(),
    category: z.enum([
      'signup',
      'business_setup',
      'google_config',
      'tags',
      'qr_design',
      'qr_test',
      'dashboard',
      'overall',
    ] as [PilotFeedbackCategory, ...PilotFeedbackCategory[]]),
    rating: z.number().int().min(1).max(5),
    feedback_text: z.string().max(2000).optional(),
    step_context: z
      .enum(ONBOARDING_STEPS as [OnboardingStep, ...OnboardingStep[]])
      .optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

// ============================================================================
// Query Parameters
// ============================================================================

export const onboardingFunnelQuerySchema = z.object({
  query: z.object({
    pilot_only: z.coerce.boolean().optional(),
  }),
});

// ============================================================================
// Type Exports
// ============================================================================

export type UpdateOnboardingStepInput = z.infer<typeof updateOnboardingStepSchema>['body'];
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>['body'];
export type SubmitPilotFeedbackInput = z.infer<typeof submitPilotFeedbackSchema>['body'];
export type OnboardingFunnelQuery = z.infer<typeof onboardingFunnelQuerySchema>['query'];