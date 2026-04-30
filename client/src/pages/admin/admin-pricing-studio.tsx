import { useEffect, useRef, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Maximize2, Minimize2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

// Cache-buster: changes on every build/deploy so the iframe reloads
// the latest pricing-studio.html instead of serving a cached version.
const STUDIO_VERSION = `v=${Date.now()}`;

export default function AdminPricingStudio() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Allow iframe to be full height of the viewport
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Optional: handle messages from iframe if needed in future
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const openInNewTab = () => {
    window.open(`/pricing-studio.html?${STUDIO_VERSION}`, "_blank");
  };

  return (
    <AdminLayout>
      <div className={`flex flex-col ${fullscreen ? "fixed inset-0 z-50 bg-white" : ""}`}
        style={{ height: fullscreen ? "100vh" : "calc(100vh - 80px)" }}>
        
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-white flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Quote & Pricing Studio</h1>
            <p className="text-xs text-gray-500">Model institutional deals · Generate client quotes · Internal margin reports</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openInNewTab}
              className="flex items-center gap-1.5 text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in New Tab
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFullscreen(!fullscreen)}
              className="flex items-center gap-1.5 text-xs"
            >
              {fullscreen
                ? <><Minimize2 className="w-3.5 h-3.5" /> Exit Fullscreen</>
                : <><Maximize2 className="w-3.5 h-3.5" /> Fullscreen</>
              }
            </Button>
          </div>
        </div>

        {/* iframe — runs in real browser context, no sandbox restrictions */}
        <iframe
          ref={iframeRef}
          src={`/pricing-studio.html?${STUDIO_VERSION}`}
          className="flex-1 w-full border-0"
          title="JIE Mastery Quote & Pricing Studio"
          // No sandbox attribute — full browser context, PDF downloads work
        />
      </div>
    </AdminLayout>
  );
}
