/**
 * QR Module Service
 * ReviewAI SaaS Platform
 * Core business logic for QR code management and routing
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  QRCode,
  CreateQRCodeRequest,
  UpdateQRCodeRequest,
  QRCodeWithStats,
  QRCodeListParams,
  QRCodeListResponse,
  QRScanRequest,
  QRScanResponse,
  QR_CONSTANTS,
} from './types';
import { AppError, NotFoundError, ConflictError, AuthorizationError } from '../../shared/exceptions';
import { parsePaginationParams, buildPaginationMeta } from '../../shared/utils/pagination';

export class QRService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a new QR code for a business
   */
  async createQRCode(
    businessId: string,
    userId: string,
    userRole: string,
    data: any
  ): Promise<QRCode> {
    // Verify business access
    await this.verifyBusinessAccess(businessId, userId, userRole, ['owner', 'admin', 'manager']);

    // Verify onboarding duplicate protection
    const { data: progress } = await this.supabase
      .from('onboarding_progress')
      .select('step_data')
      .eq('user_id', userId)
      .maybeSingle();

    if ((progress?.step_data as any)?.duplicate_blocked?.is_blocked) {
      throw new AppError(
        'Cannot generate QR code: duplicate business registration is blocked.',
        403,
        'DUPLICATE_BUSINESS_BLOCKED'
      );
    }

    const businessSlug = await this.getBusinessSlug(businessId);
    const rawBase = data.slug || `${businessSlug}-${Date.now().toString(36)}`;
    const baseSlug = rawBase
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');

    // Ensure slug is unique across all qr_codes
    let uniqueSlug = baseSlug;
    let attempts = 0;
    while (attempts < 5) {
      const { data: existingQR } = await this.supabase
        .from('qr_codes')
        .select('id')
        .eq('slug', uniqueSlug)
        .maybeSingle();
      if (!existingQR) break;
      attempts++;
      uniqueSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
    }

    const googleReviewUrl = (data.google_review_url || data.design?.google_review_url || '').trim();

    const qrData = {
      business_id: businessId,
      slug: uniqueSlug,
      label: data.name || data.label || 'Location QR',
      design: {
        ...QR_CONSTANTS.DEFAULT_DESIGN,
        ...data.design,
        google_review_url: googleReviewUrl || null,
      },
      is_active: true,
    };

    const { data: qrCode, error } = await this.supabase
      .from('qr_codes')
      .insert(qrData)
      .select()
      .single();

    if (error || !qrCode) {
      console.error('Failed to insert qr_code:', error);
      throw new AppError('Failed to create QR code: ' + (error?.message || 'Database error'), 500, 'QR_CREATION_FAILED');
    }

    // Sync google_review_url with business if business does not have one set yet
    if (googleReviewUrl) {
      try {
        await this.supabase
          .from('businesses')
          .update({ google_review_url: googleReviewUrl })
          .eq('id', businessId)
          .is('google_review_url', null);
      } catch (err) {
        console.warn('Failed to update business default google_review_url:', err);
      }
    }

    // Log audit
    try {
      await this.logAudit(userId, businessId, 'qr.created', 'qr_code', qrCode.id, null, qrCode);
    } catch {}

    return qrCode;
  }

  /**
   * Get QR code by ID
   */
  async getQRCodeById(
    businessId: string,
    qrCodeId: string,
    userId: string,
    userRole: string
  ): Promise<QRCode> {
    await this.verifyBusinessAccess(businessId, userId, userRole);

    const { data: qrCode, error } = await this.supabase
      .from('qr_codes')
      .select('*')
      .eq('id', qrCodeId)
      .eq('business_id', businessId)
      .single();

    if (error || !qrCode) {
      throw new NotFoundError('QR Code');
    }

    return qrCode;
  }

  /**
   * Get QR code by slug or identifier (public - for QR routing)
   * Resolves via:
   * 1. qr_codes.slug (exact, decoded, hyphenated, lowercase)
   * 2. qr_codes.id (if UUID)
   * 3. businesses.slug (resolves business and active QR)
   * 4. businesses.id (if UUID)
   * 5. Prefix match on business slug
   */
  async getQRCodeBySlug(slug: string): Promise<(QRCode & { businesses?: any }) | null> {
    if (!slug) return null;

    const raw = slug.trim();
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw).trim();
    } catch {}

    const hyphenated = decoded.toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');
    const rawHyphenated = raw.toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded);

    // Candidates to query in qr_codes.slug
    const candidates = Array.from(new Set([
      hyphenated,
      decoded,
      raw,
      rawHyphenated,
      decoded.toLowerCase(),
      raw.toLowerCase(),
    ])).filter(Boolean);

    let qrCode: any = null;

    // 1. Try finding qr_code by slug in candidates
    const { data: qrBySlug } = await this.supabase
      .from('qr_codes')
      .select('*')
      .in('slug', candidates)
      .limit(1)
      .maybeSingle();

    if (qrBySlug) {
      qrCode = qrBySlug;
    }

    // 2. Try finding qr_code by id if UUID
    if (!qrCode && isUuid) {
      const { data: qrById } = await this.supabase
        .from('qr_codes')
        .select('*')
        .eq('id', decoded)
        .maybeSingle();
      if (qrById) qrCode = qrById;
    }

    // 3. Try finding qr_code with ILIKE match
    if (!qrCode && hyphenated.length > 2) {
      const { data: qrByIlike } = await this.supabase
        .from('qr_codes')
        .select('*')
        .ilike('slug', hyphenated)
        .limit(1)
        .maybeSingle();
      if (qrByIlike) qrCode = qrByIlike;
    }

    // If a qrCode was found, fetch its associated business
    if (qrCode) {
      const { data: business } = await this.supabase
        .from('businesses')
        .select('*')
        .eq('id', qrCode.business_id)
        .is('deleted_at', null)
        .maybeSingle();

      if (business) {
        return {
          ...qrCode,
          businesses: business,
        };
      }
    }

    // 4. Fallback: Lookup by business directly (e.g. /r/the-fitness-world or /r/the fitness world)
    let business: any = null;

    const { data: bizBySlug } = await this.supabase
      .from('businesses')
      .select('*')
      .in('slug', candidates)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (bizBySlug) {
      business = bizBySlug;
    }

    // Check business by UUID if applicable
    if (!business && isUuid) {
      const { data: bizById } = await this.supabase
        .from('businesses')
        .select('*')
        .eq('id', decoded)
        .is('deleted_at', null)
        .maybeSingle();
      if (bizById) business = bizById;
    }

    // Check business by ILIKE slug
    if (!business && hyphenated.length > 2) {
      const { data: bizByIlike } = await this.supabase
        .from('businesses')
        .select('*')
        .ilike('slug', hyphenated)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (bizByIlike) business = bizByIlike;
    }

    // 5. Prefix match: if slug has random suffix, e.g. "the-fitness-world-mubno2p8"
    // and qr_code was missing, match business "the-fitness-world"
    if (!business && hyphenated.includes('-')) {
      const prefixSlug = hyphenated.replace(/-[a-z0-9]{4,10}$/i, '');
      if (prefixSlug && prefixSlug !== hyphenated) {
        const { data: bizByPrefix } = await this.supabase
          .from('businesses')
          .select('*')
          .eq('slug', prefixSlug)
          .is('deleted_at', null)
          .maybeSingle();
        if (bizByPrefix) business = bizByPrefix;
      }
    }

    // If business was found directly, find its active QR code
    if (business) {
      const { data: activeQR } = await this.supabase
        .from('qr_codes')
        .select('*')
        .eq('business_id', business.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeQR) {
        return {
          ...activeQR,
          businesses: business,
        };
      }

      // If no QR code exists yet, return synthetic QR code linking to this business
      return {
        id: `virtual-${business.id}`,
        business_id: business.id,
        slug: business.slug,
        label: `${business.name} Review QR`,
        design: {
          primary_color: business.settings?.primary_color || '#2563EB',
          google_review_url: business.google_review_url,
        },
        download_count: 0,
        last_downloaded_at: null,
        is_active: true,
        created_at: business.created_at,
        updated_at: business.updated_at,
        businesses: business,
      } as any;
    }

    return null;
  }

  /**
   * Update QR code
   */
  async updateQRCode(
    businessId: string,
    qrCodeId: string,
    userId: string,
    userRole: string,
    data: UpdateQRCodeRequest
  ): Promise<QRCode> {
    await this.verifyBusinessAccess(businessId, userId, userRole, ['owner', 'admin', 'manager']);

    // Don't allow slug changes (permanent QR requirement)
    const updateData: any = { ...data };
    delete updateData.slug;

    if (data.google_review_url !== undefined || data.design) {
      const { data: existingQR } = await this.supabase
        .from('qr_codes')
        .select('design')
        .eq('id', qrCodeId)
        .single();

      const mergedDesign = {
        ...(existingQR?.design || {}),
        ...(data.design || {}),
      };

      if (data.google_review_url !== undefined) {
        mergedDesign.google_review_url = data.google_review_url ? data.google_review_url.trim() : null;
      }
      updateData.design = mergedDesign;
      delete updateData.google_review_url;
    }

    const { data: qrCode, error } = await this.supabase
      .from('qr_codes')
      .update(updateData)
      .eq('id', qrCodeId)
      .eq('business_id', businessId)
      .select()
      .single();

    if (error || !qrCode) {
      throw new NotFoundError('QR Code');
    }

    // Log audit
    await this.logAudit(userId, businessId, 'qr.updated', 'qr_code', qrCodeId, null, updateData);

    return qrCode;
  }

  /**
   * Delete QR code (soft delete - deactivate)
   */
  async deleteQRCode(
    businessId: string,
    qrCodeId: string,
    userId: string,
    userRole: string
  ): Promise<void> {
    await this.verifyBusinessAccess(businessId, userId, userRole, ['owner', 'admin']);

    const { data: qrCode } = await this.supabase
      .from('qr_codes')
      .select('id')
      .eq('id', qrCodeId)
      .eq('business_id', businessId)
      .single();

    if (!qrCode) {
      throw new NotFoundError('QR Code');
    }

    const { error } = await this.supabase
      .from('qr_codes')
      .update({ is_active: false })
      .eq('id', qrCodeId);

    if (error) {
      throw new AppError('Failed to deactivate QR code', 500, 'QR_DEACTIVATION_FAILED');
    }

    // Log audit
    await this.logAudit(userId, businessId, 'qr.deleted', 'qr_code', qrCodeId, { is_active: true }, { is_active: false });
  }

  /**
   * List QR codes for a business
   */
  async listQRCodes(
    businessId: string,
    userId: string,
    userRole: string,
    params: QRCodeListParams
  ): Promise<QRCodeListResponse> {
    await this.verifyBusinessAccess(businessId, userId, userRole);

    const { page, limit, offset, sort, order } = parsePaginationParams(params);

    let query = this.supabase
      .from('qr_codes')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId);

    if (params.is_active !== undefined) {
      query = query.eq('is_active', params.is_active);
    }

    if (params.search) {
      query = query.ilike('label', `%${params.search}%`);
    }

    const allowedSortFields = ['created_at', 'label', 'download_count'];
    const sortField = allowedSortFields.includes(sort ?? 'created_at') ? (sort ?? 'created_at') : 'created_at';
    query = query.order(sortField, { ascending: (order ?? 'desc') === 'asc' });

    query = query.range(offset, offset + limit - 1);

    const { data: qrCodes, error, count } = await query;

    if (error) {
      throw new AppError('Failed to list QR codes', 500, 'QR_LIST_FAILED');
    }

    return {
      qr_codes: qrCodes || [],
      meta: buildPaginationMeta(page, limit, count || 0),
    };
  }

  /**
   * Get QR code with statistics
   */
  async getQRCodeWithStats(
    businessId: string,
    qrCodeId: string,
    userId: string,
    userRole: string
  ): Promise<QRCodeWithStats> {
    const qrCode = await this.getQRCodeById(businessId, qrCodeId, userId, userRole);
    const stats = await this.getQRCodeStats(qrCodeId);

    return { ...qrCode, stats };
  }

  /**
   * Handle QR code scan (public endpoint)
   */
  async handleScan(slug: string, scanData: QRScanRequest): Promise<QRScanResponse> {
    // Get QR code with business info
    const qrCode = await this.getQRCodeBySlug(slug);

    if (!qrCode) {
      throw new NotFoundError('QR Code');
    }

    // Check subscription limits for QR scans
    await this.checkQrScanLimit(qrCode.business_id);

    // Ingest scan log using database function
    const { data: scanId, error: scanError } = await this.supabase.rpc('ingest_scan_log', {
      p_qr_code_id: qrCode.id,
      p_ip_address: scanData.ip_address,
      p_user_agent: scanData.user_agent,
      p_referrer: scanData.referrer,
      p_country: scanData.country,
      p_city: scanData.city,
      p_device_type: scanData.device_type,
      p_browser: scanData.browser,
      p_os: scanData.os,
    });

    if (scanError || !scanId) {
      throw new AppError('Failed to record scan', 500, 'SCAN_LOG_FAILED');
    }

    // Get business info for session creation
    const { data: business } = await this.supabase
      .from('businesses')
      .select('id, name, slug, logo_url, settings')
      .eq('id', qrCode.business_id)
      .single();

    if (!business) {
      throw new NotFoundError('Business');
    }

    // Start review session
    const { data: sessionId, error: sessionError } = await this.supabase.rpc('start_review_session', {
      p_scan_log_id: scanId,
      p_language: business.settings?.language_default || 'en',
    });

    if (sessionError || !sessionId) {
      throw new AppError('Failed to start review session', 500, 'SESSION_START_FAILED');
    }

    // Update download count
    await this.supabase
      .from('qr_codes')
      .update({
        download_count: qrCode.download_count + 1,
        last_downloaded_at: new Date().toISOString(),
      })
      .eq('id', qrCode.id);

    return {
      scan_id: scanId,
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        logo_url: business.logo_url,
        settings: business.settings,
      },
      session_id: sessionId,
    };
  }

  /**
   * Generate QR code image URL
   */
  async generateQRCodeImage(qrCodeId: string, format: 'png' | 'svg' = 'png'): Promise<string> {
    const { data: qrCode } = await this.supabase
      .from('qr_codes')
      .select('slug, design')
      .eq('id', qrCodeId)
      .single();

    if (!qrCode) {
      throw new NotFoundError('QR Code');
    }

    const baseUrl = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const qrUrl = `${baseUrl}/r/${qrCode.slug}`;

    return `${baseUrl}/api/qr/generate?id=${qrCodeId}&format=${format}&url=${encodeURIComponent(qrUrl)}`;
  }

  /**
   * Download QR code (increments download count)
   */
  async downloadQRCode(
    businessId: string,
    qrCodeId: string,
    userId: string,
    userRole: string,
    format: 'png' | 'svg' = 'png'
  ): Promise<{ url: string; filename: string }> {
    await this.verifyBusinessAccess(businessId, userId, userRole);

    const qrCode = await this.getQRCodeById(businessId, qrCodeId, userId, userRole);

    // Increment download count
    await this.supabase
      .from('qr_codes')
      .update({
        download_count: qrCode.download_count + 1,
        last_downloaded_at: new Date().toISOString(),
      })
      .eq('id', qrCodeId);

    const url = await this.generateQRCodeImage(qrCodeId, format);
    const filename = `reviewai-qr-${qrCode.slug}.${format}`;

    // Log audit
    await this.logAudit(userId, businessId, 'qr.downloaded', 'qr_code', qrCodeId, null, { format });

    return { url, filename };
  }

  /**
   * Get QR code statistics
   */
  async getQRCodeStats(qrCodeId: string): Promise<{
    total_scans: number;
    total_sessions: number;
    total_generated: number;
    total_redirects: number;
    conversion_rate: number;
    scans_today: number;
    scans_this_week: number;
    scans_this_month: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    // Total scans
    const { count: totalScans } = await this.supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .eq('qr_code_id', qrCodeId);

    // Total sessions
    const { count: totalSessions } = await this.supabase
      .from('review_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('qr_code_id', qrCodeId);

    // Total generated
    const { count: totalGenerated } = await this.supabase
      .from('generated_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('qr_code_id', qrCodeId);

    // Total redirects
    const { count: totalRedirects } = await this.supabase
      .from('review_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('qr_code_id', qrCodeId)
      .eq('status', 'redirected');

    // Scans today
    const { count: scansToday } = await this.supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .eq('qr_code_id', qrCodeId)
      .gte('scanned_at', today.toISOString());

    // Scans this week
    const { count: scansThisWeek } = await this.supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .eq('qr_code_id', qrCodeId)
      .gte('scanned_at', weekAgo.toISOString());

    // Scans this month
    const { count: scansThisMonth } = await this.supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .eq('qr_code_id', qrCodeId)
      .gte('scanned_at', monthAgo.toISOString());

    const totalScansNum = totalScans || 0;
    const totalRedirectsNum = totalRedirects || 0;
    const conversionRate = totalScansNum > 0 ? (totalRedirectsNum / totalScansNum) * 100 : 0;

    return {
      total_scans: totalScansNum,
      total_sessions: totalSessions || 0,
      total_generated: totalGenerated || 0,
      total_redirects: totalRedirectsNum,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      scans_today: scansToday || 0,
      scans_this_week: scansThisWeek || 0,
      scans_this_month: scansThisMonth || 0,
    };
  }

  /**
   * Get business slug
   */
  private async getBusinessSlug(businessId: string): Promise<string> {
    const { data: business } = await this.supabase
      .from('businesses')
      .select('slug')
      .eq('id', businessId)
      .single();

    if (!business) {
      throw new NotFoundError('Business');
    }

    return business.slug;
  }

  /**
   * Verify business access
   */
  private async verifyBusinessAccess(
    businessId: string,
    userId: string,
    userRole: string,
    allowedRoles: string[] = ['owner', 'admin', 'manager', 'member', 'viewer']
  ): Promise<void> {
    if (userRole === 'admin') return;

    // Check if owner
    const { data: business } = await this.supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', businessId)
      .single();

    if (business?.owner_id === userId) return;

    // Check staff membership
    const { data: staff } = await this.supabase
      .from('business_staff')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .not('accepted_at', 'is', null)
      .single();

    if (staff && allowedRoles.includes(staff.role)) return;

    throw new AuthorizationError('Access denied to this business');
  }

  /**
   * Check QR scan limit for business
   */
  private async checkQrScanLimit(businessId: string): Promise<void> {
    // Get subscription for this business
    const { data: subscription } = await this.supabase
      .from('subscriptions')
      .select('id, plan, status, current_period_start, current_period_end')
      .eq('business_id', businessId)
      .single();

    // If no subscription, use free plan limits
    if (!subscription) {
      // Check scan_logs count for current period (last 30 days)
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - 30);
      periodStart.setHours(0, 0, 0, 0);

      const { count: scanCount } = await this.supabase
        .from('scan_logs')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .gte('scanned_at', periodStart.toISOString());

      const freeLimit = 50; // From SUBSCRIPTION_CONSTANTS.PLANS.free.limits.review_generations (also used for scans)
      if ((scanCount || 0) >= freeLimit) {
        throw new AppError(
          'QR scan limit exceeded for Free plan. Please upgrade to continue.',
          403,
          'QR_SCAN_LIMIT_EXCEEDED'
        );
      }
      return;
    }

    // If subscription is not active, check if it's expired/canceled
    if (!['active', 'trialing'].includes(subscription.status)) {
      // For expired/canceled, fallback to free plan limits
      const periodStart = new Date(subscription.current_period_end);
      periodStart.setDate(periodStart.getDate() - 30);

      const { count: scanCount } = await this.supabase
        .from('scan_logs')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .gte('scanned_at', periodStart.toISOString());

      const freeLimit = 50;
      if ((scanCount || 0) >= freeLimit) {
        throw new AppError(
          'QR scan limit exceeded. Your subscription has expired. Please renew or upgrade.',
          403,
          'QR_SCAN_LIMIT_EXCEEDED'
        );
      }
      return;
    }

    // Check current period usage from usage_logs
    const { data: usageRecords } = await this.supabase
      .from('usage_logs')
      .select('count')
      .eq('subscription_id', subscription.id)
      .eq('metric', 'qr_scans')
      .eq('period_start', subscription.current_period_start)
      .eq('period_end', subscription.current_period_end);

    const used = usageRecords?.reduce((sum, r) => sum + r.count, 0) || 0;

    // Get plan limits
    const { data: planConfig } = await this.supabase
      .from('plan_configs')
      .select('max_qr_scans')
      .eq('plan', subscription.plan)
      .single();

    const limit = planConfig?.max_qr_scans || this.getPlanScanLimit(subscription.plan);

    if (limit !== null && used >= limit) {
      throw new AppError(
        `QR scan limit (${limit}) exceeded for ${subscription.plan} plan. Please upgrade.`,
        403,
        'QR_SCAN_LIMIT_EXCEEDED'
      );
    }
  }

  /**
   * Get plan scan limit from centralized config
   */
  private getPlanScanLimit(plan: string): number | null {
    const limits: Record<string, number | null> = {
      free: 50,
      starter: 500,
      professional: 2000,
      enterprise: null, // unlimited
    };
    return limits[plan] ?? 50;
  }

  /**
   * Log audit action
   */
  private async logAudit(
    userId: string,
    businessId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    oldValues: any,
    newValues: any
  ): Promise<void> {
    await this.supabase.rpc('log_audit_action', {
      p_action: action,
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_old_values: oldValues,
      p_new_values: newValues,
      p_business_id: businessId,
      p_metadata: { user_id: userId },
    });
  }
}