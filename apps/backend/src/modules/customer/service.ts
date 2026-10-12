/**
 * Customer Module Service
 * ReviewAI SaaS Platform
 * 
 * Handles Customer CRUD, search, filtering, pagination,
 * business_id tenant isolation, permission verification, and audit logging.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/logger';
import {
  Customer,
  CreateCustomerDTO,
  UpdateCustomerDTO,
  CustomerListQuery,
  CustomerListResponse,
  CreateCustomerSchema,
  UpdateCustomerSchema,
} from './types';
import { AppError, NotFoundError, AuthorizationError, ValidationError } from '../../shared/exceptions';

export class CustomerService {
  constructor(private supabase: SupabaseClient = supabaseAdmin) {}

  /**
   * Check user permissions for a business:
   * - Admin: full access
   * - Business Owner (owner of business or business_owner role): full access
   * - Manager: view, create, edit allowed
   * - Member/Viewer: view allowed (or explicit permissions in business_staff)
   */
  async verifyBusinessAccess(
    businessId: string,
    userId: string,
    userRole: string,
    requiredPermission: 'customers.view' | 'customers.create' | 'customers.edit' | 'customers.delete'
  ): Promise<void> {
    // 1. Platform Admin has unrestricted access
    if (userRole === 'admin') {
      return;
    }

    // 2. Fetch business to verify ownership
    const { data: business, error: bizError } = (await this.supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', businessId)
      .single()) as any;

    if (bizError || !business) {
      throw new NotFoundError('Business not found');
    }

    if (business.owner_id === userId) {
      return; // Business owner has full permissions
    }

    // 3. Check staff membership in business_staff
    const { data: staffMember, error: staffError } = (await this.supabase
      .from('business_staff')
      .select('role, permissions, accepted_at')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .not('accepted_at', 'is', null)
      .maybeSingle()) as any;

    if (staffError || !staffMember) {
      throw new AuthorizationError('Access denied: User is not authorized for this business');
    }

    const staffRole = staffMember.role; // 'owner' | 'admin' | 'manager' | 'member' | 'viewer'
    const customPermissions: string[] = Array.isArray(staffMember.permissions) ? staffMember.permissions : [];

    // Check custom permissions first if explicitly granted
    if (customPermissions.includes(requiredPermission) || customPermissions.includes('customers:*')) {
      return;
    }

    // Staff role-based defaults:
    if (staffRole === 'owner' || staffRole === 'admin') {
      return; // Full access
    }

    if (staffRole === 'manager') {
      if (
        requiredPermission === 'customers.view' ||
        requiredPermission === 'customers.create' ||
        requiredPermission === 'customers.edit'
      ) {
        return;
      }
      // Manager cannot delete customers unless explicitly granted
      throw new AuthorizationError('Insufficient permissions: Managers cannot delete customers without explicit permission');
    }

    if (staffRole === 'member' || staffRole === 'viewer') {
      if (requiredPermission === 'customers.view') {
        return;
      }
      throw new AuthorizationError(`Insufficient permissions: ${staffRole}s can only view customers`);
    }

    throw new AuthorizationError('Access denied: insufficient customer permission');
  }

  /**
   * Helper to write audit log entries
   */
  private async recordAudit(
    businessId: string,
    userId: string,
    action: string,
    customerId: string,
    oldValues?: any,
    newValues?: any
  ): Promise<void> {
    try {
      await this.supabase.from('audit_logs').insert({
        business_id: businessId,
        user_id: userId,
        action,
        resource_type: 'customer',
        resource_id: customerId,
        old_values: oldValues || null,
        new_values: newValues || null,
        created_at: new Date().toISOString(),
      });
    } catch (e: any) {
      logger.warn('Failed to insert customer audit log:', e?.message || e);
    }
  }

  /**
   * Internal helper: check if Supabase has the `customers` table
   */
  private async isCustomersTableAvailable(): Promise<boolean> {
    try {
      const { error } = await this.supabase.from('customers').select('id').limit(1);
      if (error && error.code === 'PGRST205') {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Internal helper: get customers from business.settings fallback
   */
  private async getFallbackCustomers(businessId: string): Promise<Customer[]> {
    const { data: business } = (await this.supabase
      .from('businesses')
      .select('settings')
      .eq('id', businessId)
      .single()) as any;

    const list: Customer[] = (business?.settings as any)?.customers || [];
    return list;
  }

  /**
   * Internal helper: save customers to business.settings fallback
   */
  private async saveFallbackCustomers(businessId: string, customers: Customer[]): Promise<void> {
    const { data: business } = (await this.supabase
      .from('businesses')
      .select('settings')
      .eq('id', businessId)
      .single()) as any;

    const settings = {
      ...(business?.settings || {}),
      customers,
    };

    await this.supabase
      .from('businesses')
      .update({ settings })
      .eq('id', businessId);
  }

  /**
   * Create a new customer
   */
  async createCustomer(
    businessId: string,
    data: CreateCustomerDTO,
    userId: string,
    userRole: string
  ): Promise<Customer> {
    // 1. Authorize permission
    await this.verifyBusinessAccess(businessId, userId, userRole, 'customers.create');

    // 2. Validate input schema
    const validation = CreateCustomerSchema.safeParse(data);
    if (!validation.success) {
      throw new ValidationError(validation.error.errors.map(e => e.message).join(', '));
    }

    const validData = validation.data;
    const now = new Date().toISOString();
    const customerId = uuidv4();

    const newCustomer: Customer = {
      id: customerId,
      business_id: businessId,
      name: validData.name,
      phone: validData.phone,
      email: validData.email.toLowerCase(),
      company_name: validData.company_name || null,
      gst_tax_id: validData.gst_tax_id || null,
      billing_address: validData.billing_address || null,
      shipping_address: validData.shipping_address || null,
      notes: validData.notes || null,
      status: validData.status || 'active',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    const tableAvailable = await this.isCustomersTableAvailable();
    if (tableAvailable) {
      const { data: inserted, error } = await this.supabase
        .from('customers')
        .insert({
          id: newCustomer.id,
          business_id: newCustomer.business_id,
          name: newCustomer.name,
          phone: newCustomer.phone,
          email: newCustomer.email,
          company_name: newCustomer.company_name,
          gst_tax_id: newCustomer.gst_tax_id,
          billing_address: newCustomer.billing_address,
          shipping_address: newCustomer.shipping_address,
          notes: newCustomer.notes,
          status: newCustomer.status,
          created_at: newCustomer.created_at,
          updated_at: newCustomer.updated_at,
        })
        .select()
        .single();

      if (error) {
        throw new AppError(`Failed to create customer: ${error.message}`, 400, 'CREATE_CUSTOMER_FAILED');
      }
    } else {
      // Fallback to business settings
      const list = await this.getFallbackCustomers(businessId);
      list.unshift(newCustomer);
      await this.saveFallbackCustomers(businessId, list);
    }

    // 3. Record audit log
    await this.recordAudit(businessId, userId, 'customer.created', newCustomer.id, null, newCustomer);

    return newCustomer;
  }

  /**
   * List customers with search, status filtering, and pagination
   */
  async listCustomers(
    businessId: string,
    query: CustomerListQuery,
    userId: string,
    userRole: string
  ): Promise<CustomerListResponse> {
    await this.verifyBusinessAccess(businessId, userId, userRole, 'customers.view');

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const search = (query.search || '').trim().toLowerCase();
    const status = query.status || 'all';

    const tableAvailable = await this.isCustomersTableAvailable();

    if (tableAvailable) {
      let q = this.supabase
        .from('customers')
        .select('*', { count: 'exact' })
        .eq('business_id', businessId)
        .is('deleted_at', null);

      if (status !== 'all') {
        q = q.eq('status', status);
      }

      if (search) {
        q = q.or(
          `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,company_name.ilike.%${search}%`
        );
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, count, error } = await q
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        throw new AppError(`Failed to fetch customers: ${error.message}`, 400, 'FETCH_CUSTOMERS_FAILED');
      }

      const total = count || 0;
      const total_pages = Math.ceil(total / limit) || 1;

      return {
        data: (data as Customer[]) || [],
        meta: {
          total,
          page,
          limit,
          total_pages,
          has_next: page < total_pages,
          has_prev: page > 1,
        },
      };
    } else {
      // Fallback
      let all = await this.getFallbackCustomers(businessId);
      // Filter out deleted
      all = all.filter(c => !c.deleted_at);

      if (status !== 'all') {
        all = all.filter(c => c.status === status);
      }

      if (search) {
        all = all.filter(c => 
          (c.name && c.name.toLowerCase().includes(search)) ||
          (c.email && c.email.toLowerCase().includes(search)) ||
          (c.phone && c.phone.toLowerCase().includes(search)) ||
          (c.company_name && c.company_name.toLowerCase().includes(search))
        );
      }

      const total = all.length;
      const total_pages = Math.ceil(total / limit) || 1;
      const start = (page - 1) * limit;
      const paginated = all.slice(start, start + limit);

      return {
        data: paginated,
        meta: {
          total,
          page,
          limit,
          total_pages,
          has_next: page < total_pages,
          has_prev: page > 1,
        },
      };
    }
  }

  /**
   * Get single customer by ID with tenant isolation verification
   */
  async getCustomerById(
    businessId: string,
    customerId: string,
    userId: string,
    userRole: string,
    includeDeleted: boolean = false
  ): Promise<Customer> {
    await this.verifyBusinessAccess(businessId, userId, userRole, 'customers.view');

    const tableAvailable = await this.isCustomersTableAvailable();
    let customer: Customer | null = null;

    if (tableAvailable) {
      let q = this.supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .eq('business_id', businessId);

      if (!includeDeleted) {
        q = q.is('deleted_at', null);
      }

      const { data, error } = await q.maybeSingle();

      if (error) {
        throw new AppError(`Error fetching customer: ${error.message}`, 400, 'FETCH_CUSTOMER_FAILED');
      }
      customer = data as Customer;
    } else {
      const list = await this.getFallbackCustomers(businessId);
      customer = list.find(c => c.id === customerId && (includeDeleted || !c.deleted_at)) || null;
    }

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    // Strict cross-business check
    if (customer.business_id !== businessId) {
      throw new AuthorizationError('Access denied: customer belongs to another business');
    }

    return customer;
  }

  /**
   * Update an existing customer
   */
  async updateCustomer(
    businessId: string,
    customerId: string,
    data: UpdateCustomerDTO,
    userId: string,
    userRole: string
  ): Promise<Customer> {
    await this.verifyBusinessAccess(businessId, userId, userRole, 'customers.edit');

    const validation = UpdateCustomerSchema.safeParse(data);
    if (!validation.success) {
      throw new ValidationError(validation.error.errors.map(e => e.message).join(', '));
    }

    const existing = await this.getCustomerById(businessId, customerId, userId, userRole);
    const validData = validation.data;
    const now = new Date().toISOString();

    const updated: Customer = {
      ...existing,
      name: validData.name !== undefined ? validData.name : existing.name,
      phone: validData.phone !== undefined ? validData.phone : existing.phone,
      email: validData.email !== undefined ? validData.email.toLowerCase() : existing.email,
      company_name: validData.company_name !== undefined ? validData.company_name : existing.company_name,
      gst_tax_id: validData.gst_tax_id !== undefined ? validData.gst_tax_id : existing.gst_tax_id,
      billing_address: validData.billing_address !== undefined ? validData.billing_address : existing.billing_address,
      shipping_address: validData.shipping_address !== undefined ? validData.shipping_address : existing.shipping_address,
      notes: validData.notes !== undefined ? validData.notes : existing.notes,
      status: validData.status !== undefined ? validData.status : existing.status,
      updated_at: now,
    };

    const tableAvailable = await this.isCustomersTableAvailable();
    if (tableAvailable) {
      const { error } = await this.supabase
        .from('customers')
        .update({
          name: updated.name,
          phone: updated.phone,
          email: updated.email,
          company_name: updated.company_name,
          gst_tax_id: updated.gst_tax_id,
          billing_address: updated.billing_address,
          shipping_address: updated.shipping_address,
          notes: updated.notes,
          status: updated.status,
          updated_at: updated.updated_at,
        })
        .eq('id', customerId)
        .eq('business_id', businessId);

      if (error) {
        throw new AppError(`Failed to update customer: ${error.message}`, 400, 'UPDATE_CUSTOMER_FAILED');
      }
    } else {
      const list = await this.getFallbackCustomers(businessId);
      const idx = list.findIndex(c => c.id === customerId);
      if (idx !== -1) {
        list[idx] = updated;
        await this.saveFallbackCustomers(businessId, list);
      }
    }

    // Determine audit action
    const action = validData.status === 'inactive' && existing.status === 'active'
      ? 'customer.deactivated'
      : 'customer.updated';

    await this.recordAudit(businessId, userId, action, customerId, existing, updated);

    return updated;
  }

  /**
   * Delete or deactivate a customer:
   * Rule: Prefer deactivate over permanent deletion when customer has related records
   */
  async deleteCustomer(
    businessId: string,
    customerId: string,
    userId: string,
    userRole: string,
    options: { permanent?: boolean } = {}
  ): Promise<{ success: boolean; deactivated: boolean }> {
    await this.verifyBusinessAccess(businessId, userId, userRole, 'customers.delete');

    const existing = await this.getCustomerById(businessId, customerId, userId, userRole);
    const now = new Date().toISOString();

    // Check if customer has related records (in future: orders, invoices, reviews)
    // In our architecture, default to soft deactivate unless permanently requested
    const shouldDeactivate = !options.permanent;

    const tableAvailable = await this.isCustomersTableAvailable();

    if (shouldDeactivate) {
      // Soft deactivate
      if (tableAvailable) {
        await this.supabase
          .from('customers')
          .update({
            status: 'inactive',
            updated_at: now,
          })
          .eq('id', customerId)
          .eq('business_id', businessId);
      } else {
        const list = await this.getFallbackCustomers(businessId);
        const idx = list.findIndex(c => c.id === customerId);
        if (idx !== -1) {
          list[idx].status = 'inactive';
          list[idx].updated_at = now;
          await this.saveFallbackCustomers(businessId, list);
        }
      }

      await this.recordAudit(businessId, userId, 'customer.deactivated', customerId, existing, {
        status: 'inactive',
      });

      return { success: true, deactivated: true };
    } else {
      // Permanent delete
      if (tableAvailable) {
        await this.supabase
          .from('customers')
          .delete()
          .eq('id', customerId)
          .eq('business_id', businessId);
      } else {
        const list = await this.getFallbackCustomers(businessId);
        const filtered = list.filter(c => c.id !== customerId);
        await this.saveFallbackCustomers(businessId, filtered);
      }

      await this.recordAudit(businessId, userId, 'customer.deleted', customerId, existing, null);

      return { success: true, deactivated: false };
    }
  }

  /**
   * Toggle status between active and inactive
   */
  async toggleStatus(
    businessId: string,
    customerId: string,
    userId: string,
    userRole: string
  ): Promise<Customer> {
    const existing = await this.getCustomerById(businessId, customerId, userId, userRole);
    const newStatus = existing.status === 'active' ? 'inactive' : 'active';
    return this.updateCustomer(businessId, customerId, { status: newStatus }, userId, userRole);
  }
}
