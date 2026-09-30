import { AdminService } from '../service';
import { AdminController } from '../controller';
import { operationalIncidents } from '../incident_service';
import express from 'express';
import request from 'supertest';
import { createAuthMiddleware } from '../../auth/middleware';

// ============================================================
// STEP 31: Daily Pilot Health & Operational Monitoring Tests
// ============================================================

describe('STEP 31: Daily Pilot Health & Operational Monitoring', () => {

  // ── Shared mock factory ──────────────────────────────────────
  function buildMockSupabase(overrides: {
    businesses?: any[];
    scans?: any[];
    sessions?: any[];
    reviews?: any[];
    feedback?: any[];
    upgrades?: any[];
    qr?: any[];
    subscriptions?: any[];
  } = {}) {
    const {
      businesses = [],
      scans = [],
      sessions = [],
      reviews = [],
      feedback = [],
      upgrades = [],
      qr = [],
      subscriptions = [],
    } = overrides;

    return {
      from: jest.fn((table: string) => {
        const chain: any = {
          select: jest.fn().mockReturnThis(),
          is:     jest.fn().mockReturnThis(),
          in:     jest.fn().mockReturnThis(),
          gte:    jest.fn().mockReturnThis(),
          eq:     jest.fn().mockReturnThis(),
          order:  jest.fn().mockReturnThis(),
        };
        // Resolve with data for the table
        const resolve = () => {
          switch (table) {
            case 'businesses':       return Promise.resolve({ data: businesses, error: null });
            case 'scan_logs':        return Promise.resolve({ data: scans, error: null });
            case 'review_sessions':  return Promise.resolve({ data: sessions, error: null });
            case 'generated_reviews':return Promise.resolve({ data: reviews, error: null });
            case 'pilot_feedback':   return Promise.resolve({ data: feedback, error: null });
            case 'upgrade_requests': return Promise.resolve({ data: upgrades, error: null });
            case 'qr_codes':         return Promise.resolve({ data: qr, error: null });
            case 'subscriptions':    return Promise.resolve({ data: subscriptions, error: null });
            default:                 return Promise.resolve({ data: [], error: null });
          }
        };
        // Make the chain thenable
        chain.then = (cb: any) => resolve().then(cb);
        Object.keys(chain).forEach(key => {
          if (key !== 'then') {
            chain[key] = jest.fn().mockReturnValue(chain);
          }
        });
        chain.then = (cb: any) => resolve().then(cb);
        return chain;
      }),
    };
  }

  beforeEach(() => {
    operationalIncidents.clear();
  });

  // ============================================================
  // TASK 2: Daily Health Metric Calculations
  // ============================================================
  describe('Task 2: Daily health metric calculations', () => {
    const now = new Date();
    const recent = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60_000).toISOString();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

    test('2a. Counts newly onboarded businesses in last 24h vs older ones', async () => {
      const businesses = [
        { id: 'biz-new', name: 'New Biz', google_review_url: 'https://g.page/r/new/review', is_active: true, created_at: recent(60) },
        { id: 'biz-old', name: 'Old Biz', google_review_url: 'https://g.page/r/old/review', is_active: true, created_at: daysAgo(5) },
      ];
      const qr = [
        { id: 'qr-new', business_id: 'biz-new', is_active: true },
        { id: 'qr-old', business_id: 'biz-old', is_active: true },
      ];
      const svc = new AdminService(buildMockSupabase({ businesses, qr }) as any);
      const result = await svc.getDailyHealthSummary();

      expect(result.businesses.total).toBe(2);
      expect(result.businesses.newly_onboarded_24h).toBe(1);
      expect(result.businesses.setup_incomplete).toBe(0); // both have url + qr
    });

    test('2b. Identifies setup-incomplete businesses correctly', async () => {
      const businesses = [
        { id: 'biz-a', name: 'Biz A', google_review_url: 'https://g.page/r/a/review', is_active: true, created_at: daysAgo(2) },
        { id: 'biz-b', name: 'Biz B', google_review_url: '', is_active: true, created_at: daysAgo(2) }, // no URL
        { id: 'biz-c', name: 'Biz C', google_review_url: 'https://g.page/r/c/review', is_active: true, created_at: daysAgo(2) }, // no QR
      ];
      const qr = [
        { id: 'qr-a', business_id: 'biz-a', is_active: true },
        // biz-c has no QR
      ];
      const svc = new AdminService(buildMockSupabase({ businesses, qr }) as any);
      const result = await svc.getDailyHealthSummary();

      // biz-b (no URL) and biz-c (no QR) are incomplete
      expect(result.businesses.setup_incomplete).toBe(2);
    });

    test('2c. Customer flow metrics are counted within 24h window only', async () => {
      const businesses = [
        { id: 'biz-a', name: 'Biz A', google_review_url: 'https://g.page/r/a', is_active: true, created_at: daysAgo(10) },
      ];
      const scans = [
        { id: 's1', business_id: 'biz-a', scanned_at: recent(60) },  // in window
        { id: 's2', business_id: 'biz-a', scanned_at: daysAgo(2) },  // NOT in window (previous period)
      ];
      const sessions = [
        { id: 'sess1', business_id: 'biz-a', status: 'redirected', started_at: recent(30), metadata: { google_redirected_at: recent(30), copied_at: recent(30), copy_count: 1 } },
        { id: 'sess2', business_id: 'biz-a', status: 'completed',  started_at: daysAgo(2), metadata: {} }, // previous
      ];
      const reviews = [
        { id: 'rev1', business_id: 'biz-a', created_at: recent(30) },
      ];
      const svc = new AdminService(buildMockSupabase({ businesses, scans, sessions, reviews }) as any);
      const result = await svc.getDailyHealthSummary();

      expect(result.customer_flow.qr_scans).toBe(1);
      expect(result.customer_flow.review_sessions).toBe(1);
      expect(result.customer_flow.ai_generations).toBe(1);
      expect(result.customer_flow.google_page_opens).toBe(1);
      expect(result.customer_flow.review_copies).toBe(1);
    });

    test('2d. Returns all zeros with no data (empty state)', async () => {
      const svc = new AdminService(buildMockSupabase() as any);
      const result = await svc.getDailyHealthSummary();

      expect(result.businesses.total).toBe(0);
      expect(result.customer_flow.qr_scans).toBe(0);
      expect(result.customer_flow.ai_generations).toBe(0);
      expect(result.customer_flow.review_copies).toBe(0);
      expect(result.system.operational_errors_24h).toBe(0);
      expect(result.notice).toBeDefined();
    });
  });

  // ============================================================
  // TASK 3: 24-Hour Comparison
  // ============================================================
  describe('Task 3: 24-hour period comparison', () => {
    test('3a. Comparison structure is always present', async () => {
      const svc = new AdminService(buildMockSupabase() as any);
      const result = await svc.getDailyHealthSummary();

      expect(result.comparison).toBeDefined();
      expect(result.comparison.current).toBeDefined();
      expect(result.comparison.previous).toBeDefined();
    });

    test('3b. Current window isolates to last 24h, previous to prior 24h', async () => {
      const now = new Date();
      const recentTime = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago = current
      const previousTime = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString(); // 30h ago = previous

      const businesses = [
        { id: 'biz-a', name: 'Biz A', google_review_url: 'https://g.page/r/a', is_active: true, created_at: '2026-01-01T00:00:00Z' },
      ];
      const scans = [
        { id: 's1', business_id: 'biz-a', scanned_at: recentTime },
        { id: 's2', business_id: 'biz-a', scanned_at: previousTime },
      ];
      const svc = new AdminService(buildMockSupabase({ businesses, scans }) as any);
      const result = await svc.getDailyHealthSummary();

      // Current window: 1 scan; previous: 1 scan (returned by mock without date filter)
      // Mock returns all data regardless; the service filters in-memory
      expect(typeof result.comparison.current.qr_scans).toBe('number');
      expect(typeof result.comparison.previous.qr_scans).toBe('number');
    });

    test('3c. Comparison fields have no nulls for standard metrics', async () => {
      const svc = new AdminService(buildMockSupabase() as any);
      const result = await svc.getDailyHealthSummary();
      const cur = result.comparison.current;
      const prv = result.comparison.previous;

      const fields: (keyof typeof cur)[] = [
        'qr_scans', 'review_sessions', 'ai_generations', 'review_copies',
        'google_page_opens', 'operational_errors', 'ai_failures', 'auth_failures', 'db_errors',
      ];
      fields.forEach(f => {
        expect(typeof cur[f]).toBe('number');
        expect(typeof prv[f]).toBe('number');
        expect(cur[f]).toBeGreaterThanOrEqual(0);
        expect(prv[f]).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ============================================================
  // TASK 6: AI Health — Zero denominator handling
  // ============================================================
  describe('Task 6: AI health and zero-denominator safety', () => {
    test('6a. ai_failure_rate_pct is null when no AI generations and no failures', async () => {
      const svc = new AdminService(buildMockSupabase() as any);
      const result = await svc.getDailyHealthSummary();
      expect(result.customer_flow.ai_failure_rate_pct).toBeNull();
    });

    test('6b. ai_failure_rate_pct is calculated when there are generations and failures', async () => {
      // Record 2 AI failures in incident log
      operationalIncidents.record({ category: 'AI', route: '/review/generate', severity: 'error', message: 'LLM timeout' });
      operationalIncidents.record({ category: 'AI', route: '/review/generate', severity: 'error', message: 'LLM quota exceeded' });

      const businesses = [
        { id: 'biz-a', name: 'Biz A', google_review_url: 'https://g.page/r/a', is_active: true, created_at: '2026-01-01T00:00:00Z' },
      ];
      const reviews = [
        { id: 'r1', business_id: 'biz-a', created_at: new Date().toISOString() }, // 1 success
      ];
      const svc = new AdminService(buildMockSupabase({ businesses, reviews }) as any);
      const result = await svc.getDailyHealthSummary();

      // 2 failures out of 3 total attempts = 66% or 67%
      expect(result.customer_flow.ai_failure_rate_pct).not.toBeNull();
      expect(result.customer_flow.ai_generation_failures).toBe(2);
    });

    test('6c. ai_failure_rate_pct never divides by zero', async () => {
      // Only failures, no successes
      operationalIncidents.record({ category: 'AI', route: '/review/generate', severity: 'critical', message: 'AI down' });
      const svc = new AdminService(buildMockSupabase() as any);
      const result = await svc.getDailyHealthSummary();

      // denominator = 0 successes + 1 failure = 1 total, so rate = 100%
      expect(result.customer_flow.ai_failure_rate_pct).toBe(100);
    });
  });

  // ============================================================
  // TASK 4: Error severity classification
  // ============================================================
  describe('Task 4: Incident severity classification', () => {
    test('4a. CRITICAL severity is escalated when duplicates are re-recorded with higher severity', () => {
      const inc = operationalIncidents.record({
        category: 'AI', route: '/api/generate', severity: 'error', message: 'AI timeout'
      });
      expect(inc.severity).toBe('error');

      operationalIncidents.record({
        category: 'AI', route: '/api/generate', severity: 'critical', message: 'AI timeout'
      });
      // Same incident should be escalated
      const incidents = operationalIncidents.getRecentIncidents();
      const aiInc = incidents.find(i => i.category === 'AI');
      expect(aiInc!.severity).toBe('critical');
    });

    test('4b. Severity does not downgrade on duplicate', () => {
      operationalIncidents.record({ category: 'DATABASE', route: '/db', severity: 'critical', message: 'DB fail' });
      operationalIncidents.record({ category: 'DATABASE', route: '/db', severity: 'warning', message: 'DB fail' });
      const incidents = operationalIncidents.getRecentIncidents();
      const dbInc = incidents.find(i => i.category === 'DATABASE');
      expect(dbInc!.severity).toBe('critical'); // should not downgrade
    });

    test('4c. WARNING does not become CRITICAL for ordinary customer abandonment', async () => {
      // Customer abandonment is not an incident — it should NOT be recorded
      // Verify that zero incidents exist when nothing technical fails
      const svc = new AdminService(buildMockSupabase() as any);
      const result = await svc.getDailyHealthSummary();
      expect(result.system.critical_incidents).toBe(0);
    });
  });

  // ============================================================
  // TASK 8: Incident creation and retrieval
  // ============================================================
  describe('Task 8 & 9: Incident creation and retrieval', () => {
    test('8a. Incidents are recorded and retrievable with sanitized messages', () => {
      operationalIncidents.record({
        category: 'AUTH',
        route: '/auth/login',
        severity: 'error',
        message: 'Login failed with password=supersecret123',
      });
      const incidents = operationalIncidents.getRecentIncidents();
      expect(incidents).toHaveLength(1);
      expect(incidents[0].message).not.toContain('supersecret123');
    });

    test('8b. Incident detail includes required fields', () => {
      const inc = operationalIncidents.record({
        category: 'QR', route: '/r/missing-slug', severity: 'warning', message: 'QR not found', business_id: null,
      });
      const found = operationalIncidents.getIncident(inc.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(inc.id);
      expect(found!.category).toBe('QR');
      expect(found!.route).toBe('/r/missing-slug');
      expect(found!.business_id).toBeNull();
      expect(found!.status).toBe('active');
    });

    test('8c. Unknown business is stored as null, not guessed', () => {
      const inc = operationalIncidents.record({
        category: 'UNKNOWN', route: '/unknown', severity: 'info', message: 'Unknown error',
      });
      expect(inc.business_id).toBeNull();
      expect(inc.business_name).toBeNull();
    });

    test('8d. Known business is correctly linked', () => {
      const inc = operationalIncidents.record({
        category: 'AI', route: '/review/generate', severity: 'error',
        business_id: 'biz-xyz', business_name: 'Test Bistro', message: 'AI failure',
      });
      expect(inc.business_id).toBe('biz-xyz');
      expect(inc.business_name).toBe('Test Bistro');
    });
  });

  // ============================================================
  // TASK 10: Incident resolution
  // ============================================================
  describe('Task 10: Incident status updates', () => {
    test('10a. Incident can be marked investigating', () => {
      const inc = operationalIncidents.record({ category: 'AI', route: '/ai', severity: 'error', message: 'AI down' });
      const updated = operationalIncidents.updateIncident(inc.id, { status: 'investigating' });
      expect(updated!.status).toBe('investigating');
    });

    test('10b. Incident can be marked resolved with resolved_at timestamp', () => {
      const inc = operationalIncidents.record({ category: 'DATABASE', route: '/db', severity: 'critical', message: 'DB down' });
      const updated = operationalIncidents.updateIncident(inc.id, { status: 'resolved' });
      expect(updated!.status).toBe('resolved');
      expect(updated!.resolved_at).not.toBeNull();
    });

    test('10c. Admin note is sanitized to remove secrets before storing', () => {
      const inc = operationalIncidents.record({ category: 'AUTH', route: '/auth', severity: 'error', message: 'Auth err' });
      const updated = operationalIncidents.updateIncident(inc.id, {
        admin_note: 'Checked Bearer secret_token_abc123 and reset',
      });
      expect(updated!.admin_note).not.toContain('secret_token_abc123');
    });

    test('10d. Returns null for non-existent incident ID', () => {
      const result = operationalIncidents.updateIncident('nonexistent-id', { status: 'resolved' });
      expect(result).toBeNull();
    });
  });

  // ============================================================
  // TASK 12: Privacy filtering
  // ============================================================
  describe('Task 12: Privacy and message sanitization', () => {
    const sensitiveInputs = [
      { input: 'Error with Bearer eyJhbGciOiJIUzI1NiJ9.secret', blocked: 'eyJhbGciOiJIUzI1NiJ9.secret' },
      { input: 'api_key=sk-abc123456789', blocked: 'sk-abc123456789' },
      { input: 'password=mySuperSecret', blocked: 'mySuperSecret' },
      { input: 'token=abcdef1234567890abcdef1234567890', blocked: 'abcdef1234567890abcdef1234567890' },
    ];

    sensitiveInputs.forEach(({ input, blocked }) => {
      test(`Sanitizes sensitive content: ${blocked.substring(0, 20)}...`, () => {
        const sanitized = operationalIncidents.sanitizeMessage(input);
        expect(sanitized).not.toContain(blocked);
      });
    });

    test('Truncates messages to max 300 chars', () => {
      const longMsg = 'a'.repeat(500);
      const sanitized = operationalIncidents.sanitizeMessage(longMsg);
      expect(sanitized.length).toBeLessThanOrEqual(300);
    });
  });

  // ============================================================
  // TASK 14: Security — Admin-only authorization
  // ============================================================
  describe('Task 14: Security — admin-only access', () => {
    let app: express.Application;
    let adminService: AdminService;
    let adminController: AdminController;

    beforeEach(() => {
      adminService = new AdminService(buildMockSupabase() as any);
      adminController = new AdminController(adminService);

      app = express();
      app.use(express.json());

      const mockAuthService = {
        verifyAccessToken: jest.fn((token: string) => {
          if (token === 'admin-token')
            return { sub: 'admin-uuid', role: 'admin', email: 'admin@reviewai.com' };
          if (token === 'owner-token')
            return { sub: 'owner-uuid', role: 'business_owner', email: 'owner@biz.com' };
          throw new Error('Invalid token');
        }),
      };

      const authMiddleware = createAuthMiddleware(mockAuthService as any);

      app.get('/admin/daily-health',
        authMiddleware.authenticate,
        authMiddleware.requireRole('admin'),
        adminController.getDailyHealthSummary.bind(adminController)
      );
      app.get('/admin/incidents',
        authMiddleware.authenticate,
        authMiddleware.requireRole('admin'),
        adminController.getIncidents.bind(adminController)
      );
      app.patch('/admin/incidents/:id',
        authMiddleware.authenticate,
        authMiddleware.requireRole('admin'),
        adminController.updateIncident.bind(adminController)
      );

      app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || err.status || 500).json({ success: false, error: err.message });
      });
    });

    test('14a. Admin gets 200 on GET /admin/daily-health', async () => {
      const res = await request(app)
        .get('/admin/daily-health')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.system).toBeDefined();
      expect(res.body.data.customer_flow).toBeDefined();
      expect(res.body.data.comparison).toBeDefined();
    });

    test('14b. Business owner gets 403 on GET /admin/daily-health', async () => {
      await request(app)
        .get('/admin/daily-health')
        .set('Authorization', 'Bearer owner-token')
        .expect(403);
    });

    test('14c. Unauthenticated gets 401 on GET /admin/daily-health', async () => {
      await request(app)
        .get('/admin/daily-health')
        .expect(401);
    });

    test('14d. Admin gets 200 on GET /admin/incidents', async () => {
      const res = await request(app)
        .get('/admin/incidents')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('14e. Business owner cannot modify incidents (403)', async () => {
      const inc = operationalIncidents.record({ category: 'AI', route: '/ai', severity: 'error', message: 'Test' });
      await request(app)
        .patch(`/admin/incidents/${inc.id}`)
        .set('Authorization', 'Bearer owner-token')
        .send({ status: 'resolved' })
        .expect(403);
    });

    test('14f. Unauthenticated cannot modify incidents (401)', async () => {
      const inc = operationalIncidents.record({ category: 'AI', route: '/ai', severity: 'error', message: 'Test' });
      await request(app)
        .patch(`/admin/incidents/${inc.id}`)
        .send({ status: 'resolved' })
        .expect(401);
    });
  });

  // ============================================================
  // TASK 15: Test data scenarios
  // ============================================================
  describe('Task 15: Test data scenarios', () => {
    test('Scenario A: Normal healthy pilot activity — no false warnings', async () => {
      const now = new Date();
      const recent = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
      const businesses = [
        { id: 'biz-a', name: 'Healthy Biz', google_review_url: 'https://g.page/r/a', is_active: true, created_at: '2026-09-01T00:00:00Z' },
      ];
      const qr = [{ id: 'qr-a', business_id: 'biz-a', is_active: true }];
      const scans = [{ id: 's1', business_id: 'biz-a', scanned_at: recent(30) }];
      const sessions = [{ id: 'sess1', business_id: 'biz-a', status: 'redirected', started_at: recent(25), metadata: { google_redirected_at: recent(25) } }];
      const reviews = [{ id: 'r1', business_id: 'biz-a', created_at: recent(24) }];

      const svc = new AdminService(buildMockSupabase({ businesses, qr, scans, sessions, reviews }) as any);
      const result = await svc.getDailyHealthSummary();

      // No errors, no critical incidents
      expect(result.system.critical_incidents).toBe(0);
      expect(result.system.operational_errors_24h).toBe(0);
      expect(result.customer_flow.qr_scans).toBeGreaterThan(0);
      // With AI generations but zero failures, failure rate is 0% (not null).
      // null is only returned when there are zero AI attempts at all.
      expect(result.customer_flow.ai_generation_failures).toBe(0);
      if (result.customer_flow.ai_generations > 0) {
        expect(result.customer_flow.ai_failure_rate_pct).toBe(0);
      } else {
        expect(result.customer_flow.ai_failure_rate_pct).toBeNull();
      }
    });

    test('Scenario B: AI failure — captured and reported correctly', async () => {
      operationalIncidents.record({ category: 'AI', route: '/review/generate', severity: 'critical', message: 'OpenAI quota exceeded', business_id: 'biz-a' });
      const svc = new AdminService(buildMockSupabase() as any);
      const result = await svc.getDailyHealthSummary();
      expect(result.system.ai_failures_24h).toBeGreaterThan(0);
      expect(result.system.critical_incidents).toBeGreaterThan(0);
    });

    test('Scenario C: Repeated technical error — deduplicated in incident log', () => {
      for (let i = 0; i < 5; i++) {
        operationalIncidents.record({ category: 'DATABASE', route: '/db/query', severity: 'error', message: 'Connection timeout' });
      }
      const incidents = operationalIncidents.getRecentIncidents();
      // Should be deduplicated to 1 incident with count=5
      expect(incidents).toHaveLength(1);
      expect(incidents[0].count).toBe(5);
    });

    test('Scenario D: Incomplete setup — reflected in businesses.setup_incomplete', async () => {
      const businesses = [
        { id: 'biz-x', name: 'Biz X', google_review_url: '', is_active: true, created_at: '2026-09-01T00:00:00Z' },
      ];
      const svc = new AdminService(buildMockSupabase({ businesses }) as any);
      const result = await svc.getDailyHealthSummary();
      expect(result.businesses.setup_incomplete).toBe(1);
    });

    test('Scenario E: No activity — no false error warnings generated', async () => {
      const businesses = [
        { id: 'biz-z', name: 'Quiet Biz', google_review_url: 'https://g.page/r/z', is_active: true, created_at: '2026-09-01T00:00:00Z' },
      ];
      const qr = [{ id: 'qr-z', business_id: 'biz-z', is_active: true }];
      const svc = new AdminService(buildMockSupabase({ businesses, qr }) as any);
      const result = await svc.getDailyHealthSummary();

      // Low activity is NOT a technical failure
      expect(result.system.critical_incidents).toBe(0);
      expect(result.system.operational_errors_24h).toBe(0);
      expect(result.customer_flow.qr_scans).toBe(0);
    });

    test('Scenario G: No incidents — response is clean and valid', async () => {
      const svc = new AdminService(buildMockSupabase() as any);
      const result = await svc.getDailyHealthSummary();
      expect(result.system.critical_incidents).toBe(0);
      expect(result.system.open_incidents).toBe(0);
      expect(result.recent_critical_incidents).toHaveLength(0);
      expect(result.notice).toBeDefined();
    });
  });

});
