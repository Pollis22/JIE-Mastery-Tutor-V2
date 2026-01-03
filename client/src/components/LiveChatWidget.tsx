import { useEffect, useState, useCallback } from 'react';
import { MessageCircle, X, Loader2 } from 'lucide-react';

interface LiveChatWidgetProps {
  agentId: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { 'agent-id': string },
        HTMLElement
      >;
    }
  }
}

export function LiveChatWidget({ agentId, isOpen: controlledIsOpen, onOpenChange }: LiveChatWidgetProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptError, setScriptError] = useState(false);

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
    
    const scriptUrl = 'https://elevenlabs.io/convai-widget/index.js';
    
    if (document.querySelector(`script[src="${scriptUrl}"]`)) {
      console.log('[LiveChat] Script already loaded');
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.type = 'text/javascript';
    
    script.onload = () => {
      console.log('[LiveChat] ElevenLabs widget script loaded successfully');
      setScriptLoaded(true);
    };
    
    script.onerror = (error) => {
      console.error('[LiveChat] Failed to load ElevenLabs widget script:', error);
      setScriptError(true);
    };
    
    document.head.appendChild(script);
  }, [agentId]);

  const handleOpenInNewTab = () => {
    window.open(`https://elevenlabs.io/app/talk-to?agent_id=${agentId}`, '_blank');
  };

  if (!agentId) {
    console.warn('[LiveChat] No agent ID provided, widget disabled');
    return null;
  }

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
          className="fixed bottom-24 right-6 z-50 w-[380px] bg-white dark:bg-card rounded-lg shadow-2xl overflow-hidden border border-border"
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
          
          <div className="min-h-[400px]">
            {!scriptLoaded && !scriptError && (
              <div className="flex items-center justify-center h-[400px] bg-gray-50">
                <div className="flex flex-col items-center space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-red-600" />
                  <span className="text-sm text-muted-foreground">Loading support chat...</span>
                </div>
              </div>
            )}
            
            {scriptError && (
              <div className="flex flex-col items-center justify-center h-[400px] bg-gray-50 p-6 text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Unable to load chat widget. You can still reach us:
                </p>
                <button
                  onClick={handleOpenInNewTab}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg mb-3"
                >
                  Open Chat in New Tab
                </button>
                <a 
                  href="mailto:support@jiemastery.ai" 
                  className="text-red-600 hover:underline text-sm"
                >
                  Or email support@jiemastery.ai
                </a>
              </div>
            )}
            
            {scriptLoaded && (
              <elevenlabs-convai agent-id={agentId}></elevenlabs-convai>
            )}
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
