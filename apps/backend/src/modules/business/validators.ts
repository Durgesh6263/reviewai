/**
 * Business Module Validators
 * ReviewAI SaaS Platform
 * Using Zod for schema validation
 */

import { z } from 'zod';
import { BusinessStatus, BusinessAddress, ReviewTone } from './types';

// Address schema
const addressSchema = z.union([
  z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postal_code: z.string().optional(),
    formatted: z.string().optional(),
  }),
  z.string().transform(str => ({ street: str, formatted: str })),
]);

// Business branding schema
const brandingSchema = z.object({
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional().default('#2563EB'),
  logo_position: z.enum(['left', 'center', 'right']).optional().default('left'),
  custom_css: z.string().max(10000).optional().nullable().default(null),
});

// Business notifications schema
const notificationsSchema = z.object({
  email_on_scan: z.boolean().optional().default(false),
  email_on_review: z.boolean().optional().default(true),
  email_on_milestone: z.boolean().optional().default(true),
  webhook_url: z.string().url('Invalid webhook URL').max(500).optional().nullable().default(null),
});

// Business settings schema
const settingsSchema = z.object({
  language_default: z.string().length(2).optional(),
  review_tone: z.enum(['professional', 'friendly', 'casual', 'enthusiastic']).optional(),
  category: z.string().max(100).optional(),
  category_name: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).optional(),
  custom_tags: z.array(z.string().max(50)).optional(),
  branding: brandingSchema.optional(),
  notifications: notificationsSchema.optional(),
});

// Create business validation
export const createBusinessSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Business name is required').max(255).trim(),
    category: z.string().max(100).trim().optional().or(z.literal('')).transform(v => v || 'other'),
    custom_tags: z.array(z.string().max(50)).optional(),
    google_review_url: z.string().url('Invalid Google Review URL').max(2048).optional().or(z.literal('')).transform(v => v || undefined),
    google_place_id: z.string().max(255).trim().optional().or(z.literal('')).transform(v => v || undefined),
    slug: z.string().max(100).trim().optional().or(z.literal('')).transform(v => v || undefined),
    description: z.string().max(2000).trim().optional().or(z.literal('')).transform(v => v || undefined),
    website_url: z.string().url('Invalid website URL').max(500).optional().or(z.literal('')).transform(v => v || undefined),
    phone: z.string().max(50).trim().optional().or(z.literal('')).transform(v => v || undefined),
    email: z.string().email('Invalid email address').max(255).trim().optional().or(z.literal('')).transform(v => v || undefined),
    address: addressSchema.optional().nullable(),
    address_line1: z.string().max(255).trim().optional().or(z.literal('')).transform(v => v || undefined),
    address_line2: z.string().max(255).trim().optional().or(z.literal('')).transform(v => v || undefined),
    city: z.string().max(100).trim().optional().or(z.literal('')).transform(v => v || undefined),
    state: z.string().max(100).trim().optional().or(z.literal('')).transform(v => v || undefined),
    postal_code: z.string().max(30).trim().optional().or(z.literal('')).transform(v => v || undefined),
    country: z.string().max(100).trim().optional().or(z.literal('')).transform(v => v || undefined),
    timezone: z.string().optional(),
    settings: z.record(z.any()).optional().nullable(),
  }).refine(data => Boolean(data.google_review_url || data.google_place_id), {
    message: 'Either Google Review URL or Google Place ID is required',
    path: ['google_review_url'],
  }),
});

// Update business validation
export const updateBusinessSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255).trim().optional(),
    category: z.string().max(100).trim().optional(),
    custom_tags: z.array(z.string().max(50)).optional(),
    description: z.string().max(2000).trim().optional(),
    logo_url: z.string().url('Invalid logo URL').max(500).optional(),
    google_review_url: z.string().url('Invalid Google Review URL').max(2048).optional(),
    website_url: z.string().url('Invalid website URL').max(500).optional(),
    phone: z.string().max(50).trim().optional(),
    address: addressSchema.optional().nullable(),
    timezone: z.string().optional(),
    settings: settingsSchema.partial().optional(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  }),
  params: z.object({
    id: z.string().uuid('Invalid business ID format'),
  }),
});

// Business ID param validation
export const businessIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid business ID format'),
  }),
});

// Business slug param validation (for public routes)
export const businessSlugParamSchema = z.object({
  params: z.object({
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Invalid slug format'),
  }),
});

// List businesses query validation
export const listBusinessesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['active', 'suspended', 'pending_verification']).optional(),
    search: z.string().max(100).trim().optional(),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
});

// Update Google Review URL validation
export const updateGoogleUrlSchema = z.object({
  body: z.object({
    google_review_url: z.string().url('Invalid Google Review URL').max(2048),
  }),
  params: z.object({
    id: z.string().uuid('Invalid business ID format'),
  }),
});

// Business status update (admin)
export const updateBusinessStatusSchema = z.object({
  body: z.object({
    status: z.enum(['active', 'suspended', 'pending_verification']),
  }),
  params: z.object({
    id: z.string().uuid('Invalid business ID format'),
  }),
});

// Export type inference helpers
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>['body'];
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>['body'];
export type BusinessIdParam = z.infer<typeof businessIdParamSchema>['params'];
export type BusinessSlugParam = z.infer<typeof businessSlugParamSchema>['params'];
export type ListBusinessesInput = z.infer<typeof listBusinessesSchema>['query'];
export type UpdateGoogleUrlInput = z.infer<typeof updateGoogleUrlSchema>['body'];
export type UpdateBusinessStatusInput = z.infer<typeof updateBusinessStatusSchema>['body'];