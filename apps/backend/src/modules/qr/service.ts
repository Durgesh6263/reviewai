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
import { logger } from '../../shared/logger';
import { parsePaginationParams, buildPaginationMeta } from '../../shared/utils/pagination';
import { entitlementService, normalizeBlockReason } from '../subscription/entitlement';

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

    // Check QR code creation quota entitlement
    const entitlementCheck = await entitlementService.canUseService(businessId, 'create_qr');
    if (!entitlementCheck.allowed) {
      throw new AppError(
        entitlementCheck.message || entitlementService.getReasonMessage(entitlementCheck.reason || 'QR_CODE_LIMIT_REACHED'),
        403,
        entitlementCheck.reason || 'QR_CODE_LIMIT_REACHED'
      );
    }

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

    const QR_FIELDS = 'id, business_id, slug, is_active, design, download_count, last_downloaded_at, label, created_at, updated_at';
    const BIZ_FIELDS = 'id, name, slug, category, custom_tags, logo_url, description, google_review_url, website_url, phone, address, status, settings, created_at, updated_at, deleted_at';

    // 1. Primary path: Single JOIN query for qr_code + business (eliminates sequential round-trips)
    const { data: qrWithBiz } = await this.supabase
      .from('qr_codes')
      .select(`
        ${QR_FIELDS},
        businesses!inner ( ${BIZ_FIELDS} )
      `)
      .in('slug', candidates)
      .limit(1)
      .maybeSingle();

    if (qrWithBiz && qrWithBiz.businesses) {
      return qrWithBiz as any;
    }

    // 2. Try finding qr_code by id if UUID with joined business
    if (isUuid) {
      const { data: qrById } = await this.supabase
        .from('qr_codes')
        .select(`
          ${QR_FIELDS},
          businesses!inner ( ${BIZ_FIELDS} )
        `)
        .eq('id', decoded)
        .maybeSingle();
      if (qrById && qrById.businesses) return qrById as any;
    }

    // 3. Fallback: Lookup by business directly with associated qr_codes in single query
    const { data: bizWithQR } = await this.supabase
      .from('businesses')
      .select(`
        ${BIZ_FIELDS},
        qr_codes ( ${QR_FIELDS} )
      `)
      .in('slug', candidates)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    let business: any = bizWithQR;

    // Check business by UUID if applicable
    if (!business && isUuid) {
      const { data: bizById } = await this.supabase
        .from('businesses')
        .select(`
          ${BIZ_FIELDS},
          qr_codes ( ${QR_FIELDS} )
        `)
        .eq('id', decoded)
        .is('deleted_at', null)
        .maybeSingle();
      if (bizById) business = bizById;
    }

    // Prefix match: if slug has random suffix, e.g. "the-fitness-world-mubno2p8"
    if (!business && hyphenated.includes('-')) {
      const prefixSlug = hyphenated.replace(/-[a-z0-9]{4,10}$/i, '');
      if (prefixSlug && prefixSlug !== hyphenated) {
        const { data: bizByPrefix } = await this.supabase
          .from('businesses')
          .select(`
            ${BIZ_FIELDS},
            qr_codes ( ${QR_FIELDS} )
          `)
          .eq('slug', prefixSlug)
          .is('deleted_at', null)
          .maybeSingle();
        if (bizByPrefix) business = bizByPrefix;
      }
    }

    // If business was found, return its active QR code or synthetic QR
    if (business) {
      const qrList = Array.isArray(business.qr_codes) ? business.qr_codes : [];
      const activeQR = qrList.find((q: any) => q.is_active !== false) || qrList[0];
      const { qr_codes, ...bizData } = business;

      if (activeQR) {
        return {
          ...activeQR,
          businesses: bizData,
        } as any;
      }

      // If no QR code exists, return synthetic QR code linking to this business
      return {
        id: `virtual-${bizData.id}`,
        business_id: bizData.id,
        slug: bizData.slug,
        label: `${bizData.name} Review QR`,
        design: {
          primary_color: bizData.settings?.primary_color || '#2563EB',
          google_review_url: bizData.google_review_url,
        },
        download_count: 0,
        last_downloaded_at: null,
        is_active: true,
        created_at: bizData.created_at,
        updated_at: bizData.updated_at,
        businesses: bizData,
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

    if (data.is_active === true) {
      const entitlementCheck = await entitlementService.canUseService(businessId, 'create_qr');
      if (!entitlementCheck.allowed) {
        const reason = normalizeBlockReason(entitlementCheck.reason);
        throw new AppError(
          entitlementCheck.message || entitlementService.getReasonMessage(reason),
          403,
          reason
        );
      }
    }

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

    if (qrCode.businesses?.deleted_at) {
      throw new AppError('This business is no longer available.', 404, 'BUSINESS_DELETED');
    }

    if (qrCode.businesses?.status && qrCode.businesses.status !== 'active') {
      throw new AppError('This business is currently inactive.', 403, 'BUSINESS_INACTIVE');
    }

    // 1. Check current business entitlement & remaining quota
    await this.checkQrScanLimit(qrCode.business_id);

    // If entitlement is active and valid, dynamically ensure qr_code is marked active
    if (qrCode.is_active === false) {
      try {
        await this.supabase
          .from('qr_codes')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('id', qrCode.id);
        qrCode.is_active = true;
      } catch {}
    }

    // 2. Atomically consume 1 QR scan quota unit BEFORE recording scan to protect against race conditions
    const consumeRes = await entitlementService.consumeServiceQuota(qrCode.business_id, 'qr_scan', 1);
    if (!consumeRes.allowed || !consumeRes.success) {
      const reason = normalizeBlockReason(consumeRes.reason || 'QR_QUOTA_EXHAUSTED');
      throw new AppError(
        entitlementService.getReasonMessage(reason),
        403,
        reason
      );
    }

    try {
      // 3. Ingest scan log using database function
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

      // 4. Get business info for session creation
      const { data: business } = await this.supabase
        .from('businesses')
        .select('id, name, slug, logo_url, settings')
        .eq('id', qrCode.business_id)
        .single();

      if (!business) {
        throw new NotFoundError('Business');
      }

      // 5. Start review session
      let sessionId: string | null = null;
      try {
        const { data: rpcSessionId, error: sessionError } = await this.supabase.rpc('start_review_session', {
          p_scan_log_id: scanId,
          p_language: business.settings?.language_default || 'en',
        });
        if (!sessionError && rpcSessionId) {
          sessionId = rpcSessionId;
        }
      } catch {}

      if (!sessionId) {
        const { data: sessionRow, error: sessionInsertErr } = await this.supabase
          .from('review_sessions')
          .insert({
            business_id: qrCode.business_id,
            qr_code_id: qrCode.id,
            scan_log_id: scanId,
            language: business.settings?.language_default || 'en',
            rating: 5,
            status: 'started',
            started_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (sessionInsertErr || !sessionRow) {
          throw new AppError('Failed to start review session', 500, 'SESSION_START_FAILED');
        }
        sessionId = sessionRow.id;
      }

      // 6. Update download count
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
        session_id: sessionId as string,
      };
    } catch (err) {
      // If scan logging or session start failed, refund the consumed quota unit
      // unless it was already a 403 entitlement error
      if (!(err instanceof AppError && err.statusCode === 403)) {
        try {
          await entitlementService.refundServiceQuota(qrCode.business_id, 'qr_scan', 1);
        } catch (refundErr) {
          console.error('Failed to refund QR scan quota after failed scan operation:', refundErr);
        }
      }
      throw err;
    }
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
   * Check QR scan limit for business using Central Entitlement Service
   * Enforces multi-condition expiry (time, QR quota, AI quota) with NO monthly reset
   */
  private async checkQrScanLimit(businessId: string): Promise<void> {
    const check = await entitlementService.canUseService(businessId, 'qr_scan');
    if (!check.allowed) {
      const reason = normalizeBlockReason(check.reason);
      if (reason === 'TRIAL_EXPIRED' || reason === 'SUBSCRIPTION_EXPIRED') {
        try {
          await this.supabase
            .from('qr_codes')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('business_id', businessId)
            .eq('is_active', true);
        } catch (err) {
          logger.warn({ businessId, err }, 'Failed to set qr_codes inactive upon scan limit expiry check');
        }
      }
      throw new AppError(
        check.message || entitlementService.getReasonMessage(reason),
        403,
        reason
      );
    }
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