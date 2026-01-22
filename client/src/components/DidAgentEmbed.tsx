// DEV ONLY – D-ID Agent embed for homepage testing
// 
// IMPORTANT: D-ID requires allowlisting the exact origin in the D-ID dashboard.
// Current Replit preview origin that must be added:
//   https://b25c550a-8c80-4a60-8697-07d7e8e65e8c-00-2h5xmpuah2h6j.spock.replit.dev
// 
// Add this URL (with https://) to your D-ID agent's allowed domains list.

import { useEffect } from "react";

const SCRIPT_ID = "did-agent-script";
const SCRIPT_SRC = "https://agent.d-id.com/v2/index.js";

export function DidAgentEmbed() {
  useEffect(() => {
    const clientKey = import.meta.env.VITE_DID_CLIENT_KEY;
    
    if (!clientKey) {
      console.error("[D-ID] Missing VITE_DID_CLIENT_KEY");
      return;
    }

    // Check if script already exists (React StrictMode runs effects twice)
    if (document.getElementById(SCRIPT_ID)) {
      console.log("[D-ID] Script already injected, skipping");
      return;
    }

    // Verify target div exists
    const targetDiv = document.getElementById("did-agent-container");
    if (!targetDiv) {
      console.error("[D-ID] Target div #did-agent-container not found");
      return;
    }

    console.log("[D-ID] Injecting script...");

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.setAttribute("data-mode", "full");
    script.setAttribute("data-agent-id", "v2_agt_0KyN0XA6");
    script.setAttribute("data-client-key", clientKey);
    script.setAttribute("data-monitor", "true");
    script.setAttribute("data-target-id", "did-agent-container");

    script.onload = () => {
      console.log("[D-ID] Script loaded");
    };

    script.onerror = () => {
      console.error("[D-ID] Script failed to load");
    };

    document.body.appendChild(script);

    // DO NOT remove the script on unmount to avoid breaking HMR re-init loops
  }, []);

  const clientKey = import.meta.env.VITE_DID_CLIENT_KEY;
  
  if (!clientKey) {
    return (
      <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl text-sm text-yellow-800 dark:text-yellow-200">
        D-ID Agent: Missing VITE_DID_CLIENT_KEY environment variable
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-embed">
      <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
        Talk to our Live Enrollment Specialist
      </p>
      <div 
        id="did-agent-container" 
        className="w-full rounded-2xl overflow-hidden border border-border shadow-lg bg-muted/20"
        style={{ height: "520px" }}
      />
    </div>
  );
}
