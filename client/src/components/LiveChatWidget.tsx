import { useEffect, useState, useCallback } from 'react';
import { MessageCircle, X, Loader2 } from 'lucide-react';

interface LiveChatWidgetProps {
  agentId: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LiveChatWidget({ agentId, isOpen: controlledIsOpen, onOpenChange }: LiveChatWidgetProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  
  const setIsOpen = useCallback((open: boolean) => {
    console.log('[LiveChat] setIsOpen called:', open);
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setInternalIsOpen(open);
    }
  }, [onOpenChange]);

  useEffect(() => {
    console.log('[LiveChat] Component mounted, agentId:', agentId ? 'present' : 'missing');
  }, [agentId]);

  const handleIframeLoad = () => {
    console.log('[LiveChat] Iframe loaded successfully');
    setIsLoading(false);
  };

  const handleIframeError = () => {
    console.error('[LiveChat] Iframe failed to load');
    setIsLoading(false);
  };

  if (!agentId) {
    console.warn('[LiveChat] No agent ID provided, widget disabled');
    return null;
  }

  const iframeSrc = `https://elevenlabs.io/convai/${agentId}`;
  console.log('[LiveChat] Rendering widget, isOpen:', isOpen, 'iframeSrc:', iframeSrc);

  return (
    <>
      <button
        onClick={() => {
          console.log('[LiveChat] Toggle button clicked, current isOpen:', isOpen);
          setIsOpen(!isOpen);
        }}
        className="fixed bottom-6 right-6 z-50 bg-red-600 hover:bg-red-700 text-white rounded-full p-4 shadow-lg transition-all hover:scale-105"
        aria-label="Open live chat"
        data-testid="button-live-chat-toggle"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>
      
      {isOpen && (
        <div 
          className="fixed bottom-24 right-6 z-50 w-[380px] h-[600px] bg-white dark:bg-card rounded-lg shadow-2xl overflow-hidden border border-border"
          data-testid="container-live-chat"
        >
          <div className="flex items-center justify-between p-4 bg-red-600 text-white">
            <div className="flex items-center space-x-2">
              <MessageCircle className="h-5 w-5" />
              <span className="font-semibold">JIE Mastery Support</span>
            </div>
            <button 
              onClick={() => {
                console.log('[LiveChat] Close button clicked');
                setIsOpen(false);
              }} 
              className="hover:bg-red-700 rounded p-1 transition-colors"
              aria-label="Close chat"
              data-testid="button-close-chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="h-[calc(100%-64px)] relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-red-600" />
                  <span className="text-sm text-muted-foreground">Connecting to support...</span>
                </div>
              </div>
            )}
            <iframe
              src={iframeSrc}
              className="w-full h-full border-0"
              allow="microphone"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title="JIE Mastery Live Support Chat"
            />
          </div>
        </div>
      )}

      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default LiveChatWidget;
