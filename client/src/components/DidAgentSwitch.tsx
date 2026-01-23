/**
 * D-ID Agent Switch Component
 * 
 * Switches between embed mode and API (WebRTC) mode based on DID_MODE.
 * 
 * Feature Flag:
 * - DID_MODE=api  -> Uses WebRTC streaming (DidAgentWebRTC)
 * - DID_MODE=embed (default) -> Uses iframe embed (DidAgentEmbed)
 */

import { useEffect, useState } from "react";
import { DidAgentEmbed } from "./DidAgentEmbed";
import { DidAgentWebRTC } from "./DidAgentWebRTC";

interface ModeStatus {
  mode: string;
}

export function DidAgentSwitch() {
  const [mode, setMode] = useState<'api' | 'embed' | 'loading'>('loading');

  useEffect(() => {
    async function fetchMode() {
      try {
        const response = await fetch('/api/did-api/status');
        const data: ModeStatus = await response.json();
        setMode(data.mode === 'api' ? 'api' : 'embed');
      } catch (error) {
        console.log('[D-ID Switch] Failed to fetch mode, defaulting to embed');
        setMode('embed');
      }
    }
    
    fetchMode();
  }, []);

  if (mode === 'loading') {
    return (
      <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-loading">
        <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
          Talk to our Live Enrollment Specialist
        </p>
        <div 
          className="w-full rounded-2xl border border-border bg-muted/20 p-8 text-center"
          style={{ minHeight: "300px" }}
        >
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin w-6 h-6 border-3 border-primary border-t-transparent rounded-full mb-3" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'api') {
    return <DidAgentWebRTC />;
  }

  return <DidAgentEmbed />;
}
