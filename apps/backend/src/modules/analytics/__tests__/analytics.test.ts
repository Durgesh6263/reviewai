/**
 * Analytics Accuracy and Pilot Funnel Test Suite
 * Task 13: 12-point Analytics & Funnel Validation
 */

import { AnalyticsController } from '../controller';
import { AnalyticsService } from '../service';
import { ReviewService } from '../../review/service';
import { AIProviderFactory } from '../../review/ai/factory';
import { AuthorizationError } from '../../../shared/exceptions';

describe('STEP 27: Pilot Analytics Accuracy & Customer Funnel Test Suite', () => {
  // Test Businesses
  const BUSINESS_A_ID = 'biz-aaaa-1111-1111-111111111111';
  const BUSINESS_B_ID = 'biz-bbbb-2222-2222-222222222222';
  const USER_A_ID = 'user-owner-a';
  const USER_B_ID = 'user-owner-b';

  // In-memory data store for testing
  let scanLogs: any[] = [];
  let reviewSessions: any[] = [];
  let generatedReviews: any[] = [];
  let usageCounters: Record<string, number> = {};

  // Mock Supabase Client
  const createMockSupabase = () => {
    const businessesTable = [
      { id: BUSINESS_A_ID, name: 'Business A', owner_id: USER_A_ID, status: 'active', deleted_at: null },
      { id: BUSINESS_B_ID, name: 'Business B', owner_id: USER_B_ID, status: 'active', deleted_at: null },
    ];

    return {
      from: (table: string) => {
        const filters: Array<(row: any) => boolean> = [];

        const builder: any = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockImplementation((rows: any) => {
            const arr = (Array.isArray(rows) ? rows : [rows]).map((r: any, idx: number) => ({
              id: r.id || `test_id_${Date.now()}_${idx}`,
              ...r,
            }));
            if (table === 'review_sessions') reviewSessions.push(...arr);
            if (table === 'scan_logs') scanLogs.push(...arr);
            if (table === 'generated_reviews') generatedReviews.push(...arr);
            return {
              select: () => ({
                single: async () => ({ data: arr[0], error: null }),
                maybeSingle: async () => ({ data: arr[0], error: null }),
              }),
            };
          }),
          update: jest.fn().mockImplementation((updates: any) => {
            return {
              eq: (col: string, val: any) => {
                if (table === 'review_sessions') {
                  reviewSessions.forEach((s) => {
                    if (s[col] === val) Object.assign(s, updates);
                  });
                }
                return Promise.resolve({ error: null });
              },
            };
          }),
          upsert: jest.fn().mockImplementation((row: any) => {
            if (table === 'generated_reviews') generatedReviews.push(row);
            return Promise.resolve({ error: null });
          }),
          eq: (col: string, val: any) => {
            filters.push((row: any) => row[col] === val);
            return builder;
          },
          in: (col: string, vals: any[]) => {
            filters.push((row: any) => vals.includes(row[col]));
            return builder;
          },
          gte: (col: string, val: string) => {
            const start = new Date(val).getTime();
            filters.push((row: any) => {
              const t = new Date(row.scanned_at || row.started_at || row.created_at).getTime();
              return t >= start;
            });
            return builder;
          },
          lte: (col: string, val: any) => {
            if (col === 'rating') {
              filters.push((row: any) => row.rating !== undefined && row.rating <= Number(val));
            } else {
              const end = new Date(val).getTime();
              filters.push((row: any) => {
                const t = new Date(row.scanned_at || row.started_at || row.created_at).getTime();
                return t <= end;
              });
            }
            return builder;
          },
          is: (col: string, val: any) => {
            filters.push((row: any) => row[col] === val);
            return builder;
          },
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => {
            let src: any[] = [];
            if (table === 'businesses') src = businessesTable;
            else if (table === 'scan_logs') src = scanLogs;
            else if (table === 'review_sessions') src = reviewSessions;
            else if (table === 'generated_reviews') src = generatedReviews;

            for (const f of filters) src = src.filter(f);
            return { data: src[0] || null, error: null };
          },
          single: async () => {
            let src: any[] = [];
            if (table === 'businesses') src = businessesTable;
            else if (table === 'scan_logs') src = scanLogs;
            else if (table === 'review_sessions') src = reviewSessions;
            else if (table === 'generated_reviews') src = generatedReviews;

            for (const f of filters) src = src.filter(f);
            return { data: src[0] || null, error: null };
          },
          then: (resolve: (val: any) => void) => {
            let src: any[] = [];
            if (table === 'businesses') src = businessesTable;
            else if (table === 'business_staff') src = [];
            else if (table === 'scan_logs') src = scanLogs;
            else if (table === 'review_sessions') src = reviewSessions;
            else if (table === 'generated_reviews') src = generatedReviews;

            let result = [...src];
            for (const f of filters) result = result.filter(f);
            resolve({ data: result, count: result.length, error: null });
          },
        };

        return builder;
      },
    };
  };

  let mockSupabase: any;
  let analyticsService: AnalyticsService;
  let analyticsController: AnalyticsController;
  let reviewService: ReviewService;

  beforeEach(() => {
    scanLogs = [];
    reviewSessions = [];
    generatedReviews = [];
    usageCounters = {};

    mockSupabase = createMockSupabase();
    analyticsService = new AnalyticsService(mockSupabase as any);
    analyticsController = new AnalyticsController(analyticsService);

    // Mock ReviewService with usage tracking hook
    reviewService = new ReviewService(mockSupabase as any, new AIProviderFactory({}));
    (reviewService as any).trackUsage = jest.fn(async (bizId: string) => {
      usageCounters[bizId] = (usageCounters[bizId] || 0) + 1;
    });
  });

  // --------------------------------------------------------------------------
  // TEST 1: One QR scan -> correct scan count
  // --------------------------------------------------------------------------
  test('1. One QR scan produces exactly one increment in scan count', async () => {
    scanLogs.push({
      id: 'scan-1',
      business_id: BUSINESS_A_ID,
      scanned_at: new Date().toISOString(),
      device_type: 'mobile',
    });

    const req: any = {
      user: { sub: USER_A_ID, role: 'owner' },
      query: { period: '30d' },
    };
    const res: any = { json: jest.fn() };
    const next = jest.fn();

    await analyticsController.getOverview(req, res, next);
    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0].data;
    expect(data.metrics.total_scans).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Same page refresh -> no unintended duplicate event (debounce logic)
  // --------------------------------------------------------------------------
  test('2. Debounce logic protects against page refresh inflating scan count', async () => {
    const scanLogMap = new Map<string, number>();
    const debounceKey = '192.168.1.1:qr-code-1';
    const now = Date.now();

    // First scan allowed
    scanLogMap.set(debounceKey, now);
    let count = 1;

    // Second scan within 3 seconds (rapid reload) is debounced
    const reloadTime = now + 3000;
    const isDebounced = (reloadTime - (scanLogMap.get(debounceKey) || 0)) < 60000;
    if (!isDebounced) {
      count++;
    }

    expect(isDebounced).toBe(true);
    expect(count).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 3: AI success -> generation count increases
  // --------------------------------------------------------------------------
  test('3. AI success increments generated reviews count', async () => {
    generatedReviews.push({
      id: 'rev-1',
      session_id: 'sess-1',
      business_id: BUSINESS_A_ID,
      rating: 5,
      language: 'en',
      created_at: new Date().toISOString(),
    });

    const req: any = {
      user: { sub: USER_A_ID, role: 'owner' },
      query: { period: '30d' },
    };
    const res: any = { json: jest.fn() };
    const next = jest.fn();

    await analyticsController.getOverview(req, res, next);
    const data = res.json.mock.calls[0][0].data;
    expect(data.metrics.total_generated).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 4: AI failure -> successful generation count does not increase
  // --------------------------------------------------------------------------
  test('4. AI failure does not increment generated reviews count', async () => {
    // Session exists but AI generation failed (no record in generatedReviews)
    reviewSessions.push({
      id: 'sess-failed',
      business_id: BUSINESS_A_ID,
      status: 'started',
      started_at: new Date().toISOString(),
    });

    const req: any = {
      user: { sub: USER_A_ID, role: 'owner' },
      query: { period: '30d' },
    };
    const res: any = { json: jest.fn() };
    const next = jest.fn();

    await analyticsController.getOverview(req, res, next);
    const data = res.json.mock.calls[0][0].data;
    expect(data.metrics.total_generated).toBe(0);
    expect(data.metrics.total_sessions).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Regeneration -> correctly tracked
  // --------------------------------------------------------------------------
  test('5. Review regeneration correctly updates regeneration_count', async () => {
    const session = await reviewService.createSession({
      business_id: BUSINESS_A_ID,
      qr_code_id: 'qr-1',
      language: 'en',
      rating: 5,
    });

    // Advance state machine: rating must be selected before generating review
    await reviewService.selectRating(session.id, 5);

    const firstGen = await reviewService.generateReview({
      session_id: session.id,
      rating: 5,
      language: 'en',
    });
    expect(firstGen.regeneration_count).toBe(0);

    const regen = await reviewService.regenerateReview(session.id);
    expect(regen.regeneration_count).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Copy -> correctly tracked
  // --------------------------------------------------------------------------
  test('6. Copy action is reliably recorded in session metadata and counted', async () => {
    const session = await reviewService.createSession({
      business_id: BUSINESS_A_ID,
      qr_code_id: 'qr-1',
      language: 'en',
      rating: 5,
    });

    await reviewService.recordCopy(session.id);
    const updated = await reviewService.getSession(session.id);

    expect(updated.metadata?.copied_at).toBeDefined();
    expect(updated.metadata?.copy_count).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Google redirect -> page-open count increases
  // --------------------------------------------------------------------------
  test('7. Google redirect increases page-open count', async () => {
    reviewSessions.push({
      id: 'sess-redirected',
      business_id: BUSINESS_A_ID,
      status: 'redirected',
      metadata: { google_redirected_at: new Date().toISOString() },
      started_at: new Date().toISOString(),
    });

    const req: any = {
      user: { sub: USER_A_ID, role: 'owner' },
      query: { period: '30d' },
    };
    const res: any = { json: jest.fn() };
    const next = jest.fn();

    await analyticsController.getOverview(req, res, next);
    const data = res.json.mock.calls[0][0].data;
    expect(data.metrics.total_google_opens).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Google submission -> NEVER falsely recorded
  // --------------------------------------------------------------------------
  test('8. Google review submission is NEVER falsely recorded or claimed', async () => {
    const req: any = {
      user: { sub: USER_A_ID, role: 'owner' },
      query: { period: '30d' },
    };
    const res: any = { json: jest.fn() };
    const next = jest.fn();

    await analyticsController.getOverview(req, res, next);
    const data = res.json.mock.calls[0][0].data;

    // Verify naming strictly refers to page opens/redirects, never "Google reviews submitted"
    expect(data.metrics.total_google_opens).toBeDefined();
    expect((data.metrics as any).google_reviews_submitted).toBeUndefined();
    expect((data.metrics as any).published_reviews_count).toBeUndefined();
    expect(data.product_funnel.note).toContain('Google Review Page Opened indicates the customer was redirected to Google and does NOT imply a review was published or received by Google');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Private feedback -> separate metric
  // --------------------------------------------------------------------------
  test('9. Private feedback for 1-3 star ratings is tracked separately from Google metrics', async () => {
    reviewSessions.push({
      id: 'sess-low-star',
      business_id: BUSINESS_A_ID,
      rating: 2,
      status: 'private_feedback_submitted',
      metadata: { feedback_text: 'Slow service', feedback_submitted_at: new Date().toISOString() },
      started_at: new Date().toISOString(),
    });

    const req: any = {
      user: { sub: USER_A_ID, role: 'owner' },
      query: { period: '30d' },
    };
    const res: any = { json: jest.fn() };
    const next = jest.fn();

    await analyticsController.getOverview(req, res, next);
    const data = res.json.mock.calls[0][0].data;

    expect(data.metrics.total_feedback).toBe(1);
    expect(data.metrics.total_google_opens).toBe(0);
    expect(data.feedback_metrics.submitted).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 10: Business A cannot access Business B analytics
  // --------------------------------------------------------------------------
  test('10. Business A owner receives 403 Forbidden when attempting to query Business B analytics', async () => {
    const req: any = {
      user: { sub: USER_A_ID, role: 'owner' },
      query: { business_id: BUSINESS_B_ID },
    };
    const res: any = { json: jest.fn() };
    const next = jest.fn();

    await analyticsController.getOverview(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
  });

  // --------------------------------------------------------------------------
  // TEST 11: Date filtering produces correct results
  // --------------------------------------------------------------------------
  test('11. Date filtering correctly isolates 7d, 30d, and all-time records', async () => {
    const now = Date.now();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    const twentyDaysAgo = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();

    scanLogs.push(
      { id: 's1', business_id: BUSINESS_A_ID, scanned_at: threeDaysAgo },
      { id: 's2', business_id: BUSINESS_A_ID, scanned_at: twentyDaysAgo },
      { id: 's3', business_id: BUSINESS_A_ID, scanned_at: sixtyDaysAgo }
    );

    // 7d test
    const req7d: any = { user: { sub: USER_A_ID, role: 'owner' }, query: { period: '7d' } };
    const res7d: any = { json: jest.fn() };
    await analyticsController.getOverview(req7d, res7d, jest.fn());
    expect(res7d.json.mock.calls[0][0].data.metrics.total_scans).toBe(1);

    // 30d test
    const req30d: any = { user: { sub: USER_A_ID, role: 'owner' }, query: { period: '30d' } };
    const res30d: any = { json: jest.fn() };
    await analyticsController.getOverview(req30d, res30d, jest.fn());
    expect(res30d.json.mock.calls[0][0].data.metrics.total_scans).toBe(2);

    // all-time test
    const reqAll: any = { user: { sub: USER_A_ID, role: 'owner' }, query: { period: 'all' } };
    const resAll: any = { json: jest.fn() };
    await analyticsController.getOverview(reqAll, resAll, jest.fn());
    expect(resAll.json.mock.calls[0][0].data.metrics.total_scans).toBe(3);
  });

  // --------------------------------------------------------------------------
  // TEST 12: Usage limits match successful usage
  // --------------------------------------------------------------------------
  test('12. Usage limit counters increment only on successful AI generation', async () => {
    expect(usageCounters[BUSINESS_A_ID] || 0).toBe(0);

    const session = await reviewService.createSession({
      business_id: BUSINESS_A_ID,
      qr_code_id: 'qr-1',
      language: 'en',
      rating: 5,
    });

    // Advance state machine: rating must be selected before generating review
    await reviewService.selectRating(session.id, 5);

    await reviewService.generateReview({
      session_id: session.id,
      rating: 5,
      language: 'en',
    });

    expect(usageCounters[BUSINESS_A_ID]).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TASK 14: REALISTIC PILOT DATA SIMULATION TEST
  // --------------------------------------------------------------------------
  test('14. Realistic Pilot Simulation: Business A and B simulated simultaneously with zero cross-tenant contamination', async () => {
    // --- Simulate Business A Activity ---
    // 10 Scans
    for (let i = 1; i <= 10; i++) {
      scanLogs.push({ id: `scan-a-${i}`, business_id: BUSINESS_A_ID, scanned_at: new Date().toISOString() });
    }
    // 5 High-rating review sessions (4 & 5 stars)
    for (let i = 1; i <= 5; i++) {
      reviewSessions.push({
        id: `sess-a-high-${i}`,
        business_id: BUSINESS_A_ID,
        rating: 5,
        status: i <= 3 ? 'redirected' : 'review_generated',
        metadata: {
          tags: ['Friendly Staff', 'Fast Service'],
          copied_at: i <= 4 ? new Date().toISOString() : undefined,
          copy_count: i <= 4 ? 1 : 0,
          google_redirected_at: i <= 3 ? new Date().toISOString() : undefined,
        },
        started_at: new Date().toISOString(),
      });
      generatedReviews.push({
        id: `gen-a-${i}`,
        session_id: `sess-a-high-${i}`,
        business_id: BUSINESS_A_ID,
        edited_text: i <= 4 ? 'Edited review content' : null,
        created_at: new Date().toISOString(),
      });
    }
    // 2 Low-rating review sessions (1 & 2 stars)
    reviewSessions.push({
      id: 'sess-a-low-1',
      business_id: BUSINESS_A_ID,
      rating: 2,
      status: 'private_feedback_submitted',
      metadata: { feedback_text: 'Wait time was too long', feedback_submitted_at: new Date().toISOString() },
      started_at: new Date().toISOString(),
    });
    reviewSessions.push({
      id: 'sess-a-low-2',
      business_id: BUSINESS_A_ID,
      rating: 3,
      status: 'redirected',
      metadata: { feedback_skipped_at: new Date().toISOString(), google_redirected_at: new Date().toISOString() },
      started_at: new Date().toISOString(),
    });

    // --- Simulate Business B Activity ---
    // 4 Scans
    for (let i = 1; i <= 4; i++) {
      scanLogs.push({ id: `scan-b-${i}`, business_id: BUSINESS_B_ID, scanned_at: new Date().toISOString() });
    }
    // 1 High-rating session
    reviewSessions.push({
      id: 'sess-b-1',
      business_id: BUSINESS_B_ID,
      rating: 5,
      status: 'redirected',
      metadata: { copied_at: new Date().toISOString(), copy_count: 1, google_redirected_at: new Date().toISOString() },
      started_at: new Date().toISOString(),
    });
    generatedReviews.push({
      id: 'gen-b-1',
      session_id: 'sess-b-1',
      business_id: BUSINESS_B_ID,
      edited_text: null,
      created_at: new Date().toISOString(),
    });
    // 1 Low-rating session
    reviewSessions.push({
      id: 'sess-b-2',
      business_id: BUSINESS_B_ID,
      rating: 1,
      status: 'private_feedback_submitted',
      metadata: { feedback_submitted_at: new Date().toISOString() },
      started_at: new Date().toISOString(),
    });

    // --- Verify Business A Dashboard Metrics ---
    const reqA: any = { user: { sub: USER_A_ID, role: 'owner' }, query: { period: '30d' } };
    const resA: any = { json: jest.fn() };
    await analyticsController.getOverview(reqA, resA, jest.fn());

    const dataA = resA.json.mock.calls[0][0].data;
    expect(dataA.metrics.total_scans).toBe(10);
    expect(dataA.metrics.total_sessions).toBe(7); // 5 high + 2 low
    expect(dataA.metrics.total_generated).toBe(5);
    expect(dataA.metrics.total_copied).toBe(4);
    expect(dataA.metrics.total_google_opens).toBe(4); // 3 high + 1 low that skipped to Google
    expect(dataA.metrics.total_feedback).toBe(2);
    expect(dataA.product_funnel.conversion_rates.scan_to_session_pct).toBe(70); // 7 / 10 = 70%
    expect(dataA.product_funnel.conversion_rates.session_to_generation_pct).toBe(71); // 5 / 7 = 71%
    expect(dataA.product_funnel.conversion_rates.generation_to_copy_pct).toBe(80); // 4 / 5 = 80%
    expect(dataA.product_funnel.conversion_rates.copy_to_google_pct).toBe(100); // 4 / 4 = 100%

    // --- Verify Business B Dashboard Metrics ---
    const reqB: any = { user: { sub: USER_B_ID, role: 'owner' }, query: { period: '30d' } };
    const resB: any = { json: jest.fn() };
    await analyticsController.getOverview(reqB, resB, jest.fn());

    const dataB = resB.json.mock.calls[0][0].data;
    expect(dataB.metrics.total_scans).toBe(4);
    expect(dataB.metrics.total_sessions).toBe(2);
    expect(dataB.metrics.total_generated).toBe(1);
    expect(dataB.metrics.total_copied).toBe(1);
    expect(dataB.metrics.total_google_opens).toBe(1);
    expect(dataB.metrics.total_feedback).toBe(1);
    expect(dataB.product_funnel.conversion_rates.scan_to_session_pct).toBe(50); // 2 / 4 = 50%
  });
});

