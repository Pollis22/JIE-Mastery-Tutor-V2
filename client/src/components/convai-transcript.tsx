import { useEffect, useRef, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface ConvaiMessage {
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface Props {
  messages: ConvaiMessage[];
  isConnected: boolean;
}

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="relative my-2 rounded-md bg-zinc-900 dark:bg-zinc-950 overflow-hidden" data-testid="code-block">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 dark:bg-zinc-900 border-b border-zinc-700">
        <span className="text-xs text-zinc-400 font-mono">
          {language || 'code'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-zinc-400 hover:text-white"
          onClick={handleCopy}
          data-testid="button-copy-code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>
      <pre className="p-3 overflow-x-auto text-sm">
        <code className="text-zinc-100 font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
}

function MessageContent({ content, isStreaming }: MessageContentProps) {
  const parts = useMemo(() => {
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    const result: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
    let lastIndex = 0;
    let match;
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        result.push({
          type: 'text',
          content: content.slice(lastIndex, match.index)
        });
      }
      
      result.push({
        type: 'code',
        content: match[2].trim(),
        language: match[1]
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < content.length) {
      result.push({
        type: 'text',
        content: content.slice(lastIndex)
      });
    }
    
    return result;
  }, [content]);
  
  return (
    <div className="leading-relaxed">
      {parts.map((part, index) => (
        part.type === 'code' ? (
          <CodeBlock key={index} code={part.content} language={part.language} />
        ) : (
          <span key={index} className="whitespace-pre-wrap">
            {part.content}
            {isStreaming && index === parts.length - 1 && (
              <span className="inline-block w-2 h-4 bg-current animate-pulse ml-0.5 align-middle" />
            )}
          </span>
        )
      ))}
    </div>
  );
}

export function ConvaiTranscript({ messages, isConnected }: Props) {
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  return (
    <div className="w-full" data-testid="convai-transcript">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Conversation Transcript</h3>
      
      <Card className="border-2">
        <CardContent className="p-0">
          <ScrollArea className="h-80 w-full p-4" ref={scrollAreaRef}>
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
                            {message.type === 'user' ? 'You' : 'AI Tutor'}
                          </span>
                          <span className="text-xs opacity-70">
                            {message.timestamp.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <MessageContent 
                          content={message.content} 
                          isStreaming={message.isStreaming}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
              
              {isConnected && messages.length > 0 && (
                <div className="text-center text-xs text-muted-foreground py-2 border-t">
                  Listening...
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
