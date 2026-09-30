import { Request, Response, NextFunction } from 'express';
import { AdminService } from './service';
import { AuthenticatedRequest } from '../auth/middleware';
import { validate } from '../../shared/utils/validation';
import { z } from 'zod';
import {
  AdminFeedbackListQuerySchema,
  AdminFeedbackUpdateSchema,
} from './types';

export class AdminController {
  constructor(private adminService: AdminService) {}

  // Upgrade Requests
  async getUpgradeRequests(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getUpgradeRequests(req.query as any);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }

  async getUpgradeRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const request = await this.adminService.getUpgradeRequest(id);
      res.json({ success: true, data: request });
    } catch (error) {
      next(error);
    }
  }

  async updateUpgradeRequestStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, admin_notes } = req.body;
      const adminId = req.user!.sub;
      const request = await this.adminService.updateUpgradeRequestStatus(id, status, adminId, admin_notes);
      res.json({ success: true, data: request });
    } catch (error) {
      next(error);
    }
  }

  // Business management
  async getBusinesses(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getBusinesses(req.query as any);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }

  async updateBusiness(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const business = await this.adminService.updateBusiness(id, updates);
      res.json({ success: true, data: business });
    } catch (error) {
      next(error);
    }
  }

  async deleteBusiness(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await this.adminService.deleteBusiness(id);
      res.json({ success: true, message: 'Business deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async getBusinessDetail(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const detail = await this.adminService.getBusinessDetail(id);
      res.json({ success: true, data: detail });
    } catch (error) {
      next(error);
    }
  }

  // QR Code management
  async getQRCodes(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getQRCodes(req.query as any);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }

  async updateQRCode(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const qrCode = await this.adminService.updateQRCode(id, updates);
      res.json({ success: true, data: qrCode });
    } catch (error) {
      next(error);
    }
  }

  async deleteQRCode(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await this.adminService.deleteQRCode(id);
      res.json({ success: true, message: 'QR code deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  // Analytics
  async getAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const analytics = await this.adminService.getAnalytics(req.query as any);
      res.json({ success: true, data: analytics });
    } catch (error) {
      next(error);
    }
  }

  // Subscriptions
  async getSubscriptions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getSubscriptions(req.query as any);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }

  async getSubscriptionStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const stats = await this.adminService.getSubscriptionStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }

  async updateSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { plan } = req.body;
      const subscription = await this.adminService.updateSubscriptionPlan(id, plan);
      res.json({ success: true, data: subscription });
    } catch (error) {
      next(error);
    }
  }

  async cancelSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await this.adminService.cancelSubscription(id);
      res.json({ success: true, message: 'Subscription cancellation scheduled' });
    } catch (error) {
      next(error);
    }
  }

  async reactivateSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await this.adminService.reactivateSubscription(id);
      res.json({ success: true, message: 'Subscription reactivated' });
    } catch (error) {
      next(error);
    }
  }

  // System health
  async getSystemHealth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const health = await this.adminService.getSystemHealth();
      res.json({ success: true, data: health });
    } catch (error) {
      next(error);
    }
  }

  async getSystemStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const stats = await this.adminService.getSystemStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }

  async getBackgroundJobs(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const jobs = await this.adminService.getBackgroundJobs();
      res.json({ success: true, data: jobs });
    } catch (error) {
      next(error);
    }
  }

  // Settings
  async getSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const settings = await this.adminService.getSettings();
      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const updates = req.body;
      const settings = await this.adminService.updateSettings(updates);
      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  }

  // Stats
  async getStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const stats = await this.adminService.getStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }

  async getRecentActivity(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const activity = await this.adminService.getRecentActivity(limit);
      res.json({ success: true, data: activity });
    } catch (error) {
      next(error);
    }
  }

  // Feedback
  async getFeedback(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getFeedback(req.query as any);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }

  async updateFeedback(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const feedback = await this.adminService.updateFeedback(id, updates);
      res.json({ success: true, data: feedback });
    } catch (error) {
      next(error);
    }
  }

  // Pilot Insights (Step 28)
  async getPilotInsights(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getPilotInsights(req.query as any);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // Pilot Control Center (Step 29)
  async getPilotControlCenter(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getPilotControlCenter(req.query as any);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // Step 31: Daily Pilot Health Summary
  async getDailyHealthSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getDailyHealthSummary();
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // Step 31: Incident list (admin only)
  async getIncidents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { category, severity, limit } = req.query as {
        category?: string;
        severity?: string;
        limit?: string;
      };
      const result = this.adminService.getRecentIncidents({
        category: category as any,
        severity: severity as any,
        limit: limit ? parseInt(limit, 10) : 50,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // Step 31: Get incident by ID (admin only)
  async getIncident(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const incident = this.adminService.getIncidentById(id);
      if (!incident) {
        res.status(404).json({ success: false, error: 'Incident not found' });
        return;
      }
      res.json({ success: true, data: incident });
    } catch (error) {
      next(error);
    }
  }

  // Step 31: Update incident status/note (admin only)
  async updateIncident(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const update = req.body;
      const incident = this.adminService.updateIncident(id, update);
      if (!incident) {
        res.status(404).json({ success: false, error: 'Incident not found' });
        return;
      }
      res.json({ success: true, data: incident });
    } catch (error) {
      next(error);
    }
  }

  // Section 3: Clients List
  async getClients(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getClients(req.query as any);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }

  // Section 4: Client Detail
  async getClientDetail(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const detail = await this.adminService.getClientDetail(id);
      // Record audit log for viewing client detail
      await this.adminService.recordAdminAudit(req.user!.sub, 'client.view', 'user', id, { name: detail.name });
      res.json({ success: true, data: detail });
    } catch (error) {
      next(error);
    }
  }

  // Section 4B: Activate / Deactivate User
  async deactivateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body || {};
      const result = await this.adminService.deactivateUser(req.user!.sub, id, reason);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async activateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await this.adminService.activateUser(req.user!.sub, id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // Section 5: Platform Feature Usage
  async getPlatformUsage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getPlatformUsage(req.query as any);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // Section 6: AI Usage Analytics
  async getAIUsage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getAIUsage(req.query as any);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // Section 7: Funnel Metrics
  async getFunnelMetrics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await this.adminService.getFunnelMetrics(req.query as any);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  // Section 12: Global Search
  async globalSearch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const q = (req.query.q as string) || '';
      const result = await this.adminService.globalSearch(q);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}