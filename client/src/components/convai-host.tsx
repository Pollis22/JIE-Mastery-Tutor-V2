import { useEffect, useRef, useState } from "react";
import { usePerformanceMonitor } from "@/hooks/use-performance-monitor";

export interface ConvaiMessage {
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
}

type Props = {
  agentId: string;
  firstUserMessage?: string;
  metadata?: Record<string, any>;
  onMounted?: () => void;
  onUnmounted?: () => void;
  onMessage?: (message: ConvaiMessage) => void;
  onConnectionStatus?: (connected: boolean) => void;
};

export default function ConvaiHost({
  agentId,
  firstUserMessage,
  metadata = {},
  onMounted,
  onUnmounted,
  onMessage,
  onConnectionStatus,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const perf = usePerformanceMonitor(agentId);

  // Load embed script once
  useEffect(() => {
    console.log("[ConvAI Debug] Starting script load...");
    const existing = document.querySelector('script[data-elevenlabs-convai]');
    if (existing) {
      console.log("[ConvAI Debug] Script already exists, marking ready");
      setReady(true);
      perf.markScriptLoaded();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
    s.async = true;
    s.type = "text/javascript";
    s.setAttribute("data-elevenlabs-convai", "1");
    s.onload = () => {
      console.log("[ConvAI Debug] ✅ Script loaded successfully");
      setReady(true);
      perf.markScriptLoaded();
    };
    s.onerror = (err) => {
      console.error("[ConvAI Debug] ❌ Failed to load script:", err);
      perf.incrementError();
    };
    document.body.appendChild(s);
  }, [perf]);

  // Mount on agentId change
  useEffect(() => {
    console.log("[ConvAI Debug] Mount effect triggered. Ready:", ready, "Container:", !!containerRef.current);
    
    if (!ready || !containerRef.current) {
      console.log("[ConvAI Debug] Skipping mount - not ready or no container");
      return;
    }
    
    console.log("[ConvAI Debug] 🎤 Creating widget element for agent:", agentId);
    console.log("[ConvAI Debug] First message:", firstUserMessage);
    console.log("[ConvAI Debug] Metadata:", metadata);
    console.log("[ConvAI Debug] Protocol:", window.location.protocol);
    console.log("[ConvAI Debug] Browser:", navigator.userAgent.substring(0, 50) + "...");
    
    containerRef.current.setAttribute("aria-busy", "true");
    containerRef.current.innerHTML = "";

    const el = document.createElement("elevenlabs-convai");
    el.setAttribute("agent-id", agentId);
    
    if (firstUserMessage) {
      console.log("[ConvAI Debug] ✅ Setting first-user-message (length:", firstUserMessage.length, ")");
      console.log("[ConvAI Debug] First message preview:", firstUserMessage.substring(0, 200) + "...");
      el.setAttribute("first-user-message", firstUserMessage);
    } else {
      console.warn("[ConvAI Debug] ⚠️ No firstUserMessage provided!");
    }
    
    // Note: ElevenLabs ConvAI does NOT support system-prompt or metadata-* attributes
    // All context must be in the first-user-message
    console.log("[ConvAI Debug] Skipping metadata (not supported by ElevenLabs)");

    // Add event listeners for performance monitoring and debugging
    el.addEventListener("message", (e: any) => {
      const messageData = e.detail;
      console.log("[ConvAI Debug] 📩 Message received:", messageData);
      
      // Handle different message types
      switch (messageData?.type) {
        case 'user_transcript':
          // User finished speaking
          console.log("[ConvAI Debug] 🗣️ User transcript:", messageData.transcript);
          perf.incrementTurn();
          if (messageData.transcript) {
            onMessage?.({
              type: 'user',
              content: messageData.transcript,
              timestamp: new Date()
            });
          }
          break;
          
        case 'agent_response':
          // Agent sent a complete message
          console.log("[ConvAI Debug] 🤖 Agent response:", messageData.response);
          perf.incrementTurn();
          if (messageData.response) {
            onMessage?.({
              type: 'agent',
              content: messageData.response,
              timestamp: new Date()
            });
          }
          break;
          
        case 'connection':
          // Connection status changed
          console.log("[ConvAI Debug] 🔌 Connection:", messageData.status);
          const isConnected = messageData.status === 'connected';
          onConnectionStatus?.(isConnected);
          if (isConnected) {
            perf.markFirstInteraction();
            onMessage?.({
              type: 'system',
              content: '✅ Connected to AI Tutor',
              timestamp: new Date()
            });
          }
          break;
          
        case 'error':
          console.error("[ConvAI Debug] ❌ Error:", messageData);
          perf.incrementError();
          onMessage?.({
            type: 'system',
            content: `❌ Error: ${messageData.message || 'Connection error'}`,
            timestamp: new Date()
          });
          break;
          
        default:
          // Log unknown message types for debugging
          console.log("[ConvAI Debug] Unknown message type:", messageData?.type, messageData);
      }
    });

    console.log("[ConvAI Debug] Appending widget to container...");
    if (containerRef.current) {
      containerRef.current.appendChild(el);
      containerRef.current.removeAttribute("aria-busy");
      console.log("[ConvAI Debug] ✅ Widget appended to DOM");
    }
    perf.markWidgetMounted();
    onMounted?.();

    return () => {
      try {
        (el as any)?.disconnect?.();
      } catch {}
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      onUnmounted?.();
    };
  }, [ready, agentId, firstUserMessage, onMounted, onUnmounted, perf]);

  return <div ref={containerRef} className="convai-container" data-testid="convai-widget-container" />;
}