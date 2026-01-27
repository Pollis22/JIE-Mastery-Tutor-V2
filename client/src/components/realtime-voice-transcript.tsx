import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { VoiceStatusIndicator } from "./VoiceStatusIndicator";

interface RealtimeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isThinking?: boolean;
}

interface Props {
  messages: RealtimeMessage[];
  isConnected: boolean;
  status?: 'connecting' | 'active' | 'ended' | 'error' | 'idle';
  language?: string;
  voice?: string;
  isTutorThinking?: boolean;
  isTutorSpeaking?: boolean;
  communicationMode?: 'voice' | 'hybrid' | 'text';
  studentMicEnabled?: boolean;
  isHearingStudent?: boolean;
}

export function RealtimeVoiceTranscript({ 
  messages, 
  isConnected, 
  status, 
  language, 
  voice,
  isTutorThinking = false,
  isTutorSpeaking = false,
  communicationMode = 'voice',
  studentMicEnabled = true,
  isHearingStudent = false
}: Props) {
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const statusIndicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (statusIndicatorRef.current) {
      statusIndicatorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isTutorThinking, isTutorSpeaking, isHearingStudent]);

  const getStatusBadge = () => {
    if (!isConnected) return <Badge variant="secondary">Disconnected</Badge>;
    
    switch (status) {
      case 'connecting':
        return <Badge variant="outline" className="animate-pulse">Connecting...</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-600">🎤 Live</Badge>;
      case 'ended':
        return <Badge variant="secondary">Ended</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Ready</Badge>;
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="w-full" data-testid="realtime-voice-transcript">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          🎙️ Voice Conversation Transcript
        </h3>
        <div className="flex items-center gap-2">
          {language && (
            <Badge variant="outline" className="text-xs">
              {language.toUpperCase()}
            </Badge>
          )}
          {voice && (
            <Badge variant="outline" className="text-xs">
              {voice}
            </Badge>
          )}
          {getStatusBadge()}
        </div>
      </div>
      
      <Card className="border-2">
        <CardContent className="p-0">
          <ScrollArea className="h-80 w-full p-4">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  {isConnected 
                    ? "Start speaking to begin the conversation..." 
                    : "Connecting to voice service..."}
                </div>
              ) : (
                messages.filter(m => !m.isThinking).map((message, index, arr) => (
                  <div
                    key={index}
                    ref={index === arr.length - 1 ? lastMessageRef : null}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    data-testid={`message-${message.role}-${index}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground ml-4'
                          : 'bg-muted text-foreground mr-4'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-xs">
                          {message.role === 'user' ? '👤 You' : '🤖 AI Tutor'}
                        </span>
                        <span className="text-[10px] opacity-70">
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap break-words">
                        {message.content}
                      </div>
                    </div>
                  </div>
                ))
              )}
              
              {/* Voice Status Indicator - ephemeral, updates in-place, always visible */}
              <div ref={statusIndicatorRef}>
                <VoiceStatusIndicator
                  isConnected={isConnected}
                  communicationMode={communicationMode}
                  studentMicEnabled={studentMicEnabled}
                  isTutorThinking={isTutorThinking}
                  isTutorSpeaking={isTutorSpeaking}
                  isHearingStudent={isHearingStudent}
                />
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
