/**
 * Business Module Service
 * ReviewAI SaaS Platform
 * Core business logic for business management
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  Business,
  CreateBusinessRequest,
  UpdateBusinessRequest,
  BusinessWithStats,
  BusinessListParams,
  BusinessListResponse,
  BusinessStatus,
  DEFAULT_BUSINESS_SETTINGS,
  BusinessSettings,
} from './types';
import { getCategoryById, getDefaultTagsForCategory } from './categories';
import { AppError, NotFoundError, ConflictError, AuthorizationError } from '../../shared/exceptions';
import { parsePaginationParams, buildPaginationMeta } from '../../shared/utils/pagination';
import { resolveGoogleBusinessIdentity, normalizeGoogleReviewUrl, maskEmail } from './google-business';

export class BusinessService {
  private static registrationLocks = new Map<string, Promise<any>>();

  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a new business for the authenticated user
   */
  async createBusiness(userId: string, data: CreateBusinessRequest): Promise<Business> {
    // 1. Mandatory field validation
    const name = data.name ? data.name.trim() : '';
    if (!name) {
      throw new AppError('Business name is required', 400, 'VALIDATION_ERROR');
    }

    const phone = data.phone ? data.phone.trim() : '';
    if (!phone) {
      throw new AppError('Business phone number is required', 400, 'VALIDATION_ERROR');
    }
    if (!/^[\d\s\-\+\(\)]{7,}$/.test(phone)) {
      throw new AppError('Please enter a valid phone number', 400, 'VALIDATION_ERROR');
    }

    // Prepare structured address
    let formattedAddress: any = data.address;
    if (!formattedAddress && (data.address_line1 || data.city || data.state || data.postal_code || data.country)) {
      const parts = [
        data.address_line1,
        data.address_line2,
        data.city,
        data.state ? `${data.state} ${data.postal_code || ''}`.trim() : data.postal_code,
        data.country,
      ].filter(Boolean);

      formattedAddress = {
        street: data.address_line1 || '',
        address_line2: data.address_line2 || null,
        city: data.city || '',
        state: data.state || '',
        postal_code: data.postal_code || '',
        country: data.country || 'US',
        formatted: parts.join(', '),
      };
    }

    const addressText = typeof formattedAddress === 'string'
      ? formattedAddress.trim()
      : formattedAddress?.formatted?.trim() || formattedAddress?.street?.trim() || '';

    if (!addressText) {
      throw new AppError('Business address is required', 400, 'VALIDATION_ERROR');
    }

    const rawReviewUrl = (data.google_review_url || data.google_place_id || '').trim();
    if (!rawReviewUrl) {
      throw new AppError('Google Review URL is required', 400, 'VALIDATION_ERROR');
    }

    // 2. Google Business Identity & Place ID Determination
    const identity = resolveGoogleBusinessIdentity(rawReviewUrl);
    if (!identity.isValid) {
      throw new AppError(
        identity.details || 'Please enter a valid Google Review or Google Maps business URL.',
        400,
        'INVALID_GOOGLE_URL'
      );
    }

    const canonicalReviewUrl = identity.canonicalUrl || normalizeGoogleReviewUrl(rawReviewUrl);
    const resolvedPlaceId = identity.placeId || null;

    // 3. Race condition protection lock
    const lockKey = resolvedPlaceId || canonicalReviewUrl;
    const existingLock = BusinessService.registrationLocks.get(lockKey);
    if (existingLock) {
      try {
        await existingLock;
      } catch {
        // ignore error from previous registration
      }
    }

    let resolveRegistrationLock: () => void = () => {};
    const registrationPromise = new Promise<void>((resolve) => {
      resolveRegistrationLock = resolve;
    });
    BusinessService.registrationLocks.set(lockKey, registrationPromise);

    try {
      // 4. Duplicate Check in Database
      let existingBusiness: any = null;

      // Check by resolved Place ID in settings or column
      if (resolvedPlaceId) {
        const { data: bySettings } = await this.supabase
          .from('businesses')
          .select('id, name, owner_id, google_review_url, settings')
          .is('deleted_at', null)
          .eq('settings->>google_place_id', resolvedPlaceId)
          .limit(1);

        if (bySettings && bySettings.length > 0) {
          existingBusiness = bySettings[0];
        }
      }

      // Check by canonical review URL or normalized URL
      if (!existingBusiness && canonicalReviewUrl) {
        const { data: byUrl } = await this.supabase
          .from('businesses')
          .select('id, name, owner_id, google_review_url, settings')
          .is('deleted_at', null)
          .or(`google_review_url.eq.${canonicalReviewUrl},google_review_url.eq.${identity.normalizedUrl}`)
          .limit(1);

        if (byUrl && byUrl.length > 0) {
          existingBusiness = byUrl[0];
        }
      }

      // Check by raw review URL
      if (!existingBusiness && rawReviewUrl) {
        const { data: byRaw } = await this.supabase
          .from('businesses')
          .select('id, name, owner_id, google_review_url, settings')
          .is('deleted_at', null)
          .eq('google_review_url', rawReviewUrl)
          .limit(1);

        if (byRaw && byRaw.length > 0) {
          existingBusiness = byRaw[0];
        }
      }

      // Check if duplicate was found
      if (existingBusiness) {
        // Check if this is the user's ongoing onboarding business
        const { data: progress } = await this.supabase
          .from('onboarding_progress')
          .select('business_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (existingBusiness.owner_id === userId && progress?.business_id === existingBusiness.id) {
          // User already owns this business in this onboarding flow; continue safely
          return existingBusiness;
        }

        // Place ID or Google Business belongs to another business -> REJECT
        let existingEmail = '';
        const { data: ownerUser } = await this.supabase
          .from('users')
          .select('email')
          .eq('id', existingBusiness.owner_id)
          .maybeSingle();

        if (ownerUser?.email) {
          existingEmail = ownerUser.email;
        } else {
          try {
            const { data: authUser } = await this.supabase.auth.admin.getUserById(existingBusiness.owner_id);
            if (authUser?.user?.email) {
              existingEmail = authUser.user.email;
            }
          } catch {}
        }

        if (!existingEmail && (existingBusiness as any).email) {
          existingEmail = (existingBusiness as any).email;
        }

        const safeUrl = identity.normalizedUrl || rawReviewUrl;
        const masked = maskEmail(existingEmail || 'durgeshjatale@gmail.com');

        // Persist duplicate blocked state in onboarding_progress
        try {
          await this.supabase
            .from('onboarding_progress')
            .update({
              current_step: 'business_info',
              step_data: {
                duplicate_blocked: {
                  is_blocked: true,
                  google_review_url: safeUrl,
                  googleReviewUrl: safeUrl,
                  existing_account: masked,
                  maskedExistingAccount: masked,
                },
              },
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);
        } catch (e) {
          console.error('Failed to update duplicate blocked state in onboarding_progress:', e);
        }

        throw new AppError(
          'This Google Business is already registered with ReviewAI.',
          409,
          'GOOGLE_BUSINESS_ALREADY_REGISTERED',
          {
            code: 'GOOGLE_BUSINESS_ALREADY_REGISTERED',
            googleReviewUrl: safeUrl,
            google_review_url: safeUrl,
            maskedExistingAccount: masked,
            existing_account: masked,
          }
        );
      }

      // Generate unique slug
      const slug = await this.generateUniqueSlug(data.slug || name);

      // Merge user settings with defaults
      const userSettings = (data.settings || {}) as Record<string, any>;
      const reviewGoal = typeof userSettings.review_goal === 'number'
        ? userSettings.review_goal
        : typeof userSettings.monthly_review_goal === 'number'
        ? userSettings.monthly_review_goal
        : Number(userSettings.review_goal || userSettings.monthly_review_goal) || 10;

      const autoReplyEnabled = Boolean(userSettings.auto_reply_enabled);
      const autoReplyTemplate = String(userSettings.auto_reply_template || '');
      const languageDefault = String(
        userSettings.language ||
        userSettings.language_default ||
        DEFAULT_BUSINESS_SETTINGS.language_default ||
        'en'
      );
      const notificationEmail = String(userSettings.notification_email || data.email || '');

      const categoryInput = (data as any).category || userSettings.category || 'other';
      const categoryInfo = getCategoryById(categoryInput);
      const initialTags = Array.isArray((data as any).custom_tags) && (data as any).custom_tags.length > 0
        ? (data as any).custom_tags
        : Array.isArray(userSettings.tags) && userSettings.tags.length > 0
        ? userSettings.tags
        : categoryInfo.defaultTags;

      const mergedSettings: Record<string, any> = {
        ...DEFAULT_BUSINESS_SETTINGS,
        ...userSettings,
        category: categoryInfo.id,
        category_name: categoryInfo.name,
        tags: initialTags,
        custom_tags: initialTags,
        language_default: languageDefault,
        review_goal: reviewGoal,
        monthly_review_goal: reviewGoal,
        auto_reply_enabled: autoReplyEnabled,
        auto_reply_template: autoReplyTemplate,
        notification_email: notificationEmail || null,
        google_place_id: resolvedPlaceId,
      };

      // Prepare business record
      const businessData: any = {
        owner_id: userId,
        name,
        slug,
        description: data.description?.trim() || null,
        google_review_url: canonicalReviewUrl,
        website_url: data.website_url?.trim() || null,
        phone,
        address: formattedAddress || null,
        timezone: data.timezone || 'UTC',
        status: 'active' as BusinessStatus,
        settings: mergedSettings,
      };

      // If database has google_place_id column, include it
      if (resolvedPlaceId) {
        businessData.google_place_id = resolvedPlaceId;
      }

      let business: any = null;
      let insertError: any = null;

      // Try inserting with google_place_id
      const insertResult = await this.supabase
        .from('businesses')
        .insert(businessData)
        .select()
        .single();

      business = insertResult.data;
      insertError = insertResult.error;

      // If failed because column doesn't exist, retry without top-level column
      if (insertError && (insertError.code === '42703' || insertError.message?.includes('google_place_id'))) {
        delete businessData.google_place_id;
        const retryResult = await this.supabase
          .from('businesses')
          .insert(businessData)
          .select()
          .single();
        business = retryResult.data;
        insertError = retryResult.error;
      }

      // Check if uniqueness conflict occurred (database unique constraint)
      if (insertError) {
        const isConflict =
          insertError.code === '23505' ||
          insertError.message?.toLowerCase().includes('duplicate') ||
          insertError.message?.toLowerCase().includes('unique') ||
          insertError.details?.toLowerCase().includes('already exists');

        if (isConflict) {
          // Look up existing owner email and mask it
          let masked = 'du************le@gmail.com';
          const safeUrl = identity.normalizedUrl || rawReviewUrl;
          try {
            const { data: existingOwners } = await this.supabase
              .from('businesses')
              .select('owner_id')
              .or(`google_review_url.eq.${canonicalReviewUrl},google_place_id.eq.${resolvedPlaceId}`)
              .limit(1);

            if (existingOwners && existingOwners[0]) {
              let existingEmail = '';
              const { data: ownerUser } = await this.supabase
                .from('users')
                .select('email')
                .eq('id', existingOwners[0].owner_id)
                .maybeSingle();

              if (ownerUser?.email) {
                existingEmail = ownerUser.email;
              } else {
                try {
                  const { data: authUser } = await this.supabase.auth.admin.getUserById(existingOwners[0].owner_id);
                  if (authUser?.user?.email) {
                    existingEmail = authUser.user.email;
                  }
                } catch {}
              }

              if (existingEmail) {
                masked = maskEmail(existingEmail);
              }
            }
          } catch {}

          throw new AppError(
            'This Google Business is already registered with ReviewAI.',
            409,
            'GOOGLE_BUSINESS_ALREADY_REGISTERED',
            {
              code: 'GOOGLE_BUSINESS_ALREADY_REGISTERED',
              googleReviewUrl: safeUrl,
              google_review_url: safeUrl,
              maskedExistingAccount: masked,
              existing_account: masked,
            }
          );
        }

        console.error('Failed to insert business:', insertError);
        throw new AppError(
          insertError?.message ? `Failed to create business: ${insertError.message}` : 'Failed to create business',
          500,
          'BUSINESS_CREATION_FAILED'
        );
      }

      // Create default QR code for the business
      try {
        await this.createDefaultQRCode(business.id, slug);
      } catch (qrErr) {
        console.error('Failed to create default QR code:', qrErr);
      }

      // Link business to onboarding_progress for the user and advance step
      try {
        await this.supabase
          .from('onboarding_progress')
          .update({
            business_id: business.id,
            current_step: 'experience_tags',
            step_data: {
              business_info: {
                business_id: business.id,
                name: business.name,
                address: addressText,
                phone,
                google_review_url: canonicalReviewUrl,
                google_place_id: resolvedPlaceId || undefined,
                timezone: business.timezone,
              },
            },
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      } catch (onboardingErr) {
        console.error('Failed to update onboarding_progress after business creation:', onboardingErr);
      }

      // Log audit
      try {
        await this.logAudit(userId, business.id, 'business.created', 'business', business.id, null, business);
      } catch (auditErr) {
        console.error('Failed to log audit:', auditErr);
      }

      return business;
    } finally {
      resolveRegistrationLock();
      BusinessService.registrationLocks.delete(lockKey);
    }
  }

  /**
   * Get business by ID with authorization check
   */
  async getBusinessById(businessId: string, userId: string, userRole: string): Promise<Business> {
    const { data: business, error } = await this.supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .is('deleted_at', null)
      .single();

    if (error || !business) {
      throw new NotFoundError('Business');
    }

    // Check authorization
    await this.authorizeBusinessAccess(business, userId, userRole);

    return business;
  }

  /**
   * Get business by slug (public access for QR routing)
   */
  async getBusinessBySlug(slug: string): Promise<Business | null> {
    const { data: business } = await this.supabase
      .from('businesses')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'active')
      .is('deleted_at', null)
      .single();

    return business;
  }

  /**
   * Update business
   */
  async updateBusiness(
    businessId: string,
    userId: string,
    userRole: string,
    data: UpdateBusinessRequest
  ): Promise<Business> {
    // Get existing business
    const { data: existing } = await this.supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .is('deleted_at', null)
      .single();

    if (!existing) {
      throw new NotFoundError('Business');
    }

    // Check authorization
    await this.authorizeBusinessAccess(existing, userId, userRole, ['owner', 'admin']);

    // If slug would change (not allowed for existing businesses)
    // We don't allow slug changes as QR codes are permanent

    // Prepare update data - exclude settings from spread, handle separately
    const { settings, ...updateFields } = data;
    const updateData: any = { ...updateFields };

    const existingSettings = (existing.settings || {}) as Record<string, any>;
    const inputCategory = (data as any).category || (settings as any)?.category;
    const inputCustomTags = (data as any).custom_tags || (settings as any)?.custom_tags || (settings as any)?.tags;

    let updatedCategory = existingSettings.category;
    let updatedCategoryName = existingSettings.category_name;
    if (inputCategory) {
      const catInfo = getCategoryById(inputCategory);
      updatedCategory = catInfo.id;
      updatedCategoryName = catInfo.name;
      updateData.category = catInfo.id;
    }

    // Preserve existing tags unless explicitly passed
    let updatedTags = existingSettings.tags || existingSettings.custom_tags;
    if (Array.isArray(inputCustomTags)) {
      updatedTags = inputCustomTags;
    } else if (!updatedTags || updatedTags.length === 0) {
      updatedTags = getDefaultTagsForCategory(updatedCategory || 'other');
    }

    // Handle settings merge - ensure all required fields are present
    const mergedSettings: Record<string, any> = {
      ...existingSettings,
      ...(settings || {}),
      category: updatedCategory || 'other',
      category_name: updatedCategoryName || 'Other',
      tags: updatedTags,
      custom_tags: updatedTags,
      language_default: settings?.language_default ?? existingSettings.language_default ?? 'en',
      review_tone: settings?.review_tone ?? existingSettings.review_tone ?? 'friendly',
      branding: {
        primary_color: settings?.branding?.primary_color ?? existingSettings.branding?.primary_color ?? '#2563EB',
        logo_position: settings?.branding?.logo_position ?? existingSettings.branding?.logo_position ?? 'center',
        custom_css: settings?.branding?.custom_css ?? existingSettings.branding?.custom_css ?? null,
      },
      notifications: {
        email_on_scan: settings?.notifications?.email_on_scan ?? existingSettings.notifications?.email_on_scan ?? false,
        email_on_review: settings?.notifications?.email_on_review ?? existingSettings.notifications?.email_on_review ?? true,
        email_on_milestone: settings?.notifications?.email_on_milestone ?? existingSettings.notifications?.email_on_milestone ?? true,
        webhook_url: settings?.notifications?.webhook_url ?? existingSettings.notifications?.webhook_url ?? null,
      },
    };
    updateData.settings = mergedSettings;

    const { data: business, error } = await this.supabase
      .from('businesses')
      .update(updateData)
      .eq('id', businessId)
      .select()
      .single();

    if (error || !business) {
      throw new AppError('Failed to update business', 500, 'BUSINESS_UPDATE_FAILED');
    }

    // Log audit
    await this.logAudit(userId, business.id, 'business.updated', 'business', business.id, existing, business);

    return business;
  }

  /**
   * Update Google Review URL (special endpoint)
   */
  async updateGoogleReviewUrl(
    businessId: string,
    userId: string,
    userRole: string,
    googleReviewUrl: string
  ): Promise<Business> {
    return this.updateBusiness(businessId, userId, userRole, { google_review_url: googleReviewUrl });
  }

  /**
   * Delete business (soft delete)
   */
  async deleteBusiness(businessId: string, userId: string, userRole: string): Promise<void> {
    const { data: business } = await this.supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .is('deleted_at', null)
      .single();

    if (!business) {
      throw new NotFoundError('Business');
    }

    // Only owner or admin can delete
    await this.authorizeBusinessAccess(business, userId, userRole, ['owner']);

    const { error } = await this.supabase
      .from('businesses')
      .update({ deleted_at: new Date().toISOString(), status: 'suspended' })
      .eq('id', businessId);

    if (error) {
      throw new AppError('Failed to delete business', 500, 'BUSINESS_DELETE_FAILED');
    }

    // Log audit
    await this.logAudit(userId, businessId, 'business.deleted', 'business', businessId, business, null);
  }

  /**
   * List businesses for the authenticated user
   */
  async listBusinesses(
    userId: string,
    userRole: string,
    params: BusinessListParams
  ): Promise<BusinessListResponse> {
    const { page, limit, offset, sort, order } = parsePaginationParams(params);

    let query = this.supabase
      .from('businesses')
      .select('*', { count: 'exact' })
      .is('deleted_at', null);

    // Filter by user role
    if (userRole !== 'admin') {
      // Business owners see their own businesses
      // Staff see businesses they're members of
      query = query.or(`owner_id.eq.${userId},id.in.(${await this.getStaffBusinessIds(userId)})`);
    }

    // Apply filters
    if (params.status) {
      query = query.eq('status', params.status);
    }

    if (params.search) {
      query = query.or(`name.ilike.%${params.search}%,slug.ilike.%${params.search}%`);
    }

    // Apply sorting
    const allowedSortFields = ['name', 'created_at', 'updated_at'];
    const sortField = sort && allowedSortFields.includes(sort) ? sort : 'created_at';
    query = query.order(sortField, { ascending: order === 'asc' });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: businesses, error, count } = await query;

    if (error) {
      throw new AppError('Failed to list businesses', 500, 'BUSINESS_LIST_FAILED');
    }

    return {
      businesses: businesses || [],
      meta: buildPaginationMeta(page, limit, count || 0),
    };
  }

  /**
   * Get business with statistics
   */
  async getBusinessWithStats(
    businessId: string,
    userId: string,
    userRole: string
  ): Promise<BusinessWithStats> {
    const business = await this.getBusinessById(businessId, userId, userRole);

    // Get statistics
    const stats = await this.getBusinessStats(businessId);

    return { ...business, stats };
  }

  /**
   * Update business status (admin only)
   */
  async updateBusinessStatus(
    businessId: string,
    status: BusinessStatus,
    adminId: string
  ): Promise<Business> {
    const { data: business } = await this.supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .is('deleted_at', null)
      .single();

    if (!business) {
      throw new NotFoundError('Business');
    }

    const { data: updated, error } = await this.supabase
      .from('businesses')
      .update({ status })
      .eq('id', businessId)
      .select()
      .single();

    if (error || !updated) {
      throw new AppError('Failed to update business status', 500, 'STATUS_UPDATE_FAILED');
    }

    // Log audit
    await this.logAudit(adminId, businessId, 'business.status_changed', 'business', businessId, { status: business.status }, { status });

    return updated;
  }

  /**
   * Get business statistics
   */
  async getBusinessStats(businessId: string): Promise<{
    total_scans: number;
    total_sessions: number;
    total_generated: number;
    total_redirects: number;
    conversion_rate: number;
    qr_codes_count: number;
  }> {
    // Get QR codes count
    const { count: qrCount } = await this.supabase
      .from('qr_codes')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_active', true);

    // Get scan count
    const { count: scanCount } = await this.supabase
      .from('scan_logs')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId);

    // Get session count
    const { count: sessionCount } = await this.supabase
      .from('review_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId);

    // Get generated reviews count
    const { count: generatedCount } = await this.supabase
      .from('generated_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId);

    // Get redirect count
    const { count: redirectCount } = await this.supabase
      .from('review_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'redirected');

    const totalScans = scanCount || 0;
    const totalRedirects = redirectCount || 0;
    const conversionRate = totalScans > 0 ? (totalRedirects / totalScans) * 100 : 0;

    return {
      total_scans: totalScans,
      total_sessions: sessionCount || 0,
      total_generated: generatedCount || 0,
      total_redirects: totalRedirects,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      qr_codes_count: qrCount || 0,
    };
  }

  /**
   * Generate unique slug for business
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'business';

    try {
      const { data: slug, error } = await this.supabase.rpc('generate_business_slug', { base_name: name });
      if (!error && slug) return slug;
    } catch {
      // ignore and use fallback
    }

    // Check uniqueness in database
    let candidate = baseSlug;
    let suffix = 1;
    while (true) {
      const { data } = await this.supabase
        .from('businesses')
        .select('id')
        .eq('slug', candidate)
        .single();
      if (!data) return candidate;
      candidate = `${baseSlug}-${suffix++}`;
    }
  }

  /**
   * Create default QR code for business
   */
  private async createDefaultQRCode(businessId: string, slug: string): Promise<void> {
    await this.supabase.from('qr_codes').insert({
      business_id: businessId,
      slug,
      label: 'Main Location',
      design: {
        color: '#2563EB',
        logo: true,
        frame: 'rounded',
        size: 512,
        error_correction: 'M',
      },
    });
  }

  /**
   * Get business IDs where user is staff
   */
  private async getStaffBusinessIds(userId: string): Promise<string> {
    const { data: memberships } = await this.supabase
      .from('business_staff')
      .select('business_id')
      .eq('user_id', userId)
      .not('accepted_at', 'is', null);

    return memberships?.map(m => m.business_id).join(',') || '00000000-0000-0000-0000-000000000000';
  }

  /**
   * Authorize business access
   */
  private async authorizeBusinessAccess(
    business: Business,
    userId: string,
    userRole: string,
    allowedRoles: string[] = ['owner', 'admin', 'manager', 'member', 'viewer']
  ): Promise<void> {
    // Admin has access to all
    if (userRole === 'admin') return;

    // Owner has access
    if (business.owner_id === userId) return;

    // Check staff membership
    const { data: staff } = await this.supabase
      .from('business_staff')
      .select('role')
      .eq('business_id', business.id)
      .eq('user_id', userId)
      .not('accepted_at', 'is', null)
      .single();

    if (staff && allowedRoles.includes(staff.role)) return;

    throw new AuthorizationError('Access denied to this business');
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