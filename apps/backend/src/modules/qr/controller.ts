/**
 * QR Module Controller
 * ReviewAI SaaS Platform
 * HTTP request handlers for QR code endpoints
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { QRService } from './service';
import { AuthenticatedRequest } from '../auth/middleware';
import {
  CreateQRCodeInput,
  UpdateQRCodeInput,
  QRCodeIdParam,
  BusinessIdParam,
  QRSlugParam,
  ListQRCodesInput,
  ScanQRCodeInput,
} from './validators';
import { ApiResponse } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/exceptions';
import { getCategoryById, getDefaultTagsForCategory } from '../business/categories';

export class QRController {
  constructor(private qrService: QRService) {}

  /**
   * POST /businesses/:businessId/qr-codes and POST /qr-codes
   * Create a new QR code for a business
   */
  createQRCode = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const businessId = req.params.businessId || req.body.business_id;
      const data: any = req.body;

      if (!businessId) {
        throw new AppError('Business ID is required', 400, 'BUSINESS_ID_REQUIRED');
      }

      const qrCode = await this.qrService.createQRCode(businessId, userId, userRole, data);
      res.status(201).json({
        success: true,
        data: qrCode,
        qr_code: qrCode,
        message: 'QR code created successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /businesses/:businessId/qr-codes
   * List QR codes for a business
   */
  listQRCodes = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const { businessId } = req.params;
      const params: ListQRCodesInput = req.query as any;

      const result = await this.qrService.listQRCodes(businessId, userId, userRole, params);
      ApiResponse.ok(res, result, 'QR codes retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /businesses/:businessId/qr-codes/:id
   * Get QR code by ID
   */
  getQRCode = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const { businessId, id } = req.params;

      const qrCode = await this.qrService.getQRCodeById(businessId, id, userId, userRole);
      ApiResponse.ok(res, { qr_code: qrCode }, 'QR code retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /businesses/:businessId/qr-codes/:id/stats
   * Get QR code with statistics
   */
  getQRCodeStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const { businessId, id } = req.params;

      const qrCodeWithStats = await this.qrService.getQRCodeWithStats(businessId, id, userId, userRole);
      ApiResponse.ok(res, { qr_code: qrCodeWithStats }, 'QR code statistics retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /businesses/:businessId/qr-codes/:id
   * Update QR code
   */
  updateQRCode = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const { businessId, id } = req.params;
      const data: UpdateQRCodeInput = req.body;

      const qrCode = await this.qrService.updateQRCode(businessId, id, userId, userRole, data);
      ApiResponse.ok(res, { qr_code: qrCode }, 'QR code updated successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /businesses/:businessId/qr-codes/:id
   * Delete QR code (deactivate)
   */
  deleteQRCode = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const { businessId, id } = req.params;

      await this.qrService.deleteQRCode(businessId, id, userId, userRole);
      ApiResponse.ok(res, null, 'QR code deactivated successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /businesses/:businessId/qr-codes/:id/download
   * Download QR code image
   */
  downloadQRCode = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const { businessId, id } = req.params;
      const format = (req.query.format as 'png' | 'svg') || 'png';

      const result = await this.qrService.downloadQRCode(businessId, id, userId, userRole, format);
      ApiResponse.ok(res, result, 'QR code download URL generated');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /r/:slug/scan
   * Public endpoint to handle QR code scan
   */
  scanQRCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { slug } = req.params;
      const referrer = req.get('referer');
      const scanData: ScanQRCodeInput = {
        ...(req.body || {}),
        ip_address: req.ip || req.socket.remoteAddress,
        user_agent: req.get('user-agent'),
        referrer: referrer || undefined,
      };

      const result = await this.qrService.handleScan(slug, scanData);
      ApiResponse.ok(res, result, 'Scan recorded, review session started');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /r/:slug
   * Public endpoint to get business info by QR slug (for QR landing page)
   */
  getBusinessByQRSlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { slug } = req.params;
      if (!slug) {
        throw new AppError('QR code slug is required', 400, 'INVALID_SLUG');
      }

      // Safe extraction of existingScanId using optional chaining to avoid undefined query crashes
      const existingScanId = (req.headers['x-scan-id'] as string) || (req.query?.scan_id as string);

      const qrResult: any = await this.qrService.getQRCodeBySlug(slug);
      let business: any = qrResult?.businesses || null;
      let qrCode: any = qrResult || null;

      // Handle inactive QR code
      if (qrCode && qrCode.is_active === false) {
        throw new AppError('This QR code is currently inactive.', 403, 'QR_CODE_INACTIVE');
      }

      // Handle inactive business
      if (business && business.status !== 'active') {
        throw new AppError('This business is currently inactive.', 403, 'BUSINESS_INACTIVE');
      }

      // Fallback: Handle onboarding QR test preview (e.g. test-qr-code or test-*)
      if (!business && (slug === 'test-qr-code' || slug.startsWith('test-'))) {
        const { data: latestBusiness } = await this.qrService['supabase']
          .from('businesses')
          .select('id, name, slug, logo_url, description, address, phone, website_url, google_review_url, settings, status')
          .eq('status', 'active')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        business = latestBusiness || {
          id: 'test-business',
          name: 'The Fitness World',
          slug: 'test-qr-code',
          logo_url: null,
          description: 'Premier fitness and wellness center',
          address: { formatted: '123 Fitness Ave, New York, US' },
          phone: '+1 555-0199',
          website_url: 'https://fitnessworld.example.com',
          google_review_url: 'https://g.page/r/CYPgDr_K-_-CEBI/review',
          settings: {
            primary_color: '#2563EB',
            welcome_message: 'Welcome! How was your experience with us today?',
          },
        };
      }

      if (!business) {
        throw new AppError('Business not found or invalid QR link.', 404, 'BUSINESS_NOT_FOUND');
      }

      // Compute category and category-specific experience tags
      const categoryInfo = getCategoryById(business.category || business.settings?.category || 'other');
      const configuredTags = Array.isArray(business.custom_tags) && business.custom_tags.length > 0
        ? business.custom_tags
        : Array.isArray(business.settings?.custom_tags) && business.settings.custom_tags.length > 0
        ? business.settings.custom_tags
        : Array.isArray(business.settings?.tags) && business.settings.tags.length > 0
        ? business.settings.tags
        : Array.isArray(business.settings?.experience_tags) && business.settings.experience_tags.length > 0
        ? business.settings.experience_tags
        : categoryInfo.defaultTags;

      // Return only public customer review information (no sensitive fields)
      const publicBusiness = {
        id: business.id,
        name: business.name,
        slug: business.slug,
        category: categoryInfo.id,
        category_name: categoryInfo.name,
        tags: configuredTags,
        experience_tags: configuredTags,
        logo_url: business.logo_url || null,
        description: business.description || null,
        google_review_url: business.google_review_url || qrCode?.design?.google_review_url || null,
        google_place_id: business.google_place_id || null,
        phone: business.phone || null,
        website: business.website_url || business.website || null,
        address: business.address || null,
        city: business.city || null,
        country: business.country || null,
        settings: {
          primary_color: business.settings?.primary_color || qrCode?.design?.primary_color || '#2563EB',
          welcome_message: business.settings?.welcome_message || 'Welcome! How was your experience with us today?',
          review_tone: business.settings?.review_tone || 'balanced',
          category: categoryInfo.id,
          category_name: categoryInfo.name,
          experience_tags: configuredTags,
          tags: configuredTags,
        },
      };

      // Parse User-Agent & Device for scan logging
      const userAgent = req.headers['user-agent'] || '';
      const isMobile = /mobile|iphone|ipod|android.*mobile|windows.*phone/i.test(userAgent);
      const isTablet = /tablet|ipad|android(?!.*mobile)/i.test(userAgent);
      const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

      let browser = 'Other';
      if (/chrome/i.test(userAgent) && !/edge|edg|opr/i.test(userAgent)) browser = 'Chrome';
      else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
      else if (/firefox/i.test(userAgent)) browser = 'Firefox';
      else if (/edge|edg/i.test(userAgent)) browser = 'Edge';

      let os = 'Other';
      if (/windows/i.test(userAgent)) os = 'Windows';
      else if (/macintosh|mac os/i.test(userAgent)) os = 'macOS';
      else if (/android/i.test(userAgent)) os = 'Android';
      else if (/iphone|ipad|ipod/i.test(userAgent)) os = 'iOS';
      else if (/linux/i.test(userAgent)) os = 'Linux';

      let scanLogId: string | null = null;
      const isRealQrCodeId = qrCode?.id && !qrCode.id.startsWith('virtual-');

      if (isRealQrCodeId && business) {
        try {
          const supabase = this.qrService['supabase'];

          // 1. If client provided existing scan log ID for this session, reuse it idempotently
          if (existingScanId && existingScanId.length >= 10) {
            const { data: existing } = await supabase
              .from('scan_logs')
              .select('id')
              .eq('id', existingScanId)
              .eq('qr_code_id', qrCode.id)
              .maybeSingle();

            if (existing) {
              scanLogId = existing.id;
            }
          }

          // 2. Debounce window: check if same IP scanned this exact QR code in the last 60 seconds
          if (!scanLogId) {
            const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
            const rawIp = req.ip || req.socket.remoteAddress || '';
            const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(rawIp);
            const isIpv6 = /^([0-9a-fA-F]{1,4}:){1,7}[0-9a-fA-F]{1,4}$/.test(rawIp);
            const validIp = (isIpv4 || isIpv6) ? rawIp : null;

            if (validIp) {
              const { data: recentScan } = await supabase
                .from('scan_logs')
                .select('id')
                .eq('qr_code_id', qrCode.id)
                .eq('ip_address', validIp)
                .gte('scanned_at', sixtySecondsAgo)
                .order('scanned_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (recentScan) {
                scanLogId = recentScan.id;
              }
            }
          }

          // 3. If no existing or recent scan, record new scan log
          if (!scanLogId) {
            const rawIp = req.ip || req.socket.remoteAddress || '';
            const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(rawIp);
            const isIpv6 = /^([0-9a-fA-F]{1,4}:){1,7}[0-9a-fA-F]{1,4}$/.test(rawIp);
            const validIp = (isIpv4 || isIpv6) ? rawIp : null;

            const insertPayload: any = {
              qr_code_id: qrCode.id,
              business_id: business.id,
              user_agent: userAgent.slice(0, 500),
              device_type: deviceType,
              browser,
              os,
              scanned_at: new Date().toISOString(),
            };
            if (validIp) insertPayload.ip_address = validIp;

            const { data: scanLog } = await supabase
              .from('scan_logs')
              .insert(insertPayload)
              .select('id')
              .single();

            if (scanLog) {
              scanLogId = scanLog.id;
            }
          }
        } catch (scanErr) {
          console.error('Failed to log QR scan:', scanErr);
        }
      }

      ApiResponse.ok(res, {
        business: publicBusiness,
        qr_code_id: isRealQrCodeId ? qrCode.id : null,
        scan_log_id: scanLogId,
      }, 'Business found');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /qr-codes
   * List all QR codes across businesses for the current user
   */
  listAllQRCodes = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const search = (req.query.search as string) || '';
      const status = (req.query.status as string) || 'all';
      const businessId = req.query.business_id as string;

      const supabase = (this.qrService as any).supabase;

      let businessIds: string[] = [];
      if (businessId) {
        businessIds = [businessId];
      } else if (userRole === 'admin') {
        const { data: bList } = await supabase.from('businesses').select('id');
        businessIds = (bList || []).map((b: any) => b.id);
      } else {
        const [{ data: owned }, { data: memberships }] = await Promise.all([
          supabase.from('businesses').select('id').eq('owner_id', userId),
          supabase.from('business_members').select('business_id').eq('user_id', userId).eq('is_active', true),
        ]);
        const set = new Set<string>();
        (owned || []).forEach((b: any) => set.add(b.id));
        (memberships || []).forEach((m: any) => set.add(m.business_id));
        businessIds = Array.from(set);
      }

      if (businessIds.length === 0) {
        res.json({
          success: true,
          data: [],
          meta: {
            total: 0,
            page,
            limit,
            total_pages: 1,
          },
        });
        return;
      }

      let query = supabase
        .from('qr_codes')
        .select(`
          id,
          business_id,
          label,
          slug,
          design,
          is_active,
          download_count,
          created_at,
          last_downloaded_at,
          businesses ( name )
        `, { count: 'exact' })
        .in('business_id', businessIds);

      if (search) {
        query = query.or(`label.ilike.%${search}%,slug.ilike.%${search}%`);
      }
      if (status === 'active') {
        query = query.eq('is_active', true);
      } else if (status === 'inactive') {
        query = query.eq('is_active', false);
      }

      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

      const { data, count, error } = await query;
      if (error) throw error;

      const total = count || 0;
      const total_pages = Math.ceil(total / limit) || 1;

      const formatted = (data || []).map((q: any) => ({
        id: q.id,
        business_id: q.business_id,
        business_name: q.businesses?.name || 'My Business',
        name: q.label || 'Location QR',
        slug: q.slug,
        google_review_url: q.design?.google_review_url || '',
        design: q.design || {
          primary_color: '#2563EB',
          logo_url: null,
          frame_text: 'Scan to review',
          shape: 'square',
        },
        is_active: q.is_active !== false,
        scan_count: q.download_count || 0,
        review_count: 0,
        conversion_rate: 0,
        created_at: q.created_at,
        last_scanned_at: q.last_downloaded_at,
      }));

      res.json({
        success: true,
        data: formatted,
        meta: {
          total,
          page,
          limit,
          total_pages,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /qr-codes/:id
   * Delete QR code by ID directly
   */
  deleteQRCodeDirect = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = (this.qrService as any).supabase;
      await supabase.from('qr_codes').delete().eq('id', id);
      ApiResponse.ok(res, { success: true }, 'QR code deleted successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /qr-codes/:id
   * Get QR code by ID directly
   */
  getQRCodeDirect = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = (this.qrService as any).supabase;
      const { data: q, error } = await supabase
        .from('qr_codes')
        .select(`
          id,
          business_id,
          label,
          slug,
          design,
          is_active,
          download_count,
          created_at,
          last_downloaded_at,
          businesses ( id, name, slug, google_review_url )
        `)
        .eq('id', id)
        .single();

      if (error || !q) {
        throw new AppError('QR Code not found', 404, 'NOT_FOUND');
      }

      res.json({
        success: true,
        data: {
          id: q.id,
          business_id: q.business_id,
          business_name: q.businesses?.name || 'My Business',
          business_slug: q.businesses?.slug || '',
          name: q.label || 'Location QR',
          slug: q.slug,
          google_review_url: q.design?.google_review_url || q.businesses?.google_review_url || '',
          design: q.design || {
            primary_color: '#2563EB',
            logo_url: null,
            frame_text: 'Leave a Review',
            shape: 'square',
          },
          is_active: q.is_active !== false,
          scan_count: q.download_count || 0,
          created_at: q.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /qr-codes/:id
   * Update QR code directly
   */
  updateQRCodeDirect = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { name, label, design, is_active, google_review_url } = req.body;
      const supabase = (this.qrService as any).supabase;

      const updateData: any = {};
      if (name || label) updateData.label = name || label;

      if (design || google_review_url !== undefined) {
        const { data: existing } = await supabase
          .from('qr_codes')
          .select('design, business_id')
          .eq('id', id)
          .single();

        const mergedDesign = {
          ...(existing?.design || {}),
          ...(design || {}),
        };

        if (google_review_url !== undefined) {
          mergedDesign.google_review_url = google_review_url ? google_review_url.trim() : null;
        }
        updateData.design = mergedDesign;

        // Also update business profile if provided
        if (google_review_url && existing?.business_id) {
          await supabase
            .from('businesses')
            .update({ google_review_url: google_review_url.trim() })
            .eq('id', existing.business_id)
            .is('google_review_url', null);
        }
      }

      if (typeof is_active === 'boolean') updateData.is_active = is_active;
      updateData.updated_at = new Date().toISOString();

      const { data: q, error } = await supabase
        .from('qr_codes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error || !q) {
        throw new AppError('Failed to update QR code: ' + (error?.message || 'Not found'), 400, 'UPDATE_FAILED');
      }

      res.json({
        success: true,
        data: q,
        message: 'QR code updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /qr-codes/:id/download
   * Download QR code PNG image directly
   */
  downloadQRCodeDirect = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const supabase = (this.qrService as any).supabase;
      const { data: qr } = await supabase.from('qr_codes').select('*').eq('id', id).single();
      if (!qr) {
        throw new AppError('QR Code not found', 404, 'NOT_FOUND');
      }

      const baseUrl = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
      const qrUrl = `${baseUrl}/r/${qr.slug}`;
      const color = ((qr.design?.primary_color || '#2563EB') as string).replace('#', '');
      const imageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrUrl)}&color=${color}&bgcolor=FFFFFF`;

      // Update download count
      await supabase.from('qr_codes').update({
        download_count: (qr.download_count || 0) + 1,
        last_downloaded_at: new Date().toISOString(),
      }).eq('id', id);

      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${qr.label || 'qr-code'}.png"`);
      res.send(Buffer.from(response.data));
    } catch (error) {
      next(error);
    }
  };
}