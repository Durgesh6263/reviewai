import { AdminService } from '../service';
import { AdminController } from '../controller';
import { Request, Response, NextFunction } from 'express';

describe('STEP 28: Pilot Business Success & Retention Insights Test Suite', () => {
  let mockSupabase: any;
  let adminService: AdminService;
  let adminController: AdminController;

  const mockBusinesses = [
    // Business A: Configured + Active customer activity
    {
      id: 'biz-a-uuid',
      name: 'Alpha Fitness Club',
      slug: 'alpha-fitness',
      email: 'owner@alpha.com',
      is_active: true,
      google_review_url: 'https://g.page/r/alpha-fitness/review',
      is_pilot_business: true,
      pilot_limits: { max_reviews_monthly: 100 },
      created_at: '2026-09-01T10:00:00Z',
    },
    // Business B: Configured + Ready (No activity yet)
    {
      id: 'biz-b-uuid',
      name: 'Beta Bistro & Cafe',
      slug: 'beta-bistro',
      email: 'owner@beta.com',
      is_active: true,
      google_review_url: 'https://g.page/r/beta-bistro/review',
      is_pilot_business: true,
      pilot_limits: { max_reviews_monthly: 50 },
      created_at: '2026-09-10T12:00:00Z',
    },
    // Business C: Incomplete setup (Missing google review URL)
    {
      id: 'biz-c-uuid',
      name: 'Gamma Dental Care',
      slug: 'gamma-dental',
      email: 'owner@gamma.com',
      is_active: true,
      google_review_url: '', // INCOMPLETE
      is_pilot_business: true,
      pilot_limits: { max_reviews_monthly: 50 },
      created_at: '2026-09-15T09:00:00Z',
    },
    // Business D: Needs Attention (Unresolved negative feedback)
    {
      id: 'biz-d-uuid',
      name: 'Delta Auto Repair',
      slug: 'delta-auto',
      email: 'owner@delta.com',
      is_active: true,
      google_review_url: 'https://g.page/r/delta-auto/review',
      is_pilot_business: true,
      pilot_limits: { max_reviews_monthly: 50 },
      created_at: '2026-09-05T14:00:00Z',
    },
  ];

  const mockQRs = [
    { id: 'qr-a', business_id: 'biz-a-uuid', name: 'Front Desk', slug: 'alpha-front', created_at: '2026-09-02T10:00:00Z', is_active: true },
    { id: 'qr-b', business_id: 'biz-b-uuid', name: 'Table QR', slug: 'beta-table', created_at: '2026-09-11T12:00:00Z', is_active: true },
    { id: 'qr-d', business_id: 'biz-d-uuid', name: 'Checkout Counter', slug: 'delta-checkout', created_at: '2026-09-06T14:00:00Z', is_active: true },
    // Notice Business C has NO QR code!
  ];

  const mockScans = [
    { id: 's1', business_id: 'biz-a-uuid', scanned_at: '2026-09-03T11:00:00Z' },
    { id: 's2', business_id: 'biz-a-uuid', scanned_at: '2026-09-04T12:00:00Z' },
    { id: 's3', business_id: 'biz-a-uuid', scanned_at: '2026-09-05T13:00:00Z' },
  ];

  const mockSessions = [
    {
      id: 'sess-1',
      business_id: 'biz-a-uuid',
      status: 'redirected',
      rating: 5,
      started_at: '2026-09-03T11:05:00Z',
      completed_at: '2026-09-03T11:08:00Z',
      metadata: {
        copied_at: '2026-09-03T11:07:00Z',
        copy_count: 1,
        google_redirected_at: '2026-09-03T11:08:00Z',
      },
    },
    {
      id: 'sess-2',
      business_id: 'biz-a-uuid',
      status: 'review_generated',
      rating: 4,
      started_at: '2026-09-04T12:10:00Z',
      completed_at: null,
      metadata: {},
    },
  ];

  const mockReviews = [
    { id: 'rev-1', business_id: 'biz-a-uuid', created_at: '2026-09-03T11:06:00Z' },
    { id: 'rev-2', business_id: 'biz-a-uuid', created_at: '2026-09-04T12:12:00Z' },
  ];

  const mockFeedback = [
    {
      id: 'fb-1',
      business_id: 'biz-d-uuid',
      status: 'open', // UNRESOLVED
      rating: 2,
      created_at: '2026-09-07T15:00:00Z',
    },
  ];

  const mockSubscriptions = [
    { id: 'sub-a', business_id: 'biz-a-uuid', plan: 'professional', status: 'active', current_period_start: '2026-09-01T00:00:00Z', current_period_end: '2026-10-01T00:00:00Z' },
    { id: 'sub-b', business_id: 'biz-b-uuid', plan: 'starter', status: 'active', current_period_start: '2026-09-10T00:00:00Z', current_period_end: '2026-10-10T00:00:00Z' },
    { id: 'sub-c', business_id: 'biz-c-uuid', plan: 'starter', status: 'active', current_period_start: '2026-09-15T00:00:00Z', current_period_end: '2026-10-15T00:00:00Z' },
    { id: 'sub-d', business_id: 'biz-d-uuid', plan: 'starter', status: 'active', current_period_start: '2026-09-05T00:00:00Z', current_period_end: '2026-10-05T00:00:00Z' },
  ];

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn((table: string) => {
        const query: any = {
          select: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          then: (resolve: any) => {
            switch (table) {
              case 'businesses':
                return Promise.resolve({ data: mockBusinesses, error: null }).then(resolve);
              case 'qr_codes':
                return Promise.resolve({ data: mockQRs, error: null }).then(resolve);
              case 'scan_logs':
                return Promise.resolve({ data: mockScans, error: null }).then(resolve);
              case 'review_sessions':
                return Promise.resolve({ data: mockSessions, error: null }).then(resolve);
              case 'generated_reviews':
                return Promise.resolve({ data: mockReviews, error: null }).then(resolve);
              case 'pilot_feedback':
                return Promise.resolve({ data: mockFeedback, error: null }).then(resolve);
              case 'subscriptions':
                return Promise.resolve({ data: mockSubscriptions, error: null }).then(resolve);
              default:
                return Promise.resolve({ data: [], error: null }).then(resolve);
            }
          },
        };
        return query;
      }),
    };

    adminService = new AdminService(mockSupabase);
    adminController = new AdminController(adminService);
  });

  // 1. Operational activation states (Task 3 & 14)
  test('1. Correctly classifies operational activation states across Business A, B, C, D', async () => {
    const result = await adminService.getPilotInsights({ range: 'all', status: 'all' });

    expect(result.summary.total_pilot_businesses).toBe(4);

    const bizA = result.businesses.find(b => b.id === 'biz-a-uuid')!;
    const bizB = result.businesses.find(b => b.id === 'biz-b-uuid')!;
    const bizC = result.businesses.find(b => b.id === 'biz-c-uuid')!;
    const bizD = result.businesses.find(b => b.id === 'biz-d-uuid')!;

    // Business A: Configured + Customer Traffic -> ACTIVE
    expect(bizA.setup_status).toBe('complete');
    expect(bizA.activity_status).toBe('active');

    // Business B: Configured + Zero Traffic -> READY
    expect(bizB.setup_status).toBe('complete');
    expect(bizB.activity_status).toBe('ready');

    // Business C: Missing Google Review URL & No QR -> NOT SET UP
    expect(bizC.setup_status).toBe('incomplete');
    expect(bizC.activity_status).toBe('not_set_up');

    // Business D: Open unresolved feedback -> NEEDS ATTENTION
    expect(bizD.setup_status).toBe('complete');
    expect(bizD.activity_status).toBe('needs_attention');
    expect(bizD.open_feedback_count).toBe(1);
  });

  // 2. Summary metrics count (Task 2)
  test('2. Accurately calculates pilot usage summary without ranking or numerical scoring', async () => {
    const result = await adminService.getPilotInsights({ range: 'all' });

    expect(result.summary.total_pilot_businesses).toBe(4);
    expect(result.summary.businesses_active).toBe(1);
    expect(result.summary.businesses_ready).toBe(1);
    expect(result.summary.businesses_not_setup).toBe(1);
    expect(result.summary.businesses_needs_attention).toBe(1);
    expect(result.summary.businesses_no_activity).toBe(3);

    expect(result.summary.total_scans).toBe(3);
    expect(result.summary.total_sessions).toBe(2);
    expect(result.summary.total_ai_generated).toBe(2);
    expect(result.summary.total_copies).toBe(1);
    expect(result.summary.total_google_opens).toBe(1);
    expect(result.summary.total_feedback).toBe(1);
  });

  // 3. Operational milestones & timestamps (Task 4 & 7)
  test('3. Derives exact milestone booleans and operational timestamps without inventing data', async () => {
    const result = await adminService.getPilotInsights({ range: 'all' });
    const bizA = result.businesses.find(b => b.id === 'biz-a-uuid')!;

    expect(bizA.milestones.setup_completed).toBe(true);
    expect(bizA.milestones.qr_generated).toBe(true);
    expect(bizA.milestones.first_scan).toBe(true);
    expect(bizA.milestones.first_session).toBe(true);
    expect(bizA.milestones.first_generation).toBe(true);
    expect(bizA.milestones.first_copied).toBe(true);
    expect(bizA.milestones.first_google_open).toBe(true);

    expect(bizA.first_activity_timestamps.first_qr_scan).toBe('2026-09-03T11:05:00Z');
    expect(bizA.first_activity_timestamps.first_review_session).toBe('2026-09-03T11:05:00Z');
    expect(bizA.first_activity_timestamps.first_ai_generation).toBe('2026-09-03T11:06:00Z');
    expect(bizA.first_activity_timestamps.first_review_copied).toBe('2026-09-03T11:07:00Z');
    expect(bizA.first_activity_timestamps.first_google_page_open).toBe('2026-09-03T11:08:00Z');

    // Business B should have null for traffic timestamps
    const bizB = result.businesses.find(b => b.id === 'biz-b-uuid')!;
    expect(bizB.milestones.first_scan).toBe(false);
    expect(bizB.first_activity_timestamps.first_qr_scan).toBeNull();
    expect(bizB.first_activity_timestamps.first_google_page_open).toBeNull();
  });

  // 4. Search and status filters (Task 6)
  test('4. Correctly filters by operational status and search query', async () => {
    // Filter by 'ready'
    const readyResult = await adminService.getPilotInsights({ range: 'all', status: 'ready' });
    expect(readyResult.businesses.length).toBe(1);
    expect(readyResult.businesses[0].id).toBe('biz-b-uuid');

    // Search by 'Delta'
    const searchResult = await adminService.getPilotInsights({ range: 'all', search: 'Delta' });
    expect(searchResult.businesses.length).toBe(1);
    expect(searchResult.businesses[0].name).toBe('Delta Auto Repair');
  });

  // 5. Empty state (Task 12)
  test('5. Handles zero businesses empty state gracefully', async () => {
    mockSupabase.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    const result = await adminService.getPilotInsights({ range: 'all' });
    expect(result.summary.total_pilot_businesses).toBe(0);
    expect(result.summary.businesses_active).toBe(0);
    expect(result.businesses).toEqual([]);
    expect(result.trends).toEqual([]);
  });

  // 6. Semantic accuracy (Task 2 & 16)
  test('6. Enforces Google Review Page Opens semantic notice and label', async () => {
    const result = await adminService.getPilotInsights({ range: 'all' });
    expect(result.notice).toContain('Google Review Page Opens indicates customer opened the Google Review URL');
    expect(result.notice).toContain('It does NOT imply verified review publication on Google');
    expect(result.summary).toHaveProperty('total_google_opens');
    expect(result.summary).not.toHaveProperty('total_google_reviews_received');
  });

  // 7. Full HTTP controller test & Admin Authorization (Task 11)
  describe('HTTP Route & Admin Authorization Tests', () => {
    let app: any;

    beforeEach(() => {
      const express = require('express');
      const { createAuthMiddleware } = require('../../auth/middleware');
      app = express();
      app.use(express.json());

      const mockAuthService = {
        verifyAccessToken: jest.fn((token: string) => {
          if (token === 'admin-token') {
            return { sub: 'admin-uuid', role: 'admin', email: 'admin@reviewai.com' };
          }
          if (token === 'owner-token') {
            return { sub: 'owner-uuid', role: 'business_owner', email: 'owner@biz.com' };
          }
          throw new Error('Invalid token');
        }),
      };

      const authMiddleware = createAuthMiddleware(mockAuthService as any);

      // Mount admin pilot-insights endpoint with auth guard
      app.get(
        '/api/v1/admin/pilot-insights',
        authMiddleware.authenticate,
        authMiddleware.requireRole('admin'),
        adminController.getPilotInsights.bind(adminController)
      );

      // Error handler
      app.use((err: any, _req: any, res: any, _next: any) => {
        const status = err.statusCode || err.status || 500;
        res.status(status).json({ success: false, error: err.message, code: err.code });
      });
    });

    test('7a. Admin role receives HTTP 200 OK and data', async () => {
      const request = require('supertest');
      const res = await request(app)
        .get('/api/v1/admin/pilot-insights?range=all')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.total_pilot_businesses).toBe(4);
    });

    test('7b. Non-admin business owner receives HTTP 403 Forbidden', async () => {
      const request = require('supertest');
      const res = await request(app)
        .get('/api/v1/admin/pilot-insights?range=all')
        .set('Authorization', 'Bearer owner-token');

      expect(res.status).toBe(403);
    });

    test('7c. Unauthenticated user receives HTTP 401 Unauthorized', async () => {
      const request = require('supertest');
      const res = await request(app)
        .get('/api/v1/admin/pilot-insights?range=all');

      expect(res.status).toBe(401);
    });
  });

  // Helper to create test database with custom table contents
  function createCustomSupabase(overrides: {
    businesses?: any[];
    qr_codes?: any[];
    scan_logs?: any[];
    review_sessions?: any[];
    generated_reviews?: any[];
    pilot_feedback?: any[];
    subscriptions?: any[];
  }) {
    return {
      from: jest.fn((table: string) => {
        const query: any = {
          select: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          then: (resolve: any) => {
            const data = (overrides as any)[table] ?? [];
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return query;
      }),
    };
  }

  // Step 28A: First QR Scan Reliability Tests
  describe('Step 28A — First QR Scan Timestamp Reliability', () => {
    test('1. Business with first review session: first_qr_scan = review_sessions.started_at', async () => {
      const result = await adminService.getPilotInsights({ range: 'all' });
      const bizA = result.businesses.find(b => b.id === 'biz-a-uuid')!;
      expect(bizA.first_activity_timestamps.first_qr_scan).toBe('2026-09-03T11:05:00Z');
      expect(bizA.milestones.first_scan).toBe(true);
    });

    test('2. Scan log missing: first_qr_scan still works from review_sessions', async () => {
      const db = createCustomSupabase({
        businesses: [mockBusinesses[0]],
        qr_codes: [mockQRs[0]],
        scan_logs: [], // Missing scan log / beacon blocked
        review_sessions: [
          { id: 's-1', business_id: 'biz-a-uuid', qr_code_id: 'qr-a', status: 'started', rating: 5, started_at: '2026-09-03T11:05:00Z', metadata: {} },
        ],
      });
      const svc = new AdminService(db as any);
      const res = await svc.getPilotInsights({ range: 'all' });
      const b = res.businesses[0];
      expect(b.first_activity_timestamps.first_qr_scan).toBe('2026-09-03T11:05:00Z');
      expect(b.milestones.first_scan).toBe(true);
      expect(b.activity_counts.scans).toBe(0); // Scans count is 0 because scan_log was missing
      expect(b.activity_counts.sessions).toBe(1); // Session count is 1
    });

    test('3. Multiple sessions: earliest started_at is selected', async () => {
      const db = createCustomSupabase({
        businesses: [mockBusinesses[0]],
        qr_codes: [mockQRs[0]],
        review_sessions: [
          { id: 's-later', business_id: 'biz-a-uuid', qr_code_id: 'qr-a', status: 'completed', rating: 5, started_at: '2026-09-10T12:00:00Z', metadata: {} },
          { id: 's-earlier', business_id: 'biz-a-uuid', qr_code_id: 'qr-a', status: 'completed', rating: 5, started_at: '2026-09-01T08:30:00Z', metadata: {} },
          { id: 's-middle', business_id: 'biz-a-uuid', qr_code_id: 'qr-a', status: 'completed', rating: 5, started_at: '2026-09-05T09:00:00Z', metadata: {} },
        ],
      });
      const svc = new AdminService(db as any);
      const res = await svc.getPilotInsights({ range: 'all' });
      expect(res.businesses[0].first_activity_timestamps.first_qr_scan).toBe('2026-09-01T08:30:00Z');
    });

    test('4. No sessions: first_qr_scan is null even if scan_logs exist', async () => {
      const db = createCustomSupabase({
        businesses: [mockBusinesses[0]],
        qr_codes: [mockQRs[0]],
        scan_logs: [{ id: 'scan-alone', business_id: 'biz-a-uuid', scanned_at: '2026-09-01T10:00:00Z' }],
        review_sessions: [], // Zero customer sessions created
      });
      const svc = new AdminService(db as any);
      const res = await svc.getPilotInsights({ range: 'all' });
      // Case 2 in Task 7: Business has scan_logs but no review session -> first_qr_scan remains null
      expect(res.businesses[0].first_activity_timestamps.first_qr_scan).toBeNull();
      expect(res.businesses[0].milestones.first_scan).toBe(false);
      expect(res.businesses[0].activity_counts.scans).toBe(1); // Scan analytics preserved
      expect(res.businesses[0].activity_counts.sessions).toBe(0);
    });

    test('5. Wrong business session: ignored for another business', async () => {
      const result = await adminService.getPilotInsights({ range: 'all' });
      const bizB = result.businesses.find(b => b.id === 'biz-b-uuid')!;
      // Business B has no sessions, so Biz A's sessions must not leak to Biz B
      expect(bizB.first_activity_timestamps.first_qr_scan).toBeNull();
      expect(bizB.milestones.first_scan).toBe(false);
    });

    test('6. Inactive business or test sessions: does not create customer milestone', async () => {
      const inactiveBiz = { ...mockBusinesses[0], id: 'biz-inactive', is_active: false };
      const db = createCustomSupabase({
        businesses: [inactiveBiz],
        qr_codes: [{ id: 'qr-in', business_id: 'biz-inactive', is_active: false }],
        review_sessions: [
          { id: 's-test', business_id: 'biz-inactive', qr_code_id: 'qr-in', status: 'started', rating: 5, started_at: '2026-09-01T10:00:00Z', metadata: { is_test: true } },
        ],
      });
      const svc = new AdminService(db as any);
      const res = await svc.getPilotInsights({ range: 'all' });
      expect(res.businesses[0].activity_status).toBe('needs_attention');
      expect(res.businesses[0].first_activity_timestamps.first_qr_scan).toBeNull();
      expect(res.businesses[0].milestones.first_scan).toBe(false);
    });

    test('7. Admin queries are batched across businesses with no N+1 regression', async () => {
      const tenBusinesses = Array.from({ length: 10 }, (_, i) => ({
        ...mockBusinesses[0],
        id: `biz-${i}`,
      }));
      const db = createCustomSupabase({
        businesses: tenBusinesses,
      });
      const svc = new AdminService(db as any);
      await svc.getPilotInsights({ range: 'all' });
      // Exactly 7 total queries across all 10 businesses (1 businesses lookup + 6 batch queries: scans, sessions, reviews, feedback, qr, subs), NOT 10*N
      expect(db.from).toHaveBeenCalledTimes(7);
    });

    test('8. Existing scan analytics are preserved and accurate', async () => {
      const result = await adminService.getPilotInsights({ range: 'all' });
      const bizA = result.businesses.find(b => b.id === 'biz-a-uuid')!;
      expect(bizA.activity_counts.scans).toBe(3);
      expect(result.summary.total_scans).toBe(3);
    });
  });
});
