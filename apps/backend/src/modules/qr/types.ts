/**
 * QR Module Types
 * ReviewAI SaaS Platform
 */

export interface QRCode {
  id: string;
  business_id: string;
  slug: string;
  label: string | null;
  design: QRDesign;
  download_count: number;
  last_downloaded_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QRDesign {
  color: string;
  logo: boolean;
  frame: 'rounded' | 'square' | 'circle' | 'none';
  size: number;
  error_correction: 'L' | 'M' | 'Q' | 'H';
  background_color?: string;
  logo_size?: number;
  margin?: number;
}

export interface CreateQRCodeRequest {
  label?: string;
  google_review_url?: string;
  design?: Partial<QRDesign>;
}

export interface UpdateQRCodeRequest {
  label?: string | null;
  google_review_url?: string;
  design?: Partial<QRDesign>;
  is_active?: boolean;
}

export interface QRCodeWithStats extends QRCode {
  stats: QRCodeStats;
}

export interface QRCodeStats {
  total_scans: number;
  total_sessions: number;
  total_generated: number;
  total_redirects: number;
  conversion_rate: number;
  scans_today: number;
  scans_this_week: number;
  scans_this_month: number;
}

export interface QRCodeListParams {
  page?: number;
  limit?: number;
  is_active?: boolean;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface QRCodeListResponse {
  qr_codes: QRCode[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface QRScanRequest {
  // Client info for analytics
  ip_address?: string;
  user_agent?: string;
  referrer?: string;
  country?: string;
  city?: string;
  device_type?: 'mobile' | 'tablet' | 'desktop';
  browser?: string;
  os?: string;
}

export interface QRScanResponse {
  scan_id: string;
  business: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    settings: any;
  };
  session_id: string;
}

export const QR_CONSTANTS = {
  DEFAULT_DESIGN: {
    color: '#2563EB',
    logo: true,
    frame: 'rounded',
    size: 512,
    error_correction: 'M',
    background_color: '#FFFFFF',
    logo_size: 0.3,
    margin: 4,
  } as QRDesign,
  SUPPORTED_FRAMES: ['rounded', 'square', 'circle', 'none'] as const,
  SUPPORTED_ERROR_CORRECTION: ['L', 'M', 'Q', 'H'] as const,
  MIN_SIZE: 128,
  MAX_SIZE: 2048,
  MAX_LABEL_LENGTH: 255,
} as const;