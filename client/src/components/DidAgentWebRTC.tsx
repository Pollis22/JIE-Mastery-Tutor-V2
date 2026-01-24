/**
 * D-ID Agent WebRTC Component
 * 
 * Uses the D-ID Realtime Agents Streams API with WebRTC.
 * Does NOT depend on the iframe embed domain (agents.d-id.com).
 * 
 * Features:
 * - Strict connection state machine (idle → starting → connected → stopping → error)
 * - Stable video element (always mounted after first gesture, never re-keyed)
 * - Deterministic cleanup with full reset
 * - Frame watchdog to detect black screen issues
 * - ICE candidate deduplication
 * - Connection watchdog with timeout handling
 * - Mutex to prevent overlapping connections
 * - Auto-speak on connect to wake up idle avatars
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Volume2, Square, Play, Mic, MicOff, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAvatarVoice } from "@/hooks/useAvatarVoice";

const CONNECTION_TIMEOUT_MS = 12000;
const DISCONNECT_GRACE_MS = 2000;
const FRAME_WATCHDOG_INTERVAL_MS = 500;
const FRAME_WATCHDOG_TIMEOUT_MS = 5000;
const DEBUG = true;

function log(...args: unknown[]) {
  if (DEBUG) console.log("[D-ID WebRTC]", ...args);
}

function logError(...args: unknown[]) {
  console.error("[D-ID WebRTC]", ...args);
}

type ConnectionState = 'idle' | 'starting' | 'connected' | 'stopping' | 'error';

interface StreamSession {
  streamId: string;
  sessionId: string;
}

interface ApiStatus {
  ok: boolean;
  configured: boolean;
  didApiKeyPresent: boolean;
  canResolveApiDomain: boolean;
  outboundHttpOk: boolean;
  error?: string;
}

function waitAnimationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export function DidAgentWebRTC() {
  const [state, setState] = useState<ConnectionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [session, setSession] = useState<StreamSession | null>(null);
  const [hasUserGesture, setHasUserGesture] = useState(false);
  const [iceCandidatesSent, setIceCandidatesSent] = useState(0);
  const [needsPlayGesture, setNeedsPlayGesture] = useState(false);
  const [firstFrameReceived, setFirstFrameReceived] = useState(false);
  const [videoDebugInfo, setVideoDebugInfo] = useState<string>('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const sessionRef = useRef<StreamSession | null>(null);
  
  const handleTranscript = useCallback(async (text: string, isFinal: boolean) => {
    log("Transcript received:", text.slice(0, 50), "isFinal:", isFinal);
    
    if (!isFinal || !text.trim() || text.trim().length < 2) {
      return;
    }
    
    const currentSession = sessionRef.current;
    if (!currentSession || stateRef.current !== 'connected') {
      log("Cannot speak: no active session");
      return;
    }
    
    log("Sending transcript to avatar:", text.slice(0, 50));
    setIsSpeaking(true);
    
    const estimatedSpeakDuration = Math.min(text.length * 60, 15000) + 1500;
    
    try {
      const response = await fetch(`/api/did-api/stream/${currentSession.streamId}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession.sessionId,
          text: text.trim()
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        logError("Speak failed:", error);
        setIsSpeaking(false);
      } else {
        log("Speak request sent for user transcript ✓");
        log("Estimated speak duration:", estimatedSpeakDuration, "ms");
        
        setTimeout(() => {
          setIsSpeaking(false);
          log("Speaking complete, ready for next turn");
        }, estimatedSpeakDuration);
      }
    } catch (e) {
      logError("Speak error:", e);
      setIsSpeaking(false);
    }
  }, []);
  
  const voiceHook = useAvatarVoice({
    onTranscript: handleTranscript,
    onError: (msg) => logError("Voice error:", msg),
    onStatusChange: (status) => log("Voice status:", status)
  });
  
  const { status: voiceStatus, transcript, diagnostics: voiceDiagnostics, isListening, startListening, stopListening } = voiceHook;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameWatchdogStartRef = useRef<number>(0);
  const lastCurrentTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const startMutexRef = useRef(false);
  const speakAbortRef = useRef<AbortController | null>(null);
  const stateRef = useRef<ConnectionState>('idle');
  const sentIceCandidatesRef = useRef<Set<string>>(new Set());
  const hasAutoSpokenRef = useRef(false);
  
  const setStateWithRef = useCallback((newState: ConnectionState) => {
    stateRef.current = newState;
    setState(newState);
  }, []);

  const stopFrameWatchdog = useCallback(() => {
    if (frameWatchdogRef.current) {
      clearInterval(frameWatchdogRef.current);
      frameWatchdogRef.current = null;
    }
  }, []);

  const cleanup = useCallback(async (reason: string = 'unknown', stopVoice: boolean = false): Promise<void> => {
    log("Cleanup started, reason:", reason, "stopVoice:", stopVoice);
    
    if (stopVoice) {
      try {
        await stopListening(reason);
      } catch (e) {
        log("Error stopping voice capture:", e);
      }
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    if (disconnectTimeoutRef.current) {
      clearTimeout(disconnectTimeoutRef.current);
      disconnectTimeoutRef.current = null;
    }
    
    stopFrameWatchdog();
    
    if (speakAbortRef.current) {
      speakAbortRef.current.abort();
      speakAbortRef.current = null;
    }
    
    const pc = peerConnectionRef.current;
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.onicegatheringstatechange = null;
      pc.onconnectionstatechange = null;
      
      try {
        pc.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.stop();
          }
        });
      } catch (e) {
        log("Error stopping senders:", e);
      }
      
      try {
        pc.getReceivers().forEach(receiver => {
          if (receiver.track) {
            receiver.track.enabled = false;
            receiver.track.stop();
          }
        });
      } catch (e) {
        log("Error stopping receivers:", e);
      }
      
      try {
        pc.close();
      } catch (e) {
        log("Error closing peer connection:", e);
      }
      
      peerConnectionRef.current = null;
    }
    
    const remoteStream = remoteStreamRef.current;
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          log("Error stopping remote track:", e);
        }
      });
      remoteStreamRef.current = null;
    }
    
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
        video.srcObject = null;
        video.removeAttribute('src');
        video.load();
      } catch (e) {
        log("Error resetting video element:", e);
      }
    }
    
    setSession(null);
    sessionRef.current = null;
    setIceCandidatesSent(0);
    setNeedsPlayGesture(false);
    setFirstFrameReceived(false);
    setVideoDebugInfo('');
    sentIceCandidatesRef.current.clear();
    hasAutoSpokenRef.current = false;
    startMutexRef.current = false;
    lastCurrentTimeRef.current = 0;
    
    await waitAnimationFrame();
    
    log("Cleanup complete");
  }, [stopFrameWatchdog]);

  const fetchApiStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/did-api/status');
      const data: ApiStatus = await response.json();
      log("API status:", data);
      setApiStatus(data);
      return data;
    } catch (error) {
      logError("Failed to fetch API status:", error);
      return null;
    }
  }, []);

  const speakText = useCallback(async (text: string, sessionData: StreamSession) => {
    log("Speaking:", text.slice(0, 50) + "...");
    
    const abortController = new AbortController();
    speakAbortRef.current = abortController;
    
    try {
      const response = await fetch(`/api/did-api/stream/${sessionData.streamId}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          text: text
        }),
        signal: abortController.signal
      });
      
      if (!response.ok) {
        const error = await response.json();
        logError("Speak failed:", error);
        return false;
      } else {
        log("Speak request sent ✓");
        return true;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        log("Speak request aborted");
      } else {
        logError("Speak error:", error);
      }
      return false;
    } finally {
      speakAbortRef.current = null;
    }
  }, []);

  const startFrameWatchdog = useCallback((sessionData: StreamSession) => {
    stopFrameWatchdog();
    
    frameWatchdogStartRef.current = Date.now();
    lastCurrentTimeRef.current = 0;
    
    log("Starting frame watchdog...");
    
    frameWatchdogRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      
      const elapsed = Date.now() - frameWatchdogStartRef.current;
      const currentTime = video.currentTime;
      const readyState = video.readyState;
      const paused = video.paused;
      
      const debugInfo = `readyState=${readyState}, currentTime=${currentTime.toFixed(2)}, paused=${paused}`;
      setVideoDebugInfo(debugInfo);
      
      if (currentTime > lastCurrentTimeRef.current) {
        if (!firstFrameReceived) {
          log("✓ First video frame received!", debugInfo);
          setFirstFrameReceived(true);
        }
        lastCurrentTimeRef.current = currentTime;
      }
      
      if (elapsed > FRAME_WATCHDOG_TIMEOUT_MS && !firstFrameReceived) {
        log("Frame watchdog: No frames after", elapsed, "ms.", debugInfo);
        
        if (!hasAutoSpokenRef.current && stateRef.current === 'connected') {
          hasAutoSpokenRef.current = true;
          log("Sending auto-speak to wake up avatar...");
          speakText("Hello! I'm your AI enrollment specialist. How can I help you today?", sessionData);
        }
      }
    }, FRAME_WATCHDOG_INTERVAL_MS);
  }, [stopFrameWatchdog, speakText, firstFrameReceived]);

  const startConnection = useCallback(async () => {
    if (!mountedRef.current) {
      log("Component unmounted, aborting start");
      startMutexRef.current = false;
      return;
    }
    
    if (startMutexRef.current) {
      log("Start already in flight, ignoring duplicate request");
      return;
    }
    
    if (stateRef.current === 'starting' || stateRef.current === 'stopping') {
      log("Invalid state for starting:", stateRef.current);
      return;
    }
    
    startMutexRef.current = true;
    
    if (peerConnectionRef.current) {
      setStateWithRef('stopping');
      await cleanup('new connection requested', false);
    }
    
    setStateWithRef('starting');
    setErrorMessage(null);
    setFirstFrameReceived(false);
    sentIceCandidatesRef.current.clear();
    hasAutoSpokenRef.current = false;
    
    log("Starting WebRTC connection...");
    
    timeoutRef.current = setTimeout(async () => {
      const pc = peerConnectionRef.current;
      const isConnected = pc?.connectionState === 'connected';
      
      if (mountedRef.current && !isConnected && stateRef.current === 'starting') {
        logError("Connection timeout after", CONNECTION_TIMEOUT_MS, "ms");
        await cleanup('timeout', true);
        setStateWithRef('error');
        setErrorMessage("Connection timed out. The D-ID service may be unavailable.");
        fetchApiStatus();
      }
    }, CONNECTION_TIMEOUT_MS);
    
    try {
      log("Creating stream...");
      const createResponse = await fetch('/api/did-api/stream/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.message || 'Failed to create stream');
      }
      
      const { streamId, sessionId, offerSdp, iceServers } = await createResponse.json();
      log("Stream created:", streamId, "sessionId:", sessionId);
      
      if (!mountedRef.current) {
        log("Component unmounted during stream creation");
        startMutexRef.current = false;
        return;
      }
      
      const currentSession = { streamId, sessionId };
      setSession(currentSession);
      sessionRef.current = currentSession;
      
      const pcConfig: RTCConfiguration = {
        iceServers: iceServers && iceServers.length > 0 
          ? iceServers 
          : [{ urls: 'stun:stun.l.google.com:19302' }]
      };
      log("RTCPeerConnection config:", JSON.stringify(pcConfig));
      
      const pc = new RTCPeerConnection(pcConfig);
      peerConnectionRef.current = pc;
      
      let localIceCount = 0;
      let iceGatheringComplete = false;
      
      pc.ontrack = (event) => {
        log("Track received:", event.track.kind, "readyState:", event.track.readyState);
        
        const video = videoRef.current;
        if (!video) {
          logError("Video element not available");
          return;
        }
        
        if (event.track.kind === 'video') {
          log("Attaching video track to video element...");
          log("Video track state - muted:", event.track.muted, "enabled:", event.track.enabled, "readyState:", event.track.readyState);
          
          let stream = remoteStreamRef.current;
          if (!stream) {
            stream = new MediaStream();
            remoteStreamRef.current = stream;
          }
          
          stream.addTrack(event.track);
          
          video.playsInline = true;
          video.muted = true;
          video.autoplay = true;
          video.srcObject = stream;
          
          video.onloadedmetadata = () => {
            log("Video loadedmetadata - readyState:", video.readyState, "videoWidth:", video.videoWidth, "videoHeight:", video.videoHeight);
            video.play()
              .then(() => log("Video play() in loadedmetadata succeeded"))
              .catch(e => log("Video play() in loadedmetadata failed:", e.message));
          };
          
          video.play()
            .then(() => {
              log("Video playback started ✓ (muted for autoplay)");
              setTimeout(() => {
                if (videoRef.current) {
                  videoRef.current.muted = false;
                  log("Video unmuted ✓");
                }
              }, 500);
            })
            .catch((e) => {
              log("Video play() failed, needs user gesture:", e.message);
              setNeedsPlayGesture(true);
            });
          
          log("Video stream attached ✓");
        }
        
        if (event.track.kind === 'audio') {
          log("Audio track received, adding to stream");
          let stream = remoteStreamRef.current;
          if (!stream) {
            stream = new MediaStream();
            remoteStreamRef.current = stream;
          }
          stream.addTrack(event.track);
          
          if (video.srcObject !== stream) {
            video.srcObject = stream;
          }
        }
      };
      
      pc.onicecandidate = async (event) => {
        if (iceGatheringComplete) {
          log("ICE gathering already complete, ignoring candidate");
          return;
        }
        
        if (event.candidate) {
          const candidateStr = event.candidate.candidate;
          
          if (sentIceCandidatesRef.current.has(candidateStr)) {
            log("Duplicate ICE candidate, skipping");
            return;
          }
          
          sentIceCandidatesRef.current.add(candidateStr);
          localIceCount++;
          log("Local ICE candidate #" + localIceCount + ":", candidateStr?.slice(0, 50) + "...");
          
          try {
            const iceResponse = await fetch(`/api/did-api/stream/${streamId}/ice`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: sessionId,
                candidate: {
                  candidate: event.candidate.candidate,
                  sdpMid: event.candidate.sdpMid,
                  sdpMLineIndex: event.candidate.sdpMLineIndex
                }
              })
            });
            
            if (iceResponse.ok) {
              setIceCandidatesSent(prev => prev + 1);
            } else {
              const err = await iceResponse.json();
              logError("Failed to send ICE candidate:", err);
            }
          } catch (e) {
            logError("ICE candidate send error:", e);
          }
        } else {
          iceGatheringComplete = true;
          log("ICE gathering complete, total unique candidates sent:", localIceCount);
        }
      };
      
      pc.oniceconnectionstatechange = () => {
        log("ICE connection state:", pc.iceConnectionState);
      };
      
      pc.onicegatheringstatechange = () => {
        log("ICE gathering state:", pc.iceGatheringState);
        if (pc.iceGatheringState === 'complete') {
          iceGatheringComplete = true;
        }
      };
      
      pc.onconnectionstatechange = () => {
        log("Connection state:", pc.connectionState);
        
        if (!mountedRef.current) return;
        
        if (pc.connectionState === 'connected') {
          log("WebRTC connection established ✓");
          
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          
          if (disconnectTimeoutRef.current) {
            clearTimeout(disconnectTimeoutRef.current);
            disconnectTimeoutRef.current = null;
          }
          
          setStateWithRef('connected');
          startMutexRef.current = false;
          
          startFrameWatchdog(currentSession);
          
        } else if (pc.connectionState === 'failed') {
          logError("WebRTC connection failed");
          cleanup('connection failed', true).then(() => {
            setStateWithRef('error');
            setErrorMessage("WebRTC connection failed. ICE candidates: " + localIceCount);
          });
          
        } else if (pc.connectionState === 'disconnected') {
          log("WebRTC connection disconnected, waiting", DISCONNECT_GRACE_MS, "ms before cleanup...");
          
          if (disconnectTimeoutRef.current) {
            clearTimeout(disconnectTimeoutRef.current);
          }
          
          disconnectTimeoutRef.current = setTimeout(async () => {
            if (mountedRef.current && pc.connectionState === 'disconnected') {
              logError("Connection still disconnected after grace period");
              await cleanup('disconnected timeout', true);
              setStateWithRef('error');
              setErrorMessage("Connection lost and could not recover.");
            }
          }, DISCONNECT_GRACE_MS);
        }
      };
      
      log("Setting remote description (offer)...");
      await pc.setRemoteDescription({
        type: 'offer',
        sdp: offerSdp
      });
      log("Remote description set ✓");
      
      log("Creating answer...");
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log("Local description set ✓");
      
      log("Sending SDP answer to server...");
      const sdpResponse = await fetch(`/api/did-api/stream/${streamId}/sdp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          answerSdp: answer.sdp
        })
      });
      
      if (!sdpResponse.ok) {
        const error = await sdpResponse.json();
        throw new Error(error.message || 'Failed to send SDP answer');
      }
      
      log("SDP answer sent ✓");
      
    } catch (error) {
      logError("Connection error:", error);
      
      await cleanup('connection error', true);
      setStateWithRef('error');
      setErrorMessage(error instanceof Error ? error.message : 'Connection failed');
      fetchApiStatus();
    }
  }, [cleanup, fetchApiStatus, setStateWithRef, startFrameWatchdog]);

  const handleSpeak = useCallback(async () => {
    if (state !== 'connected' || !session) {
      log("Cannot speak: state=" + state + ", session=" + !!session);
      return;
    }
    
    await speakText("Hello! I'm your AI enrollment specialist. How can I help you today?", session);
  }, [session, state, speakText]);

  const handlePlayVideo = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.play()
        .then(() => {
          log("Manual video play succeeded ✓");
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.muted = false;
            }
          }, 500);
          setNeedsPlayGesture(false);
        })
        .catch((e) => {
          logError("Manual video play failed:", e);
        });
    }
  }, []);

  const handleStart = useCallback(() => {
    log("User clicked Start Avatar");
    setHasUserGesture(true);
    startConnection();
  }, [startConnection]);

  const handleStop = useCallback(async () => {
    if (stateRef.current === 'stopping') {
      log("Already stopping, ignoring");
      return;
    }
    
    log("User clicked Stop");
    setStateWithRef('stopping');
    await cleanup('user stopped', true);
    setStateWithRef('idle');
  }, [cleanup, setStateWithRef]);

  const handleRetry = useCallback(() => {
    if (stateRef.current === 'starting' || stateRef.current === 'stopping') {
      log("Cannot retry in state:", stateRef.current);
      return;
    }
    log("User clicked Retry");
    startConnection();
  }, [startConnection]);

  useEffect(() => {
    mountedRef.current = true;
    fetchApiStatus();
    
    return () => {
      mountedRef.current = false;
      cleanup('component unmount', true);
    };
  }, [cleanup, fetchApiStatus]);

  const showStartButton = !hasUserGesture;
  const showVideo = hasUserGesture;
  const isStarting = state === 'starting';
  const isStopping = state === 'stopping';
  const isError = state === 'error';
  const isIdle = state === 'idle';
  const isConnected = state === 'connected';
  const isButtonDisabled = isStarting || isStopping;

  return (
    <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-webrtc">
      <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
        Talk to our Live Enrollment Specialist
      </p>
      
      <div 
        className="w-full rounded-2xl overflow-hidden border border-border shadow-lg bg-black relative"
        style={{ minHeight: showStartButton ? "300px" : "520px" }}
      >
        {/* Video element - STABLE: always mounted once user clicks start, never re-keyed */}
        {showVideo && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ minHeight: "520px", backgroundColor: "#000" }}
            data-testid="did-video"
          />
        )}
        
        {/* Start button overlay */}
        {showStartButton && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/30">
            <p className="text-base font-medium text-foreground mb-4">
              Click to start the AI avatar
            </p>
            <Button 
              onClick={handleStart}
              size="lg"
              className="gap-2"
              data-testid="did-start-button"
            >
              <Volume2 className="w-5 h-5" />
              Start Avatar
            </Button>
            <p className="text-xs text-muted-foreground mt-4 max-w-sm text-center px-4">
              This will connect to our AI enrollment specialist via video.
            </p>
          </div>
        )}
        
        {/* Loading/Starting overlay */}
        {showVideo && isStarting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-3" />
            <p className="text-sm text-white">Connecting...</p>
            {iceCandidatesSent > 0 && (
              <p className="text-xs text-white/70 mt-2">
                ICE candidates sent: {iceCandidatesSent}
              </p>
            )}
          </div>
        )}
        
        {/* Stopping overlay */}
        {showVideo && isStopping && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-3" />
            <p className="text-sm text-white">Stopping...</p>
          </div>
        )}
        
        {/* Needs play gesture overlay */}
        {showVideo && isConnected && needsPlayGesture && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10">
            <p className="text-base font-medium text-white mb-4">
              Tap to enable playback
            </p>
            <Button 
              onClick={handlePlayVideo}
              size="lg"
              className="gap-2"
            >
              <Play className="w-5 h-5" />
              Start Playback
            </Button>
          </div>
        )}
        
        {/* Error overlay - shown OVER the video, not replacing it */}
        {showVideo && isError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 p-6">
            <AlertTriangle className="w-10 h-10 text-amber-500 mb-4" />
            <p className="text-base font-medium text-white mb-2">
              Connection Failed
            </p>
            <p className="text-sm text-white/70 mb-4 max-w-sm text-center">
              {errorMessage || "Unable to connect to the avatar service."}
            </p>
            
            {apiStatus && (
              <div className="mb-4 p-3 bg-white/10 rounded-lg text-left text-xs space-y-1 w-full max-w-sm">
                <p className="font-medium text-white mb-2">Diagnostics:</p>
                <div className="flex items-center gap-2 text-white/80">
                  {apiStatus.configured ? (
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-400" />
                  )}
                  <span>API Key: {apiStatus.configured ? 'Configured' : 'Missing'}</span>
                </div>
                <div className="flex items-center gap-2 text-white/80">
                  {apiStatus.canResolveApiDomain ? (
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-400" />
                  )}
                  <span>DNS: {apiStatus.canResolveApiDomain ? 'OK' : 'Failed'}</span>
                </div>
                <div className="flex items-center gap-2 text-white/80">
                  {apiStatus.outboundHttpOk ? (
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-400" />
                  )}
                  <span>D-ID API: {apiStatus.outboundHttpOk ? 'Reachable' : 'Unreachable'}</span>
                </div>
              </div>
            )}
            
            <Button 
              variant="secondary" 
              size="sm"
              onClick={handleRetry}
              disabled={isButtonDisabled}
              className="gap-2"
              data-testid="did-retry-button"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
          </div>
        )}
        
        {/* Idle/Stopped overlay (after stop) */}
        {showVideo && isIdle && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10">
            <p className="text-base font-medium text-white mb-4">
              Avatar stopped
            </p>
            <Button 
              onClick={handleRetry}
              disabled={isButtonDisabled}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Restart
            </Button>
          </div>
        )}
        
        {/* Connected controls overlay - at bottom */}
        {showVideo && isConnected && !needsPlayGesture && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-10">
            {/* Voice status and transcript */}
            {(isListening || transcript) && (
              <div className="mb-3 text-center">
                {isListening && (
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm text-white">
                      {isSpeaking ? 'Speaking...' : voiceStatus === 'transcribing' ? 'Transcribing...' : 'Listening...'}
                    </span>
                  </div>
                )}
                {transcript && (
                  <p className="text-sm text-white/80 italic max-w-sm mx-auto truncate">
                    "{transcript}"
                  </p>
                )}
              </div>
            )}
            
            <div className="flex items-center justify-center gap-3">
              {/* Voice control button */}
              <Button 
                variant={isListening ? "default" : "outline"}
                size="sm"
                onClick={isListening ? () => stopListening('user button') : startListening}
                disabled={isSpeaking}
                className={`gap-2 ${isListening 
                  ? 'bg-red-600 hover:bg-red-700 text-white border-red-600' 
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}
                data-testid="did-voice-button"
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isListening ? 'Stop Listening' : 'Start Listening'}
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleSpeak}
                disabled={isListening || isSpeaking}
                className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
                data-testid="did-speak-button"
              >
                <Volume2 className="w-4 h-4" />
                Test
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
                data-testid="did-diagnostics-button"
              >
                <Info className="w-4 h-4" />
              </Button>
              
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleStop}
                disabled={isButtonDisabled}
                className="gap-2"
                data-testid="did-stop-button"
              >
                <Square className="w-4 h-4" />
                Stop
              </Button>
            </div>
            
            {/* Diagnostics panel */}
            {showDiagnostics && (
              <div className="mt-3 p-3 bg-black/60 rounded-lg text-xs text-white/80 max-w-md mx-auto">
                <p className="font-semibold text-white mb-2">Diagnostics</p>
                <div className="grid grid-cols-2 gap-1">
                  <span>Browser:</span><span>{voiceDiagnostics.browser}</span>
                  <span>Capture:</span><span>{voiceDiagnostics.captureMethod || 'none'}</span>
                  <span>Sample Rate:</span><span>{voiceDiagnostics.sampleRate || '-'}</span>
                  <span>STT Provider:</span><span>{voiceDiagnostics.sttProvider}</span>
                  <span>STT Mode:</span><span>{voiceDiagnostics.sttMode}</span>
                  <span>Mic Permission:</span><span>{voiceDiagnostics.micPermission}</span>
                </div>
              </div>
            )}
            
            {/* Debug info */}
            {DEBUG && !showDiagnostics && (
              <div className="mt-2 text-center">
                <p className="text-xs text-white/50">
                  {firstFrameReceived ? '✓ Frames received' : '⏳ Waiting for frames...'}
                  {videoDebugInfo && ` | ${videoDebugInfo}`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Status indicator below the video */}
      {showVideo && (
        <p className="text-xs text-center text-muted-foreground mt-2">
          Status: {state}
          {isConnected && ` | ICE: ${iceCandidatesSent}`}
          {isConnected && firstFrameReceived && ' | ✓ Video active'}
        </p>
      )}
    </div>
  );
}
