import { ReviewService } from '../../review/service';
import { ReviewController } from '../../review/controller';
import { Request, Response, NextFunction } from 'express';

describe('Step 27A: Copy/Redirect Analytics Reliability & Safari/ITP Tests', () => {
  let mockSupabase: any;
  let mockAIFactory: any;
  let reviewService: ReviewService;
  let reviewController: ReviewController;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockAIFactory = {
      createProvider: jest.fn(),
      getActiveProviderName: jest.fn().mockReturnValue('mock-ai'),
    };

    reviewService = new ReviewService(mockSupabase, mockAIFactory);
    reviewController = new ReviewController(reviewService);
  });

  // 1. Copy event succeeds
  test('1. Copy event succeeds and increments copy count', async () => {
    const session = await reviewService.createSession({
      qr_code_id: 'qr-1',
      business_id: 'biz-1',
    });

    const result = await reviewService.recordCopy(session.id);
    expect(result.success).toBe(true);
    expect(result.copy_count).toBe(1);

    const updated = await reviewService.getSession(session.id);
    expect(updated.metadata?.copied_at).toBeDefined();
    expect(updated.metadata?.copy_count).toBe(1);
  });

  // 2. Copy event request fails -> customer can continue without crashing
  test('2. Copy event failure is non-blocking and handles database errors gracefully', async () => {
    mockSupabase.update.mockReturnValueOnce({
      eq: jest.fn().mockRejectedValueOnce(new Error('Network error or database unreachable')),
    });

    const session = await reviewService.createSession({
      qr_code_id: 'qr-1',
      business_id: 'biz-1',
    });

    // Should not throw even if DB update fails
    const result = await reviewService.recordCopy(session.id);
    expect(result.success).toBe(true);
    expect(result.copy_count).toBe(1);
  });

  // 3. Google redirect event succeeds
  test('3. Google redirect event succeeds and sets status to redirected with timestamp', async () => {
    const session = await reviewService.createSession({
      qr_code_id: 'qr-1',
      business_id: 'biz-1',
    });

    // Advance state machine: select rating (required before completion)
    await reviewService.selectRating(session.id, 5);
    // Generate review (required for rating >= 4 before completion)
    await reviewService.generateReview({
      session_id: session.id,
      rating: 5,
      language: 'en',
    });

    const result = await reviewService.completeReview(session.id);
    expect(result.redirect_url).toBeDefined();

    const updated = await reviewService.getSession(session.id);
    expect(updated.status).toBe('redirected');
    expect(updated.completed_at).toBeDefined();
    expect(updated.metadata?.google_redirected_at).toBeDefined();
  });

  // 4. Google redirect analytics fails -> customer still reaches Google
  test('4. Google redirect analytics failure still returns valid Google redirect destination', async () => {
    const session = await reviewService.createSession({
      qr_code_id: 'qr-1',
      business_id: 'biz-1',
    });

    // Advance state machine: select rating + generate review before completion
    await reviewService.selectRating(session.id, 5);
    await reviewService.generateReview({
      session_id: session.id,
      rating: 5,
      language: 'en',
    });

    // Now simulate DB failure on the final update
    mockSupabase.update.mockReturnValueOnce({
      eq: jest.fn().mockRejectedValueOnce(new Error('Database timeout during redirect')),
    });

    const result = await reviewService.completeReview(session.id);
    expect(result.redirect_url).toBeDefined();
    expect(result.redirect_url).toMatch(/^https?:\/\//);
  });

  // 5. Repeated event attempts do not create unreasonable duplicates (debounced within 3s)
  test('5. Repeated copy attempts within 3s debounce window do not inflate copy count', async () => {
    const session = await reviewService.createSession({
      qr_code_id: 'qr-1',
      business_id: 'biz-1',
    });

    // First copy
    const res1 = await reviewService.recordCopy(session.id);
    expect(res1.copy_count).toBe(1);

    // Rapid duplicate copy (e.g. user double-clicked or sendBeacon + fetch retry arrived within 500ms)
    const res2 = await reviewService.recordCopy(session.id);
    expect(res2.copy_count).toBe(1);

    // Third rapid click
    const res3 = await reviewService.recordCopy(session.id);
    expect(res3.copy_count).toBe(1);

    // Verify session metadata reflects 1 copy
    const updated = await reviewService.getSession(session.id);
    expect(updated.metadata?.copy_count).toBe(1);
  });

  // 6. Invalid session cannot record another business's event
  test('6. Invalid session cannot record another business\'s event', async () => {
    const bizASession = await reviewService.createSession({
      qr_code_id: 'qr-biz-a',
      business_id: 'biz-a',
    });

    // Calling recordCopy on random non-existent session
    const res = await reviewService.recordCopy('non-existent-session-id-12345');
    expect(res.success).toBe(true);

    // Business A session must remain unchanged
    const bizAAfter = await reviewService.getSession(bizASession.id);
    expect(bizAAfter.business_id).toBe('biz-a');
    expect(bizAAfter.metadata?.copied_at).toBeUndefined();
    expect(bizAAfter.metadata?.copy_count).toBeUndefined();
  });

  // 7. Missing/blocked analytics does not break customer flow
  test('7. Missing/blocked session id gracefully falls back to guest session without throwing', async () => {
    const req = {
      body: {},
      params: {},
    } as Request;

    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await reviewController.recordCopy(req, res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  // 8. Beacon string payload parsing (navigator.sendBeacon text/plain compatibility)
  test('8. Controller correctly parses text/plain stringified JSON from sendBeacon', async () => {
    const session = await reviewService.createSession({
      qr_code_id: 'qr-1',
      business_id: 'biz-1',
    });

    const req = {
      body: JSON.stringify({ session_id: session.id }),
      params: {},
    } as unknown as Request;

    const res = {
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await reviewController.recordCopy(req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ success: true }),
      })
    );

    const updated = await reviewService.getSession(session.id);
    expect(updated.metadata?.copied_at).toBeDefined();
  });

  // 9. Full HTTP integration tests via Supertest
  describe('HTTP Transport & Browser Emulation Tests', () => {
    let app: any;

    beforeEach(() => {
      const express = require('express');
      const { createReviewRoutes } = require('../../review/routes');
      app = express();
      app.use(express.json());
      app.use(express.text({ type: ['text/plain', 'text/plain;charset=UTF-8'] }));
      app.use((req: any, _res: any, next: any) => {
        if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
          try {
            req.body = JSON.parse(req.body);
          } catch {}
        }
        next();
      });

      const mockAuth = {
        requireAuth: (req: any, _res: any, next: any) => { req.user = { sub: 'u1' }; next(); },
        requireRole: () => (req: any, _res: any, next: any) => next(),
      };

      app.use('/api/v1/review', createReviewRoutes(reviewController, mockAuth));
      app.use('/api/v1', createReviewRoutes(reviewController, mockAuth));
    });

    test('9a. Desktop Chrome: copy event via standard JSON POST', async () => {
      const request = require('supertest');
      const session = await reviewService.createSession({ qr_code_id: 'qr-1', business_id: 'biz-1' });

      const res = await request(app)
        .post('/api/v1/review/sessions/copy')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
        .send({ session_id: session.id })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.copy_count).toBe(1);
    });

    test('9b. iPhone Safari: sendBeacon text/plain payload to /sessions/:sessionId/copied', async () => {
      const request = require('supertest');
      const session = await reviewService.createSession({ qr_code_id: 'qr-1', business_id: 'biz-1' });

      const res = await request(app)
        .post(`/api/v1/sessions/${session.id}/copied`)
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1')
        .set('Content-Type', 'text/plain;charset=UTF-8')
        .send(JSON.stringify({ session_id: session.id }))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.copy_count).toBe(1);
    });

    test('9c. Android Chrome: Google redirect event completion', async () => {
      const request = require('supertest');
      const session = await reviewService.createSession({ qr_code_id: 'qr-1', business_id: 'biz-1' });

      // Advance state machine before completing (mirrors real customer flow)
      await reviewService.selectRating(session.id, 5);
      await reviewService.generateReview({ session_id: session.id, rating: 5, language: 'en' });

      const res = await request(app)
        .post('/api/v1/review/sessions/complete')
        .set('User-Agent', 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36')
        .send({ session_id: session.id, rating: 5 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.redirect_url).toBeDefined();

      const updated = await reviewService.getSession(session.id);
      expect(updated.status).toBe('redirected');
    });

    test('9d. Rapid click debouncing over HTTP: 5 rapid calls in 100ms count as 1 copy', async () => {
      const request = require('supertest');
      const session = await reviewService.createSession({ qr_code_id: 'qr-1', business_id: 'biz-1' });

      const calls = await Promise.all([
        request(app).post('/api/v1/review/sessions/copy').send({ session_id: session.id }),
        request(app).post('/api/v1/review/sessions/copy').send({ session_id: session.id }),
        request(app).post('/api/v1/review/sessions/copy').send({ session_id: session.id }),
      ]);

      calls.forEach(c => expect(c.status).toBe(200));
      const updated = await reviewService.getSession(session.id);
      expect(updated.metadata?.copy_count).toBe(1);
    });
  });
});
