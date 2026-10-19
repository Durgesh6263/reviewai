/**
 * Centralized utility for managing the canonical public production URL for QR codes.
 * All QR codes automatically encode this canonical URL structure:
 * https://<domain>/r/{qr-slug}
 */

export const PRODUCTION_DOMAIN = 'https://www.review-pilot.store';

/**
 * Returns the authoritative canonical production URL for SEO, sitemaps, robots.txt, and metadata.
 * Always resolves to 'https://www.review-pilot.store' and ensures no legacy Vercel preview domains,
 * placeholders, or localhost URLs are exposed to search engines.
 */
export function getCanonicalSiteUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (
    envUrl &&
    envUrl.trim() !== '' &&
    !envUrl.includes('vercel.app') &&
    !envUrl.includes('reviewai.com') &&
    !envUrl.includes('localhost') &&
    !envUrl.includes('127.0.0.1')
  ) {
    return envUrl.trim().replace(/\/$/, '');
  }
  return PRODUCTION_DOMAIN;
}

export function getPublicBaseUrl(): string {
  // 1. If running in browser, prioritize the actual active host origin (e.g. www.review-pilot.store)
  if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1')) {
    return window.location.origin.replace(/\/$/, '');
  }

  // 2. If explicit production app URL is set, use canonical domain
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && envUrl.trim() !== '' && !envUrl.includes('vercel.app') && !envUrl.includes('reviewai.com')) {
    return envUrl.trim().replace(/\/$/, '');
  }

  // 3. Browser fallback
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }

  // 4. Default to canonical production domain
  return PRODUCTION_DOMAIN;
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
