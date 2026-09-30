import { z } from 'zod';

export const AdminBusinessSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  email: z.string().email(),
  owner_id: z.string().uuid(),
  owner_name: z.string(),
  owner_email: z.string().email(),
  is_active: z.boolean(),
  google_place_id: z.string().nullable(),
  is_pilot_business: z.boolean(),
  pilot_readiness_score: z.number(),
  pilot_readiness_status: z.enum(['not_started', 'in_progress', 'ready', 'launched']),
  health_score: z.number(),
  health_status: z.enum(['healthy', 'at_risk', 'critical']),
  open_feedback_count: z.number(),
  stats: z.object({
    total_scans: z.number(),
    total_reviews: z.number(),
    conversion_rate: z.number(),
    qr_codes_count: z.number(),
  }),
  subscription: z.object({
    plan: z.string(),
    status: z.string(),
  }).nullable(),
  created_at: z.string().datetime(),
});

export const AdminBusinessListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['all', 'active', 'inactive']).optional(),
  plan: z.string().optional(),
  readiness: z.enum(['all', 'not_started', 'in_progress', 'ready', 'launched']).optional(),
  health: z.enum(['all', 'healthy', 'at_risk', 'critical']).optional(),
});

export const AdminBusinessUpdateSchema = z.object({
  is_active: z.boolean().optional(),
  name: z.string().min(1).max(255).optional(),
});

export type AdminBusiness = z.infer<typeof AdminBusinessSchema>;
export type AdminBusinessListQuery = z.infer<typeof AdminBusinessListQuerySchema>;
export type AdminBusinessUpdate = z.infer<typeof AdminBusinessUpdateSchema>;

export const AdminBusinessDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  email: z.string().email(),
  owner_id: z.string().uuid(),
  owner_name: z.string(),
  owner_email: z.string().email(),
  owner_role: z.string(),
  owner_is_pilot: z.boolean(),
  owner_pilot_cohort: z.string().nullable(),
  owner_created_at: z.string().nullable(),
  description: z.string().nullable(),
  logo_url: z.string().nullable(),
  google_review_url: z.string().nullable(),
  website_url: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.record(z.unknown()).nullable(),
  timezone: z.string(),
  status: z.string(),
  settings: z.record(z.unknown()),
  is_pilot_business: z.boolean(),
  pilot_limits: z.object({
    max_qr_codes: z.number(),
    max_scans_per_month: z.number(),
    max_staff: z.number(),
  }),
  pilot_readiness: z.object({
    score: z.number(),
    status: z.enum(['not_started', 'in_progress', 'ready', 'launched']),
    missing: z.array(z.string()),
  }),
  health: z.object({
    score: z.number(),
    status: z.enum(['healthy', 'at_risk', 'critical']),
    factors: z.array(z.string()),
  }),
  activity_summary: z.object({
    scans_30d: z.number(),
    sessions_30d: z.number(),
    reviews_30d: z.number(),
    conversion_rate: z.number(),
    avg_rating: z.number(),
    top_languages: z.array(z.object({
      language: z.string(),
      count: z.number(),
    })),
  }),
  qr_codes: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    design: z.record(z.unknown()),
    is_active: z.boolean(),
    download_count: z.number(),
    last_downloaded_at: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })),
  tags: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    emoji: z.string(),
    order: z.number(),
    created_at: z.string().datetime(),
  })),
  subscription: z.object({
    id: z.string().uuid(),
    plan: z.string(),
    status: z.string(),
    stripe_subscription_id: z.string().nullable(),
    stripe_customer_id: z.string().nullable(),
    current_period_start: z.string().datetime(),
    current_period_end: z.string().datetime(),
    trial_start: z.string().datetime().nullable(),
    trial_end: z.string().datetime().nullable(),
    canceled_at: z.string().datetime().nullable(),
    cancel_at_period_end: z.boolean(),
    quantity: z.number(),
    monthly_price: z.number(),
    features: z.record(z.unknown()),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }).nullable(),
  usage_logs: z.array(z.object({
    metric: z.string(),
    count: z.number(),
    period_start: z.string().datetime(),
    period_end: z.string().datetime(),
  })),
  onboarding_progress: z.object({
    current_step: z.string(),
    completed_steps: z.array(z.string()),
    step_data: z.record(z.unknown()),
    started_at: z.string().datetime(),
    completed_at: z.string().datetime().nullable(),
    is_pilot_user: z.boolean(),
    pilot_cohort: z.string().nullable(),
  }).nullable(),
  feedback: z.array(z.object({
    id: z.string().uuid(),
    category: z.string(),
    rating: z.number(),
    feedback_text: z.string().nullable(),
    step_context: z.string().nullable(),
    created_at: z.string().datetime(),
  })),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type AdminBusinessDetail = z.infer<typeof AdminBusinessDetailSchema>;

export const AdminQRCodeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  business_id: z.string().uuid(),
  business_name: z.string(),
  business_slug: z.string(),
  design: z.object({
    foreground_color: z.string(),
    background_color: z.string(),
    logo_type: z.string(),
    logo_url: z.string().nullable(),
    frame_text: z.string().nullable(),
    shape: z.string(),
    dot_style: z.string(),
    corner_style: z.string(),
  }),
  stats: z.object({
    total_scans: z.number(),
    total_reviews: z.number(),
    conversion_rate: z.number(),
  }),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const AdminQRCodeListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['all', 'active', 'inactive']).optional(),
  business_id: z.string().uuid().optional(),
});

export const AdminQRCodeUpdateSchema = z.object({
  is_active: z.boolean().optional(),
  name: z.string().min(1).max(255).optional(),
});

export type AdminQRCode = z.infer<typeof AdminQRCodeSchema>;
export type AdminQRCodeListQuery = z.infer<typeof AdminQRCodeListQuerySchema>;
export type AdminQRCodeUpdate = z.infer<typeof AdminQRCodeUpdateSchema>;

export const AdminAnalyticsSchema = z.object({
  overview: z.object({
    total_scans: z.number(),
    total_reviews: z.number(),
    conversion_rate: z.number(),
    total_users: z.number(),
    total_businesses: z.number(),
    total_qr_codes: z.number(),
    active_subscriptions: z.number(),
    mrr: z.number(),
  }),
  trends: z.array(z.object({
    date: z.string(),
    scans: z.number(),
    reviews: z.number(),
    conversions: z.number(),
    new_users: z.number(),
    new_businesses: z.number(),
  })),
  rating_distribution: z.array(z.object({
    rating: z.number(),
    count: z.number(),
  })),
  language_distribution: z.array(z.object({
    language: z.string(),
    count: z.number(),
  })),
  device_distribution: z.array(z.object({
    device: z.string(),
    count: z.number(),
  })),
  top_businesses: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    scans: z.number(),
    reviews: z.number(),
    conversion_rate: z.number(),
  })),
  top_qr_codes: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    business_name: z.string(),
    scans: z.number(),
    reviews: z.number(),
    conversion_rate: z.number(),
  })),
});

export const AdminAnalyticsQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
});

export type AdminAnalytics = z.infer<typeof AdminAnalyticsSchema>;
export type AdminAnalyticsQuery = z.infer<typeof AdminAnalyticsQuerySchema>;

export const AdminSubscriptionSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  business_name: z.string(),
  business_slug: z.string(),
  owner_id: z.string().uuid(),
  owner_name: z.string(),
  owner_email: z.string().email(),
  plan: z.enum(['free', 'starter', 'professional', 'enterprise']),
  status: z.enum(['active', 'past_due', 'canceled', 'incomplete', 'trialing']),
  stripe_subscription_id: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  current_period_start: z.string().datetime(),
  current_period_end: z.string().datetime(),
  cancel_at_period_end: z.boolean(),
  trial_end: z.string().datetime().nullable(),
  quantity: z.number(),
  monthly_price: z.number(),
  features: z.object({
    max_businesses: z.number(),
    max_qr_codes: z.number(),
    max_scans_per_month: z.number(),
    ai_reviews_per_month: z.number(),
    custom_domains: z.boolean(),
    white_label: z.boolean(),
    api_access: z.boolean(),
    priority_support: z.boolean(),
  }),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const AdminSubscriptionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['all', 'active', 'past_due', 'canceled', 'trialing', 'incomplete']).optional(),
  plan: z.string().optional(),
});

export const AdminSubscriptionUpdateSchema = z.object({
  plan: z.enum(['free', 'starter', 'professional', 'enterprise']).optional(),
});

export const AdminSubscriptionStatsSchema = z.object({
  total_subscriptions: z.number(),
  active_subscriptions: z.number(),
  past_due_subscriptions: z.number(),
  canceled_subscriptions: z.number(),
  trialing_subscriptions: z.number(),
  mrr: z.number(),
  arr: z.number(),
  plan_distribution: z.array(z.object({
    plan: z.string(),
    count: z.number(),
  })),
  status_distribution: z.array(z.object({
    status: z.string(),
    count: z.number(),
  })),
});

export type AdminSubscription = z.infer<typeof AdminSubscriptionSchema>;
export type AdminSubscriptionListQuery = z.infer<typeof AdminSubscriptionListQuerySchema>;
export type AdminSubscriptionUpdate = z.infer<typeof AdminSubscriptionUpdateSchema>;
export type AdminSubscriptionStats = z.infer<typeof AdminSubscriptionStatsSchema>;

export const AdminSystemHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'critical']),
  checks: z.object({
    database: z.object({
      status: z.enum(['healthy', 'degraded', 'critical']),
      latency_ms: z.number(),
      message: z.string(),
      last_checked: z.string().datetime(),
    }),
    redis: z.object({
      status: z.enum(['healthy', 'degraded', 'critical']),
      latency_ms: z.number(),
      message: z.string(),
      last_checked: z.string().datetime(),
    }),
    storage: z.object({
      status: z.enum(['healthy', 'degraded', 'critical']),
      latency_ms: z.number(),
      message: z.string(),
      last_checked: z.string().datetime(),
    }),
    api: z.object({
      status: z.enum(['healthy', 'degraded', 'critical']),
      latency_ms: z.number(),
      message: z.string(),
      last_checked: z.string().datetime(),
    }),
    queue: z.object({
      status: z.enum(['healthy', 'degraded', 'critical']),
      latency_ms: z.number(),
      message: z.string(),
      last_checked: z.string().datetime(),
    }),
  }),
  metrics: z.object({
    cpu_usage: z.number(),
    memory_usage: z.number(),
    disk_usage: z.number(),
    network_in: z.number(),
    network_out: z.number(),
    active_connections: z.number(),
    requests_per_minute: z.number(),
    avg_response_time: z.number(),
    error_rate: z.number(),
  }),
  uptime: z.number(),
  version: z.string(),
  environment: z.string(),
});

export const AdminSystemStatsSchema = z.object({
  total_users: z.number(),
  total_businesses: z.number(),
  total_qr_codes: z.number(),
  total_scans: z.number(),
  total_reviews: z.number(),
  total_revenue: z.number(),
  database_size: z.number(),
  storage_used: z.number(),
  api_calls_24h: z.number(),
  emails_sent_24h: z.number(),
  qr_generated_24h: z.number(),
});

export const AdminBackgroundJobSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  progress: z.number(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  error: z.string().nullable(),
});

export type AdminSystemHealth = z.infer<typeof AdminSystemHealthSchema>;
export type AdminSystemStats = z.infer<typeof AdminSystemStatsSchema>;
export type AdminBackgroundJob = z.infer<typeof AdminBackgroundJobSchema>;

export const AdminSettingsSchema = z.object({
  general: z.object({
    site_name: z.string(),
    site_url: z.string().url(),
    support_email: z.string().email(),
    default_language: z.string(),
    maintenance_mode: z.boolean(),
    registration_enabled: z.boolean(),
    email_verification_required: z.boolean(),
  }),
  email: z.object({
    provider: z.string(),
    from_name: z.string(),
    from_email: z.string().email(),
    smtp_host: z.string(),
    smtp_port: z.number(),
    smtp_user: z.string(),
    smtp_password: z.string(),
    templates: z.record(z.string()),
  }),
  security: z.object({
    jwt_secret: z.string(),
    jwt_expiry: z.string(),
    refresh_token_expiry: z.string(),
    password_min_length: z.number(),
    require_2fa_for_admins: z.boolean(),
    session_timeout: z.number(),
    max_login_attempts: z.number(),
    lockout_duration: z.number(),
    cors_origins: z.array(z.string().url()),
  }),
  integrations: z.object({
    openai_api_key: z.string(),
    gemini_api_key: z.string(),
    google_places_api_key: z.string(),
    stripe_secret_key: z.string(),
    stripe_publishable_key: z.string(),
    stripe_webhook_secret: z.string(),
    sentry_dsn: z.string(),
    slack_webhook_url: z.string(),
  }),
  features: z.object({
    ai_reviews_enabled: z.boolean(),
    qr_customization_enabled: z.boolean(),
    multi_language_enabled: z.boolean(),
    webhooks_enabled: z.boolean(),
    white_label_domains_enabled: z.boolean(),
    api_access_enabled: z.boolean(),
    advanced_analytics_enabled: z.boolean(),
    team_collaboration_enabled: z.boolean(),
  }),
  limits: z.object({
    max_businesses_per_user: z.number(),
    max_qr_codes_per_business: z.number(),
    max_scans_per_month_free: z.number(),
    max_scans_per_month_starter: z.number(),
    max_scans_per_month_professional: z.number(),
    max_scans_per_month_enterprise: z.number(),
    ai_reviews_per_month_free: z.number(),
    ai_reviews_per_month_starter: z.number(),
    ai_reviews_per_month_professional: z.number(),
    ai_reviews_per_month_enterprise: z.number(),
    file_upload_max_size: z.number(),
  }),
});

export const AdminSettingsUpdateSchema = z.object({
  general: AdminSettingsSchema.shape.general.partial().optional(),
  email: AdminSettingsSchema.shape.email.partial().optional(),
  security: AdminSettingsSchema.shape.security.partial().optional(),
  integrations: AdminSettingsSchema.shape.integrations.partial().optional(),
  features: AdminSettingsSchema.shape.features.partial().optional(),
  limits: AdminSettingsSchema.shape.limits.partial().optional(),
});

export type AdminSettings = z.infer<typeof AdminSettingsSchema>;
export type AdminSettingsUpdate = z.infer<typeof AdminSettingsUpdateSchema>;

export const AdminStatsSchema = z.object({
  total_users: z.number(),
  active_users: z.number().optional(),
  inactive_users: z.number().optional(),
  deactivated_users: z.number().optional(),
  new_users: z.number().optional(),
  total_businesses: z.number(),
  active_businesses: z.number().optional(),
  new_businesses: z.number().optional(),
  total_qr_codes: z.number(),
  total_scans: z.number(),
  total_reviews: z.number(),
  total_review_sessions: z.number().optional(),
  total_ai_drafts: z.number().optional(),
  google_continue_events: z.number().optional(),
  total_revenue: z.number(),
  active_subscriptions: z.number(),
  conversion_rate: z.number(),
  users_change: z.number(),
  businesses_change: z.number(),
  scans_change: z.number(),
  revenue_change: z.number(),
  sessions_change: z.number().optional(),
  ai_drafts_change: z.number().optional(),
  google_continues_change: z.number().optional(),
  subscriptions_change: z.number().optional(),
});

export type AdminStats = z.infer<typeof AdminStatsSchema>;

export const AdminRecentActivitySchema = z.object({
  id: z.string(),
  type: z.string(),
  user_name: z.string().optional().nullable(),
  user_email: z.string().optional().nullable(),
  business_name: z.string().optional().nullable(),
  details: z.string(),
  status: z.string().optional().nullable(),
  created_at: z.string(),
});

export type AdminRecentActivity = z.infer<typeof AdminRecentActivitySchema>;

// Upgrade Request schemas
export const AdminUpgradeRequestSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  business_name: z.string(),
  business_slug: z.string(),
  owner_id: z.string().uuid(),
  owner_name: z.string(),
  owner_email: z.string().email(),
  requested_plan: z.enum(['starter', 'professional', 'enterprise']),
  current_plan: z.enum(['free', 'starter', 'professional', 'enterprise']),
  status: z.enum(['pending', 'approved', 'rejected', 'contacted', 'cancelled']),
  reason: z.string().nullable(),
  admin_notes: z.string().nullable(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const AdminUpgradeRequestListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['all', 'pending', 'approved', 'rejected', 'contacted', 'cancelled']).optional(),
  plan: z.string().optional(),
});

export const AdminUpgradeRequestStatusUpdateSchema = z.object({
  status: z.enum(['approved', 'rejected', 'contacted', 'cancelled']),
  admin_notes: z.string().optional(),
});

export type AdminUpgradeRequest = z.infer<typeof AdminUpgradeRequestSchema>;
export type AdminUpgradeRequestListQuery = z.infer<typeof AdminUpgradeRequestListQuerySchema>;
export type AdminUpgradeRequestStatusUpdate = z.infer<typeof AdminUpgradeRequestStatusUpdateSchema>;

// Feedback schemas
export const AdminFeedbackItemSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  business_id: z.string().uuid().nullable(),
  category: z.enum(['bug', 'feature', 'feedback']),
  rating: z.number().int().min(1).max(5),
  feedback_text: z.string().nullable(),
  step_context: z.string().nullable(),
  metadata: z.record(z.unknown()),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  status: z.enum(['open', 'reviewing', 'resolved', 'closed']),
  admin_note: z.string().nullable(),
  business_name: z.string().optional(),
  user_email: z.string().email().optional(),
});

export const AdminFeedbackListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['all', 'open', 'reviewing', 'resolved', 'closed']).optional(),
  category: z.enum(['all', 'bug', 'feature', 'feedback']).optional(),
});

export const AdminFeedbackUpdateSchema = z.object({
  status: z.enum(['open', 'reviewing', 'resolved', 'closed']).optional(),
  admin_note: z.string().nullable().optional(),
});

export type AdminFeedbackItem = z.infer<typeof AdminFeedbackItemSchema>;
export type AdminFeedbackListQuery = z.infer<typeof AdminFeedbackListQuerySchema>;
export type AdminFeedbackUpdate = z.infer<typeof AdminFeedbackUpdateSchema>;

// ============================================================================
// PILOT INSIGHTS SCHEMAS (Step 28)
// ============================================================================

export const PilotActivationStatusSchema = z.enum([
  'not_set_up',
  'ready',
  'active',
  'needs_attention'
]);
export type PilotActivationStatus = z.infer<typeof PilotActivationStatusSchema>;

export const PilotBusinessActivityItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  created_at: z.string(),
  setup_status: z.enum(['complete', 'incomplete']),
  activity_status: PilotActivationStatusSchema,
  activity_counts: z.object({
    scans: z.number(),
    sessions: z.number(),
    ai_generated: z.number(),
    copies: z.number(),
    google_opens: z.number(),
    feedback: z.number(),
  }),
  first_activity_timestamps: z.object({
    business_created: z.string().nullable(),
    setup_completed: z.string().nullable(),
    qr_created: z.string().nullable(),
    first_qr_scan: z.string().nullable(),
    first_review_session: z.string().nullable(),
    first_ai_generation: z.string().nullable(),
    first_review_copied: z.string().nullable(),
    first_google_page_open: z.string().nullable(),
    latest_activity: z.string().nullable(),
  }),
  milestones: z.object({
    setup_completed: z.boolean(),
    qr_generated: z.boolean(),
    first_scan: z.boolean(),
    first_session: z.boolean(),
    first_generation: z.boolean(),
    first_copied: z.boolean(),
    first_google_open: z.boolean(),
  }),
  open_feedback_count: z.number(),
  subscription: z.object({
    plan: z.string(),
    status: z.string(),
    ai_usage: z.number(),
    ai_limit: z.number(),
    qr_count: z.number(),
  }).nullable(),
});
export type PilotBusinessActivityItem = z.infer<typeof PilotBusinessActivityItemSchema>;

export const PilotUsageSummarySchema = z.object({
  total_pilot_businesses: z.number(),
  businesses_ready: z.number(),
  businesses_active: z.number(),
  businesses_no_activity: z.number(),
  businesses_not_setup: z.number(),
  businesses_needs_attention: z.number(),
  total_scans: z.number(),
  total_sessions: z.number(),
  total_ai_generated: z.number(),
  total_copies: z.number(),
  total_google_opens: z.number(),
  total_feedback: z.number(),
});
export type PilotUsageSummary = z.infer<typeof PilotUsageSummarySchema>;

export const PilotUsageTrendItemSchema = z.object({
  date: z.string(),
  scans: z.number(),
  sessions: z.number(),
  ai_generated: z.number(),
  google_opens: z.number(),
  feedback: z.number(),
});
export type PilotUsageTrendItem = z.infer<typeof PilotUsageTrendItemSchema>;

export const PilotInsightsResponseSchema = z.object({
  summary: PilotUsageSummarySchema,
  trends: z.array(PilotUsageTrendItemSchema),
  businesses: z.array(PilotBusinessActivityItemSchema),
  period: z.enum(['7d', '30d', 'all']),
  notice: z.string(),
});
export type PilotInsightsResponse = z.infer<typeof PilotInsightsResponseSchema>;

export const PilotInsightsQuerySchema = z.object({
  range: z.enum(['7d', '30d', 'all']).default('30d').optional(),
  search: z.string().optional(),
  status: z.enum(['all', 'not_set_up', 'ready', 'active', 'needs_attention']).default('all').optional(),
});
export type PilotInsightsQuery = z.infer<typeof PilotInsightsQuerySchema>;

// ============================================================================
// Step 29: Pilot Launch Control Center & Incident Monitoring Types
// ============================================================================

export const OperationalErrorCategorySchema = z.enum([
  'AUTH',
  'AUTHORIZATION',
  'DATABASE',
  'AI',
  'CUSTOMER_FLOW',
  'QR',
  'SUBSCRIPTION',
  'CONFIGURATION',
  'UNKNOWN',
]);
export type OperationalErrorCategory = z.infer<typeof OperationalErrorCategorySchema>;

export const OperationalIncidentSeveritySchema = z.enum(['info', 'warning', 'error', 'critical']);
export type OperationalIncidentSeverity = z.infer<typeof OperationalIncidentSeveritySchema>;

export const OperationalIncidentSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  first_seen: z.string(),
  category: OperationalErrorCategorySchema,
  route: z.string(),
  severity: OperationalIncidentSeveritySchema,
  business_id: z.string().nullable(),
  business_name: z.string().nullable().optional(),
  message: z.string(),
  count: z.number(),
  status: z.enum(['active', 'investigating', 'resolved']),
  admin_note: z.string().nullable().optional(),
  resolved_at: z.string().nullable().optional(),
});
export type OperationalIncident = z.infer<typeof OperationalIncidentSchema>;

export const PilotControlCenterBusinessSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  owner_email: z.string(),
  created_at: z.string(),
  setup_status: z.enum(['complete', 'incomplete']),
  activity_status: PilotActivationStatusSchema,
  needs_attention: z.boolean(),
  attention_reasons: z.array(z.string()),
  plan: z.string(),
  subscription_status: z.string(),
  scans_count: z.number(),
  sessions_count: z.number(),
  ai_generated_count: z.number(),
  google_opens_count: z.number(),
  open_feedback_count: z.number(),
  recent_errors_count: z.number(),
  latest_activity: z.string().nullable(),
});
export type PilotControlCenterBusiness = z.infer<typeof PilotControlCenterBusinessSchema>;

export const PilotControlCenterResponseSchema = z.object({
  businesses_summary: z.object({
    total_pilot_businesses: z.number(),
    setup_complete: z.number(),
    active: z.number(),
    inactive: z.number(),
    needs_attention: z.number(),
  }),
  customer_activity: z.object({
    total_scans: z.number(),
    total_sessions: z.number(),
    total_ai_generated: z.number(),
    total_copies: z.number(),
    total_google_opens: z.number(),
    total_feedback: z.number(),
  }),
  system_health: z.object({
    recent_errors_count: z.number(),
    ai_failures_count: z.number(),
    authorization_failures_count: z.number(),
    customer_flow_failures_count: z.number(),
    recent_incidents: z.array(OperationalIncidentSchema),
  }),
  feedback_summary: z.object({
    open: z.number(),
    reviewing: z.number(),
    resolved: z.number(),
    total: z.number(),
  }),
  subscriptions_summary: z.object({
    free_businesses: z.number(),
    paid_businesses: z.number(),
    pending_upgrade_requests: z.number(),
  }),
  pilot_businesses: z.array(PilotControlCenterBusinessSchema),
  range: z.enum(['7d', '30d', 'all']),
  notice: z.string(),
});
export type PilotControlCenterResponse = z.infer<typeof PilotControlCenterResponseSchema>;

export const PilotControlCenterQuerySchema = z.object({
  range: z.enum(['7d', '30d', 'all']).default('30d').optional(),
});
export type PilotControlCenterQuery = z.infer<typeof PilotControlCenterQuerySchema>;

// ============================================================================
// Step 31: Daily Pilot Health Summary
// ============================================================================

export const DailyHealthPeriodSchema = z.object({
  qr_scans: z.number(),
  review_sessions: z.number(),
  ai_generations: z.number(),
  review_copies: z.number(),
  google_page_opens: z.number(),
  private_feedback_submitted: z.number(),
  operational_errors: z.number(),
  ai_failures: z.number(),
  auth_failures: z.number(),
  db_errors: z.number(),
});
export type DailyHealthPeriod = z.infer<typeof DailyHealthPeriodSchema>;

export const DailyHealthSummarySchema = z.object({
  generated_at: z.string(),
  window_hours: z.number(),
  system: z.object({
    operational_errors_24h: z.number(),
    ai_failures_24h: z.number(),
    auth_failures_24h: z.number(),
    db_errors_24h: z.number(),
    customer_flow_failures_24h: z.number(),
    critical_incidents: z.number(),
    open_incidents: z.number(),
  }),
  customer_flow: z.object({
    qr_scans: z.number(),
    review_sessions: z.number(),
    ai_generations: z.number(),
    ai_generation_failures: z.number(),
    ai_failure_rate_pct: z.number().nullable(),
    review_copies: z.number(),
    google_page_opens: z.number(),
    private_feedback_submitted: z.number(),
  }),
  businesses: z.object({
    total: z.number(),
    newly_onboarded_24h: z.number(),
    setup_incomplete: z.number(),
    active_in_window: z.number(),
    no_recent_activity: z.number(),
  }),
  feedback: z.object({
    new_24h: z.number(),
    open_total: z.number(),
    reviewing: z.number(),
  }),
  subscriptions: z.object({
    pending_upgrade_requests: z.number(),
    businesses_near_limit: z.number(),
  }),
  comparison: z.object({
    current: DailyHealthPeriodSchema,
    previous: DailyHealthPeriodSchema,
  }),
  recent_critical_incidents: z.array(OperationalIncidentSchema),
  notice: z.string(),
});
export type DailyHealthSummary = z.infer<typeof DailyHealthSummarySchema>;

export const IncidentUpdateSchema = z.object({
  status: z.enum(['active', 'investigating', 'resolved']).optional(),
  admin_note: z.string().max(1000).nullable().optional(),
});
export type IncidentUpdate = z.infer<typeof IncidentUpdateSchema>;

export const AdminUsageQuerySchema = z.object({
  range: z.enum(['today', '7d', '30d', '90d', 'custom']).optional().default('30d'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
export type AdminUsageQuery = z.infer<typeof AdminUsageQuerySchema>;

export const AdminAIUsageQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).optional().default('30d'),
});
export type AdminAIUsageQuery = z.infer<typeof AdminAIUsageQuerySchema>;

export const AdminFunnelQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).optional().default('30d'),
  business_id: z.string().uuid().optional(),
});
export type AdminFunnelQuery = z.infer<typeof AdminFunnelQuerySchema>;

export const AdminClientListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  plan: z.string().optional(),
  status: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});
export type AdminClientListQuery = z.infer<typeof AdminClientListQuerySchema>;