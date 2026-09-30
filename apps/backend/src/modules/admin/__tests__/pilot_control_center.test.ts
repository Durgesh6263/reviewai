import { AdminService } from '../service';
import { AdminController } from '../controller';
import { operationalIncidents } from '../incident_service';
import express from 'express';
import request from 'supertest';
import { createAuthMiddleware } from '../../auth/middleware';

describe('STEP 29: Pilot Launch Control Center & Incident Monitoring Test Suite', () => {
  let mockSupabase: any;
  let adminService: AdminService;
  let adminController: AdminController;

  const mockBusinesses = [
    {
      id: 'biz-a-uuid',
      name: 'Alpha Gym & Fitness',
      slug: 'alpha-gym',
      email: 'owner@alpha.com',
      is_active: true,
      google_review_url: 'https://g.page/r/alpha-gym/review',
      is_pilot_business: true,
      pilot_limits: { max_reviews_monthly: 50 },
      created_at: '2026-09-01T10:00:00Z',
    },
    {
      id: 'biz-b-uuid',
      name: 'Beta Bistro Cafe',
      slug: 'beta-bistro',
      email: 'owner@beta.com',
      is_active: true,
      google_review_url: '', // INCOMPLETE SETUP
      is_pilot_business: true,
      pilot_limits: { max_reviews_monthly: 50 },
      created_at: '2026-09-10T09:00:00Z',
    },
    {
      id: 'biz-c-uuid',
      name: 'Charlie Dental Clinic',
      slug: 'charlie-dental',
      email: 'owner@charlie.com',
      is_active: true,
      google_review_url: 'https://g.page/r/charlie-dental/review',
      is_pilot_business: true,
      pilot_limits: { max_reviews_monthly: 50 },
      created_at: '2026-09-02T08:00:00Z',
    },
    {
      id: 'biz-d-uuid',
      name: 'Delta Boutique Store',
      slug: 'delta-boutique',
      email: 'owner@delta.com',
      is_active: true,
      google_review_url: 'https://g.page/r/delta-boutique/review',
      is_pilot_business: true,
      pilot_limits: { max_reviews_monthly: 50 },
      created_at: '2026-09-15T11:00:00Z',
    },
  ];

  const mockQRs = [
    { id: 'qr-a', business_id: 'biz-a-uuid', name: 'Front Desk', slug: 'alpha-front', created_at: '2026-09-01T10:05:00Z', is_active: true },
    // Notice biz-b has NO QR code!
    { id: 'qr-c', business_id: 'biz-c-uuid', name: 'Reception', slug: 'charlie-rec', created_at: '2026-09-02T08:05:00Z', is_active: true },
    { id: 'qr-d', business_id: 'biz-d-uuid', name: 'Checkout', slug: 'delta-check', created_at: '2026-09-15T11:05:00Z', is_active: true },
  ];

  const mockScans = [
    { id: 's1', business_id: 'biz-a-uuid', scanned_at: '2026-09-02T11:00:00Z' },
    { id: 's2', business_id: 'biz-a-uuid', scanned_at: '2026-09-03T12:00:00Z' },
  ];

  const mockSessions = [
    {
      id: 'sess-1',
      business_id: 'biz-a-uuid',
      qr_code_id: 'qr-a',
      status: 'redirected',
      rating: 5,
      started_at: '2026-09-02T11:05:00Z',
      completed_at: '2026-09-02T11:08:00Z',
      metadata: {
        copied_at: '2026-09-02T11:07:00Z',
        copy_count: 1,
        google_redirected_at: '2026-09-02T11:08:00Z',
      },
    },
  ];

  const mockReviews = [
    { id: 'rev-1', business_id: 'biz-a-uuid', created_at: '2026-09-02T11:06:00Z' },
  ];

  const mockFeedback = [
    {
      id: 'fb-c',
      business_id: 'biz-c-uuid',
      status: 'open', // UNRESOLVED FEEDBACK ON BIZ C
      rating: 2,
      created_at: '2026-09-05T15:00:00Z',
    },
  ];

  const mockSubscriptions = [
    { id: 'sub-a', business_id: 'biz-a-uuid', plan: 'growth', status: 'active' },
    { id: 'sub-b', business_id: 'biz-b-uuid', plan: 'starter', status: 'active' },
    { id: 'sub-c', business_id: 'biz-c-uuid', plan: 'starter', status: 'active' },
    { id: 'sub-d', business_id: 'biz-d-uuid', plan: 'starter', status: 'active' },
  ];

  const mockUpgrades = [
    { id: 'up-1', business_id: 'biz-d-uuid', status: 'pending', requested_plan: 'growth', created_at: '2026-09-16T10:00:00Z' },
  ];

  beforeEach(() => {
    operationalIncidents.clear();

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
              case 'upgrade_requests':
                return Promise.resolve({ data: mockUpgrades, error: null }).then(resolve);
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

  // 1. Business Monitoring & Needs Attention Logic (Task 2 & 4)
  test('1. Accurately determines Needs Attention state with objective criteria and no business ranking', async () => {
    const res = await adminService.getPilotControlCenter({ range: 'all' });

    expect(res.businesses_summary.total_pilot_businesses).toBe(4);
    expect(res.businesses_summary.setup_complete).toBe(3); // A, C, D complete; B incomplete

    const bizA = res.pilot_businesses.find(b => b.id === 'biz-a-uuid')!;
    const bizB = res.pilot_businesses.find(b => b.id === 'biz-b-uuid')!;
    const bizC = res.pilot_businesses.find(b => b.id === 'biz-c-uuid')!;
    const bizD = res.pilot_businesses.find(b => b.id === 'biz-d-uuid')!;

    // Business A: Setup complete + customer activity -> Active, Needs Attention: false
    expect(bizA.setup_status).toBe('complete');
    expect(bizA.activity_status).toBe('active');
    expect(bizA.needs_attention).toBe(false);
    expect(bizA.attention_reasons).toHaveLength(0);

    // Business B: Incomplete setup (missing Google Review URL & no QR) -> Needs Attention: true
    expect(bizB.setup_status).toBe('incomplete');
    expect(bizB.needs_attention).toBe(true);
    expect(bizB.attention_reasons).toContain('Valid Google Review URL not configured');
    expect(bizB.attention_reasons).toContain('No active QR code generated');

    // Business C: Open unresolved feedback -> Needs Attention: true
    expect(bizC.setup_status).toBe('complete');
    expect(bizC.needs_attention).toBe(true);
    expect(bizC.attention_reasons).toContain('1 unresolved private feedback item(s)');

    // Business D: Configured + zero activity -> Ready, Needs Attention: false (zero activity is NOT an attention flag)
    expect(bizD.setup_status).toBe('complete');
    expect(bizD.activity_status).toBe('ready');
    expect(bizD.needs_attention).toBe(false);
    expect(bizD.attention_reasons).toHaveLength(0);
  });

  // 2. Summary KPI Aggregation (Task 2)
  test('2. Aggregates customer activity, feedback, and subscription metrics accurately', async () => {
    const res = await adminService.getPilotControlCenter({ range: 'all' });

    expect(res.customer_activity.total_scans).toBe(2);
    expect(res.customer_activity.total_sessions).toBe(1);
    expect(res.customer_activity.total_ai_generated).toBe(1);
    expect(res.customer_activity.total_copies).toBe(1);
    expect(res.customer_activity.total_google_opens).toBe(1);

    expect(res.feedback_summary.open).toBe(1);
    expect(res.feedback_summary.total).toBe(1);

    expect(res.subscriptions_summary.paid_businesses).toBe(1); // biz-a is growth
    expect(res.subscriptions_summary.free_businesses).toBe(3); // biz-b, c, d are starter
    expect(res.subscriptions_summary.pending_upgrade_requests).toBe(1); // biz-d pending
  });

  // 3. Operational Incident Recording, Categorization & Deduplication (Task 5, 6, 7)
  test('3. Categorizes, sanitizes, and deduplicates operational errors within time window', async () => {
    // Record first error
    operationalIncidents.record({
      category: 'AI',
      route: 'POST /review/sessions/generate',
      severity: 'error',
      business_id: 'biz-a-uuid',
      message: 'LLM timeout after 8000ms with token Bearer secret_123456789',
    });

    // Record duplicate error within window
    operationalIncidents.record({
      category: 'AI',
      route: 'POST /review/sessions/generate',
      severity: 'critical',
      business_id: 'biz-a-uuid',
      message: 'LLM timeout after 8000ms with token Bearer secret_123456789',
    });

    // Record different error
    operationalIncidents.record({
      category: 'QR',
      route: 'GET /r/unknown-slug',
      severity: 'warning',
      business_id: null,
      message: 'QR code not found for slug unknown-slug',
    });

    const res = await adminService.getPilotControlCenter({ range: 'all' });

    // Incident count is deduplicated: 2 unique items
    expect(res.system_health.recent_incidents).toHaveLength(2);

    const aiIncident = res.system_health.recent_incidents.find(i => i.category === 'AI')!;
    expect(aiIncident.count).toBe(2); // Count incremented
    expect(aiIncident.severity).toBe('critical'); // Escalated to critical
    expect(aiIncident.message).not.toContain('secret_123456789'); // Sanitized!
    expect(aiIncident.message).toContain('Bearer [REDACTED]');

    expect(res.system_health.ai_failures_count).toBe(2);
    expect(res.system_health.recent_errors_count).toBe(3); // 2 AI + 1 QR
  });

  // 4. HTTP Route & Admin Authorization (Task 10)
  describe('HTTP Route & Admin Authorization (/api/v1/admin/pilot)', () => {
    let app: express.Application;

    beforeEach(() => {
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

      // Mount /api/v1/admin/pilot with admin guard
      app.get(
        '/api/v1/admin/pilot',
        authMiddleware.authenticate,
        authMiddleware.requireRole('admin'),
        adminController.getPilotControlCenter.bind(adminController)
      );

      // Error handler
      app.use((err: any, _req: any, res: any, _next: any) => {
        const status = err.statusCode || err.status || 500;
        res.status(status).json({ success: false, error: err.message, code: err.code });
      });
    });

    test('4a. Admin role receives HTTP 200 OK and control center data', async () => {
      const res = await request(app)
        .get('/api/v1/admin/pilot?range=all')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.businesses_summary.total_pilot_businesses).toBe(4);
      expect(res.body.data.notice).toContain('Google Review Page Opens');
    });

    test('4b. Non-admin business owner receives HTTP 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/pilot?range=all')
        .set('Authorization', 'Bearer owner-token');

      expect(res.status).toBe(403);
    });

    test('4c. Unauthenticated visitor receives HTTP 401 Unauthorized', async () => {
      const res = await request(app)
        .get('/api/v1/admin/pilot?range=all');

      expect(res.status).toBe(401);
    });
  });

  // 5. Empty State Handling (Task 13)
  test('5. Gracefully handles zero pilot businesses with valid zero-value response', async () => {
    const emptySupabase: any = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };
    const svc = new AdminService(emptySupabase);
    const res = await svc.getPilotControlCenter({ range: 'all' });

    expect(res.businesses_summary.total_pilot_businesses).toBe(0);
    expect(res.businesses_summary.active).toBe(0);
    expect(res.customer_activity.total_scans).toBe(0);
    expect(res.pilot_businesses).toHaveLength(0);
    expect(res.notice).toBeDefined();
  });
});
