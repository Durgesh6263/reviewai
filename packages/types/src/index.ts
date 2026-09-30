/**
 * ReviewAI Types Package
 * Shared type definitions across the monorepo
 * Includes Zod schemas for validation and TypeScript types
 */

import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export const UserRoleSchema = z.enum(['admin', 'business_owner', 'staff']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const BusinessStatusSchema = z.enum(['active', 'suspended', 'pending_verification']);
export type BusinessStatus = z.infer<typeof BusinessStatusSchema>;

export const StaffRoleSchema = z.enum(['owner', 'admin', 'manager', 'member', 'viewer']);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

export const DeviceTypeSchema = z.enum(['mobile', 'tablet', 'desktop']);
export type DeviceType = z.infer<typeof DeviceTypeSchema>;

export const SessionStatusSchema = z.enum([
  'started',
  'language_selected',
  'rating_selected',
  'review_generated',
  'review_edited',
  'redirected',
  'abandoned'
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const AIProviderSchema = z.enum(['openai', 'gemini']);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export const SubscriptionStatusSchema = z.enum([
  'trialing', 'active', 'past_due', 'canceled', 'paused', 'expired'
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const BillingCycleSchema = z.enum(['monthly', 'annual']);
export type BillingCycle = z.infer<typeof BillingCycleSchema>;

export const InvoiceStatusSchema = z.enum(['draft', 'open', 'paid', 'void', 'uncollectible']);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const UsageMetricSchema = z.enum(['qr_scans', 'review_generations', 'google_redirects', 'api_calls']);
export type UsageMetric = z.infer<typeof UsageMetricSchema>;

export const WebhookStatusSchema = z.enum(['pending', 'delivered', 'failed', 'retrying']);
export type WebhookStatus = z.infer<typeof WebhookStatusSchema>;

export const PlanSchema = z.enum(['free', 'starter', 'professional', 'enterprise']);
export type Plan = z.infer<typeof PlanSchema>;

// ============================================================================
// CORE ENTITY SCHEMAS
// ============================================================================

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  password_hash: z.string(),
  full_name: z.string(),
  avatar_url: z.string().url().nullable(),
  role: UserRoleSchema,
  email_verified: z.boolean(),
  email_verification_token: z.string().nullable(),
  password_reset_token: z.string().nullable(),
  password_reset_expires: z.string().datetime().nullable(),
  last_login_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const BusinessSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  logo_url: z.string().url().nullable(),
  google_review_url: z.string().url(),
  website_url: z.string().url().nullable(),
  phone: z.string().nullable(),
  address: z.record(z.unknown()).nullable(),
  timezone: z.string(),
  status: BusinessStatusSchema,
  settings: z.record(z.unknown()),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
});
export type Business = z.infer<typeof BusinessSchema>;
export type BusinessInsert = Omit<Business, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> & { id?: string };
export type BusinessUpdate = Partial<Omit<Business, 'id' | 'created_at' | 'updated_at'>>;

export const BusinessStaffSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: StaffRoleSchema,
  permissions: z.array(z.string()),
  invited_by: z.string().uuid().nullable(),
  invited_at: z.string().datetime(),
  accepted_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type BusinessStaff = z.infer<typeof BusinessStaffSchema>;

export const QRCodeSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  slug: z.string(),
  label: z.string().nullable(),
  design: z.record(z.unknown()),
  download_count: z.number().int(),
  last_downloaded_at: z.string().datetime().nullable(),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type QRCode = z.infer<typeof QRCodeSchema>;
export type QRCodeInsert = Omit<QRCode, 'id' | 'created_at' | 'updated_at' | 'download_count' | 'last_downloaded_at'> & { id?: string };
export type QRCodeUpdate = Partial<Omit<QRCode, 'id' | 'created_at' | 'updated_at'>>;

export const ScanLogSchema = z.object({
  id: z.string().uuid(),
  qr_code_id: z.string().uuid(),
  business_id: z.string().uuid(),
  session_id: z.string().uuid().nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  referrer: z.string().nullable(),
  country: z.string().length(2).nullable(),
  city: z.string().nullable(),
  device_type: DeviceTypeSchema.nullable(),
  browser: z.string().nullable(),
  os: z.string().nullable(),
  scanned_at: z.string().datetime(),
});
export type ScanLog = z.infer<typeof ScanLogSchema>;

export const ReviewSessionSchema = z.object({
  id: z.string().uuid(),
  qr_code_id: z.string().uuid(),
  business_id: z.string().uuid(),
  scan_log_id: z.string().uuid(),
  language: z.string().length(2),
  rating: z.number().int().min(1).max(5).nullable(),
  status: SessionStatusSchema,
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
  abandoned_at: z.string().datetime().nullable(),
  metadata: z.record(z.unknown()),
});
export type ReviewSession = z.infer<typeof ReviewSessionSchema>;
export type ReviewSessionInsert = Omit<ReviewSession, 'id' | 'started_at' | 'completed_at' | 'abandoned_at'> & { id?: string };

export const GeneratedReviewSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  business_id: z.string().uuid(),
  language: z.string().length(2),
  rating: z.number().int().min(1).max(5),
  ai_provider: AIProviderSchema,
  model: z.string(),
  prompt_version: z.string(),
  generated_text: z.string(),
  edited_text: z.string().nullable(),
  final_text: z.string(),
  generation_time_ms: z.number().int(),
  token_usage: z.record(z.unknown()).nullable(),
  regeneration_count: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type GeneratedReview = z.infer<typeof GeneratedReviewSchema>;

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  plan_id: z.string(),
  status: SubscriptionStatusSchema,
  billing_cycle: BillingCycleSchema,
  price_cents: z.number().int(),
  currency: z.string().length(3),
  quantity: z.number().int(),
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  stripe_price_id: z.string().nullable(),
  current_period_start: z.string().datetime(),
  current_period_end: z.string().datetime(),
  trial_start: z.string().datetime().nullable(),
  trial_end: z.string().datetime().nullable(),
  canceled_at: z.string().datetime().nullable(),
  cancel_at_period_end: z.boolean(),
  metadata: z.record(z.unknown()),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

// Subscription plan enum (matches backend validators)
export type SubscriptionPlan = 'free' | 'starter' | 'professional' | 'enterprise';

export const InvoiceSchema = z.object({
  id: z.string().uuid(),
  subscription_id: z.string().uuid(),
  business_id: z.string().uuid(),
  stripe_invoice_id: z.string().nullable(),
  invoice_number: z.string(),
  status: InvoiceStatusSchema,
  amount_cents: z.number().int(),
  amount_paid_cents: z.number().int(),
  currency: z.string().length(3),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  due_date: z.string().datetime().nullable(),
  paid_at: z.string().datetime().nullable(),
  invoice_pdf_url: z.string().url().nullable(),
  hosted_invoice_url: z.string().url().nullable(),
  created_at: z.string().datetime(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const UsageLogSchema = z.object({
  id: z.string().uuid(),
  subscription_id: z.string().uuid(),
  business_id: z.string().uuid(),
  metric: UsageMetricSchema,
  count: z.number().int(),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  recorded_at: z.string().datetime(),
});
export type UsageLog = z.infer<typeof UsageLogSchema>;

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  business_id: z.string().uuid().nullable(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.string().uuid().nullable(),
  old_values: z.record(z.unknown()).nullable(),
  new_values: z.record(z.unknown()).nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  metadata: z.record(z.unknown()),
  created_at: z.string().datetime(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const APIKeySchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  name: z.string(),
  key_hash: z.string(),
  key_prefix: z.string(),
  scopes: z.array(z.string()),
  last_used_at: z.string().datetime().nullable(),
  expires_at: z.string().datetime().nullable(),
  is_active: z.boolean(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
});
export type APIKey = z.infer<typeof APIKeySchema>;

export const WebhookEventSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  event_type: z.string(),
  payload: z.record(z.unknown()),
  url: z.string().url(),
  status: WebhookStatusSchema,
  attempts: z.number().int(),
  last_attempt_at: z.string().datetime().nullable(),
  response_status: z.number().int().nullable(),
  response_body: z.string().nullable(),
  next_retry_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// ============================================================================
// DAILY ANALYTICS & ADMIN TABLES
// ============================================================================

export const DailyAnalyticsSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  date: z.string().date(),
  scans: z.number().int(),
  sessions_started: z.number().int(),
  reviews_generated: z.number().int(),
  reviews_edited: z.number().int(),
  google_redirects: z.number().int(),
  new_users: z.number().int(),
  new_businesses: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type DailyAnalytics = z.infer<typeof DailyAnalyticsSchema>;

export const BusinessAnalyticsSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  date: z.string().date(),
  scans: z.number().int(),
  reviews: z.number().int(),
  conversions: z.number().int(),
  conversion_rate: z.number(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type BusinessAnalytics = z.infer<typeof BusinessAnalyticsSchema>;

export const QRCodeAnalyticsSchema = z.object({
  id: z.string().uuid(),
  qr_code_id: z.string().uuid(),
  business_id: z.string().uuid(),
  date: z.string().date(),
  scans: z.number().int(),
  reviews: z.number().int(),
  conversions: z.number().int(),
  conversion_rate: z.number(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type QRCodeAnalytics = z.infer<typeof QRCodeAnalyticsSchema>;

export const AdminSettingsSchema = z.object({
  id: z.string().uuid(),
  general: z.record(z.unknown()),
  email: z.record(z.unknown()),
  security: z.record(z.unknown()),
  integrations: z.record(z.unknown()),
  features: z.record(z.unknown()),
  limits: z.record(z.unknown()),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type AdminSettings = z.infer<typeof AdminSettingsSchema>;

export const BackgroundJobSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  progress: z.number().int().min(0).max(100),
  payload: z.record(z.unknown()),
  result: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type BackgroundJob = z.infer<typeof BackgroundJobSchema>;

export const APILogSchema = z.object({
  id: z.string().uuid(),
  method: z.string(),
  path: z.string(),
  status_code: z.number().int(),
  response_time_ms: z.number().int(),
  user_id: z.string().uuid().nullable(),
  business_id: z.string().uuid().nullable(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  request_size: z.number().int().nullable(),
  response_size: z.number().int().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string().datetime(),
});
export type APILog = z.infer<typeof APILogSchema>;

export const EmailLogSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  to_email: z.string().email(),
  from_email: z.string().email(),
  subject: z.string().nullable(),
  status: z.enum(['pending', 'sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked']),
  provider: z.string().nullable(),
  provider_message_id: z.string().nullable(),
  error_message: z.string().nullable(),
  business_id: z.string().uuid().nullable(),
  user_id: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()),
  sent_at: z.string().datetime().nullable(),
  delivered_at: z.string().datetime().nullable(),
  opened_at: z.string().datetime().nullable(),
  clicked_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type EmailLog = z.infer<typeof EmailLogSchema>;

// ============================================================================
// API REQUEST/RESPONSE SCHEMAS
// ============================================================================

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginationMetaSchema = z.object({
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  total_pages: z.number().int(),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const APIResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    meta: PaginationMetaSchema.optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  });

export type APIResponse<T> = {
  success: boolean;
  data?: T;
  meta?: PaginationMeta;
  message?: string;
  error?: string;
};

// ============================================================================
// PUBLIC BUSINESS SCHEMA (for QR landing page)
// ============================================================================

export const PublicBusinessSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  logo_url: z.string().url().nullable(),
  description: z.string().nullable(),
  address: z.record(z.unknown()).nullable(),
  phone: z.string().nullable(),
  website_url: z.string().url().nullable(),
  google_review_url: z.string().url(),
});
export type PublicBusiness = z.infer<typeof PublicBusinessSchema>;

// ============================================================================
// QR DESIGN SCHEMA
// ============================================================================

export const QRDesignSchema = z.object({
  foreground_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#000000'),
  background_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#FFFFFF'),
  logo_type: z.enum(['business', 'google', 'custom', 'none']).default('google'),
  logo_url: z.string().url().nullable(),
  frame_text: z.string().max(50).nullable(),
  shape: z.enum(['square', 'rounded', 'circle']).default('rounded'),
  dot_style: z.enum(['square', 'rounded', 'dots', 'classy']).default('square'),
  corner_style: z.enum(['square', 'rounded', 'dot']).default('square'),
  size: z.number().int().min(128).max(2048).default(512),
  error_correction: z.enum(['L', 'M', 'Q', 'H']).default('M'),
  margin: z.number().int().min(0).max(20).default(4),
  logo_size: z.number().min(0.1).max(0.5).default(0.3),
});
export type QRDesign = z.infer<typeof QRDesignSchema>;

// ============================================================================
// BUSINESS ADDRESS SCHEMA
// ============================================================================

export const BusinessAddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().length(2).optional(),
  postal_code: z.string().optional(),
});
export type BusinessAddress = z.infer<typeof BusinessAddressSchema>;

// ============================================================================
// BUSINESS SETTINGS SCHEMA
// ============================================================================

export const BusinessSettingsSchema = z.object({
  language_default: z.string().length(2).default('en'),
  review_tone: z.enum(['professional', 'casual', 'enthusiastic', 'friendly']).default('friendly'),
  branding: z.object({
    primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    logo_url: z.string().url().optional(),
  }).optional(),
  qr_code_defaults: QRDesignSchema.partial().optional(),
  email_notifications: z.boolean().default(true),
  review_moderation: z.boolean().default(false),
});
export type BusinessSettings = z.infer<typeof BusinessSettingsSchema>;

// ============================================================================
// SUBSCRIPTION PLANS CONFIGURATION
// ============================================================================

export const PLAN_LIMITS = {
  free: {
    max_businesses: 1,
    max_qr_codes: 1,
    max_scans_per_month: 1000,
    max_ai_reviews_per_month: 10,
    max_team_members: 1,
    custom_domains: false,
    white_label: false,
    api_access: false,
    priority_support: false,
    advanced_analytics: false,
  },
  starter: {
    max_businesses: 3,
    max_qr_codes: 10,
    max_scans_per_month: 10000,
    max_ai_reviews_per_month: 100,
    max_team_members: 3,
    custom_domains: false,
    white_label: false,
    api_access: false,
    priority_support: false,
    advanced_analytics: true,
  },
  professional: {
    max_businesses: 10,
    max_qr_codes: 50,
    max_scans_per_month: 100000,
    max_ai_reviews_per_month: 1000,
    max_team_members: 10,
    custom_domains: true,
    white_label: false,
    api_access: true,
    priority_support: true,
    advanced_analytics: true,
  },
  enterprise: {
    max_businesses: 100,
    max_qr_codes: 500,
    max_scans_per_month: 1000000,
    max_ai_reviews_per_month: 10000,
    max_team_members: 50,
    custom_domains: true,
    white_label: true,
    api_access: true,
    priority_support: true,
    advanced_analytics: true,
  },
} as const;

export type PlanLimits = typeof PLAN_LIMITS[keyof typeof PLAN_LIMITS];

// ============================================================================
// PERMISSIONS
// ============================================================================

export const PERMISSIONS = {
  // Business permissions
  'business:create': ['business_owner', 'admin'],
  'business:read': ['owner', 'admin', 'manager', 'member', 'viewer'],
  'business:update': ['owner', 'admin', 'manager'],
  'business:delete': ['owner', 'admin'],
  'business:manage_settings': ['owner', 'admin'],

  // QR Code permissions
  'qr:create': ['owner', 'admin', 'manager'],
  'qr:read': ['owner', 'admin', 'manager', 'member', 'viewer'],
  'qr:update': ['owner', 'admin', 'manager'],
  'qr:delete': ['owner', 'admin'],
  'qr:download': ['owner', 'admin', 'manager', 'member'],

  // Analytics permissions
  'analytics:read': ['owner', 'admin', 'manager', 'member', 'viewer'],
  'analytics:export': ['owner', 'admin', 'manager'],

  // Review permissions
  'review:read': ['owner', 'admin', 'manager', 'member', 'viewer'],
  'review:export': ['owner', 'admin', 'manager'],

  // Team permissions
  'team:invite': ['owner', 'admin'],
  'team:update_role': ['owner', 'admin'],
  'team:remove': ['owner', 'admin'],

  // Subscription permissions
  'subscription:read': ['owner', 'admin'],
  'subscription:manage': ['owner', 'admin'],

  // API Key permissions
  'api_key:create': ['owner', 'admin'],
  'api_key:read': ['owner', 'admin'],
  'api_key:delete': ['owner', 'admin'],

  // Webhook permissions
  'webhook:create': ['owner', 'admin'],
  'webhook:read': ['owner', 'admin'],
  'webhook:delete': ['owner', 'admin'],

  // Admin permissions
  'admin:users': ['admin'],
  'admin:businesses': ['admin'],
  'admin:analytics': ['admin'],
  'admin:subscriptions': ['admin'],
  'admin:system': ['admin'],
  'admin:settings': ['admin'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: string | string[], permission: Permission): boolean {
  const roles = Array.isArray(role) ? role : [role];
  const allowedRoles = PERMISSIONS[permission] as readonly string[];
  return roles.some(r => allowedRoles.includes(r));
}

// ============================================================================
// AUTH CONSTANTS
// ============================================================================

export const AUTH_CONSTANTS = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  PASSWORD_RESET_EXPIRY: '1h',
  EMAIL_VERIFICATION_EXPIRY: '24h',
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MINUTES: 15,
  BCRYPT_ROUNDS: 12,
  JWT_ISSUER: 'reviewai',
  JWT_AUDIENCE: 'reviewai-api',
} as const;

// ============================================================================
// DATABASE TYPE (for Supabase client)
// ============================================================================

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> & { id?: string };
        Update: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>;
      };
      businesses: {
        Row: Business;
        Insert: Omit<Business, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> & { id?: string };
        Update: Partial<Omit<Business, 'id' | 'created_at' | 'updated_at'>>;
      };
      business_staff: {
        Row: BusinessStaff;
        Insert: Omit<BusinessStaff, 'id' | 'created_at' | 'invited_at'> & { id?: string };
        Update: Partial<Omit<BusinessStaff, 'id' | 'created_at' | 'invited_at'>>;
      };
      qr_codes: {
        Row: QRCode;
        Insert: Omit<QRCode, 'id' | 'created_at' | 'updated_at' | 'download_count' | 'last_downloaded_at'> & { id?: string };
        Update: Partial<Omit<QRCode, 'id' | 'created_at' | 'updated_at'>>;
      };
      scan_logs: {
        Row: ScanLog;
        Insert: Omit<ScanLog, 'id' | 'scanned_at'> & { id?: string };
        Update: Partial<Omit<ScanLog, 'id' | 'scanned_at'>>;
      };
      review_sessions: {
        Row: ReviewSession;
        Insert: Omit<ReviewSession, 'id' | 'started_at' | 'completed_at' | 'abandoned_at'> & { id?: string };
        Update: Partial<Omit<ReviewSession, 'id' | 'started_at'>>;
      };
      generated_reviews: {
        Row: GeneratedReview;
        Insert: Omit<GeneratedReview, 'id' | 'created_at' | 'updated_at' | 'final_text'> & { id?: string };
        Update: Partial<Omit<GeneratedReview, 'id' | 'created_at' | 'updated_at' | 'final_text'>>;
      };
      subscriptions: {
        Row: Subscription;
        Insert: Omit<Subscription, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Subscription, 'id' | 'created_at' | 'updated_at'>>;
      };
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<Invoice, 'id' | 'created_at'>>;
      };
      usage_logs: {
        Row: UsageLog;
        Insert: Omit<UsageLog, 'id' | 'recorded_at'> & { id?: string };
        Update: Partial<Omit<UsageLog, 'id' | 'recorded_at'>>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Omit<AuditLog, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<AuditLog, 'id' | 'created_at'>>;
      };
      api_keys: {
        Row: APIKey;
        Insert: Omit<APIKey, 'id' | 'created_at' | 'key_hash' | 'key_prefix'> & { id?: string };
        Update: Partial<Omit<APIKey, 'id' | 'created_at'>>;
      };
      webhook_events: {
        Row: WebhookEvent;
        Insert: Omit<WebhookEvent, 'id' | 'created_at' | 'attempts'> & { id?: string };
        Update: Partial<Omit<WebhookEvent, 'id' | 'created_at'>>;
      };
      daily_analytics: {
        Row: DailyAnalytics;
        Insert: Omit<DailyAnalytics, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DailyAnalytics, 'id' | 'created_at' | 'updated_at'>>;
      };
      business_analytics: {
        Row: BusinessAnalytics;
        Insert: Omit<BusinessAnalytics, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<BusinessAnalytics, 'id' | 'created_at' | 'updated_at'>>;
      };
      qr_code_analytics: {
        Row: QRCodeAnalytics;
        Insert: Omit<QRCodeAnalytics, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<QRCodeAnalytics, 'id' | 'created_at' | 'updated_at'>>;
      };
      admin_settings: {
        Row: AdminSettings;
        Insert: Omit<AdminSettings, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<AdminSettings, 'id' | 'created_at' | 'updated_at'>>;
      };
      background_jobs: {
        Row: BackgroundJob;
        Insert: Omit<BackgroundJob, 'id' | 'created_at' | 'updated_at' | 'progress' | 'status'> & { id?: string };
        Update: Partial<Omit<BackgroundJob, 'id' | 'created_at' | 'updated_at'>>;
      };
      api_logs: {
        Row: APILog;
        Insert: Omit<APILog, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<APILog, 'id' | 'created_at'>>;
      };
      email_logs: {
        Row: EmailLog;
        Insert: Omit<EmailLog, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<EmailLog, 'id' | 'created_at'>>;
      };
    };
    Views: {
      business_analytics_summary: {
        Row: {
          business_id: string;
          business_name: string;
          slug: string;
          total_scans: number;
          total_sessions: number;
          total_generated: number;
          total_redirects: number;
          conversion_rate: number;
        };
      };
      subscription_usage_current: {
        Row: {
          subscription_id: string;
          business_id: string;
          plan_id: string;
          status: string;
          metric: string;
          total_usage: number;
          current_period_start: string;
          current_period_end: string;
        };
      };
      business_stats: {
        Row: {
          business_id: string;
          total_scans: number;
          total_reviews: number;
          conversion_rate: number;
        };
      };
      qr_code_stats: {
        Row: {
          qr_code_id: string;
          total_scans: number;
          total_reviews: number;
          conversion_rate: number;
        };
      };
    };
    Functions: {
      generate_business_slug: {
        Args: { base_name: string };
        Returns: string;
      };
      log_audit_action: {
        Args: {
          p_action: string;
          p_resource_type: string;
          p_resource_id?: string;
          p_old_values?: Record<string, unknown>;
          p_new_values?: Record<string, unknown>;
          p_business_id?: string;
          p_metadata?: Record<string, unknown>;
        };
        Returns: void;
      };
      ingest_scan_log: {
        Args: {
          p_qr_code_id: string;
          p_ip_address?: string;
          p_user_agent?: string;
          p_referrer?: string;
          p_country?: string;
          p_city?: string;
          p_device_type?: DeviceType;
          p_browser?: string;
          p_os?: string;
        };
        Returns: string;
      };
      start_review_session: {
        Args: { p_scan_log_id: string; p_language: string };
        Returns: string;
      };
      update_review_session_rating: {
        Args: { p_session_id: string; p_rating: number };
        Returns: void;
      };
      create_generated_review: {
        Args: {
          p_session_id: string;
          p_ai_provider: AIProvider;
          p_model: string;
          p_prompt_version: string;
          p_generated_text: string;
          p_generation_time_ms: number;
          p_token_usage?: Record<string, unknown>;
        };
        Returns: string;
      };
      complete_review_session: {
        Args: { p_session_id: string };
        Returns: void;
      };
      create_future_partitions: {
        Args: Record<string, never>;
        Returns: void;
      };
      drop_old_partitions: {
        Args: { retention_months?: number };
        Returns: void;
      };
      track_usage: {
        Args: { p_subscription_id: string; p_metric: UsageMetric; p_count?: number };
        Returns: void;
      };
      get_database_size: {
        Args: Record<string, never>;
        Returns: { size: number }[];
      };
      get_storage_used: {
        Args: Record<string, never>;
        Returns: { size: number }[];
      };
      refresh_analytics_partitions: {
        Args: Record<string, never>;
        Returns: void;
      };
      update_daily_analytics_on_scan: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      update_daily_analytics_on_session: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      update_business_qr_analytics: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
    Enums: {
      user_role: UserRole;
      business_status: BusinessStatus;
      staff_role: StaffRole;
      device_type: DeviceType;
      session_status: SessionStatus;
      ai_provider: AIProvider;
      subscription_status: SubscriptionStatus;
      billing_cycle: BillingCycle;
      invoice_status: InvoiceStatus;
      usage_metric: UsageMetric;
      webhook_status: WebhookStatus;
    };
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Types are already exported via `export type` or `export const` at declaration
// No need for duplicate exports