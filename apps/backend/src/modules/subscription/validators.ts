/**
 * Subscription Module Validators
 * ReviewAI SaaS Platform
 * Using Zod for schema validation
 */

import { z } from 'zod';
import { SubscriptionPlan, SubscriptionStatus } from './types';

// Plan validation
const planSchema = z.enum(['free', 'starter', 'professional', 'enterprise']);

// Status validation
const statusSchema = z.enum([
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
]);

// Business ID validation
const businessIdSchema = z.string().uuid('Invalid business ID format');

// Subscription ID validation
const subscriptionIdSchema = z.string().uuid('Invalid subscription ID format');

// Create subscription validation
export const createSubscriptionSchema = z.object({
  body: z.object({
    business_id: businessIdSchema,
    plan: planSchema,
    payment_method_id: z.string().optional(),
    trial_days: z.number().int().min(0).max(365).optional().default(14),
    metadata: z.record(z.any()).optional(),
  }),
});

// Update subscription validation
export const updateSubscriptionSchema = z.object({
  body: z.object({
    plan: planSchema.optional(),
    cancel_at_period_end: z.boolean().optional(),
    metadata: z.record(z.any()).optional(),
  }),
  params: z.object({
    subscriptionId: subscriptionIdSchema,
  }),
});

// Cancel subscription validation
export const cancelSubscriptionSchema = z.object({
  body: z.object({
    immediately: z.boolean().optional().default(false),
  }),
  params: z.object({
    subscriptionId: subscriptionIdSchema,
  }),
});

// Subscription ID param
export const subscriptionIdParamSchema = z.object({
  params: z.object({
    subscriptionId: subscriptionIdSchema,
  }),
});

// Business ID param
export const businessIdParamSchema = z.object({
  params: z.object({
    businessId: businessIdSchema,
  }),
});

// Create checkout session validation
export const createCheckoutSessionSchema = z.object({
  body: z.object({
    business_id: businessIdSchema,
    plan: planSchema,
    success_url: z.string().url('Invalid success URL').optional(),
    cancel_url: z.string().url('Invalid cancel URL').optional(),
    trial_days: z.number().int().min(0).max(365).optional(),
  }),
});

// Create billing portal session validation
export const createBillingPortalSessionSchema = z.object({
  body: z.object({
    business_id: businessIdSchema,
    return_url: z.string().url('Invalid return URL').optional(),
  }),
});

// Export type inference helpers
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>['body'];
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>['body'];
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>['body'];
export type SubscriptionIdParam = z.infer<typeof subscriptionIdParamSchema>['params'];
export type BusinessIdParam = z.infer<typeof businessIdParamSchema>['params'];
export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>['body'];
export type CreateBillingPortalSessionInput = z.infer<typeof createBillingPortalSessionSchema>['body'];