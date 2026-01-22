// DEV ONLY – D-ID Agent embed for homepage testing
import { useEffect } from "react";

export function DidAgentEmbed() {
  useEffect(() => {
    const clientKey = import.meta.env.VITE_DID_CLIENT_KEY;
    
    if (!clientKey) {
      console.warn("[D-ID] Missing VITE_DID_CLIENT_KEY environment variable");
      return;
    }

    const existingScript = document.querySelector('script[src="https://agent.d-id.com/v2/index.js"]');
    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://agent.d-id.com/v2/index.js";
    script.async = true;
    script.setAttribute("data-mode", "full");
    script.setAttribute("data-agent-id", "v2_agt_0KyN0XA6");
    script.setAttribute("data-client-key", clientKey);
    script.setAttribute("data-monitor", "true");
    script.setAttribute("data-target-id", "did-agent-container");

    document.body.appendChild(script);

    return () => {
      const scriptToRemove = document.querySelector('script[src="https://agent.d-id.com/v2/index.js"]');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, []);

  const clientKey = import.meta.env.VITE_DID_CLIENT_KEY;
  
  if (!clientKey) {
    return null;
  }

  return (
    <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-embed">
      <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
        Talk to our Live Enrollment Specialist
      </p>
      <div 
        id="did-agent-container" 
        className="w-full rounded-xl overflow-hidden border border-border shadow-lg bg-muted/20"
        style={{ height: "480px" }}
      />
    </div>
  );
}
