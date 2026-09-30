/**
 * Reliable Analytics Transport for Customer Flows
 * Designed for Safari ITP, mobile page lifecycles, and immediate external redirects.
 *
 * Guiding Principles:
 * 1. Never block or delay customer navigation to Google.
 * 2. Graceful degradation: If analytics fail or are blocked by ad-blockers, customer flow continues seamlessly.
 * 3. Keepalive & sendBeacon: Uses fetch(keepalive: true) with fallback to navigator.sendBeacon so requests
 *    survive tab closure/navigation.
 */

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return '/api/v1';
    }
  }
  const envUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
  return envUrl.endsWith('/api/v1') ? envUrl : `${envUrl}/api/v1`;
};

/**
 * Resolves relative or full API endpoint URL
 */
export function resolveApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const base = getApiBaseUrl();
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${cleanBase}${cleanEndpoint}`;
}

/**
 * Dispatches a non-blocking analytics beacon designed to survive external navigation.
 * Uses fetch with keepalive: true (Safari 13+, Chrome, Edge, Firefox),
 * falling back to navigator.sendBeacon or standard fetch.
 *
 * Does NOT throw errors. If ad-blockers block the network request, it degrades gracefully.
 */
export function sendReliableAnalyticsBeacon(endpoint: string, payload: Record<string, any>): void {
  if (typeof window === 'undefined') return;

  const url = resolveApiUrl(endpoint);
  const jsonString = JSON.stringify(payload);

  // Strategy 1: Modern fetch with keepalive: true (supports CORS headers, survives page unload)
  if (typeof fetch === 'function') {
    try {
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonString,
        keepalive: true,
        mode: 'cors',
        credentials: 'omit',
      }).catch((err) => {
        // Silently degrade; do not disrupt the customer
        console.debug('[Analytics Beacon] Keepalive fetch notice (graceful degradation):', err?.message || err);
      });
      return;
    } catch (err) {
      console.debug('[Analytics Beacon] Fetch keepalive thrown, attempting sendBeacon fallback:', err);
    }
  }

  // Strategy 2: navigator.sendBeacon fallback (using text/plain to avoid CORS preflight failures during unload)
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([jsonString], { type: 'text/plain;charset=UTF-8' });
      const queued = navigator.sendBeacon(url, blob);
      if (queued) return;
    } catch (beaconErr) {
      console.debug('[Analytics Beacon] sendBeacon notice:', beaconErr);
    }
  }

  // Strategy 3: Standard asynchronous fetch fallback (fire and forget)
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonString,
      mode: 'cors',
    }).catch(() => {});
  } catch {
    // Ignore all errors in analytics transport
  }
}

/**
 * Opens Google Review URL reliably on mobile and desktop browsers:
 * - Executes synchronously inside user-initiated click tick to prevent iOS Safari popup blocking.
 * - If popup blocker still intervenes (window.open returns null), falls back to direct navigation.
 * - Customer navigation NEVER awaits analytics.
 */
export function openGoogleReviewDestination(targetUrl: string): boolean {
  if (typeof window === 'undefined' || !targetUrl) return false;

  const cleanUrl = targetUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    return false;
  }

  try {
    // Attempt standard new window/tab
    const newWindow = window.open(cleanUrl, '_blank', 'noopener,noreferrer');
    
    // Check if popup was blocked or in restricted iframe/webview
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      window.location.href = cleanUrl;
    }
    return true;
  } catch {
    try {
      window.location.href = cleanUrl;
      return true;
    } catch {
      return false;
    }
  }
}
