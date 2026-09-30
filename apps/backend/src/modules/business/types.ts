/**
 * Business Module Types
 * ReviewAI SaaS Platform
 */

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  google_review_url: string;
  website_url: string | null;
  phone: string | null;
  address: BusinessAddress | null;
  timezone: string;
  status: BusinessStatus;
  settings: BusinessSettings;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type BusinessStatus = 'active' | 'suspended' | 'pending_verification';

export interface BusinessAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  formatted?: string;
}

export interface BusinessSettings {
  language_default: string;
  review_tone: ReviewTone;
  branding: BusinessBranding;
  notifications: BusinessNotifications;
}

export type ReviewTone = 'professional' | 'friendly' | 'casual' | 'enthusiastic';

export interface BusinessBranding {
  primary_color: string;
  logo_position: 'left' | 'center' | 'right';
  custom_css: string | null;
}

export interface BusinessNotifications {
  email_on_scan: boolean;
  email_on_review: boolean;
  email_on_milestone: boolean;
  webhook_url: string | null;
}

export interface CreateBusinessRequest {
  name: string;
  google_review_url?: string;
  slug?: string;
  description?: string;
  website_url?: string;
  phone?: string;
  email?: string;
  address?: BusinessAddress | null;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  timezone?: string;
  google_place_id?: string;
  settings?: Record<string, any> | null;
}

export interface UpdateBusinessRequest {
  name?: string;
  description?: string;
  logo_url?: string | null;
  google_review_url?: string;
  website_url?: string | null;
  phone?: string | null;
  address?: BusinessAddress | null;
  timezone?: string;
  settings?: Partial<BusinessSettings>;
}

export interface BusinessWithStats extends Business {
  stats: BusinessStats;
}

export interface BusinessStats {
  total_scans: number;
  total_sessions: number;
  total_generated: number;
  total_redirects: number;
  conversion_rate: number;
  qr_codes_count: number;
}

export interface BusinessListParams {
  page?: number;
  limit?: number;
  status?: BusinessStatus;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface BusinessListResponse {
  businesses: Business[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const BUSINESS_CONSTANTS = {
  SLUG_MAX_LENGTH: 100,
  NAME_MAX_LENGTH: 255,
  DESCRIPTION_MAX_LENGTH: 2000,
  SUPPORTED_TIMEZONES: [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Australia/Sydney',
  ],
  SUPPORTED_LANGUAGES: [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'hinglish', name: 'Hinglish' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
  ],
} as const;

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  language_default: 'en',
  review_tone: 'friendly',
  branding: {
    primary_color: '#2563EB',
    logo_position: 'center',
    custom_css: null,
  },
  notifications: {
    email_on_scan: false,
    email_on_review: true,
    email_on_milestone: true,
    webhook_url: null,
  },
};