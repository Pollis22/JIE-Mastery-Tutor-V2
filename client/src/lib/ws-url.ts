/**
 * WebSocket URL Builder
 * 
 * Safely constructs WebSocket URLs with validation to prevent
 * invalid URLs like "wss://localhost:undefined".
 */

export interface WsUrlOptions {
  path: string;
  queryParams?: Record<string, string>;
}

/**
 * Build a WebSocket URL based on the current window location.
 * Returns null if the URL cannot be safely constructed.
 * 
 * @param options - Path and optional query parameters
 * @returns The WebSocket URL string, or null if invalid
 */
export function buildWsUrl(options: WsUrlOptions): string | null {
  const { path, queryParams } = options;
  
  // Validate window.location is available
  if (typeof window === 'undefined' || !window.location) {
    console.warn('[WS-URL] window.location not available');
    return null;
  }
  
  const { protocol, host } = window.location;
  
  // Validate host is defined and not empty
  if (!host || host === 'undefined' || host.includes('undefined')) {
    console.warn('[WS-URL] Invalid host:', host);
    return null;
  }
  
  // Determine WebSocket protocol
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  
  // Build base URL
  let wsUrl = `${wsProtocol}//${host}${path.startsWith('/') ? path : '/' + path}`;
  
  // Add query parameters if provided
  if (queryParams && Object.keys(queryParams).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    }
    const queryString = params.toString();
    if (queryString) {
      wsUrl += `?${queryString}`;
    }
  }
  
  // Final validation - check for undefined in URL
  if (wsUrl.includes('undefined') || wsUrl.includes('null')) {
    console.warn('[WS-URL] Invalid URL contains undefined/null:', wsUrl);
    return null;
  }
  
  return wsUrl;
}

/**
 * Validate a WebSocket URL string.
 * 
 * @param url - The URL to validate
 * @returns true if valid, false otherwise
 */
export function isValidWsUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  // Check for common invalid patterns
  if (url.includes('undefined') || url.includes('null')) {
    return false;
  }
  
  // Check protocol
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    return false;
  }
  
  // Try to parse as URL
  try {
    const parsed = new URL(url);
    return parsed.host !== '' && parsed.host !== 'undefined';
  } catch {
    return false;
  }
}
