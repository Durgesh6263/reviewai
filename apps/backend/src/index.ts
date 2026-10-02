/**
 * ReviewAI Backend Entry Point
 * Express.js application with all modules integrated
 */

import 'dotenv/config';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { AppError, errorHandler } from './shared/exceptions';
import { createAuthMiddleware, AuthMiddleware } from './modules/auth/middleware';
import { TokenPayload } from './modules/auth/types';
import { supabaseAdmin, checkSupabaseHealth } from './config/supabase';
import { logger, getRequestLogger } from './shared/logger';
import { requestIdMiddleware, requestLoggingMiddleware } from './shared/middleware/requestId';
import { initSentry, Sentry } from './config/sentry';

// Import module routes
import { createAuthRoutes } from './modules/auth/routes';
import { createBusinessRoutes } from './modules/business/routes';
import { createQRRoutes } from './modules/qr/routes';
import { createReviewRoutes } from './modules/review/routes';
import { createAnalyticsRoutes } from './modules/analytics/routes';
import { createSubscriptionRoutes } from './modules/subscription/routes';
import { createTeamRoutes } from './modules/team/routes';
import { createSettingsRoutes } from './modules/settings/routes';
import adminRoutes from './modules/admin/routes';
import { createPrivacyRoutes } from './modules/privacy/routes';
import { createOnboardingRoutes } from './modules/onboarding/routes';

// Import module controllers/services
import { AuthController } from './modules/auth/controller';
import { AuthService } from './modules/auth/service';
import { BusinessController } from './modules/business/controller';
import { BusinessService } from './modules/business/service';
import { QRController } from './modules/qr/controller';
import { QRService } from './modules/qr/service';
import { ReviewController } from './modules/review/controller';
import { ReviewService } from './modules/review/service';
import { AnalyticsController } from './modules/analytics/controller';
import { AnalyticsService } from './modules/analytics/service';
import { SubscriptionController } from './modules/subscription/controller';
import { SubscriptionService } from './modules/subscription/service';
import { AdminController } from './modules/admin/controller';
import { AdminService } from './modules/admin/service';
import { AIProviderFactory } from './modules/review/ai/factory';
import { PrivacyController } from './modules/privacy/controller';
import { PrivacyService } from './modules/privacy/service';
import { OnboardingController } from './modules/onboarding/controller';
import { OnboardingService } from './modules/onboarding/service';

import { env } from './config/env';

const app: Application = express();
const PORT = env.PORT;
const API_PREFIX = env.API_PREFIX;

// ============================================================================
// GLOBAL MIDDLEWARE
// ============================================================================

// Security headers with CSP for production
const isProduction = env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind needs unsafe-inline
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: isProduction ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}));

// Initialize Sentry (must be before other middleware for request tracing)
initSentry();

// CORS configuration (supports single URL or comma-separated ALLOWED_ORIGINS)
const corsOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [env.FRONTEND_URL];

app.use(cors({
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
}));

// Compression
app.use(compression());

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/plain', 'text/plain;charset=UTF-8'], limit: '1mb' }));

// Safely parse JSON strings received from navigator.sendBeacon
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      // Continue with string if parsing fails
    }
  }
  next();
});

// Request ID middleware (must be first for correlation)
app.use(requestIdMiddleware);

// Request logging middleware (with structured logging)
app.use(requestLoggingMiddleware);

// Attach logger to request for use in controllers
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.logger = getRequestLogger(req);
  next();
});

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// ============================================================================
// HEALTH CHECK ENDPOINTS
// ============================================================================

// Check external dependency health
async function checkExternalDependencies(): Promise<Record<string, { healthy: boolean; latency?: number; error?: string }>> {
  const results: Record<string, { healthy: boolean; latency?: number; error?: string }> = {};

  // Check Stripe
  if (process.env.STRIPE_SECRET_KEY) {
    const start = Date.now();
    try {
      const { Stripe } = await import('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
      await stripe.accounts.retrieve();
      results.stripe = { healthy: true, latency: Date.now() - start };
    } catch (error) {
      results.stripe = { healthy: false, latency: Date.now() - start, error: (error as Error).message };
    }
  } else {
    results.stripe = { healthy: true, error: 'not configured' };
  }

  // Check OpenAI
  if (process.env.OPENAI_API_KEY) {
    const start = Date.now();
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      results.openai = { healthy: response.ok, latency: Date.now() - start, error: response.ok ? undefined : `HTTP ${response.status}` };
    } catch (error) {
      results.openai = { healthy: false, latency: Date.now() - start, error: (error as Error).message };
    }
  } else {
    results.openai = { healthy: true, error: 'not configured' };
  }

  // Check Gemini
  if (process.env.GEMINI_API_KEY) {
    const start = Date.now();
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`, {
        signal: AbortSignal.timeout(5000),
      });
      results.gemini = { healthy: response.ok, latency: Date.now() - start, error: response.ok ? undefined : `HTTP ${response.status}` };
    } catch (error) {
      results.gemini = { healthy: false, latency: Date.now() - start, error: (error as Error).message };
    }
  } else {
    results.gemini = { healthy: true, error: 'not configured' };
  }

  // Check Resend (email)
  if (process.env.RESEND_API_KEY) {
    const start = Date.now();
    try {
      const response = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      results.resend = { healthy: response.ok, latency: Date.now() - start, error: response.ok ? undefined : `HTTP ${response.status}` };
    } catch (error) {
      results.resend = { healthy: false, latency: Date.now() - start, error: (error as Error).message };
    }
  } else {
    results.resend = { healthy: true, error: 'not configured' };
  }

  return results;
}

app.get('/health', async (_req: Request, res: Response) => {
  const [dbHealth, externalDeps] = await Promise.all([
    checkSupabaseHealth(),
    checkExternalDependencies(),
  ]);

  const allHealthy = dbHealth.healthy && Object.values(externalDeps).every(d => d.healthy);

  res.json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: dbHealth,
    dependencies: externalDeps,
  });
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  const [dbHealth, externalDeps] = await Promise.all([
    checkSupabaseHealth(),
    checkExternalDependencies(),
  ]);

  // Ready requires database + critical dependencies (Stripe for payments)
  const criticalDepsHealthy = dbHealth.healthy && externalDeps.stripe?.healthy;

  if (!criticalDepsHealthy) {
    return res.status(503).json({
      status: 'not ready',
      database: dbHealth,
      dependencies: externalDeps,
    });
  }
  res.json({ status: 'ready', dependencies: externalDeps });
});

app.get('/health/live', (_req: Request, res: Response) => {
  res.json({ status: 'alive' });
});

// Detailed health check for debugging
app.get('/health/details', async (_req: Request, res: Response) => {
  const [dbHealth, externalDeps] = await Promise.all([
    checkSupabaseHealth(),
    checkExternalDependencies(),
  ]);

  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  res.json({
    status: dbHealth.healthy && Object.values(externalDeps).every(d => d.healthy) ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || 'unknown',
    database: dbHealth,
    dependencies: externalDeps,
    system: {
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
    },
  });
});

// ============================================================================
// INITIALIZE SERVICES & CONTROLLERS
// ============================================================================

// Auth module
const authService = new AuthService(
  supabaseAdmin,
  env.JWT_SECRET,
  env.JWT_REFRESH_SECRET
);
const authMiddlewareInstance = createAuthMiddleware(authService);
const authController = new AuthController(authService);

// Business module
const businessService = new BusinessService(supabaseAdmin);
const businessController = new BusinessController(businessService);

// QR Code module
const qrService = new QRService(supabaseAdmin);
const qrController = new QRController(qrService);

// Review module
const aiFactory = new AIProviderFactory({
  openai: process.env.OPENAI_API_KEY ? {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    organizationId: process.env.OPENAI_ORG_ID,
  } : undefined,
  gemini: process.env.GEMINI_API_KEY ? {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    organizationId: process.env.GEMINI_BASE_URL,
  } : undefined,
});
const reviewService = new ReviewService(supabaseAdmin, aiFactory);
const reviewController = new ReviewController(reviewService);

// Analytics module
const analyticsService = new AnalyticsService(supabaseAdmin);
const analyticsController = new AnalyticsController(analyticsService);

// Subscription module
const subscriptionService = new SubscriptionService(supabaseAdmin, process.env.STRIPE_SECRET_KEY!);
const subscriptionController = new SubscriptionController(subscriptionService);

// Admin module
const adminService = new AdminService(supabaseAdmin);
const adminController = new AdminController(adminService);

// Privacy module (GDPR compliance)
const privacyService = new PrivacyService(supabaseAdmin);
const privacyController = new PrivacyController(privacyService);

// Onboarding module
const onboardingService = new OnboardingService(supabaseAdmin);
const onboardingController = new OnboardingController(onboardingService);

// ============================================================================
// MOUNT ROUTES
// ============================================================================

// Auth routes (public + protected)
app.use(`${API_PREFIX}/auth`, createAuthRoutes(authController, authMiddlewareInstance));

// Review routes (public customer flow + protected for business)
app.use(`${API_PREFIX}/review`, createReviewRoutes(reviewController, authMiddlewareInstance));
app.use(`${API_PREFIX}`, createReviewRoutes(reviewController, authMiddlewareInstance));

// Business routes (protected)
app.use(`${API_PREFIX}`, createBusinessRoutes(businessController, authMiddlewareInstance));

// QR Code routes (protected)
app.use(`${API_PREFIX}/qr-codes`, createQRRoutes(qrController, authMiddlewareInstance));
app.use(`${API_PREFIX}`, createQRRoutes(qrController, authMiddlewareInstance));

// Analytics routes (protected)
app.use(`${API_PREFIX}/analytics`, createAnalyticsRoutes(analyticsController, authMiddlewareInstance));
app.use(`${API_PREFIX}`, createAnalyticsRoutes(analyticsController, authMiddlewareInstance));

// Subscription routes (protected)
app.use(`${API_PREFIX}/subscription`, createSubscriptionRoutes(subscriptionController, authMiddlewareInstance));
app.use(`${API_PREFIX}/subscriptions`, createSubscriptionRoutes(subscriptionController, authMiddlewareInstance));
app.use(`${API_PREFIX}`, createSubscriptionRoutes(subscriptionController, authMiddlewareInstance));

// Team routes (protected)
app.use(`${API_PREFIX}/team`, createTeamRoutes(supabaseAdmin, authMiddlewareInstance));

// Settings routes (protected)
app.use(`${API_PREFIX}/settings`, createSettingsRoutes(supabaseAdmin, authMiddlewareInstance));

// Admin routes (admin only)
const adminAuthMiddleware = createAuthMiddleware(authService);
app.use(`${API_PREFIX}/admin`, adminAuthMiddleware.authenticate, adminAuthMiddleware.requireRole('admin'), adminRoutes);

// Privacy routes (GDPR compliance - all require authentication)
app.use(`${API_PREFIX}/privacy`, createPrivacyRoutes(privacyController, authMiddlewareInstance));

// Onboarding routes (protected)
app.use(`${API_PREFIX}/onboarding`, createOnboardingRoutes(supabaseAdmin, authService));
app.use(`${API_PREFIX}`, createOnboardingRoutes(supabaseAdmin, authService));

// ============================================================================
// 404 HANDLER
// ============================================================================

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Route not found', 404, 'NOT_FOUND'));
});

// ============================================================================
// SENTRY ERROR HANDLER (before global error handler)
// ============================================================================

Sentry.setupExpressErrorHandler(app);

// ============================================================================
// GLOBAL ERROR HANDLER
// ============================================================================

app.use(errorHandler);

// ============================================================================
// START SERVER
// ============================================================================

function startServer(): void {
  try {
    app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ReviewAI Backend Server                                    ║
║  Running on http://localhost:${PORT}                          ║
║  API Prefix: ${API_PREFIX}                                    ║
║  Environment: ${process.env.NODE_ENV || 'development'}              ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

export { app };