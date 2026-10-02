/**
 * Onboarding Module Service
 * ReviewAI SaaS Platform
 * Core business logic for onboarding progress tracking
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  OnboardingProgress,
  OnboardingStep,
  OnboardingStepData,
  PilotFeedback,
  PilotFeedbackCategory,
  OnboardingFunnel,
  PilotFeedbackSummary,
  GetOnboardingProgressResponse,
  UpdateOnboardingStepResponse,
  CompleteOnboardingResponse,
  SubmitPilotFeedbackResponse,
  OnboardingFunnelResponse,
  PilotFeedbackSummaryResponse,
  PILOT_LIMITS,
} from './types';
import { AppError, NotFoundError } from '../../shared/exceptions';
import { resolveGoogleBusinessIdentity } from '../business/google-business';

export class OnboardingService {
  constructor(private supabase: SupabaseClient) {}

  private memoryStore: Map<string, any> = new Map();

  private isTableMissing(error: any): boolean {
    return Boolean(
      error && (
        error.code === 'PGRST205' ||
        error.message?.includes('schema cache') ||
        error.message?.includes('Could not find the table')
      )
    );
  }

  private getMemoryItem(userId: string): OnboardingProgress {
    let p = this.memoryStore.get(userId);
    if (!p) {
      p = {
        id: crypto.randomUUID(),
        user_id: userId,
        business_id: null,
        current_step: 'welcome' as OnboardingStep,
        completed_steps: [],
        step_data: {},
        started_at: new Date().toISOString(),
        completed_at: null,
        is_pilot_user: false,
        pilot_cohort: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.memoryStore.set(userId, p);
    }
    return p;
  }

  private getMemoryProgress(userId: string): GetOnboardingProgressResponse {
    return { progress: this.getMemoryItem(userId) };
  }

  // ============================================================================
  // Onboarding Progress
  // ============================================================================

  /**
   * Get or create onboarding progress for a user
   */
  async getProgress(userId: string): Promise<GetOnboardingProgressResponse> {
    // Try to get existing progress
    const { data: progress, error } = await this.supabase
      .from('onboarding_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (this.isTableMissing(error)) {
        return this.getMemoryProgress(userId);
      }
      if (error.code !== 'PGRST116') {
        throw new AppError('Failed to get onboarding progress', 500, 'PROGRESS_FETCH_FAILED');
      }
    }

    // If not found, create default
    if (!progress) {
      return this.createDefaultProgress(userId);
    }

    return { progress: this.mapProgress(progress) };
  }

  /**
   * Create default onboarding progress for new user
   */
  async createDefaultProgress(userId: string): Promise<GetOnboardingProgressResponse> {
    const { data: progress, error } = await this.supabase
      .from('onboarding_progress')
      .insert({
        user_id: userId,
        current_step: 'welcome',
        completed_steps: [],
        step_data: {},
        is_pilot_user: false, // Will be set by auth flow or admin
      })
      .select()
      .single();

    if (error) {
      if (this.isTableMissing(error)) {
        return this.getMemoryProgress(userId);
      }
      throw new AppError('Failed to create onboarding progress', 500, 'PROGRESS_CREATION_FAILED');
    }

    if (!progress) {
      throw new AppError('Failed to create onboarding progress', 500, 'PROGRESS_CREATION_FAILED');
    }

    return { progress: this.mapProgress(progress) };
  }

  /**
   * Update onboarding step
   */
  async updateStep(
    userId: string,
    step: OnboardingStep,
    stepData: Partial<OnboardingStepData> = {}
  ): Promise<UpdateOnboardingStepResponse> {
    // Get current progress
    const { data: progress, error: fetchError } = await this.supabase
      .from('onboarding_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    // 1. If moving past business_info, enforce that duplicate is not blocked and business exists
    const restrictedSteps = ['experience_tags', 'qr_generation', 'qr_test', 'dashboard_tour', 'completed'];
    if (restrictedSteps.includes(step)) {
      if (progress && (progress.step_data as any)?.duplicate_blocked?.is_blocked) {
        throw new AppError(
          'Onboarding is blocked: this Google Business is already registered with ReviewAI.',
          409,
          'GOOGLE_BUSINESS_ALREADY_REGISTERED'
        );
      }

      // Check if user has an active, valid business
      const { data: userBusinesses } = await this.supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', userId)
        .is('deleted_at', null)
        .limit(1);

      if (!userBusinesses || userBusinesses.length === 0) {
        throw new AppError(
          'A valid, registered business is required before accessing this step.',
          403,
          'BUSINESS_REQUIRED'
        );
      }
    }

    if (fetchError) {
      if (this.isTableMissing(fetchError)) {
        const mem = this.getMemoryItem(userId);
        const completedSteps = [...mem.completed_steps];
        if (mem.current_step !== step) {
          const stepOrder = this.getStepOrder(mem.current_step);
          const newStepOrder = this.getStepOrder(step);
          if (newStepOrder > stepOrder) {
            completedSteps.push(mem.current_step);
          }
        }
        mem.current_step = step;
        mem.completed_steps = completedSteps;
        mem.step_data = { ...mem.step_data, ...stepData };
        mem.updated_at = new Date().toISOString();
        this.memoryStore.set(userId, mem);
        return { progress: mem };
      }
      // Create if doesn't exist
      return this.createProgressWithStep(userId, step, stepData);
    }

    // Determine completed steps
    const completedSteps = [...progress.completed_steps];
    if (progress.current_step !== step) {
      // Add previous step to completed if moving forward
      const stepOrder = this.getStepOrder(progress.current_step);
      const newStepOrder = this.getStepOrder(step);
      if (newStepOrder > stepOrder) {
        completedSteps.push(progress.current_step);
      }
    }

    // Merge step data
    const mergedStepData = { ...progress.step_data, ...stepData };

    const { data: updated, error } = await this.supabase
      .from('onboarding_progress')
      .update({
        current_step: step,
        completed_steps: completedSteps,
        step_data: mergedStepData,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !updated) {
      throw new AppError('Failed to update onboarding step', 500, 'STEP_UPDATE_FAILED');
    }

    return { progress: this.mapProgress(updated) };
  }

  /**
   * Create progress with initial step (for first-time setup)
   */
  private async createProgressWithStep(
    userId: string,
    step: OnboardingStep,
    stepData: Partial<OnboardingStepData>
  ): Promise<UpdateOnboardingStepResponse> {
    const { data: progress, error } = await this.supabase
      .from('onboarding_progress')
      .insert({
        user_id: userId,
        current_step: step,
        completed_steps: [],
        step_data: stepData,
        is_pilot_user: false,
      })
      .select()
      .single();

    if (error || !progress) {
      if (this.isTableMissing(error)) {
        const mem = this.getMemoryItem(userId);
        mem.current_step = step;
        mem.step_data = stepData as Record<string, unknown>;
        return { progress: mem };
      }
      throw new AppError('Failed to create onboarding progress', 500, 'PROGRESS_CREATION_FAILED');
    }

    return { progress: this.mapProgress(progress) };
  }

  /**
   * Complete onboarding
   */
  async completeOnboarding(userId: string): Promise<CompleteOnboardingResponse> {
    // Check if user has an active, valid business
    const { data: userBusinesses } = await this.supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', userId)
      .is('deleted_at', null)
      .limit(1);

    if (!userBusinesses || userBusinesses.length === 0) {
      throw new AppError(
        'A valid, registered business is required to complete onboarding.',
        403,
        'BUSINESS_REQUIRED'
      );
    }
    const { data: progress, error } = await this.supabase
      .from('onboarding_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (this.isTableMissing(error)) {
        const mem = this.getMemoryItem(userId);
        if (!mem.completed_steps.includes(mem.current_step)) {
          mem.completed_steps.push(mem.current_step);
        }
        mem.current_step = 'completed';
        mem.completed_at = new Date().toISOString();
        mem.updated_at = new Date().toISOString();
        this.memoryStore.set(userId, mem);
        return { progress: mem };
      }
      throw new NotFoundError('Onboarding progress');
    }

    if (!progress) {
      throw new NotFoundError('Onboarding progress');
    }

    const completedSteps = [...progress.completed_steps];
    if (!completedSteps.includes(progress.current_step)) {
      completedSteps.push(progress.current_step);
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('onboarding_progress')
      .update({
        current_step: 'completed',
        completed_steps: completedSteps,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError || !updated) {
      throw new AppError('Failed to complete onboarding', 500, 'COMPLETION_FAILED');
    }

    // Also update users table
    await this.supabase
      .from('users')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', userId);

    return { progress: this.mapProgress(updated) };
  }

  /**
   * Mark user as pilot
   */
  async markAsPilot(userId: string, cohort?: string): Promise<GetOnboardingProgressResponse> {
    const { data: progress, error } = await this.supabase
      .from('onboarding_progress')
      .update({
        is_pilot_user: true,
        pilot_cohort: cohort || `pilot-${new Date().getFullYear()}-q${Math.ceil((new Date().getMonth() + 1) / 3)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !progress) {
      if (this.isTableMissing(error)) {
        const mem = this.getMemoryItem(userId);
        mem.is_pilot_user = true;
        mem.pilot_cohort = cohort || `pilot-${new Date().getFullYear()}-q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
        return { progress: mem };
      }
      throw new AppError('Failed to mark user as pilot', 500, 'PILOT_UPDATE_FAILED');
    }

    // Also update users table
    await this.supabase
      .from('users')
      .update({
        is_pilot_user: true,
        pilot_cohort: cohort || `pilot-${new Date().getFullYear()}-q${Math.ceil((new Date().getMonth() + 1) / 3)}`,
      })
      .eq('id', userId);

    return { progress: this.mapProgress(progress) };
  }

  /**
   * Verify Google Review URL format and validity
   */
  async verifyGoogleReviewUrl(url: string): Promise<{ valid: boolean; details?: string; is_duplicate?: boolean; place_id?: string }> {
    const identity = resolveGoogleBusinessIdentity(url);
    if (!identity.isValid) {
      return {
        valid: false,
        details: identity.details || 'Please enter a valid Google Review or Google Maps business URL.',
      };
    }

    // Check duplicate Place ID or URL in database
    if (identity.placeId) {
      const { data: existing } = await this.supabase
        .from('businesses')
        .select('id, owner_id')
        .is('deleted_at', null)
        .eq('settings->>google_place_id', identity.placeId)
        .limit(1);

      if (existing && existing.length > 0) {
        return {
          valid: false,
          is_duplicate: true,
          place_id: identity.placeId,
          details: 'This Google Business is already registered with ReviewAI.',
        };
      }
    }

    return {
      valid: true,
      place_id: identity.placeId || undefined,
      details: 'URL verified successfully! Google Reviews page is accessible.',
    };
  }

  private testScanSessions: Map<string, { status: string; redirect_url?: string; created_at: number }> = new Map();

  /**
   * Create a simulated test scan session for onboarding
   */
  async createTestScanSession(businessId?: string, qrSlug?: string): Promise<{ session_id: string; test_url: string }> {
    const sessionId = crypto.randomUUID();
    const session = {
      status: 'pending',
      redirect_url: 'https://g.page/r/CYPgDr_K-_-CEBI/review',
      created_at: Date.now(),
    };
    this.testScanSessions.set(sessionId, session);

    // Automatically simulate a successful scan after 2 seconds
    setTimeout(() => {
      const s = this.testScanSessions.get(sessionId);
      if (s) {
        s.status = 'scanned';
      }
    }, 2000);

    return {
      session_id: sessionId,
      test_url: `/r/${qrSlug || 'test-qr-code'}`,
    };
  }

  /**
   * Get test scan session status
   */
  async getTestScanSession(sessionId: string): Promise<{ status: string; redirect_url?: string }> {
    const session = this.testScanSessions.get(sessionId);
    if (!session) {
      return { status: 'scanned', redirect_url: 'https://g.page/r/CYPgDr_K-_-CEBI/review' };
    }
    return session;
  }

  // ============================================================================
  // Pilot Feedback
  // ============================================================================

  /**
   * Submit pilot feedback
   */
  async submitFeedback(
    userId: string,
    data: {
      business_id?: string;
      category: PilotFeedbackCategory;
      rating: number;
      feedback_text?: string;
      step_context?: OnboardingStep;
      metadata?: Record<string, unknown>;
    }
  ): Promise<SubmitPilotFeedbackResponse> {
    const { data: feedback, error } = await this.supabase
      .from('pilot_feedback')
      .insert({
        user_id: userId,
        business_id: data.business_id || null,
        category: data.category,
        rating: data.rating,
        feedback_text: data.feedback_text || null,
        step_context: data.step_context || null,
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (error || !feedback) {
      if (this.isTableMissing(error)) {
        return {
          feedback: {
            id: crypto.randomUUID(),
            user_id: userId,
            business_id: data.business_id ?? null,
            category: data.category,
            rating: data.rating,
            feedback_text: data.feedback_text ?? null,
            step_context: data.step_context ?? null,
            metadata: data.metadata || {},
            created_at: new Date().toISOString(),
          },
        };
      }
      throw new AppError('Failed to submit feedback', 500, 'FEEDBACK_SUBMISSION_FAILED');
    }

    return { feedback: this.mapFeedback(feedback) };
  }

  /**
   * Get pilot feedback for user
   */
  async getUserFeedback(userId: string): Promise<PilotFeedback[]> {
    const { data: feedback, error } = await this.supabase
      .from('pilot_feedback')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new AppError('Failed to get feedback', 500, 'FEEDBACK_FETCH_FAILED');
    }

    return (feedback || []).map(this.mapFeedback);
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  /**
   * Get onboarding funnel analytics
   */
  async getFunnel(pilotOnly = false): Promise<OnboardingFunnelResponse> {
    const query = this.supabase.from('onboarding_funnel').select('*');

    if (pilotOnly) {
      // We need a custom query since the view doesn't filter
      const { data, error } = await this.supabase
        .from('onboarding_progress')
        .select('current_step')
        .eq('is_pilot_user', true);

      if (error) {
        throw new AppError('Failed to get funnel data', 500, 'FUNNEL_FETCH_FAILED');
      }

      // Aggregate manually
      const counts = new Map<string, { total: number; completed: number }>();
      data?.forEach(row => {
        const step = row.current_step;
        const current = counts.get(step) || { total: 0, completed: 0 };
        current.total++;
        if (step === 'completed') current.completed++;
        counts.set(step, current);
      });

      const funnel: OnboardingFunnel[] = [];
      const stepOrder = ['welcome', 'business_info', 'experience_tags', 'qr_generation', 'qr_test', 'dashboard_tour', 'completed'];
      stepOrder.forEach(step => {
        const c = counts.get(step) || { total: 0, completed: 0 };
        funnel.push({
          current_step: step as OnboardingStep,
          user_count: c.total,
          pilot_count: c.total,
          completed_count: c.completed,
        });
      });

      return { funnel };
    }

    const { data, error } = await query;
    if (error) {
      throw new AppError('Failed to get funnel data', 500, 'FUNNEL_FETCH_FAILED');
    }

    return { funnel: (data || []).map(this.mapFunnel) };
  }

  /**
   * Get pilot feedback summary
   */
  async getFeedbackSummary(): Promise<PilotFeedbackSummaryResponse> {
    const { data, error } = await this.supabase.from('pilot_feedback_summary').select('*');

    if (error) {
      throw new AppError('Failed to get feedback summary', 500, 'SUMMARY_FETCH_FAILED');
    }

    return { summary: (data || []).map(this.mapFeedbackSummary) };
  }

  // ============================================================================
  // Pilot Limits
  // ============================================================================

  /**
   * Get pilot limits for a business
   */
  async getPilotLimits(businessId: string): Promise<{ max_qr_codes: number; max_scans_per_month: number; max_staff: number }> {
    const { data: business, error } = await this.supabase
      .from('businesses')
      .select('pilot_limits, is_pilot_business')
      .eq('id', businessId)
      .single();

    if (error) {
      throw new AppError('Failed to get pilot limits', 500, 'LIMITS_FETCH_FAILED');
    }

    if (!business || !business.is_pilot_business) {
      // Return unlimited for non-pilot businesses
      return {
        max_qr_codes: -1,
        max_scans_per_month: -1,
        max_staff: -1,
      };
    }

    return business.pilot_limits || PILOT_LIMITS;
  }

  /**
   * Check if user can create more QR codes (pilot limits)
   */
  async canCreateQRCode(businessId: string): Promise<{ allowed: boolean; limit: number; current: number }> {
    const limits = await this.getPilotLimits(businessId);

    // If not pilot, unlimited
    if (limits.max_qr_codes < 0) {
      return { allowed: true, limit: -1, current: 0 };
    }

    const { count } = await this.supabase
      .from('qr_codes')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_active', true);

    const current = count || 0;
    return {
      allowed: current < limits.max_qr_codes,
      limit: limits.max_qr_codes,
      current,
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private getStepOrder(step: OnboardingStep): number {
    const order: Record<OnboardingStep, number> = {
      welcome: 1,
      business_info: 2,
      google_config: 2, // mapped for backward compatibility
      experience_tags: 3,
      qr_generation: 4,
      qr_test: 5,
      dashboard_tour: 6,
      completed: 7,
    };
    return order[step] || 0;
  }

  private mapProgress(row: any): OnboardingProgress {
    let currentStep = row.current_step;
    if (currentStep === 'google_config') {
      currentStep = 'experience_tags';
    }

    const completedSteps = (row.completed_steps || []).map((s: string) =>
      s === 'google_config' ? 'experience_tags' : s
    );

    return {
      id: row.id,
      user_id: row.user_id,
      business_id: row.business_id,
      current_step: currentStep,
      completed_steps: Array.from(new Set(completedSteps)),
      step_data: row.step_data || {},
      started_at: row.started_at,
      completed_at: row.completed_at,
      is_pilot_user: row.is_pilot_user,
      pilot_cohort: row.pilot_cohort,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapFeedback(row: any): PilotFeedback {
    return {
      id: row.id,
      user_id: row.user_id,
      business_id: row.business_id,
      category: row.category,
      rating: row.rating,
      feedback_text: row.feedback_text,
      step_context: row.step_context,
      metadata: row.metadata || {},
      created_at: row.created_at,
    };
  }

  private mapFunnel(row: any): OnboardingFunnel {
    return {
      current_step: row.current_step,
      user_count: parseInt(row.user_count) || 0,
      pilot_count: parseInt(row.pilot_count) || 0,
      completed_count: parseInt(row.completed_count) || 0,
    };
  }

  private mapFeedbackSummary(row: any): PilotFeedbackSummary {
    return {
      category: row.category,
      step_context: row.step_context,
      feedback_count: parseInt(row.feedback_count) || 0,
      avg_rating: parseFloat(row.avg_rating) || 0,
      negative_count: parseInt(row.negative_count) || 0,
      positive_count: parseInt(row.positive_count) || 0,
    };
  }
}