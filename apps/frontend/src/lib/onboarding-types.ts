/**
 * Onboarding Types
 * ReviewAI Frontend
 * Type definitions for onboarding wizard
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
  dashboard_tour?: { completed_tour?: boolean; current_tour_step?: number };
  completed?: { pilot_feedback_submitted?: boolean };
  [key: string]: unknown;
}

export interface BusinessInfoStepData {
  name: string;
  category?: string;
  description?: string;
  google_place_id?: string;
  google_review_url: string;
  website_url?: string;
  phone?: string;
  address?: string;
  timezone: string;
  business_id?: string;
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
  rating: number;
  feedback_text: string | null;
  step_context: OnboardingStep | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type PilotFeedbackCategory =
  | 'signup'
  | 'business_setup'
  | 'google_config'
  | 'tags'
  | 'qr_design'
  | 'qr_test'
  | 'dashboard'
  | 'overall';

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

export const DEFAULT_TAGS: ExperienceTag[] = [
  { id: '1', label: 'Food Quality', emoji: '🍕', order: 1 },
  { id: '2', label: 'Service', emoji: '🤝', order: 2 },
  { id: '3', label: 'Atmosphere', emoji: '✨', order: 3 },
  { id: '4', label: 'Value', emoji: '💰', order: 4 },
  { id: '5', label: 'Cleanliness', emoji: '🧼', order: 5 },
  { id: '6', label: 'Speed', emoji: '⚡', order: 6 },
];

export const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
  'Australia/Melbourne',
];

export const QR_FRAMES = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'square', label: 'Square' },
  { value: 'circle', label: 'Circle' },
  { value: 'none', label: 'None' },
];

export const QR_ERROR_CORRECTION = [
  { value: 'L', label: 'Low (7%)' },
  { value: 'M', label: 'Medium (15%)' },
  { value: 'Q', label: 'Quartile (25%)' },
  { value: 'H', label: 'High (30%)' },
];