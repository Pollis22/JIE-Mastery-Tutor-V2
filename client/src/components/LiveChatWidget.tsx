import { useEffect, useState, useCallback } from 'react';
import { MessageCircle, X } from 'lucide-react';

interface LiveChatWidgetProps {
  agentId: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { 'agent-id': string }, HTMLElement>;
    }
  }
}

export function LiveChatWidget({ agentId, isOpen: controlledIsOpen, onOpenChange }: LiveChatWidgetProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  
  const setIsOpen = useCallback((open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setInternalIsOpen(open);
    }
  }, [onOpenChange]);

  useEffect(() => {
    if (document.querySelector('script[src="https://elevenlabs.io/convai-widget/index.js"]')) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://elevenlabs.io/convai-widget/index.js';
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    document.body.appendChild(script);

    return () => {
      // Don't remove script on unmount as it might be needed elsewhere
    };
  }, []);

  if (!agentId) {
    return null;
  }

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
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
      
      {/* Chat widget container */}
      {isOpen && scriptLoaded && (
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
              onClick={() => setIsOpen(false)} 
              className="hover:bg-red-700 rounded p-1 transition-colors"
              aria-label="Close chat"
              data-testid="button-close-chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="h-[calc(100%-64px)]">
            <elevenlabs-convai agent-id={agentId}></elevenlabs-convai>
          </div>
        </div>
      )}

      {/* Mobile responsive overlay */}
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
