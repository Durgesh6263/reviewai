/**
 * Step 37 Pilot Feedback & Improvements Regression Tests
 * Verifies customer notes preservation, tag weaving, regeneration context,
 * and beacon payload resilience across customer review flow.
 */

import { ReviewService } from '../service';
import { AIProviderFactory } from '../ai/factory';
import { ReviewController } from '../controller';

describe('Step 37: Pilot Review Improvements & Customer Text Preservation', () => {
  let reviewService: ReviewService;
  let mockSupabase: any;
  let mockAIFactory: any;

  beforeEach(() => {
    const createBuilder = () => {
      const b: any = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve: any) => resolve({ data: [], count: 0, error: null }),
      };
      return b;
    };

    mockSupabase = {
      from: jest.fn().mockImplementation(() => createBuilder()),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockAIFactory = new AIProviderFactory({});
    reviewService = new ReviewService(mockSupabase, mockAIFactory);
  });

  describe('Customer Notes & Tag Preservation in Fallback Generation', () => {
    it('preserves specific customer personal notes in 5-star English reviews', () => {
      const notes = 'Special thanks to server Rahul who was exceptionally attentive';
      const text = reviewService.generateFallbackReviewText(
        'Apex Dental Care',
        5,
        'en',
        0,
        ['Cleanliness', 'Quick Service'],
        notes
      );

      expect(text).toContain(notes);
      expect(text).toContain('Apex Dental Care');
      expect(text).toContain('Cleanliness, Quick Service');
    });

    it('preserves specific customer personal notes in Hindi reviews', () => {
      const notes = 'डॉक्टर शर्मा बहुत ही अनुभवी और विनम्र हैं';
      const text = reviewService.generateFallbackReviewText(
        'Apex Clinic',
        5,
        'hi',
        0,
        ['Service'],
        notes
      );

      expect(text).toContain(notes);
      expect(text).toContain('Apex Clinic');
    });

    it('preserves specific customer personal notes in Hinglish reviews', () => {
      const notes = 'Rahul bhaiya ne workout me super guide kiya';
      const text = reviewService.generateFallbackReviewText(
        'The Fitness World',
        5,
        'hinglish',
        0,
        ['Trainers'],
        notes
      );

      expect(text).toContain(notes);
      expect(text).toContain('The Fitness World');
    });

    it('weaves experience tags when customer notes are absent', () => {
      const text = reviewService.generateFallbackReviewText(
        'Artisan Brew Cafe',
        5,
        'en',
        0,
        ['Great Coffee', 'Friendly Ambience'],
        undefined
      );

      expect(text).toContain('Artisan Brew Cafe');
      expect(text).toContain('great coffee and friendly ambience');
    });

    it('returns natural variations when neither customer notes nor tags are provided', () => {
      const text1 = reviewService.generateFallbackReviewText('Metro Auto Works', 5, 'en', 0);
      const text2 = reviewService.generateFallbackReviewText('Metro Auto Works', 5, 'en', 1);

      expect(text1).toContain('Metro Auto Works');
      expect(text2).toContain('Metro Auto Works');
      expect(text1).not.toEqual(text2);
    });
  });

  describe('Review Session Regeneration with Context', () => {
    it('regenerateReview preserves customer notes and tags stored in session metadata', async () => {
      const session = await reviewService.createSession({
        qr_code_id: 'qr_pilot_1',
        business_id: 'biz_pilot_1',
        rating: 5,
        language: 'en',
        metadata: {
          customer_text: 'Loved the espresso and friendly barista',
          tags: ['Espresso', 'Great Service'],
        },
      });

      // Transition status to rating_selected
      await reviewService.selectRating(session.id, 5);

      // Generate initial review
      await reviewService.generateReview({
        session_id: session.id,
        rating: 5,
        language: 'en',
      });

      // Regenerate review
      const regenerated = await reviewService.regenerateReview(session.id);

      expect(regenerated.regeneration_count).toBe(1);
      expect(regenerated.generated_text).toContain('Loved the espresso and friendly barista');
      expect(regenerated.generated_text).toContain('Espresso, Great Service');
    });
  });

  describe('Beacon & Stringified JSON Payload Resilience in Controller', () => {
    let controller: ReviewController;
    let mockReq: any;
    let mockRes: any;
    let mockNext: any;

    beforeEach(() => {
      controller = new ReviewController(reviewService);
      mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };
      mockNext = jest.fn();
    });

    it('safely handles text/plain JSON string payloads in submitFeedback', async () => {
      const session = await reviewService.createSession({
        qr_code_id: 'qr_pilot_2',
        business_id: 'biz_pilot_2',
        rating: 2,
      });

      // Transition status to rating_selected for private feedback
      await reviewService.selectRating(session.id, 2);

      mockReq = {
        body: JSON.stringify({
          session_id: session.id,
          feedback_text: 'Wait time was a bit too long',
          rating: 2,
        }),
        params: {},
      };

      await controller.submitFeedback(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Private feedback submitted successfully',
        })
      );
    });

    it('safely handles text/plain JSON string payloads in abandonSession', async () => {
      const session = await reviewService.createSession({
        qr_code_id: 'qr_pilot_3',
        business_id: 'biz_pilot_3',
        rating: 4,
      });

      mockReq = {
        body: JSON.stringify({ session_id: session.id }),
        params: {},
      };

      await controller.abandonSession(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Session abandoned',
        })
      );
    });
  });
});
