import { Router, Request, Response, NextFunction } from 'express';
import { AdminController } from './controller';
import { AdminService } from './service';
import { supabaseAdmin } from '../../config/supabase';
import { createAuthMiddleware } from '../auth/middleware';
import { validate } from '../../shared/utils/validation';
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
  AdminUpgradeRequestListQuerySchema,
  AdminUpgradeRequestStatusUpdateSchema,
  AdminFeedbackListQuerySchema,
  AdminFeedbackUpdateSchema,
  PilotInsightsQuerySchema,
  PilotControlCenterQuerySchema,
  IncidentUpdateSchema,
  OperationalErrorCategorySchema,
  OperationalIncidentSeveritySchema,
} from './types';

const router: Router = Router();
const adminService = new AdminService(supabaseAdmin);
const adminController = new AdminController(adminService);

// All admin routes require admin authentication (checked in index.ts)

// Pilot Control Center (Step 29)
router.get('/pilot', validate(z.object({ query: PilotControlCenterQuerySchema })), adminController.getPilotControlCenter.bind(adminController));

// Pilot Insights (Step 28)
router.get('/pilot-insights', validate(z.object({ query: PilotInsightsQuerySchema })), adminController.getPilotInsights.bind(adminController));

// Business management
router.get('/businesses', validate(z.object({ query: AdminBusinessListQuerySchema })), adminController.getBusinesses.bind(adminController));
router.get('/businesses/:id', validate(z.object({ params: z.object({ id: z.string().uuid() }) })), adminController.getBusinessDetail.bind(adminController));
router.patch('/businesses/:id', validate(z.object({ params: z.object({ id: z.string().uuid() }), body: AdminBusinessUpdateSchema })), adminController.updateBusiness.bind(adminController));
router.delete('/businesses/:id', validate(z.object({ params: z.object({ id: z.string().uuid() }) })), adminController.deleteBusiness.bind(adminController));

// QR Code management
router.get('/qr-codes', validate(z.object({ query: AdminQRCodeListQuerySchema })), adminController.getQRCodes.bind(adminController));
router.patch('/qr-codes/:id', validate(z.object({ params: z.object({ id: z.string().uuid() }), body: AdminQRCodeUpdateSchema })), adminController.updateQRCode.bind(adminController));
router.delete('/qr-codes/:id', validate(z.object({ params: z.object({ id: z.string().uuid() }) })), adminController.deleteQRCode.bind(adminController));

// Analytics
router.get('/analytics', validate(z.object({ query: AdminAnalyticsQuerySchema })), adminController.getAnalytics.bind(adminController));

// Subscriptions
router.get('/subscriptions', validate(z.object({ query: AdminSubscriptionListQuerySchema })), adminController.getSubscriptions.bind(adminController));
router.get('/subscriptions/stats', validate(z.object({})), adminController.getSubscriptionStats.bind(adminController));
router.patch('/subscriptions/:id', validate(z.object({ params: z.object({ id: z.string().uuid() }), body: AdminSubscriptionUpdateSchema })), adminController.updateSubscription.bind(adminController));
router.post('/subscriptions/:id/cancel', validate(z.object({ params: z.object({ id: z.string().uuid() }) })), adminController.cancelSubscription.bind(adminController));
router.post('/subscriptions/:id/reactivate', validate(z.object({ params: z.object({ id: z.string().uuid() }) })), adminController.reactivateSubscription.bind(adminController));

// Upgrade Requests
router.get('/upgrade-requests', validate(z.object({ query: AdminUpgradeRequestListQuerySchema })), adminController.getUpgradeRequests.bind(adminController));
router.get('/upgrade-requests/:id', validate(z.object({ params: z.object({ id: z.string().uuid() }) })), adminController.getUpgradeRequest.bind(adminController));
router.patch('/upgrade-requests/:id/status', validate(z.object({ params: z.object({ id: z.string().uuid() }), body: AdminUpgradeRequestStatusUpdateSchema })), adminController.updateUpgradeRequestStatus.bind(adminController));

// System health & monitoring
router.get('/system/health', validate(z.object({})), adminController.getSystemHealth.bind(adminController));
router.get('/system/stats', validate(z.object({})), adminController.getSystemStats.bind(adminController));
router.get('/system/jobs', validate(z.object({})), adminController.getBackgroundJobs.bind(adminController));

// Settings
router.get('/settings', validate(z.object({})), adminController.getSettings.bind(adminController));
router.patch('/settings', validate(z.object({ body: AdminSettingsUpdateSchema })), adminController.updateSettings.bind(adminController));

// Dashboard stats
router.get('/stats', validate(z.object({})), adminController.getStats.bind(adminController));
router.get('/recent-activity', validate(z.object({ query: z.object({ limit: z.coerce.number().int().positive().max(100).default(10) }) })), adminController.getRecentActivity.bind(adminController));

// Feedback
router.get('/feedback', validate(z.object({ query: AdminFeedbackListQuerySchema })), adminController.getFeedback.bind(adminController));
router.patch('/feedback/:id', validate(z.object({ params: z.object({ id: z.string().uuid() }), body: AdminFeedbackUpdateSchema })), adminController.updateFeedback.bind(adminController));

// Step 31: Daily Pilot Health Summary
router.get('/daily-health', validate(z.object({})), adminController.getDailyHealthSummary.bind(adminController));

// Step 31: Operational Incident Management (admin only)
const IncidentListQuerySchema = z.object({
  category: OperationalErrorCategorySchema.optional(),
  severity: OperationalIncidentSeveritySchema.optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
router.get('/incidents', validate(z.object({ query: IncidentListQuerySchema })), adminController.getIncidents.bind(adminController));
router.get('/incidents/:id', validate(z.object({ params: z.object({ id: z.string().min(1) }) })), adminController.getIncident.bind(adminController));
router.patch('/incidents/:id', validate(z.object({ params: z.object({ id: z.string().min(1) }), body: IncidentUpdateSchema })), adminController.updateIncident.bind(adminController));

// STEP 51 & 53: Platform Control Panel & User/Client Management routes
router.get('/clients', adminController.getClients.bind(adminController));
router.get('/clients/:id', validate(z.object({ params: z.object({ id: z.string().uuid() }) })), adminController.getClientDetail.bind(adminController));
router.post('/users/:id/deactivate', validate(z.object({ params: z.object({ id: z.string().uuid() }) })), adminController.deactivateUser.bind(adminController));
router.post('/users/:id/activate', validate(z.object({ params: z.object({ id: z.string().uuid() }) })), adminController.activateUser.bind(adminController));
router.get('/usage', adminController.getPlatformUsage.bind(adminController));
router.get('/ai-usage', adminController.getAIUsage.bind(adminController));
router.get('/funnel', adminController.getFunnelMetrics.bind(adminController));
router.get('/search', adminController.globalSearch.bind(adminController));

export default router;