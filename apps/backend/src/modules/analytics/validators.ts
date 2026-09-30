/**
 * Analytics Module Validators
 * ReviewAI SaaS Platform
 * Using Zod for schema validation
 */

import { z } from 'zod';

// Date validation (ISO 8601)
const dateSchema = z.string().datetime({ offset: true }).or(z.string().date());

// Analytics filters validation
export const analyticsFiltersSchema = z.object({
  query: z.object({
    business_id: z.string().uuid('Invalid business ID format').optional(),
    qr_code_id: z.string().uuid('Invalid QR code ID format').optional(),
    start_date: dateSchema,
    end_date: dateSchema,
    group_by: z.enum(['day', 'week', 'month']).optional().default('day'),
  }).refine(data => new Date(data.start_date) <= new Date(data.end_date), {
    message: 'start_date must be before or equal to end_date',
  }).refine(data => {
    const diffDays = (new Date(data.end_date).getTime() - new Date(data.start_date).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 365;
  }, {
    message: 'Date range cannot exceed 365 days',
  }),
});

// QR code analytics filters
export const qrAnalyticsFiltersSchema = z.object({
  query: z.object({
    qr_code_id: z.string().uuid('Invalid QR code ID format'),
    start_date: dateSchema,
    end_date: dateSchema,
    group_by: z.enum(['day', 'week', 'month']).optional().default('day'),
  }).refine(data => new Date(data.start_date) <= new Date(data.end_date), {
    message: 'start_date must be before or equal to end_date',
  }).refine(data => {
    const diffDays = (new Date(data.end_date).getTime() - new Date(data.start_date).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 365;
  }, {
    message: 'Date range cannot exceed 365 days',
  }),
});

// Business ID param
export const businessIdParamSchema = z.object({
  params: z.object({
    businessId: z.string().uuid('Invalid business ID format'),
  }),
});

// QR code ID param
export const qrCodeIdParamSchema = z.object({
  params: z.object({
    qrCodeId: z.string().uuid('Invalid QR code ID format'),
  }),
});

// Export type inference helpers
export type AnalyticsFiltersInput = z.infer<typeof analyticsFiltersSchema>['query'];
export type QRAnalyticsFiltersInput = z.infer<typeof qrAnalyticsFiltersSchema>['query'];
export type BusinessIdParam = z.infer<typeof businessIdParamSchema>['params'];
export type QRCodeIdParam = z.infer<typeof qrCodeIdParamSchema>['params'];