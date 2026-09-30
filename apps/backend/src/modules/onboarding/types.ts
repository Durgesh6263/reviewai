/**
 * Onboarding Module Types
 * ReviewAI SaaS Platform
 * Onboarding progress tracking for pilot users
 */

export type OnboardingStep =
  | 'welcome'
  | 'business_info'
  | 'google_config'
  | 'experience_tags'
  | 'qr_generation'
  | 'qr_test'
  | 'dashboard_tour'
  | 'completed';

export type PilotFeedbackCategory =
  | 'signup'
  | 'business_setup'
  | 'google_config'
  | 'tags'
  | 'qr_design'
  | 'qr_test'
  | 'dashboard'
  | 'overall';

export interface OnboardingProgress {
  id: string;
  user_id: string;
  business_id: string | null;
  current_step: OnboardingStep;
  completed_steps: OnboardingStep[];
  step_data: OnboardingStepData;
  started_at: string;
  completed_at: string | null;
  is_pilot_user: boolean;
  pilot_cohort: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingStepData {
  business_info?: BusinessInfoStepData;
  google_config?: GoogleConfigStepData;
  tags?: TagsStepData;
  qr_design?: QRDesignStepData;
  qr_test?: QRTestStepData;
}

export interface BusinessInfoStepData {
  name: string;
  description?: string;
  google_place_id?: string;
  google_review_url: string;
  website_url?: string;
  phone?: string;
  address?: string;
  timezone: string;
}

export interface GoogleConfigStepData {
  google_review_url: string;
  verified: boolean;
}

export interface TagsStepData {
  tags: ExperienceTag[];
}

export interface ExperienceTag {
  id: string;
  label: string;
  emoji: string;
  order: number;
}

export interface QRDesignStepData {
  qr_id: string;
  color: string;
  logo: boolean;
  frame: string;
  frame_text: string;
  size: number;
  error_correction: 'L' | 'M' | 'Q' | 'H';
}

export interface QRTestStepData {
  test_scan_id?: string;
  scanned_at?: string;
  verified: boolean;
}

export interface PilotFeedback {
  id: string;
  user_id: string;
  business_id: string | null;
  category: PilotFeedbackCategory;
  rating: number; // 1-5
  feedback_text: string | null;
  step_context: OnboardingStep | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OnboardingFunnel {
  current_step: OnboardingStep;
  user_count: number;
  pilot_count: number;
  completed_count: number;
}

export interface PilotFeedbackSummary {
  category: PilotFeedbackCategory;
  step_context: OnboardingStep | null;
  feedback_count: number;
  avg_rating: number;
  negative_count: number;
  positive_count: number;
}

// API Request/Response types
export interface GetOnboardingProgressResponse {
  progress: OnboardingProgress | null;
}

export interface UpdateOnboardingStepRequest {
  step: OnboardingStep;
  step_data?: Partial<OnboardingStepData>;
}

export interface UpdateOnboardingStepResponse {
  progress: OnboardingProgress;
}

export interface CompleteOnboardingResponse {
  progress: OnboardingProgress;
}

export interface SubmitPilotFeedbackRequest {
  business_id?: string;
  category: PilotFeedbackCategory;
  rating: number;
  feedback_text?: string;
  step_context?: OnboardingStep;
  metadata?: Record<string, unknown>;
}

export interface SubmitPilotFeedbackResponse {
  feedback: PilotFeedback;
}

export interface OnboardingFunnelResponse {
  funnel: OnboardingFunnel[];
}

export interface PilotFeedbackSummaryResponse {
  summary: PilotFeedbackSummary[];
}

// Constants
export const ONBOARDING_STEPS: OnboardingStep[] = [
  'welcome',
  'business_info',
  'google_config',
  'experience_tags',
  'qr_generation',
  'qr_test',
  'dashboard_tour',
  'completed',
];

export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: 'Welcome',
  business_info: 'Business Info',
  google_config: 'Google Config',
  experience_tags: 'Experience Tags',
  qr_generation: 'QR Generation',
  qr_test: 'QR Test',
  dashboard_tour: 'Dashboard Tour',
  completed: 'Completed',
};

export const ONBOARDING_STEP_DESCRIPTIONS: Record<OnboardingStep, string> = {
  welcome: 'Welcome to ReviewAI! Let\'s get you set up.',
  business_info: 'Tell us about your business',
  google_config: 'Connect your Google Review page',
  experience_tags: 'Add experience tags for reviews',
  qr_generation: 'Design your QR code',
  qr_test: 'Test your QR code',
  dashboard_tour: 'Explore your dashboard',
  completed: 'You\'re all set!',
};

export const PILOT_LIMITS = {
  max_qr_codes: 3,
  max_scans_per_month: 100,
  max_staff: 1,
} as const;