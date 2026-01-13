import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

const EXCLUDED_PREFIXES = ['/admin', '/api', '/auth', '/admin-'];

function getOrCreateSessionId(): string {
  const key = 'pv_session_id';
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}

export function usePageTracking() {
  const [location] = useLocation();
  const lastTracked = useRef<string>('');

  useEffect(() => {
    if (lastTracked.current === location) return;
    
    const shouldSkip = EXCLUDED_PREFIXES.some(prefix => location.startsWith(prefix));
    if (shouldSkip) return;

    lastTracked.current = location;
    const sessionId = getOrCreateSessionId();

    fetch('/api/analytics/page-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagePath: location,
        pageTitle: document.title,
        sessionId,
      }),
    }).catch(() => {});
  }, [location]);
}
