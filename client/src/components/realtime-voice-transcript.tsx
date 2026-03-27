import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VoiceStatusIndicator } from "./VoiceStatusIndicator";
import { TutorSessionAmbient } from "./TutorSessionAmbient";
import { useAgeTheme } from "@/contexts/ThemeContext";
import { ArrowDown, Zap, ZapOff } from "lucide-react";

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
const TYPEWRITER_WORD_DELAY = 250; // ms between words — ChatGPT-like pacing

// Render markdown bold as <strong>
function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { theme, isYoungLearner } = useAgeTheme();
  
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const autoScrollRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const prevMessagesLenRef = useRef(0);
  
  // Typewriter effect state
  const [typewriterEnabled, setTypewriterEnabled] = useState(() => {
    try { return localStorage.getItem('jie-typewriter') !== 'false'; } catch { return true; }
  });
  const [typingMsgIndex, setTypingMsgIndex] = useState<number | null>(null);
  const [typingWordCount, setTypingWordCount] = useState(0);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const typewriterPrevLenRef = useRef(0); // Separate ref — scroll effect uses prevMessagesLenRef
  
  // Toggle typewriter and persist
  const toggleTypewriter = useCallback(() => {
    setTypewriterEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('jie-typewriter', String(next)); } catch {}
      return next;
    });
    // Cancel any active typing animation
    if (typingTimerRef.current) { clearInterval(typingTimerRef.current); typingTimerRef.current = null; }
    setTypingMsgIndex(null);
  }, []);
  
  // Start typewriter when a new assistant message arrives (text/hybrid mode only)
  useEffect(() => {
    const filtered = messages.filter(m => !m.isThinking);
    const len = filtered.length;
    const prevLen = typewriterPrevLenRef.current;
    typewriterPrevLenRef.current = len; // Always update
    
    if (!typewriterEnabled) return;
    if (communicationMode === 'voice') return;
    
    if (len > prevLen && len > 0) {
      const lastMsg = filtered[len - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        const words = lastMsg.content.split(/\s+/).filter(w => w.length > 0);
        if (words.length > 1) {
          setTypingMsgIndex(len - 1);
          setTypingWordCount(0);
          
          if (typingTimerRef.current) clearInterval(typingTimerRef.current);
          let count = 0;
          typingTimerRef.current = setInterval(() => {
            count++;
            setTypingWordCount(count);
            if (count >= words.length) {
              if (typingTimerRef.current) clearInterval(typingTimerRef.current);
              typingTimerRef.current = null;
              setTimeout(() => setTypingMsgIndex(null), 100);
            }
          }, TYPEWRITER_WORD_DELAY);
        }
      }
    }
  }, [messages, typewriterEnabled, communicationMode]);
  
  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (typingTimerRef.current) clearInterval(typingTimerRef.current); };
  }, []);
  
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
          {/* Typewriter toggle — only show in text/hybrid mode */}
          {communicationMode !== 'voice' && (
            <button
              onClick={toggleTypewriter}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                typewriterEnabled
                  ? isDark ? 'bg-blue-900/40 text-blue-300 border-blue-700 hover:bg-blue-900/60' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  : isDark ? 'bg-gray-800 text-gray-400 border-gray-600 hover:bg-gray-700' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`}
              title={typewriterEnabled ? 'Typewriter mode: ON — words appear one at a time' : 'Typewriter mode: OFF — full response appears instantly'}
            >
              {typewriterEnabled ? <Zap className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
              {typewriterEnabled ? 'Word by Word' : 'Instant'}
            </button>
          )}
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
              <AnimatePresence>
                {messages.length === 0 && (
                  <motion.div
                    key="ambient"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.35 } }}
                  >
                    <TutorSessionAmbient
                      isSpeaking={isTutorSpeaking}
                      isConnected={isConnected}
                      hasMessages={false}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              {messages.length > 0 && (
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
                        
                        <div className={`max-w-[90%] ${isUser ? 'order-1' : 'order-2'}`}>
                          <div
                            className={`
                              relative px-4 py-3 text-base shadow-md
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
                              {(() => {
                                const text = message.content;
                                
                                // Typewriter: show partial text word-by-word for active typing message
                                const isTyping = typingMsgIndex === index && !isUser;
                                const displayText = isTyping
                                  ? text.split(/\s+/).slice(0, typingWordCount).join(' ')
                                  : text;
                                
                                return renderMarkdown(displayText);
                              })()}
                              {typingMsgIndex === index && !isUser && (
                                <span className="inline-block w-1.5 h-4 bg-current opacity-60 animate-pulse ml-0.5 align-text-bottom" />
                              )}
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
              
              <div className="h-4" />
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
