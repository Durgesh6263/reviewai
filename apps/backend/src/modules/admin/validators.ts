import { z } from 'zod';
import {
  AdminBusinessListQuerySchema,
  AdminBusinessUpdateSchema,
  AdminQRCodeListQuerySchema,
  AdminQRCodeUpdateSchema,
  AdminAnalyticsQuerySchema,
  AdminSubscriptionListQuerySchema,
  AdminSubscriptionUpdateSchema,
  AdminSettingsUpdateSchema,
} from './types';

export const adminBusinessListValidator = z.object({
  query: AdminBusinessListQuerySchema,
});

export const adminBusinessUpdateValidator = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: AdminBusinessUpdateSchema,
});

export const adminBusinessDeleteValidator = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const adminQRCodeListValidator = z.object({
  query: AdminQRCodeListQuerySchema,
});

export const adminQRCodeUpdateValidator = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: AdminQRCodeUpdateSchema,
});

export const adminQRCodeDeleteValidator = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const adminAnalyticsValidator = z.object({
  query: AdminAnalyticsQuerySchema,
});

export const adminSubscriptionListValidator = z.object({
  query: AdminSubscriptionListQuerySchema,
});

export const adminSubscriptionUpdateValidator = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: AdminSubscriptionUpdateSchema,
});

export const adminSubscriptionCancelValidator = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const adminSubscriptionReactivateValidator = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const adminSettingsValidator = z.object({
  body: AdminSettingsUpdateSchema,
});

export const adminSystemHealthValidator = z.object({});

export const adminSystemStatsValidator = z.object({});

export const adminJobsValidator = z.object({});

export const adminStatsValidator = z.object({});

export const adminRecentActivityValidator = z.object({
  query: z.object({
    limit: z.coerce.number().int().positive().max(100).default(10),
  }),
});