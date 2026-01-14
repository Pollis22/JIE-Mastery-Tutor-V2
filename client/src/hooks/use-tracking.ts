/**
 * Google Ads + Meta Pixel SPA Tracking Hook
 * 
 * Fires page view events on both initial load and SPA route changes.
 * Prevents duplicate firing with URL deduplication.
 * 
 * Tag IDs (from index.html):
 * - Google Ads: AW-17252974185
 * - Meta Pixel: 833118612039393
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

const TRACKING_DEBUG = import.meta.env.VITE_TRACKING_DEBUG === '1' || 
                       import.meta.env.VITE_TRACKING_DEBUG === 'true';

const EXCLUDED_PREFIXES = ['/admin', '/api'];

function log(...args: any[]) {
  if (TRACKING_DEBUG) {
    console.log('[Tracking]', ...args);
  }
}

export function useTracking() {
  const [location] = useLocation();
  const lastTrackedUrl = useRef<string | null>(null);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    const fullUrl = window.location.origin + location;
    
    // Check if excluded path
    const isExcluded = EXCLUDED_PREFIXES.some(prefix => location.startsWith(prefix));
    
    // Handle initial load - clear flag even on excluded paths to ensure
    // next navigation to allowed path fires tracking
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      if (isExcluded) {
        log('Initial load on excluded path:', location);
        return;
      }
      // Initial load on allowed path - already fired by index.html
      lastTrackedUrl.current = fullUrl;
      log('Initial load - PageView already fired by index.html for:', location);
      return;
    }
    
    if (isExcluded) {
      log('Skipped (excluded path):', location);
      return;
    }

    if (lastTrackedUrl.current === fullUrl) {
      log('Skipped (duplicate):', fullUrl);
      return;
    }

    lastTrackedUrl.current = fullUrl;

    if (window.gtag) {
      window.gtag('event', 'page_view', {
        page_location: fullUrl,
        page_path: location,
        page_title: document.title
      });
      log('GA page_view fired:', location);
    } else {
      log('gtag not available');
    }

    if (window.fbq) {
      window.fbq('track', 'PageView');
      log('Meta PageView fired:', location);
    } else {
      log('fbq not available');
    }
  }, [location]);
}

export function trackEvent(eventName: string, params?: Record<string, any>) {
  if (window.gtag) {
    window.gtag('event', eventName, params);
    log('GA event fired:', eventName, params);
  }
  
  if (window.fbq && eventName !== 'page_view') {
    window.fbq('trackCustom', eventName, params);
    log('Meta custom event fired:', eventName, params);
  }
}

export function trackBeginCheckout(value?: number, currency: string = 'USD') {
  if (window.gtag) {
    window.gtag('event', 'begin_checkout', {
      value: value,
      currency: currency
    });
    log('GA begin_checkout fired, value:', value);
  }
  
  if (window.fbq) {
    window.fbq('track', 'InitiateCheckout', {
      value: value,
      currency: currency
    });
    log('Meta InitiateCheckout fired, value:', value);
  }
}

export function trackLead(params?: Record<string, any>) {
  if (window.gtag) {
    window.gtag('event', 'generate_lead', params);
    log('GA generate_lead fired:', params);
  }
  
  if (window.fbq) {
    window.fbq('track', 'Lead', params);
    log('Meta Lead fired:', params);
  }
}
