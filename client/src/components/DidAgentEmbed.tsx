// DEV ONLY – D-ID Agent embed for homepage
// 
// IMPORTANT: D-ID requires allowlisting the exact origin in the D-ID dashboard.
// Current Replit preview origin that must be added:
//   https://b25c550a-8c80-4a60-8697-07d7e8e65e8c-00-2h5xmpuah2h6j.spock.replit.dev
// 
// Add this URL (with https://) to your D-ID agent's allowed domains list.

import { useEffect, useState, useRef, useCallback } from "react";
import { ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const AGENT_ID = "v2_agt_0KyN0XA6";
const LOAD_TIMEOUT_MS = 8000; // 8 second timeout for iframe load
const DEBUG = true; // Set to false in production

function log(...args: unknown[]) {
  if (DEBUG) console.log("[D-ID]", ...args);
}

function logError(...args: unknown[]) {
  console.error("[D-ID]", ...args);
}

export function DidAgentEmbed() {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'timeout' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const clientKey = import.meta.env.VITE_DID_CLIENT_KEY;

  // Build and validate iframe src URL
  const buildIframeSrc = useCallback((): string | null => {
    if (!clientKey) {
      logError("Missing VITE_DID_CLIENT_KEY environment variable");
      return null;
    }
    
    if (!AGENT_ID || AGENT_ID.length < 5) {
      logError("Invalid AGENT_ID configuration");
      return null;
    }
    
    const url = `https://agents.d-id.com/${AGENT_ID}?clientKey=${encodeURIComponent(clientKey)}`;
    log("Built iframe src:", url.replace(clientKey, "CLIENT_KEY_HIDDEN"));
    return url;
  }, [clientKey]);

  const iframeSrc = buildIframeSrc();

  // Handle successful load
  const handleLoad = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    log("Iframe load event fired ✓");
    setStatus('loaded');
  }, []);

  // Handle error
  const handleError = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    logError("Iframe error event fired");
    setStatus('error');
    setErrorMessage("Failed to load the avatar. The iframe triggered an error event.");
  }, []);

  // Retry loading
  const handleRetry = useCallback(() => {
    log("Retrying iframe load...");
    setStatus('loading');
    setErrorMessage(null);
    
    // Force iframe reload by updating key
    if (iframeRef.current && iframeSrc) {
      iframeRef.current.src = iframeSrc;
    }
  }, [iframeSrc]);

  // Open in new tab for diagnostics
  const handleOpenInNewTab = useCallback(() => {
    if (iframeSrc) {
      log("Opening iframe src in new tab for diagnostics");
      window.open(iframeSrc, '_blank', 'noopener,noreferrer');
    }
  }, [iframeSrc]);

  // Set up load timeout
  useEffect(() => {
    if (!iframeSrc) return;
    
    log("Initializing embed with agent:", AGENT_ID);
    log("Timeout set for", LOAD_TIMEOUT_MS, "ms");
    
    timeoutRef.current = setTimeout(() => {
      if (status === 'loading') {
        logError("Iframe load timeout after", LOAD_TIMEOUT_MS, "ms");
        setStatus('timeout');
        setErrorMessage(
          "Avatar took too long to load. This could be due to network issues, " +
          "DNS problems, ad blockers, or firewall restrictions blocking agents.d-id.com."
        );
      }
    }, LOAD_TIMEOUT_MS);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [iframeSrc, status]);

  // Missing client key - show config error
  if (!clientKey) {
    return (
      <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-embed">
        <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
          Talk to our Live Enrollment Specialist
        </p>
        <div className="w-full rounded-2xl border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-400 mx-auto mb-3" />
          <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
            Configuration Required
          </p>
          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
            VITE_DID_CLIENT_KEY environment variable is not set.
          </p>
        </div>
      </div>
    );
  }

  // Invalid iframe src - show config error
  if (!iframeSrc) {
    return (
      <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-embed">
        <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
          Talk to our Live Enrollment Specialist
        </p>
        <div className="w-full rounded-2xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-800 dark:text-red-200 font-medium">
            Configuration Error
          </p>
          <p className="text-xs text-red-700 dark:text-red-300 mt-2">
            Unable to build valid embed URL.
          </p>
        </div>
      </div>
    );
  }

  // Timeout or Error state - show fallback UI with diagnostic options
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
            {errorMessage || "Please check your network connection or allow agents.d-id.com in your browser/firewall."}
          </p>
          
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
          </div>
          
          <p className="text-xs text-muted-foreground mt-4">
            If the avatar loads in a new tab but not here, your browser may be blocking embedded content.
          </p>
        </div>
      </div>
    );
  }

  // Loading or Loaded state - show iframe
  return (
    <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-embed">
      <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
        Talk to our Live Enrollment Specialist
      </p>
      <div 
        className="w-full rounded-2xl overflow-hidden border border-border shadow-lg bg-muted/20 relative"
        style={{ height: "520px" }}
      >
        {/* Loading overlay */}
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-3" />
            <p className="text-sm text-muted-foreground">Loading avatar...</p>
          </div>
        )}
        
        {/* D-ID iframe */}
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="D-ID AI Enrollment Specialist"
          className="w-full h-full border-0"
          allow="camera; microphone; autoplay; encrypted-media"
          onLoad={handleLoad}
          onError={handleError}
          data-testid="did-iframe"
        />
      </div>
      
      {/* Diagnostic link (always visible when loaded) */}
      {status === 'loaded' && (
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
      )}
    </div>
  );
}
