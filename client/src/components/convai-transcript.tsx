import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConvaiMessage {
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
}

interface Props {
  messages: ConvaiMessage[];
  isConnected: boolean;
}

export function ConvaiTranscript({ messages, isConnected }: Props) {
  const lastMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  return (
    <div className="w-full" data-testid="convai-transcript">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">📝 Conversation Transcript</h3>
      
      <Card className="border-2">
        <CardContent className="p-0">
          <ScrollArea className="h-80 w-full p-4">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  {isConnected 
                    ? "Waiting for conversation to start..." 
                    : "Conversation will appear here once connected..."}
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    ref={index === messages.length - 1 ? lastMessageRef : null}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    data-testid={`message-${message.type}-${index}`}
                  >
                    {message.type === 'system' ? (
                      <div className="w-full text-center text-xs text-muted-foreground py-2 border-t border-b">
                        {message.content}
                      </div>
                    ) : (
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          message.type === 'user'
                            ? 'bg-primary text-primary-foreground ml-4'
                            : 'bg-muted text-foreground mr-4'
                        }`}
                      >
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-medium text-xs">
                            {message.type === 'user' ? '👤 You' : '🤖 AI Tutor'}
                          </span>
                          <span className="text-xs opacity-70">
                            {message.timestamp.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <div className="leading-relaxed whitespace-pre-wrap">
                          {message.content}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              
              {isConnected && messages.length > 0 && (
                <div className="text-center text-xs text-muted-foreground py-2 border-t">
                  🎤 Listening...
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
