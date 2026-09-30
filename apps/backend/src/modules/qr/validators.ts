/**
 * QR Module Validators
 * ReviewAI SaaS Platform
 * Using Zod for schema validation
 */

import { z } from 'zod';
import { QRDesign } from './types';

// QR Design schema
const qrDesignSchema = z.object({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
  logo: z.boolean().optional(),
  frame: z.enum(['rounded', 'square', 'circle', 'none']).optional(),
  size: z.number().int().min(128).max(2048).optional(),
  error_correction: z.enum(['L', 'M', 'Q', 'H']).optional(),
  background_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
  logo_size: z.number().min(0.1).max(0.5).optional(),
  margin: z.number().int().min(0).max(20).optional(),
});

// Create QR code validation
export const createQRCodeSchema = z.object({
  body: z.object({
    label: z.string().max(255).trim().optional(),
    design: qrDesignSchema.optional(),
  }),
  params: z.object({
    businessId: z.string().uuid('Invalid business ID format'),
  }),
});

// Update QR code validation
export const updateQRCodeSchema = z.object({
  body: z.object({
    label: z.string().max(255).trim().optional(),
    design: qrDesignSchema.optional(),
    is_active: z.boolean().optional(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  }),
  params: z.object({
    businessId: z.string().uuid('Invalid business ID format'),
    id: z.string().uuid('Invalid QR code ID format'),
  }),
});

// QR code ID param validation
export const qrCodeIdParamSchema = z.object({
  params: z.object({
    businessId: z.string().uuid('Invalid business ID format'),
    id: z.string().uuid('Invalid QR code ID format'),
  }),
});

// Business ID param validation
export const businessIdParamSchema = z.object({
  params: z.object({
    businessId: z.string().uuid('Invalid business ID format'),
  }),
});

// QR slug param validation (public route)
export const qrSlugParamSchema = z.object({
  params: z.object({
    slug: z.string().min(1).max(200),
  }),
  query: z.object({
    scan_id: z.string().optional(),
  }).passthrough().optional(),
});

// List QR codes query validation
export const listQRCodesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    is_active: z.coerce.boolean().optional(),
    search: z.string().max(100).trim().optional(),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
  params: z.object({
    businessId: z.string().uuid('Invalid business ID format'),
  }),
});

// Scan request validation
export const scanQRCodeSchema = z.object({
  body: z.object({
    ip_address: z.string().ip({ version: 'v4' }).optional(),
    user_agent: z.string().max(500).optional(),
    referrer: z.string().max(500).optional(),
    country: z.string().length(2).optional(),
    city: z.string().max(100).optional(),
    device_type: z.enum(['mobile', 'tablet', 'desktop']).optional(),
    browser: z.string().max(100).optional(),
    os: z.string().max(100).optional(),
  }),
  params: z.object({
    slug: z.string().min(1).max(200),
  }),
});

// Export type inference helpers
export type CreateQRCodeInput = z.infer<typeof createQRCodeSchema>['body'];
export type UpdateQRCodeInput = z.infer<typeof updateQRCodeSchema>['body'];
export type QRCodeIdParam = z.infer<typeof qrCodeIdParamSchema>['params'];
export type BusinessIdParam = z.infer<typeof businessIdParamSchema>['params'];
export type QRSlugParam = z.infer<typeof qrSlugParamSchema>['params'];
export type ListQRCodesInput = z.infer<typeof listQRCodesSchema>['query'];
export type ScanQRCodeInput = z.infer<typeof scanQRCodeSchema>['body'];