import { useEffect, useRef, useState } from "react";
import { usePerformanceMonitor } from "@/hooks/use-performance-monitor";

type Props = {
  agentId: string;
  firstUserMessage?: string;
  metadata?: Record<string, any>;
  onMounted?: () => void;
  onUnmounted?: () => void;
};

export default function ConvaiHost({
  agentId,
  firstUserMessage,
  metadata = {},
  onMounted,
  onUnmounted,
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
      console.log("[ConvAI Debug] Setting first-user-message:", firstUserMessage);
      el.setAttribute("first-user-message", firstUserMessage);
    }
    
    if (metadata.systemPrompt) {
      console.log("[ConvAI Debug] Setting system-prompt");
      el.setAttribute("system-prompt", metadata.systemPrompt);
    }
    
    for (const [k, v] of Object.entries(metadata)) {
      if (k !== 'systemPrompt') {
        const value = typeof v === 'string' ? v : JSON.stringify(v);
        console.log(`[ConvAI Debug] Setting metadata-${k}:`, value);
        el.setAttribute(`metadata-${k}`, value);
      }
    }

    // Add event listeners for performance monitoring and debugging
    el.addEventListener("widget-ready", () => {
      console.log("[ConvAI Debug] ✅ Widget ready event fired for agent:", agentId);
      perf.markFirstInteraction();
    });

    el.addEventListener("user-spoke", (e: any) => {
      console.log("[ConvAI Debug] 🗣️ User spoke:", e.detail);
      perf.incrementTurn();
    });

    el.addEventListener("agent-spoke", (e: any) => {
      console.log("[ConvAI Debug] 🤖 Agent spoke:", e.detail);
      perf.incrementTurn();
    });

    el.addEventListener("error", (e: any) => {
      console.error("[ConvAI Debug] ❌ Widget error:", e.detail || e);
      perf.incrementError();
    });
    
    el.addEventListener("connection-status", (e: any) => {
      console.log("[ConvAI Debug] 🔌 Connection status:", e.detail);
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
  }, [ready, agentId, firstUserMessage, metadata, onMounted, onUnmounted, perf]);

  return <div ref={containerRef} className="convai-container" data-testid="convai-widget-container" />;
}