/**
 * Privacy Service - GDPR Compliance
 * Handles data export (Right to Access) and deletion (Right to Erasure)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { AppError, NotFoundError, InternalError, ValidationError } from '../../shared/exceptions';
import { logger, getJobLogger } from '../../shared/logger';

export interface ExportPackage {
  user: {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
    email_verified: boolean;
    last_login_at: string | null;
    created_at: string;
    updated_at: string;
  };
  businesses_owned: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo_url: string | null;
    website_url: string | null;
    phone: string | null;
    address: Record<string, any> | null;
    timezone: string;
    status: string;
    settings: Record<string, any>;
    created_at: string;
    updated_at: string;
  }>;
  business_memberships: Array<{
    id: string;
    business_id: string;
    business_name: string;
    role: string;
    permissions: string[];
    invited_at: string;
    accepted_at: string | null;
  }>;
  subscriptions: Array<{
    id: string;
    business_id: string;
    business_name: string;
    plan_id: string;
    status: string;
    billing_cycle: string;
    price_cents: number;
    currency: string;
    current_period_start: string;
    current_period_end: string;
    created_at: string;
  }>;
  audit_logs: Array<{
    id: string;
    action: string;
    resource_type: string;
    resource_id: string | null;
    old_values: Record<string, any> | null;
    new_values: Record<string, any> | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
  }>;
  review_sessions: Array<{
    id: string;
    business_id: string;
    business_name: string;
    qr_code_id: string;
    language: string;
    rating: number;
    status: string;
    started_at: string;
    completed_at: string | null;
    abandoned_at: string | null;
  }>;
  generated_reviews: Array<{
    id: string;
    session_id: string;
    business_id: string;
    business_name: string;
    language: string;
    rating: number;
    ai_provider: string;
    model: string;
    generated_text: string;
    edited_text: string | null;
    final_text: string;
    regeneration_count: number;
    created_at: string;
  }>;
  scan_logs: Array<{
    id: string;
    qr_code_id: string;
    business_id: string;
    business_name: string;
    ip_address: string | null;
    user_agent: string | null;
    country: string | null;
    city: string | null;
    device_type: string | null;
    browser: string | null;
    os: string | null;
    scanned_at: string;
  }>;
  api_keys: Array<{
    id: string;
    business_id: string;
    business_name: string;
    name: string;
    key_prefix: string;
    scopes: string[];
    last_used_at: string | null;
    expires_at: string | null;
    is_active: boolean;
    created_at: string;
  }>;
}

export class PrivacyService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Export all user data (GDPR Right to Access)
   */
  async exportUserData(userId: string): Promise<ExportPackage> {
    const jobLogger = getJobLogger('privacy:export', { userId });

    try {
      jobLogger.info('Starting user data export');

      // 1. Get user profile
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new NotFoundError('User');
      }

      // 2. Get owned businesses
      const { data: ownedBusinesses, error: businessesError } = await this.supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', userId)
        .is('deleted_at', null);

      if (businessesError) {
        throw new InternalError('Failed to fetch businesses');
      }

      const businessIds = (ownedBusinesses || []).map(b => b.id);

      // 3. Get business memberships
      const { data: memberships, error: membershipsError } = await this.supabase
        .from('business_staff')
        .select(`
          *,
          businesses!inner(id, name, slug)
        `)
        .eq('user_id', userId)
        .not('accepted_at', 'is', null);

      if (membershipsError) {
        throw new InternalError('Failed to fetch memberships');
      }

      // Add membership business IDs
      const membershipBusinessIds = (memberships || [])
        .map(m => m.business_id)
        .filter(id => !businessIds.includes(id));

      const allBusinessIds = [...businessIds, ...membershipBusinessIds];

      // 4. Get subscriptions
      const { data: subscriptions, error: subsError } = await this.supabase
        .from('subscriptions')
        .select(`
          *,
          businesses!inner(id, name)
        `)
        .in('business_id', allBusinessIds.length > 0 ? allBusinessIds : ['00000000-0000-0000-0000-000000000000']);

      if (subsError) {
        throw new InternalError('Failed to fetch subscriptions');
      }

      // 5. Get audit logs
      const { data: auditLogs, error: auditError } = await this.supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10000); // Reasonable limit

      if (auditError) {
        throw new InternalError('Failed to fetch audit logs');
      }

      // 6. Get review sessions (via owned/accessible businesses)
      const { data: reviewSessions, error: sessionsError } = await this.supabase
        .from('review_sessions')
        .select(`
          *,
          qr_codes!inner(
            id,
            business_id,
            businesses!inner(id, name)
          )
        `)
        .in('qr_codes.business_id', allBusinessIds.length > 0 ? allBusinessIds : ['00000000-0000-0000-0000-000000000000']);

      if (sessionsError) {
        throw new InternalError('Failed to fetch review sessions');
      }

      // 7. Get generated reviews
      const { data: generatedReviews, error: reviewsError } = await this.supabase
        .from('generated_reviews')
        .select(`
          *,
          review_sessions!inner(
            id,
            qr_code_id,
            qr_codes!inner(
              business_id,
              businesses!inner(id, name)
            )
          )
        `)
        .in('review_sessions.qr_codes.business_id', allBusinessIds.length > 0 ? allBusinessIds : ['00000000-0000-0000-0000-000000000000']);

      if (reviewsError) {
        throw new InternalError('Failed to fetch generated reviews');
      }

      // 8. Get scan logs
      const { data: scanLogs, error: scansError } = await this.supabase
        .from('scan_logs')
        .select(`
          *,
          qr_codes!inner(
            id,
            business_id,
            businesses!inner(id, name)
          )
        `)
        .in('qr_codes.business_id', allBusinessIds.length > 0 ? allBusinessIds : ['00000000-0000-0000-0000-000000000000'])
        .order('scanned_at', { ascending: false })
        .limit(5000); // Reasonable limit

      if (scansError) {
        throw new InternalError('Failed to fetch scan logs');
      }

      // 9. Get API keys
      const { data: apiKeys, error: apiKeysError } = await this.supabase
        .from('api_keys')
        .select(`
          *,
          businesses!inner(id, name)
        `)
        .in('business_id', allBusinessIds.length > 0 ? allBusinessIds : ['00000000-0000-0000-0000-000000000000'])
        .eq('is_active', true);

      if (apiKeysError) {
        throw new InternalError('Failed to fetch API keys');
      }

      // Build export package
      const exportData: ExportPackage = {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
          role: user.role,
          email_verified: user.email_verified,
          last_login_at: user.last_login_at,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
        businesses_owned: (ownedBusinesses || []).map(b => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          description: b.description,
          logo_url: b.logo_url,
          website_url: b.website_url,
          phone: b.phone,
          address: b.address,
          timezone: b.timezone,
          status: b.status,
          settings: b.settings,
          created_at: b.created_at,
          updated_at: b.updated_at,
        })),
        business_memberships: (memberships || []).map(m => ({
          id: m.id,
          business_id: m.business_id,
          business_name: (m as any).businesses?.name || '',
          role: m.role,
          permissions: m.permissions || [],
          invited_at: m.invited_at,
          accepted_at: m.accepted_at,
        })),
        subscriptions: (subscriptions || []).map(s => ({
          id: s.id,
          business_id: s.business_id,
          business_name: (s as any).businesses?.name || '',
          plan_id: s.plan_id,
          status: s.status,
          billing_cycle: s.billing_cycle,
          price_cents: s.price_cents,
          currency: s.currency,
          current_period_start: s.current_period_start,
          current_period_end: s.current_period_end,
          created_at: s.created_at,
        })),
        audit_logs: (auditLogs || []).map(a => ({
          id: a.id,
          action: a.action,
          resource_type: a.resource_type,
          resource_id: a.resource_id,
          old_values: a.old_values,
          new_values: a.new_values,
          ip_address: a.ip_address,
          user_agent: a.user_agent,
          created_at: a.created_at,
        })),
        review_sessions: (reviewSessions || []).map(s => ({
          id: s.id,
          business_id: (s as any).qr_codes?.businesses?.id || '',
          business_name: (s as any).qr_codes?.businesses?.name || '',
          qr_code_id: s.qr_code_id,
          language: s.language,
          rating: s.rating,
          status: s.status,
          started_at: s.started_at,
          completed_at: s.completed_at,
          abandoned_at: s.abandoned_at,
        })),
        generated_reviews: (generatedReviews || []).map(r => ({
          id: r.id,
          session_id: r.session_id,
          business_id: r.business_id,
          business_name: (r as any).review_sessions?.qr_codes?.businesses?.name || '',
          language: r.language,
          rating: r.rating,
          ai_provider: r.ai_provider,
          model: r.model,
          generated_text: r.generated_text,
          edited_text: r.edited_text,
          final_text: r.final_text,
          regeneration_count: r.regeneration_count,
          created_at: r.created_at,
        })),
        scan_logs: (scanLogs || []).map(s => ({
          id: s.id,
          qr_code_id: s.qr_code_id,
          business_id: (s as any).qr_codes?.businesses?.id || '',
          business_name: (s as any).qr_codes?.businesses?.name || '',
          ip_address: s.ip_address,
          user_agent: s.user_agent,
          country: s.country,
          city: s.city,
          device_type: s.device_type,
          browser: s.browser,
          os: s.os,
          scanned_at: s.scanned_at,
        })),
        api_keys: (apiKeys || []).map(k => ({
          id: k.id,
          business_id: k.business_id,
          business_name: (k as any).businesses?.name || '',
          name: k.name,
          key_prefix: k.key_prefix,
          scopes: k.scopes || [],
          last_used_at: k.last_used_at,
          expires_at: k.expires_at,
          is_active: k.is_active,
          created_at: k.created_at,
        })),
      };

      jobLogger.info({
        businessesCount: exportData.businesses_owned.length,
        membershipsCount: exportData.business_memberships.length,
        auditLogsCount: exportData.audit_logs.length,
        sessionsCount: exportData.review_sessions.length,
        reviewsCount: exportData.generated_reviews.length,
        scansCount: exportData.scan_logs.length,
      }, 'User data export completed');

      return exportData;

    } catch (error) {
      jobLogger.error({ err: error }, 'User data export failed');
      throw error;
    }
  }

  /**
   * Delete user account and all associated data (GDPR Right to Erasure)
   * Uses soft deletes where possible, anonymizes audit logs
   */
  async deleteUserAccount(userId: string): Promise<void> {
    const jobLogger = getJobLogger('privacy:delete', { userId });

    try {
      jobLogger.info('Starting user account deletion');

      // CRITICAL SECURITY RULE: No one can delete an admin account under any circumstances
      const { data: targetUser } = await this.supabase
        .from('users')
        .select('id, role, email')
        .eq('id', userId)
        .single();

      if (targetUser && (targetUser.role === 'admin' || targetUser.email === 'thelastminuteprojectsss@gmail.com')) {
        jobLogger.warn({ userId }, 'Attempted deletion of admin account was strictly blocked');
        throw new ValidationError('Admin accounts cannot be deleted');
      }

      // 1. Get user's owned businesses
      const { data: ownedBusinesses, error: businessesError } = await this.supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', userId)
        .is('deleted_at', null);

      if (businessesError) {
        throw new InternalError('Failed to fetch businesses for deletion');
      }

      const businessIds = (ownedBusinesses || []).map(b => b.id);

      // 2. Get business memberships
      const { data: memberships, error: membershipsError } = await this.supabase
        .from('business_staff')
        .select('business_id')
        .eq('user_id', userId)
        .not('accepted_at', 'is', null);

      if (membershipsError) {
        throw new InternalError('Failed to fetch memberships for deletion');
      }

      const membershipBusinessIds = (memberships || []).map(m => m.business_id);
      const allBusinessIds = [...new Set([...businessIds, ...membershipBusinessIds])];

      // 3. Soft delete owned businesses (cascades to related data via RLS/service layer)
      for (const businessId of businessIds) {
        const { error: deleteError } = await this.supabase
          .from('businesses')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', businessId);

        if (deleteError) {
          throw new InternalError(`Failed to delete business ${businessId}`);
        }
      }

      // 4. Remove user from business staff (hard delete for memberships)
      const { error: staffDeleteError } = await this.supabase
        .from('business_staff')
        .delete()
        .eq('user_id', userId);

      if (staffDeleteError) {
        throw new InternalError('Failed to remove business memberships');
      }

      // 5. Anonymize audit logs (set user_id to null, keep action for compliance)
      const { error: auditAnonymizeError } = await this.supabase
        .from('audit_logs')
        .update({
          user_id: null,
          business_id: null,
          metadata: { anonymized: true, original_user_id: userId, anonymized_at: new Date().toISOString() },
        })
        .eq('user_id', userId);

      if (auditAnonymizeError) {
        throw new InternalError('Failed to anonymize audit logs');
      }

      // 6. Delete user's API keys
      const { error: apiKeysError } = await this.supabase
        .from('api_keys')
        .delete()
        .eq('created_by', userId);

      if (apiKeysError) {
        throw new InternalError('Failed to delete API keys');
      }

      // 7. Soft delete user account
      const { error: userDeleteError } = await this.supabase
        .from('users')
        .update({
          deleted_at: new Date().toISOString(),
          email: `deleted_${userId}@deleted.local`,
          full_name: 'Deleted User',
          avatar_url: null,
        })
        .eq('id', userId);

      if (userDeleteError) {
        throw new InternalError('Failed to delete user account');
      }

      // 8. Log deletion in audit (with admin context if available)
      await this.supabase.rpc('log_audit_action', {
        p_action: 'user.account_deleted_gdpr',
        p_resource_type: 'user',
        p_resource_id: userId,
        p_old_values: { deleted_via_gdpr: true },
        p_new_values: { deleted_via_gdpr: true, deleted_at: new Date().toISOString() },
      });

      jobLogger.info({
        businessesDeleted: businessIds.length,
        membershipsRemoved: membershipBusinessIds.length,
      }, 'User account deletion completed');

    } catch (error) {
      jobLogger.error({ err: error }, 'User account deletion failed');
      throw error;
    }
  }

  /**
   * Delete business data (for business owner)
   */
  async deleteBusinessData(businessId: string, userId: string): Promise<void> {
    const jobLogger = getJobLogger('privacy:delete-business', { userId, businessId });

    try {
      jobLogger.info('Starting business data deletion');

      // Verify ownership
      const { data: business, error: bizError } = await this.supabase
        .from('businesses')
        .select('id, owner_id')
        .eq('id', businessId)
        .single();

      if (bizError || !business) {
        throw new NotFoundError('Business');
      }

      if (business.owner_id !== userId) {
        throw new AppError('Only business owner can delete business data', 403, 'FORBIDDEN');
      }

      // Soft delete business
      const { error: deleteError } = await this.supabase
        .from('businesses')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', businessId);

      if (deleteError) {
        throw new InternalError('Failed to delete business');
      }

      // Anonymize related audit logs
      await this.supabase
        .from('audit_logs')
        .update({
          business_id: null,
          metadata: { anonymized: true, original_business_id: businessId, anonymized_at: new Date().toISOString() },
        })
        .eq('business_id', businessId);

      // Log deletion
      await this.supabase.rpc('log_audit_action', {
        p_action: 'business.deleted_gdpr',
        p_resource_type: 'business',
        p_resource_id: businessId,
        p_old_values: { deleted_via_gdpr: true },
        p_new_values: { deleted_via_gdpr: true, deleted_at: new Date().toISOString() },
      });

      jobLogger.info('Business data deletion completed');

    } catch (error) {
      jobLogger.error({ err: error }, 'Business data deletion failed');
      throw error;
    }
  }
}