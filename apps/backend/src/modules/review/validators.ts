/**
 * Review Module Validators
 * ReviewAI SaaS Platform
 * Using Zod for schema validation
 */

import { z } from 'zod';
import { SessionStatus } from './types';

// Language validation
const languageSchema = z.string().min(2).max(20).optional();

// Rating validation
const ratingSchema = z.number().int().min(1).max(5);

// Session ID validation (supports UUID, guest string, or empty during test flows)
const sessionIdSchema = z.string().optional().or(z.literal(''));

// Generate review request validation
export const generateReviewSchema = z.object({
  body: z.object({
    session_id: sessionIdSchema,
    rating: ratingSchema,
    language: languageSchema,
    tags: z.array(z.string().min(1).max(50)).optional(),
    customer_text: z.string().max(1000).optional(),
    variation: z.number().int().min(0).max(10).optional(),
  }),
});

// Tags selection validation
export const selectTagsSchema = z.object({
  body: z.object({
    session_id: sessionIdSchema,
    tags: z.array(z.string().min(1).max(50)).min(1, 'Please select at least 1 tag').max(10),
  }),
});

// Review copy validation
export const recordCopySchema = z.object({
  body: z.object({
    session_id: sessionIdSchema,
  }),
});

// Private feedback start validation
export const recordFeedbackStartSchema = z.object({
  body: z.object({
    session_id: sessionIdSchema,
  }),
});

// Private feedback skip validation
export const recordFeedbackSkipSchema = z.object({
  body: z.object({
    session_id: sessionIdSchema,
  }),
});

// Update review (edit) validation
export const updateReviewSchema = z.object({
  body: z.object({
    session_id: sessionIdSchema,
    edited_text: z.string()
      .min(10, 'Review must be at least 10 characters')
      .max(4000, 'Review must not exceed 4000 characters')
      .trim(),
  }),
  params: z.object({
    sessionId: sessionIdSchema,
  }).optional(),
});

// Regenerate review validation
export const regenerateReviewSchema = z.object({
  body: z.object({
    session_id: sessionIdSchema,
  }),
});

// Complete review (redirect to Google) validation
export const completeReviewSchema = z.object({
  body: z.object({
    session_id: sessionIdSchema,
  }),
});

// Session ID param validation
export const sessionIdParamSchema = z.object({
  params: z.object({
    sessionId: sessionIdSchema,
  }),
});

// Language selection validation (step 1)
export const selectLanguageSchema = z.object({
  body: z.object({
    session_id: sessionIdSchema,
    language: z.string().min(2, 'Language code must be at least 2 characters').max(20),
  }),
});

// Rating selection validation (step 2)
export const selectRatingSchema = z.object({
  body: z.object({
    session_id: sessionIdSchema,
    rating: ratingSchema,
  }),
});

// Export type inference helpers
export type GenerateReviewInput = z.infer<typeof generateReviewSchema>['body'];
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>['body'];
export type RegenerateReviewInput = z.infer<typeof regenerateReviewSchema>['body'];
export type CompleteReviewInput = z.infer<typeof completeReviewSchema>['body'];
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>['params'];
export type SelectLanguageInput = z.infer<typeof selectLanguageSchema>['body'];
export type SelectRatingInput = z.infer<typeof selectRatingSchema>['body'];