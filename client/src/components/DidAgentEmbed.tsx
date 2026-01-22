// DEV ONLY – D-ID Agent embed for homepage testing
// 
// IMPORTANT: D-ID requires allowlisting the exact origin in the D-ID dashboard.
// Current Replit preview origin that must be added:
//   https://b25c550a-8c80-4a60-8697-07d7e8e65e8c-00-2h5xmpuah2h6j.spock.replit.dev
// 
// Add this URL (with https://) to your D-ID agent's allowed domains list.

import { useEffect, useState } from "react";

const AGENT_ID = "v2_agt_0KyN0XA6";

export function DidAgentEmbed() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const clientKey = import.meta.env.VITE_DID_CLIENT_KEY;

  useEffect(() => {
    if (!clientKey) {
      console.error("[D-ID] Missing VITE_DID_CLIENT_KEY");
      setError("Missing D-ID client key");
      setIsLoading(false);
      return;
    }
    console.log("[D-ID] Iframe embed initialized with agent:", AGENT_ID);
  }, [clientKey]);
  
  if (!clientKey) {
    return (
      <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl text-sm text-yellow-800 dark:text-yellow-200">
        D-ID Agent: Missing VITE_DID_CLIENT_KEY environment variable
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-800 dark:text-red-200">
        D-ID Agent Error: {error}
      </div>
    );
  }

  const iframeSrc = `https://agents.d-id.com/${AGENT_ID}?clientKey=${encodeURIComponent(clientKey)}`;

  return (
    <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-embed">
      <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
        Talk to our Live Enrollment Specialist
      </p>
      <div 
        className="w-full rounded-2xl overflow-hidden border border-border shadow-lg bg-muted/20 relative"
        style={{ height: "520px" }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        )}
        <iframe
          src={iframeSrc}
          title="D-ID AI Agent"
          className="w-full h-full border-0"
          allow="camera; microphone; autoplay; encrypted-media"
          onLoad={() => {
            console.log("[D-ID] Iframe loaded ✓");
            setIsLoading(false);
          }}
          onError={() => {
            console.error("[D-ID] Iframe failed to load");
            setError("Failed to load agent");
            setIsLoading(false);
          }}
        />
      </div>
    </div>
  );
}
