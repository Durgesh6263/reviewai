/**
 * Customer Module Controller
 * ReviewAI SaaS Platform
 */

import { Request, Response, NextFunction } from 'express';
import { CustomerService } from './service';
import { AuthenticatedRequest } from '../auth/middleware';
import { AppError } from '../../shared/exceptions';
import { ApiResponse } from '../../shared/utils/apiResponse';
import { supabaseAdmin } from '../../config/supabase';

export class CustomerController {
  constructor(private customerService: CustomerService) {}

  /**
   * Helper to resolve active businessId from params, query, body, or user's primary business
   */
  private async resolveBusinessId(req: AuthenticatedRequest): Promise<string> {
    const fromReq = req.params.businessId || req.query.business_id || req.body.business_id;
    if (typeof fromReq === 'string' && fromReq.trim()) {
      return fromReq.trim();
    }

    const userId = req.user!.sub;

    // Look for business owned by user
    const { data: ownedBiz } = (await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)
      .maybeSingle()) as any;

    if (ownedBiz?.id) {
      return ownedBiz.id;
    }

    // Look for staff business
    const { data: staffBiz } = (await supabaseAdmin
      .from('business_staff')
      .select('business_id')
      .eq('user_id', userId)
      .not('accepted_at', 'is', null)
      .limit(1)
      .maybeSingle()) as any;

    if (staffBiz?.business_id) {
      return staffBiz.business_id;
    }

    // If admin and no business, find first business in DB
    if (req.user!.role === 'admin') {
      const { data: anyBiz } = (await supabaseAdmin
        .from('businesses')
        .select('id')
        .limit(1)
        .maybeSingle()) as any;
      if (anyBiz?.id) return anyBiz.id;
    }

    throw new AppError('Business ID is required', 400, 'BUSINESS_ID_REQUIRED');
  }

  /**
   * POST /customers or POST /businesses/:businessId/customers
   */
  createCustomer = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const businessId = await this.resolveBusinessId(req);

      const customer = await this.customerService.createCustomer(
        businessId,
        req.body,
        userId,
        userRole
      );

      res.status(201).json({
        success: true,
        data: customer,
        message: 'Customer created successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /customers or GET /businesses/:businessId/customers
   */
  listCustomers = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const businessId = await this.resolveBusinessId(req);

      const query = {
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 10,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        status: (req.query.status as any) || 'all',
        business_id: businessId,
      };

      const result = await this.customerService.listCustomers(
        businessId,
        query,
        userId,
        userRole
      );

      res.json({
        success: true,
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /customers/:id or GET /businesses/:businessId/customers/:id
   */
  getCustomer = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const { id } = req.params;
      const businessId = await this.resolveBusinessId(req);

      const customer = await this.customerService.getCustomerById(
        businessId,
        id,
        userId,
        userRole
      );

      res.json({
        success: true,
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /customers/:id or PATCH /businesses/:businessId/customers/:id
   */
  updateCustomer = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const { id } = req.params;
      const businessId = await this.resolveBusinessId(req);

      const updated = await this.customerService.updateCustomer(
        businessId,
        id,
        req.body,
        userId,
        userRole
      );

      res.json({
        success: true,
        data: updated,
        message: 'Customer updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /customers/:id or DELETE /businesses/:businessId/customers/:id
   */
  deleteCustomer = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const { id } = req.params;
      const businessId = await this.resolveBusinessId(req);
      const permanent = req.query.permanent === 'true';

      const result = await this.customerService.deleteCustomer(
        businessId,
        id,
        userId,
        userRole,
        { permanent }
      );

      res.json({
        success: true,
        data: result,
        message: result.deactivated
          ? 'Customer deactivated successfully'
          : 'Customer permanently deleted',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /customers/:id/toggle-status
   */
  toggleStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const { id } = req.params;
      const businessId = await this.resolveBusinessId(req);

      const updated = await this.customerService.toggleStatus(
        businessId,
        id,
        userId,
        userRole
      );

      res.json({
        success: true,
        data: updated,
        message: `Customer marked as ${updated.status}`,
      });
    } catch (error) {
      next(error);
    }
  };
}
