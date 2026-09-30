/**
 * Production Environment Configuration & Validation
 * ReviewAI SaaS Platform
 * 
 * Validates required environment variables on startup.
 * Prevents server from starting with missing secrets or invalid configurations.
 * NEVER prints secret values in error logs or exceptions.
 */

import { z } from 'zod';
import { logger } from '../shared/logger';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default('/api/v1'),
  
  // Supabase Configuration
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid HTTPS URL'),
  SUPABASE_ANON_KEY: z.string().min(10, 'SUPABASE_ANON_KEY must be provided'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, 'SUPABASE_SERVICE_ROLE_KEY must be provided'),

  // JWT Secrets (must be strong in production)
  JWT_SECRET: z.string().min(1, 'JWT_SECRET must be provided'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET must be provided'),

  // URLs & CORS
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().optional(),

  // AI Providers (at least one key recommended)
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  DEFAULT_AI_PROVIDER: z.enum(['openai', 'gemini']).default('openai'),

  // Billing (optional in MVP pilot)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Email (optional in dev)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@reviewai.com'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Observability
  LOG_LEVEL: z.string().default('info'),
  LOG_FORMAT: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnvironment(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.errors.map(err => {
      const field = err.path.join('.');
      return `  - ${field}: ${err.message}`;
    }).join('\n');

    console.error('\n======================================================');
    console.error('FATAL: Environment validation failed on startup:');
    console.error(errorDetails);
    console.error('======================================================\n');

    throw new Error('Environment validation failed. Check your environment variables.');
  }

  const env = result.data;

  // Additional strict checks for production
  if (env.NODE_ENV === 'production') {
    const productionErrors: string[] = [];

    if (env.JWT_SECRET.length < 32) {
      productionErrors.push('  - JWT_SECRET must be at least 32 characters long in production.');
    }
    if (env.JWT_REFRESH_SECRET.length < 32) {
      productionErrors.push('  - JWT_REFRESH_SECRET must be at least 32 characters long in production.');
    }
    if (!env.OPENAI_API_KEY && !env.GEMINI_API_KEY) {
      productionErrors.push('  - At least one AI provider key (OPENAI_API_KEY or GEMINI_API_KEY) must be set in production.');
    }
    if (env.FRONTEND_URL.includes('localhost')) {
      logger.warn('Warning: FRONTEND_URL is set to localhost in production mode.');
    }

    if (productionErrors.length > 0) {
      console.error('\n======================================================');
      console.error('FATAL: Production Security Checks Failed:');
      console.error(productionErrors.join('\n'));
      console.error('======================================================\n');
      throw new Error('Production environment validation failed. Refusing to start.');
    }
  }

  return env;
}

export const env = validateEnvironment();
