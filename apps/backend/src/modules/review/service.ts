/**
 * Review Module Service
 * ReviewAI SaaS Platform
 * Core business logic for review generation and flow management
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ReviewSession,
  GeneratedReview,
  GenerateReviewRequest,
  UpdateReviewRequest,
  ReviewSessionResponse,
  ReviewFlowStep,
  REVIEW_CONSTANTS,
  isValidStatusTransition,
  SessionStatus,
} from './types';
import { AppError, NotFoundError, ValidationError, ConflictError } from '../../shared/exceptions';
import { AIProviderFactory } from './ai/factory';
import { getCategoryById } from '../business/categories';

export class ReviewService {
  private fallbackSessions = new Map<string, ReviewSession>();
  private fallbackReviews = new Map<string, GeneratedReview>();
  private inFlightGenerations = new Map<string, Promise<GeneratedReview>>();
  private businessLocks = new Map<string, Promise<any>>();

  constructor(
    private supabase: SupabaseClient,
    private aiFactory: AIProviderFactory
  ) {}

  private async executeWithBusinessLock<T>(businessId: string, fn: () => Promise<T>): Promise<T> {
    const key = businessId || 'default';
    const prevLock = this.businessLocks.get(key) || Promise.resolve();
    let releaseLock: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.businessLocks.set(key, currentLock);

    try {
      await prevLock;
      return await fn();
    } finally {
      releaseLock!();
      if (this.businessLocks.get(key) === currentLock) {
        this.businessLocks.delete(key);
      }
    }
  }

  async findGeneratedReview(sessionId: string): Promise<GeneratedReview | null> {
    const cached = this.fallbackReviews.get(sessionId);
    if (cached) return cached;
    try {
      const { data } = await this.supabase
        .from('generated_reviews')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();
      if (data) {
        this.fallbackReviews.set(sessionId, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return null;
  }

  private createFallbackSession(id: string): ReviewSession {
    const session: ReviewSession = {
      id: id || 'guest-session',
      qr_code_id: 'test-qr-code',
      business_id: 'guest-business',
      scan_log_id: 'test-scan-log',
      language: 'en',
      rating: 5,
      status: 'started',
      started_at: new Date().toISOString(),
      completed_at: null,
      abandoned_at: null,
      metadata: {},
    };
    this.fallbackSessions.set(session.id, session);
    return session;
  }

  /**
   * Create and persist a new review session in review_sessions table
   */
  async createSession(data: {
    qr_code_id: string;
    business_id: string;
    scan_log_id?: string | null;
    language?: string;
    rating?: number;
    metadata?: Record<string, any>;
  }): Promise<ReviewSession> {
    const sessionData: any = {
      qr_code_id: data.qr_code_id,
      business_id: data.business_id,
      scan_log_id: data.scan_log_id || undefined,
      language: data.language || 'en',
      rating: Math.max(1, Math.min(5, Number(data.rating) || 5)),
      status: 'started',
      started_at: new Date().toISOString(),
      metadata: data.metadata || {},
    };

    try {
      const { data: session, error } = await this.supabase
        .from('review_sessions')
        .insert(sessionData)
        .select()
        .single();

      if (session) {
        this.fallbackSessions.set(session.id, session);
        return session;
      }
      if (error) {
        console.error('Supabase error creating review session:', error.message);
      }
    } catch (err) {
      console.error('Failed to create review session in DB:', err);
    }

    const fallbackId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fallback = this.createFallbackSession(fallbackId);
    fallback.qr_code_id = data.qr_code_id;
    fallback.business_id = data.business_id;
    fallback.scan_log_id = data.scan_log_id || 'test-scan-log';
    fallback.rating = data.rating || 5;
    fallback.language = data.language || 'en';
    fallback.metadata = data.metadata || {};
    this.fallbackSessions.set(fallbackId, fallback);
    return fallback;
  }

  /**
   * Normalizes review text for similarity comparison
   */
  normalizeReviewText(text: string): string {
    return (text || '')
      .toLowerCase()
      .replace(/[^\w\s\u0900-\u097F]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculates similarity between two review drafts (0.0 to 1.0)
   * Uses combined word-level Jaccard and character bigram Dice coefficient
   */
  calculateReviewSimilarity(textA: string, textB: string): number {
    const normA = this.normalizeReviewText(textA);
    const normB = this.normalizeReviewText(textB);
    if (!normA || !normB) return 0;
    if (normA === normB) return 1.0;

    // Word-level Jaccard
    const wordsA = new Set(normA.split(' ').filter(w => w.length > 2));
    const wordsB = new Set(normB.split(' ').filter(w => w.length > 2));
    let wordJaccard = 0;
    if (wordsA.size > 0 && wordsB.size > 0) {
      let intersection = 0;
      for (const w of wordsA) {
        if (wordsB.has(w)) intersection++;
      }
      const union = new Set([...wordsA, ...wordsB]).size;
      wordJaccard = union > 0 ? intersection / union : 0;
    }

    // Character bigram Dice coefficient
    const getBigrams = (str: string) => {
      const s = str.replace(/\s+/g, '');
      const bigrams = new Map<string, number>();
      for (let i = 0; i < s.length - 1; i++) {
        const bg = s.slice(i, i + 2);
        bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
      }
      return bigrams;
    };

    const bigramsA = getBigrams(normA);
    const bigramsB = getBigrams(normB);
    let totalA = 0;
    for (const c of bigramsA.values()) totalA += c;
    let totalB = 0;
    for (const c of bigramsB.values()) totalB += c;

    let shared = 0;
    for (const [bg, countA] of bigramsA.entries()) {
      const countB = bigramsB.get(bg) || 0;
      shared += Math.min(countA, countB);
    }

    const dice = (totalA + totalB) > 0 ? (2 * shared) / (totalA + totalB) : 0;
    return Math.max(wordJaccard, dice);
  }

  /**
   * Check if a candidate review is an exact duplicate or highly similar to previous reviews of the same business
   */
  checkDuplicate(candidate: string, existingReviews: string[], threshold = 0.75): {
    isDuplicate: boolean;
    maxSimilarity: number;
    matchedSnippet?: string;
  } {
    let maxSim = 0;
    let matchedSnippet: string | undefined;

    for (const existing of existingReviews) {
      const sim = this.calculateReviewSimilarity(candidate, existing);
      if (sim > maxSim) {
        maxSim = sim;
        matchedSnippet = existing.slice(0, 100);
      }
    }

    return {
      isDuplicate: maxSim >= threshold,
      maxSimilarity: maxSim,
      matchedSnippet,
    };
  }

  /**
   * Retrieve recent generated reviews for a business to check for duplicates
   */
  async getRecentReviewsForBusiness(businessId: string, limit = 20): Promise<string[]> {
    const list: string[] = [];
    if (!businessId || businessId === 'guest-business') {
      for (const rev of this.fallbackReviews.values()) {
        if (rev.final_text) list.push(rev.final_text);
        else if (rev.generated_text) list.push(rev.generated_text);
      }
      return Array.from(new Set(list));
    }

    try {
      const { data } = await this.supabase
        .from('generated_reviews')
        .select('generated_text, final_text')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (data && Array.isArray(data)) {
        for (const row of data) {
          if (row.final_text) list.push(row.final_text);
          else if (row.generated_text) list.push(row.generated_text);
        }
      }
    } catch {
      // Non-blocking
    }

    for (const rev of this.fallbackReviews.values()) {
      if (rev.business_id === businessId) {
        if (rev.final_text) list.push(rev.final_text);
        else if (rev.generated_text) list.push(rev.generated_text);
      }
    }

    return Array.from(new Set(list));
  }

  /**
   * Generates natural, authentic contextual review text across languages
   */
  generateFallbackReviewText(
    businessName: string,
    rating: number,
    language: string,
    variation = 0,
    tags?: string[],
    customerNotes?: string,
    businessCategory?: string
  ): string {
    const lang = (language || 'en').toLowerCase();
    const name = businessName || 'this place';
    const notes = customerNotes?.trim();
    const cleanTags = tags?.filter(Boolean) || [];
    const catSlug = (businessCategory || 'other').toLowerCase();

    // Prioritize and preserve genuine customer notes if provided
    if (notes) {
      const tagSuffix = cleanTags.length > 0 ? ` Highlights: ${cleanTags.join(', ')}.` : '';
      if (rating >= 4) {
        if (lang === 'hi') {
          return `${notes}। ${name} में मेरा अनुभव बहुत ही संतोषजनक रहा। सेवा और स्टाफ दोनों बहुत अच्छे हैं।`;
        }
        if (lang === 'hinglish') {
          return `${notes}. ${name} me visit kaafi badhiya raha. Staff attentive hai aur overall experience kaafi accha laga.`;
        }
        return `${notes}. Visiting ${name} was genuinely a positive experience. The staff was attentive and courteous.${tagSuffix}`;
      } else if (rating === 3) {
        if (lang === 'hi') {
          return `${notes}। ${name} में अनुभव सामान्य रहा। सेवा ठीक थी लेकिन सुधार की गुंजाइश है।`;
        }
        if (lang === 'hinglish') {
          return `${notes}. ${name} par experience average raha. Service theek thi but thoda improvement chahiye.`;
        }
        return `${notes}. My visit to ${name} was decent overall. Helpful staff though there are minor areas for improvement.`;
      } else {
        if (lang === 'hi') {
          return `${notes}। दुर्भाग्यवश ${name} में मेरा अनुभव उम्मीद के अनुसार नहीं रहा। सेवा में सुधार की आवश्यकता है।`;
        }
        if (lang === 'hinglish') {
          return `${notes}. Unfortunately ${name} par mera experience disappointing raha.`;
        }
        return `${notes}. Unfortunately, my experience at ${name} did not meet expectations.`;
      }
    }

    // Category-specific high-rating templates with tag mentions
    if (cleanTags.length > 0 && rating >= 4) {
      const tagsString = cleanTags.join(' and ').toLowerCase();
      if (lang === 'hi') {
        return `${name} में बहुत अच्छा अनुभव रहा। विशेषकर ${cleanTags.join(', ')} काफी प्रभावशाली रहा और स्टाफ का व्यवहार विनम्र था।`;
      }
      if (lang === 'hinglish') {
        return `${name} visit karke accha laga. Especially ${cleanTags.join(', ')} kaafi badhiya laga aur team bhi supportive thi.`;
      }

      const openings = [
        `Appreciated the visit to ${name}.`,
        `Enjoyed my time at ${name}.`,
        `Solid experience visiting ${name}.`,
        `Very pleased with the visit to ${name}.`,
        `A thoroughly positive experience at ${name}.`,
        `Glad I chose to visit ${name}.`,
        `Found ${name} to be consistently well-managed.`,
        `Had a seamless interaction at ${name}.`,
        `Impressive standard of service at ${name}.`,
        `Visiting ${name} was genuinely worthwhile.`,
      ];

      const middles = [
        `The ${tagsString} stood out positively`,
        `Particularly pleased with the ${tagsString}`,
        `The ${tagsString} made a strong impression`,
        `Noticed great attention given to ${tagsString}`,
        `Special appreciation for the ${tagsString}`,
        `The quality of ${tagsString} was evident throughout`,
        `Everything regarding ${tagsString} was handled smoothly`,
        `The focus on ${tagsString} was clearly visible`,
        `The standard of ${tagsString} exceeded expectations`,
        `Appreciated how well ${tagsString} was maintained`,
      ];

      const closings = [
        `and the staff maintained a welcoming standard throughout.`,
        `backed by courteous and prompt attention from the team.`,
        `and the overall service was attentive and consistent.`,
        `leaving a dependable and favorable impression.`,
        `with polite communication at every interaction.`,
        `and the overall atmosphere was professional and comfortable.`,
        `with the staff always ready to assist patiently.`,
        `making the entire visit smooth and satisfactory.`,
        `and the environment was kept clean and orderly.`,
        `reflecting great professionalism and care.`,
      ];

      const oIdx = variation % openings.length;
      const mIdx = (variation * 3 + 1) % middles.length;
      const cIdx = (variation * 7 + 3) % closings.length;
      return `${openings[oIdx]} ${middles[mIdx]}, ${closings[cIdx]}`;
    }

    // High rating category-specific variations (avoiding clichés like "Great experience at..." / "Highly recommended")
    if (rating >= 4) {
      if (catSlug.includes('gym') || catSlug.includes('fitness')) {
        const gymOptions = [
          `The workout floor at ${name} is well-maintained and the training atmosphere keeps you focused. Staff is supportive and equipment is kept in good order.`,
          `Very clean setup and motivating environment at ${name}. Good availability of machines and helpful trainers on the floor.`,
          `Training at ${name} has been productive. The workout environment is hygienic and staff members are consistently polite.`
        ];
        return gymOptions[variation % gymOptions.length];
      }

      if (catSlug.includes('cafe') || catSlug.includes('coffee')) {
        const cafeOptions = [
          `Loved the cozy ambience and aromatic brews at ${name}. A calm spot to unwind with great beverage quality and friendly service.`,
          `Pleasant seating arrangements and prompt service at ${name}. Coffee tasted fresh and the atmosphere was comfortable.`,
          `Relaxing setting with good music and tasty options at ${name}. The staff was courteous and kept everything clean.`
        ];
        return cafeOptions[variation % cafeOptions.length];
      }

      if (catSlug.includes('restaurant')) {
        const restOptions = [
          `The meal was freshly prepared and full of flavor at ${name}. Table service was prompt and the dining area was well kept.`,
          `Appreciated the courteous hospitality and flavorful dishes at ${name}. Timely service made the meal thoroughly enjoyable.`,
          `Pleasantly surprised by the food quality and pleasant dining vibe at ${name}. Staff accommodated our table attentively.`
        ];
        return restOptions[variation % restOptions.length];
      }

      if (catSlug.includes('hospital') || catSlug.includes('healthcare')) {
        const hospOptions = [
          `The premises at ${name} are clean and orderly. Front desk and nursing staff were respectful and guided us smoothly.`,
          `Found the reception and support staff at ${name} very cooperative and polite. Waiting areas were hygienic and well managed.`,
          `Smooth coordination and courteous assistance at ${name}. Staff handled inquiries patiently and kept the premises tidy.`
        ];
        return hospOptions[variation % hospOptions.length];
      }

      if (catSlug.includes('dental')) {
        const dentalOptions = [
          `Clean and well-organized clinic at ${name}. The dental staff was polite, reassuring, and explained each step clearly.`,
          `Appreciated the calm environment and hygienic standards at ${name}. The team handled the visit with care and courtesy.`,
          `Gentle approach and organized appointments at ${name}. Staff members are friendly and prioritize patient comfort.`
        ];
        return dentalOptions[variation % dentalOptions.length];
      }

      if (catSlug.includes('salon') || catSlug.includes('beauty')) {
        const salonOptions = [
          `Clean stations and professional styling at ${name}. The staff listened attentively to preferences and delivered great results.`,
          `Very hygienic tools and relaxing ambiance at ${name}. The team was courteous and took time to ensure thorough service.`,
          `Pleasant visit to ${name}. Welcoming stylists, attentive consultation, and a neat, comfortable setup.`
        ];
        return salonOptions[variation % salonOptions.length];
      }

      if (catSlug.includes('hotel') || catSlug.includes('hospitality')) {
        const hotelOptions = [
          `The rooms were clean and comfortable at ${name}. Reception staff ensured a smooth check-in and attentive hospitality throughout.`,
          `Quiet and well-maintained property at ${name}. Friendly front desk team and prompt housekeeping support.`,
          `Comfortable stay with polite assistance across departments at ${name}. Premises were kept fresh and orderly.`
        ];
        return hotelOptions[variation % hotelOptions.length];
      }

      if (catSlug.includes('auto')) {
        const autoOptions = [
          `Prompt vehicle inspection and clear updates from the team at ${name}. The work was finished on schedule with polite service.`,
          `Appreciated the professional handling and transparent communication at ${name}. Courteous staff and orderly workshop.`,
          `Smooth servicing experience at ${name}. The mechanics were knowledgeable and the car was returned clean and on time.`
        ];
        return autoOptions[variation % autoOptions.length];
      }

      if (catSlug.includes('education') || catSlug.includes('coaching')) {
        const eduOptions = [
          `Encouraging learning environment and knowledgeable faculty at ${name}. Concepts are addressed clearly and staff is supportive.`,
          `Structured sessions and attentive instructors at ${name}. The study atmosphere is disciplined and motivating.`,
          `Good academic guidance and approachable staff at ${name}. Very organized administration and helpful mentors.`
        ];
        return eduOptions[variation % eduOptions.length];
      }

      if (catSlug.includes('retail')) {
        const retailOptions = [
          `Well-arranged aisles and diverse selection at ${name}. Cashier and floor staff were quick to help find items.`,
          `Clean store layout and smooth checkout at ${name}. Courteous staff on the floor when assistance was needed.`,
          `Organized shelves and pleasant shopping atmosphere at ${name}. Prompt service at the billing counter.`
        ];
        return retailOptions[variation % retailOptions.length];
      }

      // Default high rating
      const genericOptions = [
        `Pleasant visit to ${name}. The staff was professional and welcoming, ensuring everything was handled seamlessly.`,
        `Attentive team and tidy environment at ${name}. Service was delivered promptly without any complications.`,
        `Smooth interaction with the team at ${name}. Polite communication and quality attention to detail throughout.`
      ];
      return genericOptions[variation % genericOptions.length];
    } else if (rating === 3) {
      if (lang === 'hi') {
        return `${name} का अनुभव सामान्य रहा। सेवा ठीक थी और स्टाफ मददगार था, लेकिन कुछ चीजों में सुधार किया जा सकता है।`;
      }
      if (lang === 'hinglish') {
        return `${name} par experience average raha. Service theek thi but peak hours me thoda wait karna pada. Decent place overall.`;
      }
      return `My visit to ${name} was decent overall. The staff was polite and the atmosphere was fine, though there are a few minor areas for improvement. A solid 3-star experience.`;
    } else {
      if (lang === 'hi') {
        return `दुर्भाग्यवश ${name} में मेरा अनुभव उम्मीद के अनुसार नहीं रहा। सेवा में सुधार की आवश्यकता है।`;
      }
      if (lang === 'hinglish') {
        return `Unfortunately ${name} par mera experience thoda disappointing raha. Service aur response time improve hona chahiye.`;
      }
      return `Unfortunately, my experience at ${name} did not meet expectations. The service was slower than expected and there is definite room for improvement in customer care.`;
    }
  }

  /**
   * Get review session by ID
   */
  async getSession(sessionId: string, requireExists = false): Promise<ReviewSession> {
    if (!sessionId || sessionId === 'guest-session' || sessionId.startsWith('guest-')) {
      const key = sessionId || 'guest-session';
      return this.fallbackSessions.get(key) || this.createFallbackSession(key);
    }

    if (this.fallbackSessions.has(sessionId)) {
      return this.fallbackSessions.get(sessionId)!;
    }

    try {
      const { data: session } = await this.supabase
        .from('review_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

      if (session) {
        this.fallbackSessions.set(session.id, session);
        return session;
      }
    } catch {
      // Ignore database lookup error and fall back to memory
    }

    if (requireExists) {
      throw new NotFoundError('Review session');
    }

    return this.createFallbackSession(sessionId);
  }

  /**
   * Get review session with generated review
   */
  async getSessionWithReview(sessionId: string): Promise<ReviewSessionResponse> {
    const session = await this.getSession(sessionId);

    let review: GeneratedReview | null = this.fallbackReviews.get(sessionId) || null;
    if (!review) {
      try {
        const { data } = await this.supabase
          .from('generated_reviews')
          .select('*')
          .eq('session_id', sessionId)
          .maybeSingle();
        review = data;
      } catch {
        // Fallback review lookup
      }
    }

    let businessName = 'The Fitness World';
    let googleReviewUrl = 'https://g.page/r/test-fitness-world/review';
    let settings: any = {};

    try {
      if (session.business_id && session.business_id !== 'guest-business') {
        const { data: business } = await this.supabase
          .from('businesses')
          .select('id, name, slug, google_review_url, settings')
          .eq('id', session.business_id)
          .maybeSingle();

        if (business) {
          businessName = business.name;
          googleReviewUrl = business.google_review_url || googleReviewUrl;
          settings = business.settings || {};
        }
      }
    } catch {
      // Use defaults
    }

    return {
      session,
      review,
      business: {
        id: session.business_id,
        name: businessName,
        slug: 'test-qr-code',
        google_review_url: googleReviewUrl,
        settings,
      },
    };
  }

  /**
   * Select language for review session
   */
  async selectLanguage(sessionId: string, language: string): Promise<ReviewSession> {
    const session = await this.getSession(sessionId);

    if (session.status === 'abandoned') {
      throw new ValidationError('Cannot update an abandoned review session');
    }
    if (session.status === 'redirected') {
      throw new ValidationError('Cannot update an already completed review session');
    }
    if (!isValidStatusTransition(session.status, 'language_selected')) {
      throw new ValidationError(`Cannot transition session from ${session.status} to language_selected`);
    }

    const validLanguage = REVIEW_CONSTANTS.SUPPORTED_LANGUAGES.find(
      l => l.code.toLowerCase() === language.toLowerCase() || l.name.toLowerCase() === language.toLowerCase()
    );
    const resolvedLanguage = validLanguage ? validLanguage.code : (language || 'en');

    session.language = resolvedLanguage;
    session.status = 'language_selected';
    this.fallbackSessions.set(session.id, session);

    if (sessionId && sessionId !== 'guest-session' && !sessionId.startsWith('guest-')) {
      try {
        await this.supabase
          .from('review_sessions')
          .update({
            language: resolvedLanguage,
            status: 'language_selected',
          })
          .eq('id', sessionId);
      } catch {
        // Non-blocking database update
      }
    }

    return session;
  }

  /**
   * Select rating for review session
   */
  async selectRating(sessionId: string, rating: number): Promise<ReviewSession> {
    const session = await this.getSession(sessionId);

    if (session.status === 'abandoned') {
      throw new ValidationError('Cannot update an abandoned review session');
    }
    if (session.status === 'redirected') {
      throw new ValidationError('Cannot update an already completed review session');
    }
    if (!isValidStatusTransition(session.status, 'rating_selected')) {
      throw new ValidationError(`Cannot transition session from ${session.status} to rating_selected`);
    }

    const validRating = Math.max(1, Math.min(5, Number(rating) || 5));

    session.rating = validRating;
    session.status = 'rating_selected';
    this.fallbackSessions.set(session.id, session);

    if (sessionId && sessionId !== 'guest-session' && !sessionId.startsWith('guest-')) {
      try {
        await this.supabase
          .from('review_sessions')
          .update({
            rating: validRating,
            status: 'rating_selected',
          })
          .eq('id', sessionId);
      } catch {
        // Non-blocking database update
      }
    }

    return session;
  }

  /**
   * Select experience tags for review session
   */
  async selectTags(sessionId: string, tags: string[]): Promise<ReviewSession> {
    const session = await this.getSession(sessionId);
    session.metadata = {
      ...(session.metadata || {}),
      tags,
    };
    this.fallbackSessions.set(session.id, session);

    if (sessionId && sessionId !== 'guest-session' && !sessionId.startsWith('guest-')) {
      try {
        await this.supabase
          .from('review_sessions')
          .update({ metadata: session.metadata })
          .eq('id', sessionId);
      } catch {
        // Non-blocking
      }
    }

    return session;
  }

  /**
   * Record customer copying review to clipboard
   */
  async recordCopy(sessionId: string): Promise<{ success: boolean; copy_count: number }> {
    const session = await this.getSession(sessionId);

    // Idempotency: debounce rapid duplicate clicks or multiple transport triggers (keepalive + sendBeacon)
    // within 3 seconds for the same session.
    const lastCopied = session.metadata?.copied_at ? new Date(session.metadata.copied_at).getTime() : 0;
    const now = Date.now();
    const currentCount = (session.metadata?.copy_count as number) || 0;

    if (lastCopied > 0 && now - lastCopied < 3000) {
      return { success: true, copy_count: currentCount || 1 };
    }

    const count = currentCount + 1;
    session.metadata = {
      ...(session.metadata || {}),
      copied_at: new Date(now).toISOString(),
      copy_count: count,
    };
    this.fallbackSessions.set(session.id, session);

    if (sessionId && sessionId !== 'guest-session' && !sessionId.startsWith('guest-')) {
      try {
        await this.supabase
          .from('review_sessions')
          .update({ metadata: session.metadata })
          .eq('id', sessionId);
      } catch {
        // Non-blocking
      }
    }

    return { success: true, copy_count: count };
  }

  /**
   * Record customer starting private feedback flow (1-3 stars)
   */
  async recordFeedbackStart(sessionId: string): Promise<{ success: boolean }> {
    const session = await this.getSession(sessionId);
    if (!session.metadata?.feedback_started_at) {
      session.metadata = {
        ...(session.metadata || {}),
        feedback_started_at: new Date().toISOString(),
      };
      this.fallbackSessions.set(session.id, session);

      if (sessionId && sessionId !== 'guest-session' && !sessionId.startsWith('guest-')) {
        try {
          await this.supabase
            .from('review_sessions')
            .update({ metadata: session.metadata })
            .eq('id', sessionId);
        } catch {}
      }
    }
    return { success: true };
  }

  /**
   * Record customer skipping private feedback and proceeding directly to Google
   */
  async recordFeedbackSkip(sessionId: string): Promise<{ success: boolean }> {
    const session = await this.getSession(sessionId);
    session.metadata = {
      ...(session.metadata || {}),
      feedback_skipped_at: new Date().toISOString(),
    };
    this.fallbackSessions.set(session.id, session);

    if (sessionId && sessionId !== 'guest-session' && !sessionId.startsWith('guest-')) {
      try {
        await this.supabase
          .from('review_sessions')
          .update({ metadata: session.metadata })
          .eq('id', sessionId);
      } catch {}
    }
    return { success: true };
  }

  /**
   * Generate AI review
   */
  async generateReview(data: GenerateReviewRequest): Promise<GeneratedReview> {
    const session = await this.getSession(data.session_id);

    if (session.status === 'abandoned') {
      throw new ValidationError('Cannot generate review for an abandoned session');
    }
    if (session.status === 'redirected') {
      throw new ValidationError('Cannot generate review for an already completed session');
    }
    if (!isValidStatusTransition(session.status, 'review_generated')) {
      throw new ValidationError(`Cannot generate review for session in status: ${session.status}`);
    }

    // Always preserve customer input (tags, customer_text) before generation attempt
    session.metadata = {
      ...(session.metadata || {}),
      ...(data.tags && data.tags.length > 0 ? { tags: data.tags } : {}),
      ...(data.customer_text ? { customer_text: data.customer_text } : {}),
    };
    this.fallbackSessions.set(session.id, session);

    // In-flight deduplication: if identical generation is already running for this session, wait for it
    const inFlightKey = `${data.session_id}_${data.rating || session.rating}_${data.language || session.language}_${data.variation || 0}`;
    if (this.inFlightGenerations.has(inFlightKey)) {
      return this.inFlightGenerations.get(inFlightKey)!;
    }

    // Idempotency: If review already generated for this session and this is NOT a variation request, return existing
    if ((data.variation === undefined || data.variation === 0) && session.status === 'review_generated') {
      const existing = this.fallbackReviews.get(data.session_id) || await this.findGeneratedReview(data.session_id);
      if (existing && existing.rating === (data.rating || session.rating) && existing.language === (data.language || session.language)) {
        return existing;
      }
    }

    const generationPromise = this.executeWithBusinessLock(session.business_id, async () => {
      // Enforce subscription usage limit inside the business lock to prevent concurrent bypass
      if (session.business_id && session.business_id !== 'guest-business') {
        await this.checkReviewGenerationLimit(session.business_id);
      }

      // Check simulated error if requested in tests
      if (data.simulatedError) {
        if (data.simulatedError === 'timeout') {
          throw new AppError('AI provider request timed out. Please try again.', 504, 'AI_TIMEOUT');
        }
        if (data.simulatedError === 'rate_limit') {
          throw new AppError('AI provider rate limit reached. Please try again shortly.', 429, 'AI_RATE_LIMIT');
        }
        if (data.simulatedError === 'api_error') {
          throw new AppError('AI provider service error. Please try again.', 502, 'AI_SERVICE_ERROR');
        }
        if (data.simulatedError === 'malformed_response') {
          throw new AppError('Malformed response from AI provider. Please try again.', 502, 'AI_MALFORMED_RESPONSE');
        }
      }

      const language = data.language || session.language || 'en';
      const rating = data.rating || session.rating || 5;

      // Get business name and category for context
      let businessName = 'The Fitness World';
      let businessCategory = 'gym-fitness';
      const validTones = ['professional', 'casual', 'enthusiastic', 'detailed'] as const;
      let reviewTone: 'professional' | 'casual' | 'enthusiastic' | 'detailed' = 'enthusiastic';

      try {
        if (session.business_id && session.business_id !== 'guest-business') {
          const { data: business } = await this.supabase
            .from('businesses')
            .select('name, category, settings')
            .eq('id', session.business_id)
            .maybeSingle();

          if (business) {
            businessName = business.name || businessName;
            businessCategory = business.category || business.settings?.category || businessCategory;
            if (business.settings?.review_tone && validTones.includes(business.settings.review_tone)) {
              reviewTone = business.settings.review_tone;
            }
          }
        } else {
          const { data: latestBiz } = await this.supabase
            .from('businesses')
            .select('name, category, settings')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestBiz) {
            businessName = latestBiz.name || businessName;
            businessCategory = latestBiz.category || latestBiz.settings?.category || businessCategory;
            if (latestBiz.settings?.review_tone && validTones.includes(latestBiz.settings.review_tone)) {
              reviewTone = latestBiz.settings.review_tone;
            }
          }
        }
      } catch {
        // Keep default context
      }

      const catObj = getCategoryById(businessCategory);
      const businessCategoryName = catObj?.name || businessCategory;

      // Duplicate prevention: query recent generated reviews for this business
      const recentReviews = await this.getRecentReviewsForBusiness(session.business_id, 20);

      const MAX_DUPLICATE_RETRIES = 2;
      let attempts = 0;
      let duplicatePreventionPrompt: string | undefined = undefined;
      let bestCandidate = '';
      let lowestSimilarity = 1.0;
      let generationStartTime = Date.now();

      while (attempts <= MAX_DUPLICATE_RETRIES) {
        let candidateText = '';
        try {
          if (this.aiFactory.hasProvider(REVIEW_CONSTANTS.DEFAULT_AI_PROVIDER)) {
            const aiProvider = this.aiFactory.getProvider(REVIEW_CONSTANTS.DEFAULT_AI_PROVIDER);
            const aiResult = await aiProvider.generateReview({
              businessName,
              businessCategory,
              businessCategoryName,
              rating,
              language,
              tone: reviewTone,
              tags: data.tags || session.metadata?.tags,
              customerNotes: data.customer_text || session.metadata?.customer_text,
              variation: (data.variation || 0) + attempts,
              duplicatePreventionPrompt,
            });
            candidateText = aiResult.text;
          }
        } catch (err) {
          if (data.throwOnAiError && attempts === 0) {
            throw err;
          }
        }

        if (!candidateText) {
          candidateText = this.generateFallbackReviewText(
            businessName,
            rating,
            language,
            (data.variation || 0) + attempts,
            data.tags || session.metadata?.tags,
            data.customer_text || session.metadata?.customer_text || session.metadata?.customer_notes,
            businessCategory
          );
        }

        // Check for duplicates/high similarity
        const dupCheck = this.checkDuplicate(candidateText, recentReviews, 0.75);
        if (!dupCheck.isDuplicate || recentReviews.length === 0) {
          bestCandidate = candidateText;
          lowestSimilarity = dupCheck.maxSimilarity;
          break;
        }

        if (dupCheck.maxSimilarity < lowestSimilarity || !bestCandidate) {
          bestCandidate = candidateText;
          lowestSimilarity = dupCheck.maxSimilarity;
        }

        attempts++;
        if (attempts <= MAX_DUPLICATE_RETRIES) {
          duplicatePreventionPrompt = `A previous draft for this business had high similarity (${Math.round(dupCheck.maxSimilarity * 100)}%) with: "${dupCheck.matchedSnippet}...". You must use completely different phrasing, varied sentence openings, and distinct descriptive terms while remaining truthful to customer tags/notes.`;
        }
      }

      const generatedText = bestCandidate;
      const generationTimeMs = Date.now() - generationStartTime;
      const tokenUsage = this.estimateTokenUsage(generatedText);

      let review: GeneratedReview;
      const existingReview = this.fallbackReviews.get(data.session_id);

      if (existingReview) {
        if (existingReview.regeneration_count >= 5) {
          throw new AppError('Maximum review regenerations reached for this session (5 max).', 429, 'MAX_REGENERATIONS_EXCEEDED');
        }
        existingReview.generated_text = generatedText;
        existingReview.edited_text = null;
        existingReview.final_text = generatedText;
        existingReview.regeneration_count += 1;
        existingReview.generation_time_ms = generationTimeMs;
        review = existingReview;
      } else {
        review = {
          id: `rev_${Date.now()}`,
          session_id: data.session_id || session.id,
          business_id: session.business_id,
          language,
          rating,
          ai_provider: REVIEW_CONSTANTS.DEFAULT_AI_PROVIDER,
          model: REVIEW_CONSTANTS.DEFAULT_MODEL,
          prompt_version: REVIEW_CONSTANTS.PROMPT_VERSION,
          generated_text: generatedText,
          edited_text: null,
          final_text: generatedText,
          generation_time_ms: generationTimeMs,
          token_usage: tokenUsage,
          regeneration_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        this.fallbackReviews.set(data.session_id, review);
        this.fallbackReviews.set(session.id, review);
      }

      // Preserve generation history so regenerations never destroy prior suggestions
      const historyItem = {
        variation: review.regeneration_count,
        text: generatedText,
        generated_at: new Date().toISOString(),
        provider: REVIEW_CONSTANTS.DEFAULT_AI_PROVIDER,
        model: REVIEW_CONSTANTS.DEFAULT_MODEL,
      };
      const existingHistory = Array.isArray(session.metadata?.generation_history)
        ? session.metadata.generation_history
        : [];
      session.metadata = {
        ...(session.metadata || {}),
        generation_history: [...existingHistory, historyItem],
      };

      session.status = 'review_generated';
      this.fallbackSessions.set(session.id, session);

      // Save to Supabase if session exists in DB
      if (data.session_id && data.session_id !== 'guest-session' && !data.session_id.startsWith('guest-')) {
        try {
          await this.supabase
            .from('generated_reviews')
            .upsert({
              session_id: data.session_id,
              business_id: session.business_id,
              language,
              rating,
              ai_provider: REVIEW_CONSTANTS.DEFAULT_AI_PROVIDER,
              model: REVIEW_CONSTANTS.DEFAULT_MODEL,
              prompt_version: REVIEW_CONSTANTS.PROMPT_VERSION,
              generated_text: generatedText,
              generation_time_ms: generationTimeMs,
              token_usage: tokenUsage,
              regeneration_count: review.regeneration_count,
            });

          await this.supabase
            .from('review_sessions')
            .update({
              status: 'review_generated',
              metadata: session.metadata,
            })
            .eq('id', data.session_id);
        } catch {
          // Non-blocking DB save
        }
      }

      // Only count genuine successful generation towards subscription usage
      if (session.business_id && session.business_id !== 'guest-business') {
        try {
          await this.trackUsage(session.business_id, 'review_generations');
        } catch (trackErr) {
          console.warn('Failed to track usage for review generation:', trackErr);
        }
      }

      return review;
    });

    this.inFlightGenerations.set(inFlightKey, generationPromise);
    try {
      return await generationPromise;
    } finally {
      this.inFlightGenerations.delete(inFlightKey);
    }
  }

  /**
   * Update/edit review
   */
  async updateReview(sessionId: string, data: UpdateReviewRequest): Promise<GeneratedReview> {
    const session = await this.getSession(sessionId);

    if (session.status === 'abandoned') {
      throw new ValidationError('Cannot edit review for an abandoned session');
    }
    if (session.status === 'redirected') {
      throw new ValidationError('Cannot edit review for an already completed session');
    }
    if (!isValidStatusTransition(session.status, 'review_edited')) {
      throw new ValidationError(`Cannot transition session from ${session.status} to review_edited`);
    }

    let review = this.fallbackReviews.get(sessionId) || await this.findGeneratedReview(sessionId);
    if (!review) {
      throw new ValidationError('Cannot edit review before generating a review');
    }

    review.edited_text = data.edited_text;
    review.final_text = data.edited_text;
    review.updated_at = new Date().toISOString();
    this.fallbackReviews.set(sessionId, review);

    session.status = 'review_edited';
    this.fallbackSessions.set(session.id, session);

    if (sessionId && sessionId !== 'guest-session' && !sessionId.startsWith('guest-')) {
      try {
        await this.supabase
          .from('generated_reviews')
          .update({
            edited_text: data.edited_text,
          })
          .eq('session_id', sessionId);

        await this.supabase
          .from('review_sessions')
          .update({ status: 'review_edited' })
          .eq('id', sessionId);
      } catch {
        // Non-blocking DB update
      }
    }

    return review;
  }

  /**
   * Regenerate review
   */
  async regenerateReview(sessionId: string): Promise<GeneratedReview> {
    const session = await this.getSession(sessionId);

    if (session.status === 'abandoned') {
      throw new ValidationError('Cannot regenerate review for an abandoned session');
    }
    if (session.status === 'redirected') {
      throw new ValidationError('Cannot regenerate review for an already completed session');
    }
    if (!isValidStatusTransition(session.status, 'review_generated')) {
      throw new ValidationError(`Cannot regenerate review for session in status: ${session.status}`);
    }

    return this.executeWithBusinessLock(session.business_id, async () => {
      // Enforce subscription usage limit inside the lock
      if (session.business_id && session.business_id !== 'guest-business') {
        await this.checkReviewGenerationLimit(session.business_id);
      }

      const existing = this.fallbackReviews.get(sessionId) || await this.findGeneratedReview(sessionId);
      const nextVariation = (existing?.regeneration_count || 0) + 1;
      if (nextVariation > 5) {
        throw new AppError('Maximum review regenerations reached for this session (5 max).', 429, 'MAX_REGENERATIONS_EXCEEDED');
      }

      // Get business name and settings for context
      let businessName = 'The Fitness World';
      let businessCategory = 'gym-fitness';
      const validTones = ['professional', 'casual', 'enthusiastic', 'detailed'] as const;
      let reviewTone: 'professional' | 'casual' | 'enthusiastic' | 'detailed' = 'enthusiastic';

      try {
        if (session.business_id && session.business_id !== 'guest-business') {
          const { data: business } = await this.supabase
            .from('businesses')
            .select('name, category, settings')
            .eq('id', session.business_id)
            .maybeSingle();

          if (business) {
            businessName = business.name || businessName;
            businessCategory = business.category || business.settings?.category || businessCategory;
            if (business.settings?.review_tone && validTones.includes(business.settings.review_tone)) {
              reviewTone = business.settings.review_tone;
            }
          }
        } else {
          const { data: latestBiz } = await this.supabase
            .from('businesses')
            .select('name, category, settings')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latestBiz?.name) {
            businessName = latestBiz.name;
            businessCategory = latestBiz.category || latestBiz.settings?.category || businessCategory;
            if (latestBiz.settings?.review_tone && validTones.includes(latestBiz.settings.review_tone)) {
              reviewTone = latestBiz.settings.review_tone;
            }
          }
        }
      } catch {}

      const catObj = getCategoryById(businessCategory);
      const businessCategoryName = catObj?.name || businessCategory;

      // Duplicate prevention: query recent generated reviews for this business
      const recentReviews = await this.getRecentReviewsForBusiness(session.business_id, 20);

      const customerNotes = session.metadata?.customer_text || session.metadata?.customer_notes;
      const tags = session.metadata?.tags;
      const startTime = Date.now();

      const MAX_DUPLICATE_RETRIES = 2;
      let attempts = 0;
      let duplicatePreventionPrompt: string | undefined = undefined;
      let bestCandidate = '';
      let lowestSimilarity = 1.0;

      while (attempts <= MAX_DUPLICATE_RETRIES) {
        let candidateText = '';
        try {
          if (this.aiFactory.hasProvider(REVIEW_CONSTANTS.DEFAULT_AI_PROVIDER)) {
            const aiProvider = this.aiFactory.getProvider(REVIEW_CONSTANTS.DEFAULT_AI_PROVIDER);
            const aiResult = await aiProvider.generateReview({
              businessName,
              businessCategory,
              businessCategoryName,
              rating: session.rating || 5,
              language: session.language || 'en',
              tone: reviewTone,
              tags,
              customerNotes,
              variation: nextVariation + attempts,
              duplicatePreventionPrompt,
            });
            candidateText = aiResult.text;
          }
        } catch {}

        if (!candidateText) {
          candidateText = this.generateFallbackReviewText(
            businessName,
            session.rating || 5,
            session.language || 'en',
            nextVariation + attempts,
            tags,
            customerNotes,
            businessCategory
          );
        }

        const dupCheck = this.checkDuplicate(candidateText, recentReviews, 0.75);
        if (!dupCheck.isDuplicate || recentReviews.length === 0) {
          bestCandidate = candidateText;
          lowestSimilarity = dupCheck.maxSimilarity;
          break;
        }

        if (dupCheck.maxSimilarity < lowestSimilarity || !bestCandidate) {
          bestCandidate = candidateText;
          lowestSimilarity = dupCheck.maxSimilarity;
        }

        attempts++;
        if (attempts <= MAX_DUPLICATE_RETRIES) {
          duplicatePreventionPrompt = `A previous draft had high similarity (${Math.round(dupCheck.maxSimilarity * 100)}%) with: "${dupCheck.matchedSnippet}...". Vary sentence structure, opening sentence, and vocabulary.`;
        }
      }

      const generatedText = bestCandidate;
      const generationTimeMs = Math.max(120, Date.now() - startTime);

      const review: GeneratedReview = {
        id: existing?.id || `rev_${Date.now()}`,
        session_id: sessionId,
        business_id: session.business_id,
        language: session.language || 'en',
        rating: session.rating || 5,
        ai_provider: REVIEW_CONSTANTS.DEFAULT_AI_PROVIDER,
        model: REVIEW_CONSTANTS.DEFAULT_MODEL,
        prompt_version: REVIEW_CONSTANTS.PROMPT_VERSION,
        generated_text: generatedText,
        edited_text: null,
        final_text: generatedText,
        generation_time_ms: generationTimeMs,
        token_usage: this.estimateTokenUsage(generatedText),
        regeneration_count: nextVariation,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      this.fallbackReviews.set(sessionId, review);

      // Preserve generation history
      const historyItem = {
        variation: nextVariation,
        text: generatedText,
        generated_at: new Date().toISOString(),
        provider: REVIEW_CONSTANTS.DEFAULT_AI_PROVIDER,
        model: REVIEW_CONSTANTS.DEFAULT_MODEL,
      };
      const existingHistory = Array.isArray(session.metadata?.generation_history)
        ? session.metadata.generation_history
        : [];
      session.metadata = {
        ...(session.metadata || {}),
        generation_history: [...existingHistory, historyItem],
      };
      this.fallbackSessions.set(session.id, session);

      // Persist to DB
      if (sessionId && sessionId !== 'guest-session' && !sessionId.startsWith('guest-')) {
        try {
          await this.supabase
            .from('generated_reviews')
            .upsert({
              session_id: sessionId,
              business_id: session.business_id,
              language: session.language || 'en',
              rating: session.rating || 5,
              ai_provider: REVIEW_CONSTANTS.DEFAULT_AI_PROVIDER,
              model: REVIEW_CONSTANTS.DEFAULT_MODEL,
              prompt_version: REVIEW_CONSTANTS.PROMPT_VERSION,
              generated_text: generatedText,
              generation_time_ms: 120,
              token_usage: review.token_usage,
              regeneration_count: nextVariation,
            });

          await this.supabase
            .from('review_sessions')
            .update({ metadata: session.metadata })
            .eq('id', sessionId);
        } catch {}
      }

      // Track usage only on successful regeneration
      if (session.business_id && session.business_id !== 'guest-business') {
        try {
          await this.trackUsage(session.business_id, 'review_generations');
        } catch (trackErr) {
          console.warn('Failed to track usage for review regeneration:', trackErr);
        }
      }

      return review;
    });
  }

  /**
   * Complete review (redirect to Google)
   */
  async completeReview(sessionId: string): Promise<{ redirect_url: string }> {
    const session = await this.getSession(sessionId);

    // Resolve target redirect URL
    let redirectUrl = 'https://search.google.com/local/writereview';
    try {
      if (session.qr_code_id && session.qr_code_id !== 'test-qr-code') {
        const { data: qr } = await this.supabase
          .from('qr_codes')
          .select('design')
          .eq('id', session.qr_code_id)
          .maybeSingle();

        if (qr?.design?.google_review_url) {
          redirectUrl = qr.design.google_review_url;
        }
      }

      if (redirectUrl === 'https://search.google.com/local/writereview' && session.business_id && session.business_id !== 'guest-business') {
        const { data: business } = await this.supabase
          .from('businesses')
          .select('google_review_url')
          .eq('id', session.business_id)
          .maybeSingle();

        if (business?.google_review_url) {
          redirectUrl = business.google_review_url;
        }
      }

      if (redirectUrl === 'https://search.google.com/local/writereview') {
        const { data: latestBiz } = await this.supabase
          .from('businesses')
          .select('google_review_url')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestBiz?.google_review_url) {
          redirectUrl = latestBiz.google_review_url;
        }
      }
    } catch {
      // Use fallback URL
    }

    // Idempotency: if already redirected, safely return redirect URL without re-writing state
    if (session.status === 'redirected') {
      return { redirect_url: redirectUrl };
    }

    if (session.status === 'abandoned') {
      throw new ValidationError('Cannot complete an abandoned session');
    }

    // State machine check: cannot complete review before selecting rating
    if (session.status === 'started' || session.status === 'language_selected') {
      throw new ValidationError('Cannot complete review before selecting rating');
    }

    // Rating >= 4: require valid generated or edited review
    if (session.rating >= 4) {
      const review = this.fallbackReviews.get(session.id) || await this.findGeneratedReview(session.id);
      if (!review || (!review.final_text && !review.generated_text)) {
        throw new ValidationError('Cannot redirect to Google before a valid review is generated');
      }
    }

    // Rating <= 3: customer must either submit private feedback or skip it
    if (session.rating <= 3) {
      const hasFeedback = session.status === 'private_feedback_submitted' || session.metadata?.feedback_submitted_at;
      const hasSkipped = !!session.metadata?.feedback_skipped_at;
      if (!hasFeedback && !hasSkipped) {
        session.metadata = {
          ...(session.metadata || {}),
          feedback_skipped_at: new Date().toISOString(),
        };
      }
    }

    session.status = 'redirected';
    session.completed_at = session.completed_at || new Date().toISOString();
    session.metadata = {
      ...(session.metadata || {}),
      google_redirected_at: session.metadata?.google_redirected_at || new Date().toISOString(),
    };
    this.fallbackSessions.set(session.id, session);

    if (sessionId && sessionId !== 'guest-session' && !sessionId.startsWith('guest-')) {
      try {
        await this.supabase
          .from('review_sessions')
          .update({
            status: 'redirected',
            completed_at: new Date().toISOString(),
            metadata: session.metadata,
          })
          .eq('id', sessionId);
      } catch {
        // Non-blocking update
      }
    }

    return { redirect_url: redirectUrl };
  }

  /**
   * Submit private feedback for 1-3 star ratings
   */
  async submitPrivateFeedback(
    sessionId: string,
    feedbackText: string,
    rating?: number
  ): Promise<{ success: boolean; message: string }> {
    if (!feedbackText || !feedbackText.trim()) {
      throw new ValidationError('Feedback text is required');
    }

    const session = await this.getSession(sessionId);

    // Idempotency: debounce rapid duplicate clicks or multiple submissions within 10s
    const isDuplicate = session.status === 'private_feedback_submitted' &&
      (session.metadata?.feedback_text === feedbackText.trim() ||
       (session.metadata?.feedback_submitted_at && Date.now() - new Date(session.metadata.feedback_submitted_at).getTime() < 10000));

    if (isDuplicate) {
      return {
        success: true,
        message: 'Thank you for your feedback. We appreciate your input!',
      };
    }

    if (session.status === 'abandoned') {
      throw new ValidationError('Cannot submit feedback for an abandoned session');
    }

    if (!isValidStatusTransition(session.status, 'private_feedback_submitted')) {
      throw new ValidationError(`Cannot submit feedback for session in status: ${session.status}`);
    }

    const resolvedRating = rating ? Math.max(1, Math.min(5, Number(rating))) : (session.rating || 3);
    session.rating = resolvedRating;
    session.status = 'private_feedback_submitted';
    session.completed_at = new Date().toISOString();
    session.metadata = {
      ...(session.metadata || {}),
      rating: resolvedRating,
      feedback_text: feedbackText.trim(),
      is_private_feedback: true,
      feedback_submitted_at: new Date().toISOString(),
    };
    this.fallbackSessions.set(session.id, session);

    if (sessionId && sessionId !== 'guest-session' && !sessionId.startsWith('guest-')) {
      try {
        await this.supabase
          .from('review_sessions')
          .update({
            rating: resolvedRating,
            status: 'private_feedback_submitted',
            completed_at: new Date().toISOString(),
            metadata: session.metadata,
          })
          .eq('id', sessionId);
      } catch (err) {
        console.error('Failed to update session with private feedback:', err);
      }
    }

    // Persist into pilot_feedback table if business_id is known
    try {
      if (session.business_id && session.business_id !== 'guest-business') {
        const { data: b } = await this.supabase
          .from('businesses')
          .select('owner_id')
          .eq('id', session.business_id)
          .maybeSingle();

        if (b?.owner_id) {
          await this.supabase.from('pilot_feedback').insert({
            business_id: session.business_id,
            user_id: b.owner_id,
            rating: rating || session.rating || 3,
            category: 'overall',
            feedback_text: feedbackText.trim(),
            metadata: { session_id: sessionId, qr_code_id: session.qr_code_id },
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (fbErr) {
      console.error('Failed to insert into pilot_feedback:', fbErr);
    }

    return {
      success: true,
      message: 'Thank you for your feedback. We appreciate your input!',
    };
  }

  /**
   * Abandon review session
   */
  async abandonSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);

    if (session.status === 'redirected' || session.status === 'abandoned') {
      throw new ValidationError('Session already completed or abandoned');
    }

    session.status = 'abandoned';
    session.abandoned_at = new Date().toISOString();
    this.fallbackSessions.set(session.id, session);

    if (sessionId && sessionId !== 'guest-session' && !sessionId.startsWith('guest-')) {
      await this.supabase
        .from('review_sessions')
        .update({
          status: 'abandoned',
          abandoned_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    }
  }

  /**
   * Get review flow step for frontend
   */
  async getFlowStep(sessionId: string): Promise<ReviewFlowStep> {
    const session = await this.getSession(sessionId);
    let review: GeneratedReview | undefined;

    if (['review_generated', 'review_edited', 'redirected'].includes(session.status)) {
      const { data } = await this.supabase
        .from('generated_reviews')
        .select('*')
        .eq('session_id', sessionId)
        .single();
      review = data;
    }

    return {
      step: this.getStepFromStatus(session.status),
      session,
      review,
    };
  }

  /**
   * Map session status to flow step
   */
  private getStepFromStatus(status: SessionStatus): ReviewFlowStep['step'] {
    switch (status) {
      case 'started':
      case 'language_selected':
        return 'language';
      case 'rating_selected':
        return 'rating';
      case 'review_generated':
        return 'review';
      case 'review_edited':
      case 'redirected':
        return 'redirect';
      case 'abandoned':
      case 'private_feedback_submitted':
        return 'redirect'; // Show redirect page with abandonment message
      default:
        return 'language';
    }
  }

  /**
   * Check review generation limit for business
   */
  private async checkReviewGenerationLimit(businessId: string): Promise<void> {
    // Get subscription for this business
    const { data: subscription } = await this.supabase
      .from('subscriptions')
      .select('id, plan, status, current_period_start, current_period_end')
      .eq('business_id', businessId)
      .single();

    // If no subscription, use free plan limits
    if (!subscription) {
      // Check generated_reviews count for current period (last 30 days)
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - 30);
      periodStart.setHours(0, 0, 0, 0);

      const { count: reviewCount } = await this.supabase
        .from('generated_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .gte('created_at', periodStart.toISOString());

      const freeLimit = 50; // From SUBSCRIPTION_CONSTANTS.PLANS.free.limits.review_generations
      if ((reviewCount || 0) >= freeLimit) {
        throw new AppError(
          'AI review generation limit exceeded for Free plan. Please upgrade to continue.',
          403,
          'REVIEW_GENERATION_LIMIT_EXCEEDED'
        );
      }
      return;
    }

    // If subscription is not active, check if it's expired/canceled
    if (!['active', 'trialing'].includes(subscription.status)) {
      // For expired/canceled, fallback to free plan limits
      const periodStart = new Date(subscription.current_period_end);
      periodStart.setDate(periodStart.getDate() - 30);

      const { count: reviewCount } = await this.supabase
        .from('generated_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .gte('created_at', periodStart.toISOString());

      const freeLimit = 50;
      if ((reviewCount || 0) >= freeLimit) {
        throw new AppError(
          'AI review generation limit exceeded. Your subscription has expired. Please renew or upgrade.',
          403,
          'REVIEW_GENERATION_LIMIT_EXCEEDED'
        );
      }
      return;
    }

    // Check current period usage from usage_logs
    const { data: usageRecords } = await this.supabase
      .from('usage_logs')
      .select('count')
      .eq('subscription_id', subscription.id)
      .eq('metric', 'review_generations')
      .eq('period_start', subscription.current_period_start)
      .eq('period_end', subscription.current_period_end);

    const used = usageRecords?.reduce((sum, r) => sum + r.count, 0) || 0;

    // Get plan limits
    const { data: planConfig } = await this.supabase
      .from('plan_configs')
      .select('max_review_generations')
      .eq('plan', subscription.plan)
      .single();

    const limit = planConfig?.max_review_generations || this.getPlanReviewLimit(subscription.plan);

    if (limit !== null && used >= limit) {
      throw new AppError(
        `AI review generation limit (${limit}) exceeded for ${subscription.plan} plan. Please upgrade.`,
        403,
        'REVIEW_GENERATION_LIMIT_EXCEEDED'
      );
    }
  }

  /**
   * Get plan review generation limit from centralized config
   */
  private getPlanReviewLimit(plan: string): number | null {
    const limits: Record<string, number | null> = {
      free: 50,
      starter: 500,
      professional: 2000,
      enterprise: null, // unlimited
    };
    return limits[plan] ?? 50;
  }

  /**
   * Estimate token usage from text
   */
  private estimateTokenUsage(text: string): { prompt_tokens: number; completion_tokens: number; total_tokens: number } {
    // Rough estimation: 1 token ≈ 4 characters for English
    const completionTokens = Math.ceil(text.length / 4);
    const promptTokens = 200; // Estimated prompt size
    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };
  }

  /**
   * Track usage for billing
   */
  private async trackUsage(businessId: string, metric: string): Promise<void> {
    // Get active subscription
    const { data: subscription } = await this.supabase
      .from('subscriptions')
      .select('id, current_period_start, current_period_end')
      .eq('business_id', businessId)
      .in('status', ['active', 'trialing'])
      .single();

    if (subscription) {
      await this.supabase.rpc('track_usage', {
        p_subscription_id: subscription.id,
        p_metric: metric,
        p_count: 1,
      });
    }
  }
}