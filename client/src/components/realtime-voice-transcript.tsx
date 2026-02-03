import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { VoiceStatusIndicator } from "./VoiceStatusIndicator";
import { useAgeTheme } from "@/contexts/ThemeContext";

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
  const { theme, isYoungLearner } = useAgeTheme();
  
  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

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
    <div className="w-full h-full flex flex-col" data-testid="realtime-voice-transcript">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
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
      
      <Card className="border-2 flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full w-full p-4">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  {isConnected 
                    ? "Start speaking to begin the conversation..." 
                    : "Connecting to voice service..."}
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.filter(m => !m.isThinking).map((message, index, arr) => {
                    const isUser = message.role === 'user';
                    const isLast = index === arr.length - 1;
                    
                    return (
                      <motion.div
                        key={index}
                        ref={isLast ? lastMessageRef : null}
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
                        data-testid={`message-${message.role}-${index}`}
                      >
                        {!isUser && (
                          <div className="order-1 mr-2 flex-shrink-0">
                            <div 
                              className="w-8 h-8 rounded-full flex items-center justify-center shadow-md"
                              style={{ 
                                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` 
                              }}
                            >
                              <span className="text-sm">{theme.tutorEmoji}</span>
                            </div>
                          </div>
                        )}
                        
                        <div className={`max-w-[80%] ${isUser ? 'order-1' : 'order-2'}`}>
                          <div
                            className={`
                              relative px-4 py-3 text-sm shadow-md
                              ${isUser 
                                ? `bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl rounded-tr-sm ml-4` 
                                : `bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-2xl rounded-tl-sm mr-4`
                              }
                            `}
                            style={{
                              borderRadius: isYoungLearner ? '20px' : '12px',
                            }}
                          >
                            <div className="whitespace-pre-wrap break-words leading-relaxed">
                              {message.content}
                            </div>
                          </div>
                          <div className={`text-[10px] text-muted-foreground mt-1 ${isUser ? 'text-right' : 'text-left ml-2'}`}>
                            {formatTime(message.timestamp)}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
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
              
              {/* Spacer to ensure last message isn't hidden behind sticky input */}
              <div className="h-4" />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
