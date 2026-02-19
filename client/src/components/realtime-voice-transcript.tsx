import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VoiceStatusIndicator } from "./VoiceStatusIndicator";
import { useAgeTheme } from "@/contexts/ThemeContext";
import { ArrowDown } from "lucide-react";

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

const NEAR_BOTTOM_THRESHOLD = 80;

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { theme, isYoungLearner } = useAgeTheme();
  
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const autoScrollRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const prevMessagesLenRef = useRef(0);
  
  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  const checkNearBottom = useCallback((): boolean => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return (el.scrollHeight - (el.scrollTop + el.clientHeight)) < NEAR_BOTTOM_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, [prefersReducedMotion]);

  const handleScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    const nearBottom = checkNearBottom();
    if (nearBottom !== autoScrollRef.current) {
      autoScrollRef.current = nearBottom;
      setAutoScrollEnabled(nearBottom);
    }
  }, [checkNearBottom]);

  const handleJumpToLive = useCallback(() => {
    autoScrollRef.current = true;
    setAutoScrollEnabled(true);
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    const newLen = messages.length;
    const grew = newLen > prevMessagesLenRef.current;
    prevMessagesLenRef.current = newLen;

    if (autoScrollRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    } else if (grew) {
      requestAnimationFrame(() => {
        if (checkNearBottom()) {
          autoScrollRef.current = true;
          setAutoScrollEnabled(true);
          scrollToBottom();
        }
      });
    }
  }, [messages, isTutorThinking, isTutorSpeaking, isHearingStudent, scrollToBottom, checkNearBottom]);

  const getStatusBadge = () => {
    if (!isConnected) return <Badge variant="secondary">Disconnected</Badge>;
    
    switch (status) {
      case 'connecting':
        return <Badge variant="outline" className="animate-pulse">Connecting...</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-600">Live</Badge>;
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

  const isDark = theme.isDark;
  
  return (
    <div className="w-full h-full flex flex-col" data-testid="realtime-voice-transcript">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-muted-foreground'}`}>
          Voice Conversation Transcript
        </h3>
        <div className="flex items-center gap-2">
          {language && (
            <Badge variant="outline" className={`text-xs ${isDark ? 'border-gray-600 text-gray-300' : ''}`}>
              {language.toUpperCase()}
            </Badge>
          )}
          {voice && (
            <Badge variant="outline" className={`text-xs ${isDark ? 'border-gray-600 text-gray-300' : ''}`}>
              {voice}
            </Badge>
          )}
          {getStatusBadge()}
        </div>
      </div>
      
      <Card className={`flex-1 min-h-0 flex flex-col relative ${isDark ? 'bg-slate-800/50 border-slate-700' : 'border-2'}`}>
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden relative">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="h-full w-full overflow-y-auto p-4 scroll-smooth"
            data-testid="transcript-scroll-container"
          >
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className={`text-center text-sm py-8 ${isDark ? 'text-gray-500' : 'text-muted-foreground'}`}>
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
                        {!isUser && !isDark && (
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
                        {!isUser && isDark && (
                          <div className="order-1 mr-2 flex-shrink-0">
                            <div 
                              className="w-6 h-6 rounded-full flex items-center justify-center"
                              style={{ 
                                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` 
                              }}
                            />
                          </div>
                        )}
                        
                        <div className={`max-w-[80%] ${isUser ? 'order-1' : 'order-2'}`}>
                          <div
                            className={`
                              relative px-4 py-3 text-sm shadow-md
                              ${isUser 
                                ? `${theme.userBubbleClass} ml-4` 
                                : `${theme.messageBubbleClass} mr-4`
                              }
                            `}
                            style={{
                              borderRadius: theme.borderRadius,
                            }}
                          >
                            <div className="whitespace-pre-wrap break-words leading-relaxed">
                              {message.content}
                            </div>
                          </div>
                          <div className={`text-[10px] mt-1 ${isUser ? 'text-right' : 'text-left ml-2'} ${theme.isDark ? 'text-gray-500' : 'text-muted-foreground'}`}>
                            {formatTime(message.timestamp)}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
              
              <div>
                <VoiceStatusIndicator
                  isConnected={isConnected}
                  communicationMode={communicationMode}
                  studentMicEnabled={studentMicEnabled}
                  isTutorThinking={isTutorThinking}
                  isTutorSpeaking={isTutorSpeaking}
                  isHearingStudent={isHearingStudent}
                />
              </div>
              
              <div className="h-20" />
            </div>
          </div>
          
          {!autoScrollEnabled && messages.length > 0 && (
            <button
              onClick={handleJumpToLive}
              className={`
                absolute bottom-3 left-1/2 -translate-x-1/2 z-10
                flex items-center gap-1.5 px-3 py-1.5 rounded-full
                text-xs font-medium shadow-lg transition-all
                hover:scale-105 active:scale-95
                ${isDark
                  ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-900/40'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/30'
                }
              `}
              data-testid="button-jump-to-live"
            >
              <ArrowDown className="h-3 w-3" />
              Jump to live
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
