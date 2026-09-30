/**
 * Subscription Module Types
 * ReviewAI SaaS Platform
 */

export interface Subscription {
  id: string;
  business_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  metadata: SubscriptionMetadata;
  created_at: string;
  updated_at: string;
}

export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export type SubscriptionPlan = 'free' | 'starter' | 'professional' | 'enterprise';

export interface SubscriptionMetadata {
  seats?: number;
  custom_branding?: boolean;
  api_access?: boolean;
  priority_support?: boolean;
  [key: string]: any;
}

export interface UsageRecord {
  id: string;
  subscription_id: string;
  metric: UsageMetric;
  count: number;
  period_start: string;
  period_end: string;
  created_at: string;
}

export type UsageMetric = 'review_generations' | 'google_redirects' | 'qr_codes' | 'team_members' | 'api_calls';

export interface PlanLimits {
  review_generations: number | null; // null = unlimited
  google_redirects: number | null;
  qr_codes: number | null;
  team_members: number | null;
  api_calls: number | null;
  custom_branding: boolean;
  api_access: boolean;
  priority_support: boolean;
  analytics_retention_days: number;
}

export interface SubscriptionWithUsage extends Subscription {
  usage: UsageSummary;
  limits: PlanLimits;
}

export interface UsageSummary {
  review_generations: { used: number; limit: number | null; percentage: number };
  google_redirects: { used: number; limit: number | null; percentage: number };
  qr_codes: { used: number; limit: number | null; percentage: number };
  team_members: { used: number; limit: number | null; percentage: number };
}

export interface CreateSubscriptionRequest {
  business_id: string;
  plan: SubscriptionPlan;
  payment_method_id?: string;
  trial_days?: number;
  success_url?: string;
  cancel_url?: string;
  metadata?: SubscriptionMetadata;
}

export interface UpdateSubscriptionRequest {
  plan?: SubscriptionPlan;
  cancel_at_period_end?: boolean;
  metadata?: SubscriptionMetadata;
}

export interface CancelSubscriptionRequest {
  immediately?: boolean;
}

export interface SubscriptionCheckoutSession {
  session_id: string;
  url: string;
}

export interface BillingPortalSession {
  url: string;
}

export interface Invoice {
  id: string;
  subscription_id: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  invoice_url: string;
  pdf_url: string;
  period_start: string;
  period_end: string;
  created_at: string;
}

export const SUBSCRIPTION_CONSTANTS = {
  PLANS: {
    free: {
      name: 'Free',
      price_monthly: 0,
      price_yearly: 0,
      limits: {
        review_generations: 50,
        google_redirects: 50,
        qr_codes: 1,
        team_members: 1,
        api_calls: 1000,
        custom_branding: false,
        api_access: false,
        priority_support: false,
        analytics_retention_days: 7,
      },
    },
    starter: {
      name: 'Starter',
      price_monthly: 2900, // $29.00 in cents
      price_yearly: 29000, // $290.00 in cents (2 months free)
      limits: {
        review_generations: 500,
        google_redirects: 500,
        qr_codes: 5,
        team_members: 3,
        api_calls: 10000,
        custom_branding: false,
        api_access: true,
        priority_support: false,
        analytics_retention_days: 30,
      },
    },
    professional: {
      name: 'Professional',
      price_monthly: 7900, // $79.00 in cents
      price_yearly: 79000, // $790.00 in cents (2 months free)
      limits: {
        review_generations: 2000,
        google_redirects: 2000,
        qr_codes: 20,
        team_members: 10,
        api_calls: 50000,
        custom_branding: true,
        api_access: true,
        priority_support: true,
        analytics_retention_days: 90,
      },
    },
    enterprise: {
      name: 'Enterprise',
      price_monthly: 19900, // $199.00 in cents
      price_yearly: 199000, // $1990.00 in cents (2 months free)
      limits: {
        review_generations: null, // unlimited
        google_redirects: null,
        qr_codes: null,
        team_members: null,
        api_calls: null,
        custom_branding: true,
        api_access: true,
        priority_support: true,
        analytics_retention_days: 365,
      },
    },
  } as const,
  TRIAL_DAYS: 14,
  GRACE_PERIOD_DAYS: 3,
  USAGE_WARNING_THRESHOLD: 0.8, // 80%
} as const;

export function getPlanLimits(plan: SubscriptionPlan): PlanLimits {
  return SUBSCRIPTION_CONSTANTS.PLANS[plan].limits;
}

export function getPlanPrice(plan: SubscriptionPlan, interval: 'monthly' | 'yearly'): number {
  return interval === 'monthly'
    ? SUBSCRIPTION_CONSTANTS.PLANS[plan].price_monthly
    : SUBSCRIPTION_CONSTANTS.PLANS[plan].price_yearly;
}