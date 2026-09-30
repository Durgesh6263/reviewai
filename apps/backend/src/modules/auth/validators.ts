/**
 * Authentication Module Validators
 * ReviewAI SaaS Platform
 * Using Zod for schema validation
 */

import { z } from 'zod';
import { UserRole } from './types';

// Password requirements: min 8 chars, at least 1 uppercase, 1 lowercase, 1 number, 1 special char
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Email schema
const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email must not exceed 255 characters')
  .toLowerCase()
  .trim();

// Name schema
const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(255, 'Name must not exceed 255 characters')
  .trim()
  .regex(/^[a-zA-Z\s\-'.]+$/, 'Name contains invalid characters');

// Register request validation
export const registerSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: passwordSchema,
    full_name: nameSchema,
  }),
});

// Login request validation
export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required').max(128),
  }),
});

// Refresh token validation
export const refreshTokenSchema = z.object({
  body: z.object({
    refresh_token: z.string().min(1, 'Refresh token is required'),
  }),
});

// Forgot password validation
export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

// Reset password validation
export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: passwordSchema,
  }),
});

// Verify email validation
export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Verification token is required'),
  }),
});

// Change password validation
export const changePasswordSchema = z.object({
  body: z.object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
  }).refine(data => data.current_password !== data.new_password, {
    message: 'New password must be different from current password',
    path: ['new_password'],
  }),
});

// Update profile validation
export const updateProfileSchema = z.object({
  body: z.object({
    full_name: nameSchema.optional(),
    avatar_url: z.string().url('Invalid avatar URL').max(500).optional().nullable(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  }),
});

// Query parameter validation for pagination
export const paginationSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
});

// User ID param validation
export const userIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
});

// Business ID param validation
export const businessIdParamSchema = z.object({
  params: z.object({
    businessId: z.string().uuid('Invalid business ID format'),
  }),
});

// Role validation
export const roleSchema = z.object({
  body: z.object({
    role: z.enum(['admin', 'business_owner', 'staff'] as [UserRole, ...UserRole[]]),
  }),
});

// Export type inference helpers
export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>['body'];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>['body'];
export type PaginationInput = z.infer<typeof paginationSchema>['query'];