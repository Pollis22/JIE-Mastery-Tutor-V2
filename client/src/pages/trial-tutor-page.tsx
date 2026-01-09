import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mic, MicOff, Clock, AlertCircle, Volume2, VolumeX } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface TrialStatus {
  hasAccess: boolean;
  reason: string;
  secondsRemaining?: number;
  trialId?: string;
}

interface TrialSessionToken {
  ok: boolean;
  token?: string;
  secondsRemaining?: number;
  trialId?: string;
  error?: string;
}

interface TranscriptMessage {
  speaker: 'student' | 'tutor' | 'system';
  text: string;
  timestamp?: string;
}

function buildWsUrl(trialToken: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/custom-voice-ws?trialToken=${encodeURIComponent(trialToken)}`;
}

export default function TrialTutorPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(300);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isTutorSpeaking, setIsTutorSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const trialTokenRef = useRef<string | null>(null);
  const trialIdRef = useRef<string | null>(null);

  useEffect(() => {
    checkTrialStatus();
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (!isSessionActive || secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          handleTrialExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isSessionActive, secondsRemaining]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isSessionActive && sessionStartTime && trialIdRef.current) {
        const secondsUsed = Math.floor((Date.now() - sessionStartTime) / 1000);
        navigator.sendBeacon('/api/trial/end-session', JSON.stringify({
          trialId: trialIdRef.current,
          secondsUsed,
        }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSessionActive, sessionStartTime]);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const checkTrialStatus = async () => {
    try {
      const response = await fetch('/api/trial/status', { credentials: 'include' });
      const data = await response.json();
      setTrialStatus(data);
      
      if (!data.hasAccess) {
        if (data.reason === 'trial_expired') {
          setLocation('/trial/ended');
        } else if (data.reason === 'trial_not_found' || data.reason === 'trial_not_verified') {
          setLocation('/benefits');
        }
        return;
      }

      setSecondsRemaining(data.secondsRemaining || 300);
      trialIdRef.current = data.trialId;
    } catch (error) {
      console.error('Error checking trial status:', error);
      toast({
        title: 'Error',
        description: 'Unable to verify trial status. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTrialExpired = useCallback(async () => {
    setIsSessionActive(false);
    cleanup();
    
    if (trialIdRef.current && sessionStartTime) {
      const secondsUsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      try {
        await apiRequest('POST', '/api/trial/end-session', {
          trialId: trialIdRef.current,
          secondsUsed,
        });
      } catch (error) {
        console.error('Error ending trial session:', error);
      }
    }
    
    toast({
      title: 'Trial Ended',
      description: 'Your 5-minute free trial has ended. Create an account to continue!',
    });
    
    setLocation('/trial/ended');
  }, [sessionStartTime, setLocation, toast, cleanup]);

  const startSession = async () => {
    try {
      setLoading(true);
      
      // Get session token for WebSocket
      const tokenResponse = await fetch('/api/trial/session-token', { 
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const tokenData: TrialSessionToken = await tokenResponse.json();
      
      if (!tokenData.ok || !tokenData.token) {
        throw new Error(tokenData.error || 'Failed to get session token');
      }
      
      trialTokenRef.current = tokenData.token;
      trialIdRef.current = tokenData.trialId || null;
      
      // Connect to WebSocket
      const wsUrl = buildWsUrl(tokenData.token);
      console.log('[Trial] Connecting to WebSocket:', wsUrl.replace(tokenData.token, 'TOKEN'));
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = async () => {
        console.log('[Trial] WebSocket connected');
        setIsConnected(true);
        
        // Send start message
        ws.send(JSON.stringify({
          type: 'start',
          sessionId: `trial_${trialIdRef.current}`,
          studentName: 'Trial User',
          ageGroup: 'College/Adult',
          subject: 'General',
          language: 'en',
        }));
        
        // Start microphone
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          });
          mediaStreamRef.current = stream;
          
          // Create audio context for processing
          audioContextRef.current = new AudioContext({ sampleRate: 16000 });
          const source = audioContextRef.current.createMediaStreamSource(stream);
          
          // Create processor to send audio to server
          const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN && micEnabled) {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
              }
              // Convert to base64 (matching existing paid user flow)
              const bytes = new Uint8Array(pcm16.buffer);
              let binaryString = '';
              for (let i = 0; i < bytes.length; i++) {
                binaryString += String.fromCharCode(bytes[i]);
              }
              ws.send(JSON.stringify({
                type: 'audio',
                data: btoa(binaryString),
              }));
            }
          };
          
          source.connect(processor);
          processor.connect(audioContextRef.current.destination);
          
          setIsSessionActive(true);
          setSessionStartTime(Date.now());
          setLoading(false);
          
          toast({
            title: 'Session Started',
            description: 'Your trial timer is now running. Talk to your AI tutor!',
          });
        } catch (micError) {
          console.error('[Trial] Microphone error:', micError);
          toast({
            title: 'Microphone Error',
            description: 'Please allow microphone access to use voice tutoring.',
            variant: 'destructive',
          });
          setLoading(false);
        }
      };
      
      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'ready':
              console.log('[Trial] Server ready');
              break;
              
            case 'transcript':
              if (message.speaker === 'student') {
                setTranscript(prev => [...prev.filter(m => m.speaker !== 'student' || !m.text.startsWith(message.text.substring(0, 10))), {
                  speaker: 'student',
                  text: message.text,
                  timestamp: new Date().toISOString(),
                }]);
              }
              break;
              
            case 'response':
              setTranscript(prev => [...prev, {
                speaker: 'tutor',
                text: message.text,
                timestamp: new Date().toISOString(),
              }]);
              break;
              
            case 'audio':
              if (audioEnabled && message.audio) {
                setIsTutorSpeaking(true);
                try {
                  const audioData = Uint8Array.from(message.audio);
                  const ctx = audioContextRef.current || new AudioContext();
                  const audioBuffer = await ctx.decodeAudioData(audioData.buffer);
                  const source = ctx.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(ctx.destination);
                  source.onended = () => setIsTutorSpeaking(false);
                  source.start();
                } catch (audioError) {
                  console.error('[Trial] Audio playback error:', audioError);
                  setIsTutorSpeaking(false);
                }
              }
              break;
              
            case 'audio_end':
              setIsTutorSpeaking(false);
              break;
              
            case 'error':
              console.error('[Trial] Server error:', message.error);
              toast({
                title: 'Error',
                description: message.error || 'An error occurred',
                variant: 'destructive',
              });
              break;
          }
        } catch (error) {
          console.error('[Trial] Error parsing message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('[Trial] WebSocket error:', error);
        setIsConnected(false);
      };
      
      ws.onclose = () => {
        console.log('[Trial] WebSocket closed');
        setIsConnected(false);
      };
      
    } catch (error) {
      console.error('[Trial] Error starting session:', error);
      toast({
        title: 'Connection Error',
        description: 'Unable to start tutoring session. Please try again.',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const endSession = async () => {
    setIsSessionActive(false);
    cleanup();
    
    if (trialIdRef.current && sessionStartTime) {
      const secondsUsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      try {
        await apiRequest('POST', '/api/trial/end-session', {
          trialId: trialIdRef.current,
          secondsUsed,
        });
        
        const response = await fetch('/api/trial/status', { credentials: 'include' });
        const data = await response.json();
        setTrialStatus(data);
        setSecondsRemaining(data.secondsRemaining || 0);
        
        if (!data.hasAccess) {
          setLocation('/trial/ended');
        }
      } catch (error) {
        console.error('Error ending session:', error);
      }
    }
    
    setSessionStartTime(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading && !isSessionActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-red-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading your trial session...</p>
        </div>
      </div>
    );
  }

  if (!trialStatus?.hasAccess && !isSessionActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
            <CardTitle>Trial Not Available</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Please verify your email to start your free trial.
            </p>
            <Button 
              onClick={() => setLocation('/benefits')}
              className="bg-red-600 hover:bg-red-700"
            >
              Start Free Trial
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" data-testid="page-trial-tutor">
      <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-red-600 to-red-700 text-white py-3 px-4 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5" />
            <span className="font-semibold">Free Trial</span>
            {isConnected && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
          </div>
          <div className="flex items-center gap-4">
            <div className={`text-2xl font-mono font-bold ${secondsRemaining < 60 ? 'animate-pulse text-yellow-300' : ''}`} data-testid="text-trial-timer">
              {formatTime(secondsRemaining)}
            </div>
            <Button 
              variant="secondary"
              size="sm"
              onClick={() => setLocation('/pricing')}
              data-testid="button-upgrade"
            >
              Upgrade Now
            </Button>
          </div>
        </div>
      </div>

      <div className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-xl">
            <CardHeader className="text-center border-b">
              <CardTitle className="text-2xl font-bold text-red-600">
                JIE Mastery AI Tutor - Free Trial
              </CardTitle>
              <p className="text-gray-600 dark:text-gray-400">
                Experience personalized AI tutoring for {formatTime(secondsRemaining)} more
              </p>
            </CardHeader>
            <CardContent className="p-8">
              <div className="flex flex-col items-center justify-center min-h-[400px]">
                {!isSessionActive ? (
                  <div className="text-center">
                    <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Mic className="w-12 h-12 text-red-600" />
                    </div>
                    <h2 className="text-xl font-semibold mb-4">Ready to Start?</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
                      Click the button below to start your tutoring session. Your timer will begin counting down.
                    </p>
                    <Button
                      onClick={startSession}
                      disabled={loading}
                      className="bg-red-600 hover:bg-red-700 text-lg px-8 py-6"
                      data-testid="button-start-session"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      ) : (
                        <Mic className="w-5 h-5 mr-2" />
                      )}
                      Start Tutoring Session
                    </Button>
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="flex justify-center mb-6">
                      <div className={`w-32 h-32 rounded-full flex items-center justify-center ${isTutorSpeaking ? 'bg-blue-100 animate-pulse' : 'bg-green-100'}`}>
                        {isTutorSpeaking ? (
                          <Volume2 className="w-16 h-16 text-blue-600" />
                        ) : (
                          <Mic className="w-16 h-16 text-green-600 animate-pulse" />
                        )}
                      </div>
                    </div>
                    
                    <div className="text-center mb-6">
                      <h2 className="text-xl font-semibold mb-2">
                        {isTutorSpeaking ? 'Tutor Speaking...' : 'Listening...'}
                      </h2>
                      <p className="text-gray-600 dark:text-gray-400">
                        Ask any question about Math, English, or Spanish!
                      </p>
                    </div>
                    
                    {transcript.length > 0 && (
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6 max-h-48 overflow-y-auto">
                        {transcript.slice(-5).map((msg, i) => (
                          <div key={i} className={`mb-2 ${msg.speaker === 'tutor' ? 'text-blue-600' : 'text-gray-800 dark:text-gray-200'}`}>
                            <span className="font-semibold">{msg.speaker === 'tutor' ? 'Tutor: ' : 'You: '}</span>
                            {msg.text}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex justify-center gap-4">
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() => setMicEnabled(!micEnabled)}
                        className={!micEnabled ? 'bg-red-100 border-red-500' : ''}
                      >
                        {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() => setAudioEnabled(!audioEnabled)}
                        className={!audioEnabled ? 'bg-red-100 border-red-500' : ''}
                      >
                        {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                      </Button>
                      <Button
                        onClick={endSession}
                        variant="outline"
                        className="border-red-600 text-red-600 hover:bg-red-50"
                        data-testid="button-end-session"
                      >
                        End Session
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Want unlimited tutoring?{' '}
              <button 
                onClick={() => setLocation('/pricing')}
                className="text-red-600 hover:underline font-medium"
              >
                View our plans
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
