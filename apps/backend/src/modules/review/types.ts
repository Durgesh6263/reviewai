/**
 * Review Module Types
 * ReviewAI SaaS Platform
 */

export interface ReviewSession {
  id: string;
  qr_code_id: string;
  business_id: string;
  scan_log_id: string;
  language: string;
  rating: number;
  status: SessionStatus;
  started_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
  metadata: SessionMetadata;
}

export type SessionStatus =
  | 'started'
  | 'language_selected'
  | 'rating_selected'
  | 'review_generated'
  | 'review_edited'
  | 'redirected'
  | 'abandoned'
  | 'private_feedback_submitted';

export interface GenerationHistoryItem {
  variation: number;
  text: string;
  generated_at: string;
  provider?: string;
  model?: string;
}

export interface SessionMetadata {
  referrer?: string;
  utm_params?: Record<string, string>;
  ab_test_variant?: string;
  feedback_text?: string;
  is_private_feedback?: boolean;
  copied_at?: string;
  copy_count?: number;
  feedback_started_at?: string;
  feedback_skipped_at?: string;
  feedback_submitted_at?: string;
  google_redirected_at?: string;
  generation_history?: GenerationHistoryItem[];
  tags?: string[];
  customer_text?: string;
  [key: string]: any;
}

export interface GeneratedReview {
  id: string;
  session_id: string;
  business_id: string;
  language: string;
  rating: number;
  ai_provider: AIProvider;
  model: string;
  prompt_version: string;
  generated_text: string;
  edited_text: string | null;
  final_text: string;
  generation_time_ms: number;
  token_usage: TokenUsage | null;
  regeneration_count: number;
  created_at: string;
  updated_at: string;
}

export type AIProvider = 'openai' | 'gemini';

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface GenerateReviewRequest {
  session_id: string;
  rating: number;
  language?: string;
  tags?: string[];
  customer_text?: string;
  variation?: number;
  simulatedError?: 'timeout' | 'api_error' | 'rate_limit' | 'malformed_response';
  throwOnAiError?: boolean;
}

export interface SelectTagsRequest {
  session_id: string;
  tags: string[];
}

export interface RecordCopyRequest {
  session_id: string;
}

export interface RecordFeedbackStartRequest {
  session_id: string;
}

export interface RecordFeedbackSkipRequest {
  session_id: string;
}

export interface UpdateReviewRequest {
  edited_text: string;
}

export interface RegenerateReviewRequest {
  session_id: string;
}

export interface CompleteReviewRequest {
  session_id: string;
}

export interface ReviewSessionResponse {
  session: ReviewSession;
  review: GeneratedReview | null;
  business: {
    id: string;
    name: string;
    slug: string;
    google_review_url: string;
    settings: any;
  };
}

export interface ReviewFlowStep {
  step: 'language' | 'rating' | 'review' | 'editor' | 'redirect';
  session: ReviewSession;
  review?: GeneratedReview;
}

export const REVIEW_CONSTANTS = {
  SUPPORTED_LANGUAGES: [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
    { code: 'hinglish', name: 'Hinglish', native: 'Hinglish' },
    { code: 'es', name: 'Spanish', native: 'Español' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'de', name: 'German', native: 'Deutsch' },
    { code: 'pt', name: 'Portuguese', native: 'Português' },
    { code: 'it', name: 'Italian', native: 'Italiano' },
    { code: 'ja', name: 'Japanese', native: '日本語' },
    { code: 'ko', name: 'Korean', native: '한국어' },
    { code: 'zh', name: 'Chinese', native: '中文' },
  ],
  SUPPORTED_RATINGS: [1, 2, 3, 4, 5] as const,
  MAX_REGENERATIONS: 5,
  AI_PROVIDERS: ['openai', 'gemini'] as const,
  DEFAULT_AI_PROVIDER: 'openai' as AIProvider,
  DEFAULT_MODEL: 'gpt-4o-mini',
  PROMPT_VERSION: 'v1.0',
  MAX_REVIEW_LENGTH: 4000,
  MIN_REVIEW_LENGTH: 10,
} as const;

export const SESSION_STATUS_FLOW: Record<SessionStatus, SessionStatus[]> = {
  started: ['language_selected', 'rating_selected', 'review_generated', 'private_feedback_submitted', 'abandoned'],
  language_selected: ['rating_selected', 'review_generated', 'private_feedback_submitted', 'abandoned'],
  rating_selected: ['review_generated', 'private_feedback_submitted', 'redirected', 'abandoned'],
  review_generated: ['review_generated', 'review_edited', 'private_feedback_submitted', 'redirected', 'abandoned'],
  review_edited: ['review_generated', 'review_edited', 'private_feedback_submitted', 'redirected', 'abandoned'],
  redirected: ['redirected'],
  abandoned: [],
  private_feedback_submitted: ['private_feedback_submitted', 'redirected'],
};

export function isValidStatusTransition(current: SessionStatus, next: SessionStatus): boolean {
  if (current === next) return true; // Idempotent same-state transition
  return SESSION_STATUS_FLOW[current]?.includes(next) ?? false;
}

// AI Provider types for factory
export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  organizationId?: string;
}

export interface ReviewGenerationInput {
  businessName: string;
  businessCategory: string;
  businessCategoryName?: string;
  rating: number;
  language: string;
  tone?: 'professional' | 'casual' | 'enthusiastic' | 'detailed';
  length?: 'short' | 'medium' | 'long';
  customPrompt?: string;
  tags?: string[];
  customerNotes?: string;
  variation?: number;
  duplicatePreventionPrompt?: string;
}

export interface ReviewGenerationOutput {
  text: string;
  tokenUsage?: TokenUsage;
  generationTimeMs: number;
}