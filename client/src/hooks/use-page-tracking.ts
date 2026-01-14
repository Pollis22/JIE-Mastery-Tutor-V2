import { useEffect } from 'react';
import { useLocation } from 'wouter';

const EXCLUDED_PREFIXES = ['/admin', '/api', '/auth', '/admin-'];

function getOrCreateSessionId(): string {
  const key = 'sv_session_id';
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}

function hasTrackedThisSession(): boolean {
  return sessionStorage.getItem('sv_tracked') === 'true';
}

function markSessionTracked(): void {
  sessionStorage.setItem('sv_tracked', 'true');
}

export function usePageTracking() {
  const [location] = useLocation();

  useEffect(() => {
    // Only track once per session (site visit = first landing, not every page view)
    if (hasTrackedThisSession()) return;
    
    // Skip admin/api/auth pages as landing pages
    const shouldSkip = EXCLUDED_PREFIXES.some(prefix => location.startsWith(prefix));
    if (shouldSkip) return;
    
    const sessionId = getOrCreateSessionId();
    const referrer = document.referrer || '';

    fetch('/api/analytics/site-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        landingPage: location,
        pageTitle: document.title,
        sessionId,
        referrer,
      }),
    })
    .then(res => {
      if (res.ok) {
        // Only mark as tracked after successful request
        markSessionTracked();
      }
    })
    .catch(() => {
      // Don't mark as tracked on failure - allow retry on next navigation
    });
  }, [location]);
}
