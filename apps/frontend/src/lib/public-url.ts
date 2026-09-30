/**
 * Centralized utility for managing the canonical public production URL for QR codes.
 * All QR codes automatically encode this canonical URL structure:
 * https://<domain>/r/{qr-slug}
 */

export function getPublicBaseUrl(): string {
  // 1. If explicit production app URL is set, prioritize canonical domain for QR generation
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/$/, '');
  }

  // 2. If running in browser and no envUrl, use current window origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }

  // 3. Fallback URL
  return 'http://localhost:3000';
}

export const getPublicAppUrl = getPublicBaseUrl;

/**
 * Constructs the canonical public review URL for a given review slug
 */
export function getQRCodeReviewUrl(slug: string): string {
  const base = getPublicBaseUrl();
  const cleanSlug = (slug || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return `${base}/r/${cleanSlug}`;
}

/**
 * Generates a high-quality, scannable QR Code image URL
 * Compliant with ISO/IEC standards:
 * - High resolution (600x600)
 * - Error correction Level M / Q (15-25% recovery)
 * - Quiet zone (margin) of 4 modules for reliable camera scanning
 */
export function generateQRCodeImageUrl(
  targetUrl: string,
  options: {
    color?: string;
    size?: number;
    quietZone?: number;
    ecc?: 'L' | 'M' | 'Q' | 'H';
  } = {}
): string {
  const size = options.size || 600;
  const rawColor = options.color || '#2563EB';
  const color = rawColor.replace('#', '');
  const quietZone = options.quietZone !== undefined ? options.quietZone : 4;
  const ecc = options.ecc || 'M';

  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    targetUrl
  )}&color=${encodeURIComponent(color)}&bgcolor=FFFFFF&qzone=${quietZone}&ecc=${ecc}`;
}
