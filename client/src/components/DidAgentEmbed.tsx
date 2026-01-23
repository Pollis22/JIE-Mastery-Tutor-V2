/**
 * D-ID Agent Embed Component
 * 
 * Embeds a D-ID conversational AI avatar on the landing page.
 * Uses server-side session management via /api/did/session to avoid
 * exposing client keys in the browser.
 * 
 * Features:
 * - Server-side embed URL generation
 * - 8-second load timeout with fallback UI
 * - Health check diagnostics
 * - Retry and "Open in new tab" options
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { ExternalLink, RefreshCw, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const LOAD_TIMEOUT_MS = 8000;
const DEBUG = true;

function log(...args: unknown[]) {
  if (DEBUG) console.log("[D-ID]", ...args);
}

function logError(...args: unknown[]) {
  console.error("[D-ID]", ...args);
}

interface SessionResponse {
  ok: boolean;
  embedUrl?: string;
  agentId?: string;
  status?: number;
  message?: string;
  code?: string;
}

interface HealthResponse {
  ok: boolean;
  dnsOk: boolean;
  httpOk: boolean;
  httpStatus?: number;
  configured: boolean;
  dnsError?: string;
  httpError?: string;
}

export function DidAgentEmbed() {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'timeout' | 'error'>('loading');
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [healthInfo, setHealthInfo] = useState<HealthResponse | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);
  const fetchedRef = useRef(false);

  // Fetch session from server
  const fetchSession = useCallback(async () => {
    try {
      log("Fetching session from server...");
      const response = await fetch('/api/did/session');
      const data: SessionResponse = await response.json();
      
      if (data.ok && data.embedUrl) {
        log("Session received:", data.agentId);
        log("Embed URL:", data.embedUrl.replace(/clientKey=[^&]+/, 'clientKey=HIDDEN'));
        setEmbedUrl(data.embedUrl);
        return true;
      } else {
        logError("Session failed:", data.message || data.code);
        setErrorMessage(data.message || 'Failed to get D-ID session');
        setStatus('error');
        return false;
      }
    } catch (error) {
      logError("Session fetch error:", error);
      setErrorMessage('Failed to connect to server');
      setStatus('error');
      return false;
    }
  }, []);

  // Fetch health info for diagnostics
  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/did/health');
      const data: HealthResponse = await response.json();
      log("Health check:", data);
      setHealthInfo(data);
    } catch (error) {
      log("Health check failed:", error);
    }
  }, []);

  // Handle successful iframe load
  const handleLoad = useCallback(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    log("Iframe load event fired ✓");
    setStatus('loaded');
  }, []);

  // Handle iframe error
  const handleError = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    logError("Iframe error event fired");
    setStatus('error');
    setErrorMessage("Failed to load the avatar iframe.");
  }, []);

  // Retry loading
  const handleRetry = useCallback(() => {
    log("Retrying...");
    hasLoadedRef.current = false;
    fetchedRef.current = false;
    setEmbedUrl(null);
    setStatus('loading');
    setErrorMessage(null);
    setRetryCount(c => c + 1);
  }, []);

  // Open in new tab for diagnostics
  const handleOpenInNewTab = useCallback(() => {
    if (embedUrl) {
      log("Opening in new tab for diagnostics");
      window.open(embedUrl, '_blank', 'noopener,noreferrer');
    }
  }, [embedUrl]);

  // Fetch session on mount/retry
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    
    fetchSession();
  }, [fetchSession, retryCount]);

  // Set up load timeout when we have an embed URL
  useEffect(() => {
    if (!embedUrl || status !== 'loading') return;
    
    log("Setting up timeout for", LOAD_TIMEOUT_MS, "ms");
    
    timeoutRef.current = setTimeout(() => {
      if (!hasLoadedRef.current) {
        logError("Iframe load timeout after", LOAD_TIMEOUT_MS, "ms");
        setStatus('timeout');
        setErrorMessage(
          "Avatar took too long to load. This could be due to network issues, " +
          "DNS problems, or firewall restrictions blocking agents.d-id.com."
        );
        // Fetch health info for diagnostics
        fetchHealth();
      }
    }, LOAD_TIMEOUT_MS);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [embedUrl, status, fetchHealth]);

  // Timeout or Error state - show fallback UI with diagnostics
  if (status === 'timeout' || status === 'error') {
    return (
      <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-embed">
        <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
          Talk to our Live Enrollment Specialist
        </p>
        <div 
          className="w-full rounded-2xl border border-border bg-muted/30 p-6 text-center"
          style={{ minHeight: "300px" }}
        >
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <p className="text-base font-medium text-foreground mb-2">
            Avatar could not load
          </p>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
            {errorMessage || "Please check your network connection."}
          </p>
          
          {/* Diagnostic info */}
          {healthInfo && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg text-left text-xs space-y-1">
              <p className="font-medium text-foreground mb-2">Diagnostics:</p>
              <div className="flex items-center gap-2">
                {healthInfo.dnsOk ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-500" />
                )}
                <span>DNS: {healthInfo.dnsOk ? 'OK' : healthInfo.dnsError || 'Failed'}</span>
              </div>
              <div className="flex items-center gap-2">
                {healthInfo.httpOk ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-500" />
                )}
                <span>
                  D-ID Status: {healthInfo.httpOk ? 'OK' : 'Unreachable'}
                  {healthInfo.httpStatus && ` (HTTP ${healthInfo.httpStatus})`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {healthInfo.configured ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-500" />
                )}
                <span>Configuration: {healthInfo.configured ? 'OK' : 'Missing'}</span>
              </div>
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRetry}
              className="gap-2"
              data-testid="did-retry-button"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
            {embedUrl && (
              <Button 
                variant="secondary" 
                size="sm"
                onClick={handleOpenInNewTab}
                className="gap-2"
                data-testid="did-open-newtab-button"
              >
                <ExternalLink className="w-4 h-4" />
                Open in new tab
              </Button>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground mt-4">
            If the avatar loads in a new tab but not here, your browser may be blocking embedded content.
          </p>
        </div>
      </div>
    );
  }

  // Loading state (no embedUrl yet or waiting for iframe)
  if (!embedUrl || status === 'loading') {
    return (
      <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-embed">
        <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
          Talk to our Live Enrollment Specialist
        </p>
        <div 
          className="w-full rounded-2xl overflow-hidden border border-border shadow-lg bg-muted/20 relative"
          style={{ height: "520px" }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-3" />
            <p className="text-sm text-muted-foreground">Loading avatar...</p>
          </div>
          
          {/* Render iframe in background if we have URL */}
          {embedUrl && (
            <iframe
              key={`did-iframe-${retryCount}`}
              ref={iframeRef}
              src={embedUrl}
              title="D-ID AI Enrollment Specialist"
              className="w-full h-full border-0"
              allow="camera; microphone; autoplay; encrypted-media"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              onLoad={handleLoad}
              onError={handleError}
              data-testid="did-iframe"
            />
          )}
        </div>
      </div>
    );
  }

  // Loaded state - show iframe
  return (
    <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-embed">
      <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
        Talk to our Live Enrollment Specialist
      </p>
      <div 
        className="w-full rounded-2xl overflow-hidden border border-border shadow-lg bg-muted/20 relative"
        style={{ height: "520px" }}
      >
        <iframe
          key={`did-iframe-${retryCount}`}
          ref={iframeRef}
          src={embedUrl}
          title="D-ID AI Enrollment Specialist"
          className="w-full h-full border-0"
          allow="camera; microphone; autoplay; encrypted-media"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          onLoad={handleLoad}
          onError={handleError}
          data-testid="did-iframe"
        />
      </div>
      
      <div className="mt-2 text-center">
        <button
          onClick={handleOpenInNewTab}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1"
          data-testid="did-open-newtab-link"
        >
          <ExternalLink className="w-3 h-3" />
          Open in new tab
        </button>
      </div>
    </div>
  );
}
