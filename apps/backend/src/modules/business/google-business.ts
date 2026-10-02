/**
 * Google Business Resolution and Identity Protection
 * ReviewAI SaaS Platform
 */


export interface GoogleBusinessIdentity {
  placeId: string;
  canonicalUrl: string;
  normalizedUrl: string;
  isValid: boolean;
  details?: string;
}

/**
 * Checks if a hostname belongs to an authoritative Google domain
 */
export function isGoogleDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'g.page' ||
    host.endsWith('.g.page') ||
    host === 'maps.app.goo.gl' ||
    host === 'goo.gl' ||
    host.endsWith('.goo.gl') ||
    host === 'google.com' ||
    host.endsWith('.google.com') ||
    /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)
  );
}

/**
 * Normalizes Google Review / Maps URLs
 */
export function normalizeGoogleReviewUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();

  // If it's a direct place ID
  if (trimmed.startsWith('ChIJ') && !trimmed.includes('/') && !trimmed.includes(' ')) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(trimmed)}`;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, '');

    // 1. search.google.com or maps.google.com with placeid
    const placeId = url.searchParams.get('placeid') || url.searchParams.get('place_id');
    if (placeId) {
      return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId.trim())}`;
    }

    // 2. maps.google.com with cid
    const cid = url.searchParams.get('cid');
    if (cid) {
      return `https://maps.google.com/?cid=${encodeURIComponent(cid.trim())}`;
    }

    // 3. g.page URL
    if (host.includes('g.page')) {
      return `https://${host}${pathname}`;
    }

    // Clean tracking parameters
    const cleanParams = new URLSearchParams();
    url.searchParams.forEach((val, key) => {
      if (!key.startsWith('utm_') && key !== 'ref' && key !== 's' && key !== 'src') {
        cleanParams.set(key, val);
      }
    });

    const queryString = cleanParams.toString();
    return `https://${host}${pathname}${queryString ? '?' + queryString : ''}`;
  } catch {
    return trimmed;
  }
}

/**
 * Resolves the Google Business identity and Place ID from URL or input
 */
export function resolveGoogleBusinessIdentity(urlOrInput: string): GoogleBusinessIdentity {
  if (!urlOrInput || typeof urlOrInput !== 'string') {
    return {
      placeId: '',
      canonicalUrl: '',
      normalizedUrl: '',
      isValid: false,
      details: 'Google Review URL is required',
    };
  }

  const trimmed = urlOrInput.trim();

  // Case 1: Direct Place ID (starts with ChIJ...)
  if (trimmed.startsWith('ChIJ') && !trimmed.includes('/') && !trimmed.includes(' ')) {
    const canonical = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(trimmed)}`;
    return {
      placeId: trimmed,
      canonicalUrl: canonical,
      normalizedUrl: canonical,
      isValid: true,
    };
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    if (!isGoogleDomain(hostname)) {
      return {
        placeId: '',
        canonicalUrl: '',
        normalizedUrl: trimmed,
        isValid: false,
        details: 'URL must belong to a Google domain (e.g. g.page, search.google.com, maps.google.com)',
      };
    }

    // Check placeid or place_id parameter
    const placeIdParam = parsed.searchParams.get('placeid') || parsed.searchParams.get('place_id');
    if (placeIdParam) {
      const pid = placeIdParam.trim();
      const canonical = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(pid)}`;
      return {
        placeId: pid,
        canonicalUrl: canonical,
        normalizedUrl: normalizeGoogleReviewUrl(trimmed),
        isValid: true,
      };
    }

    // Check CID parameter (maps.google.com/?cid=...)
    const cidParam = parsed.searchParams.get('cid');
    if (cidParam) {
      const cid = cidParam.trim();
      const canonical = `https://maps.google.com/?cid=${encodeURIComponent(cid)}`;
      return {
        placeId: `cid:${cid}`,
        canonicalUrl: canonical,
        normalizedUrl: canonical,
        isValid: true,
      };
    }

    // Check g.page review URLs: https://g.page/r/[ID]/review or https://g.page/[slug]/review
    const gpageRMatch = parsed.pathname.match(/\/r\/([a-zA-Z0-9_-]+)/i);
    if (gpageRMatch && gpageRMatch[1]) {
      const reviewCode = gpageRMatch[1];
      const normalized = normalizeGoogleReviewUrl(trimmed);
      return {
        placeId: reviewCode,
        canonicalUrl: `https://g.page/r/${reviewCode}/review`,
        normalizedUrl: normalized,
        isValid: true,
      };
    }

    if (hostname.includes('g.page')) {
      const slugMatch = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (slugMatch) {
        return {
          placeId: `g.page:${slugMatch.toLowerCase()}`,
          canonicalUrl: `https://g.page/${slugMatch}/review`,
          normalizedUrl: normalizeGoogleReviewUrl(trimmed),
          isValid: true,
        };
      }
    }

    // Check /maps/place/... URLs
    if (parsed.pathname.includes('/maps') || parsed.pathname.includes('/place')) {
      // Check query 'q'
      const qParam = parsed.searchParams.get('q');
      if (qParam && qParam.startsWith('place_id:')) {
        const pid = qParam.replace('place_id:', '').trim();
        return {
          placeId: pid,
          canonicalUrl: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(pid)}`,
          normalizedUrl: normalizeGoogleReviewUrl(trimmed),
          isValid: true,
        };
      }

      // Check data parameter hex FID / PlaceID
      const dataMatch = parsed.pathname.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
      if (dataMatch && dataMatch[1]) {
        return {
          placeId: dataMatch[1],
          canonicalUrl: normalizeGoogleReviewUrl(trimmed),
          normalizedUrl: normalizeGoogleReviewUrl(trimmed),
          isValid: true,
        };
      }
    }

    // Check Google Maps short links (e.g. maps.app.goo.gl/XXXXX or goo.gl/maps/XXXXX)
    if (hostname === 'maps.app.goo.gl' || hostname === 'goo.gl') {
      const shortCode = parsed.pathname.replace(/^\/+/, '');
      if (shortCode) {
        return {
          placeId: `short:${shortCode}`,
          canonicalUrl: `https://${hostname}/${shortCode}`,
          normalizedUrl: `https://${hostname}/${shortCode}`,
          isValid: true,
        };
      }
    }

    // Fallback: If it's a recognized review pattern
    const isReviewPattern =
      parsed.pathname.includes('/review') ||
      parsed.pathname.includes('/writereview') ||
      parsed.pathname.includes('/maps');

    if (isReviewPattern) {
      const normalized = normalizeGoogleReviewUrl(trimmed);
      return {
        placeId: normalized,
        canonicalUrl: normalized,
        normalizedUrl: normalized,
        isValid: true,
      };
    }

    return {
      placeId: '',
      canonicalUrl: '',
      normalizedUrl: trimmed,
      isValid: false,
      details: 'Please enter a valid Google Review or Google Maps business URL.',
    };
  } catch {
    return {
      placeId: '',
      canonicalUrl: '',
      normalizedUrl: trimmed,
      isValid: false,
      details: 'Please enter a valid Google Review or Google Maps business URL.',
    };
  }
}

/**
 * Server-side email masking for duplicate notifications
 * Ex: durgeshjatale@gmail.com -> du************le@gmail.com
 *     johnsmith@gmail.com -> jo******th@gmail.com
 *     abc@gmail.com -> a*c@gmail.com
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return 'du************le@gmail.com';
  }

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return 'du************le@gmail.com';

  if (localPart.length <= 2) {
    return `${localPart[0]}*@${domain}`;
  }
  if (localPart.length === 3) {
    return `${localPart[0]}*${localPart[2]}@${domain}`;
  }
  if (localPart.length <= 5) {
    return `${localPart[0]}${'*'.repeat(localPart.length - 2)}${localPart[localPart.length - 1]}@${domain}`;
  }

  // Length > 5: preserve first 2 and last 2 characters
  const first = localPart.slice(0, 2);
  const last = localPart.slice(-2);
  const maskedLength = Math.max(6, localPart.length - 4);
  return `${first}${'*'.repeat(maskedLength)}${last}@${domain}`;
}
