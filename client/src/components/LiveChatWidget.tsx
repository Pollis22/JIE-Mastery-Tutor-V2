import { useEffect, useState } from 'react';

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

export function LiveChatWidget({ agentId }: LiveChatWidgetProps) {
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!agentId) {
      console.error('[LiveChat] Missing agent ID');
      return;
    }

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
    };
    
    document.head.appendChild(script);
  }, [agentId]);

  if (!agentId) {
    console.warn('[LiveChat] No agent ID provided, widget disabled');
    return null;
  }

  if (!scriptLoaded) {
    return null;
  }

  return <elevenlabs-convai agent-id={agentId}></elevenlabs-convai>;
}

export default LiveChatWidget;
