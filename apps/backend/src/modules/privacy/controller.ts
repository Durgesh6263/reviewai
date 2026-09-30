/**
 * Privacy Controller - GDPR Compliance Endpoints
 * Handles data export (Right to Access) and deletion (Right to Erasure)
 */

import { Request, Response, NextFunction } from 'express';
import { PrivacyService, ExportPackage } from './service';
import { TokenPayload } from '../../modules/auth/types';
import { successResponse, createdResponse } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/exceptions';

export class PrivacyController {
  constructor(private privacyService: PrivacyService) {}

  /**
   * GET /privacy/export
   * Export all user data (GDPR Right to Access - Article 15)
   */
  async exportData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.sub;
      if (!userId) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }
      const exportData: ExportPackage = await this.privacyService.exportUserData(userId);

      // Set headers for file download
      const filename = `reviewai-data-export-${userId}-${new Date().toISOString().split('T')[0]}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Log the export request
      req.logger?.info({ userId }, 'Data export requested and completed');

      res.json(exportData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /privacy/account
   * Delete user account and all data (GDPR Right to Erasure - Article 17)
   */
  async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.sub;
      if (!userId) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      if ((req as any).user?.role === 'admin') {
        throw new AppError('Admin accounts cannot be deleted.', 403, 'FORBIDDEN');
      }

      // Confirm deletion via query parameter (prevents accidental deletions)
      const confirmed = req.query.confirmed === 'true';
      if (!confirmed) {
        throw new AppError(
          'Deletion requires confirmation. Add ?confirmed=true to request.',
          400,
          'VALIDATION_ERROR',
          { message: 'Account deletion requires explicit confirmation' }
        );
      }

      await this.privacyService.deleteUserAccount(userId);

      // Log the deletion
      req.logger?.info({ userId }, 'Account deletion completed via GDPR request');

      res.json(successResponse(null, 'Account and all associated data have been permanently deleted'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /privacy/business/:businessId
   * Delete business data (for business owner)
   */
  async deleteBusiness(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.sub;
      if (!userId) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }
      const { businessId } = req.params;

      // Confirm deletion
      const confirmed = req.query.confirmed === 'true';
      if (!confirmed) {
        throw new AppError(
          'Deletion requires confirmation. Add ?confirmed=true to request.',
          400,
          'VALIDATION_ERROR',
          { message: 'Business deletion requires explicit confirmation' }
        );
      }

      await this.privacyService.deleteBusinessData(businessId, userId);

      req.logger?.info({ userId, businessId }, 'Business data deletion completed via GDPR request');

      res.json(successResponse(null, 'Business and all associated data have been permanently deleted'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /privacy/info
   * Get information about data processing (GDPR Articles 13/14)
   */
  async getPrivacyInfo(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    const privacyInfo = {
      data_controller: {
        name: 'ReviewAI',
        contact: 'privacy@reviewai.com',
        dpo: 'dpo@reviewai.com',
      },
      purposes: [
        {
          purpose: 'Provide review generation service',
          legal_basis: 'Contract performance (GDPR Art. 6(1)(b))',
          data_categories: ['Business info', 'QR scan data', 'Review content', 'Usage metrics'],
          retention: '2 years for analytics, 7 years for audit logs',
        },
        {
          purpose: 'Billing and subscription management',
          legal_basis: 'Contract performance (GDPR Art. 6(1)(b))',
          data_categories: ['Business info', 'Payment data (via Stripe)', 'Subscription details'],
          retention: 'Duration of contract + 7 years for tax compliance',
        },
        {
          purpose: 'Security and fraud prevention',
          legal_basis: 'Legitimate interest (GDPR Art. 6(1)(f))',
          data_categories: ['IP addresses', 'User agents', 'Audit logs'],
          retention: '7 years',
        },
        {
          purpose: 'Service improvement and analytics',
          legal_basis: 'Legitimate interest (GDPR Art. 6(1)(f))',
          data_categories: ['Aggregated usage metrics', 'Feature usage'],
          retention: '2 years',
        },
      ],
      subprocessors: [
        { name: 'Supabase', purpose: 'Database, authentication, storage', location: 'EU/US', dpa: true },
        { name: 'Stripe', purpose: 'Payment processing', location: 'US', dpa: true },
        { name: 'OpenAI', purpose: 'AI review generation', location: 'US', dpa: true },
        { name: 'Google (Gemini)', purpose: 'AI review generation (fallback)', location: 'US', dpa: true },
        { name: 'Resend', purpose: 'Transactional email', location: 'US', dpa: true },
        { name: 'Vercel', purpose: 'Frontend hosting', location: 'Global', dpa: true },
      ],
      user_rights: [
        'Right to access (Article 15) - GET /privacy/export',
        'Right to rectification (Article 16) - PATCH /auth/me',
        'Right to erasure (Article 17) - DELETE /privacy/account',
        'Right to restriction of processing (Article 18)',
        'Right to data portability (Article 20) - GET /privacy/export',
        'Right to object (Article 21)',
        'Right to withdraw consent',
        'Right to lodge complaint with supervisory authority',
      ],
      retention_periods: {
        analytics_data: '2 years (partitioned monthly)',
        audit_logs: '7 years (compliance requirement)',
        subscription_data: 'Contract duration + 7 years (tax)',
        user_account: 'Account lifetime + 30 days grace period',
        scan_logs: '2 years (partitioned monthly)',
        review_sessions: '2 years (partitioned monthly)',
      },
      international_transfers: {
        adequacy_decisions: ['US (EU-US Data Privacy Framework for certified companies)'],
        safeguards: ['Standard Contractual Clauses (SCCs)', 'Data Processing Agreements (DPAs)'],
      },
    };

    res.json(successResponse(privacyInfo, 'Privacy information retrieved'));
  }
}