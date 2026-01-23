/**
 * D-ID Agent WebRTC Component
 * 
 * Uses the D-ID Realtime Agents Streams API with WebRTC.
 * Does NOT depend on the iframe embed domain (agents.d-id.com).
 * 
 * Features:
 * - Strict connection state machine (idle → starting → connected → stopping → error)
 * - Deterministic cleanup with full reset
 * - Video element always mounted to avoid Safari issues
 * - Connection watchdog with timeout handling
 * - Mutex to prevent overlapping connections
 * - Proper ICE candidate exchange
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Volume2, Square, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONNECTION_TIMEOUT_MS = 12000;
const DISCONNECT_GRACE_MS = 2000;
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
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const startMutexRef = useRef(false);
  const speakAbortRef = useRef<AbortController | null>(null);
  const stateRef = useRef<ConnectionState>('idle');
  
  const setStateWithRef = useCallback((newState: ConnectionState) => {
    stateRef.current = newState;
    setState(newState);
  }, []);

  const cleanup = useCallback(async (reason: string = 'unknown'): Promise<void> => {
    log("Cleanup started, reason:", reason);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    if (disconnectTimeoutRef.current) {
      clearTimeout(disconnectTimeoutRef.current);
      disconnectTimeoutRef.current = null;
    }
    
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
    setIceCandidatesSent(0);
    setNeedsPlayGesture(false);
    startMutexRef.current = false;
    
    await waitAnimationFrame();
    
    log("Cleanup complete");
  }, []);

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
      await cleanup('new connection requested');
    }
    
    setStateWithRef('starting');
    setErrorMessage(null);
    
    log("Starting WebRTC connection...");
    
    timeoutRef.current = setTimeout(async () => {
      const pc = peerConnectionRef.current;
      const isConnected = pc?.connectionState === 'connected';
      
      if (mountedRef.current && !isConnected && stateRef.current === 'starting') {
        logError("Connection timeout after", CONNECTION_TIMEOUT_MS, "ms");
        await cleanup('timeout');
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
      
      setSession({ streamId, sessionId });
      
      const pcConfig: RTCConfiguration = {
        iceServers: iceServers && iceServers.length > 0 
          ? iceServers 
          : [{ urls: 'stun:stun.l.google.com:19302' }]
      };
      log("RTCPeerConnection config:", JSON.stringify(pcConfig));
      
      const pc = new RTCPeerConnection(pcConfig);
      peerConnectionRef.current = pc;
      
      let localIceCount = 0;
      
      pc.ontrack = (event) => {
        log("Track received:", event.track.kind, "readyState:", event.track.readyState);
        
        const video = videoRef.current;
        if (!video) {
          logError("Video element not available");
          return;
        }
        
        if (event.track.kind === 'video') {
          log("Attaching video track to video element...");
          
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
          
          video.play()
            .then(() => {
              log("Video playback started ✓ (muted for autoplay)");
              video.muted = false;
              log("Video unmuted ✓");
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
        if (event.candidate) {
          localIceCount++;
          log("Local ICE candidate #" + localIceCount + ":", event.candidate.candidate?.slice(0, 50) + "...");
          
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
              log("ICE candidate #" + localIceCount + " sent successfully");
            } else {
              const err = await iceResponse.json();
              logError("Failed to send ICE candidate:", err);
            }
          } catch (e) {
            logError("ICE candidate send error:", e);
          }
        } else {
          log("ICE gathering complete, total candidates sent:", localIceCount);
        }
      };
      
      pc.oniceconnectionstatechange = () => {
        log("ICE connection state:", pc.iceConnectionState);
      };
      
      pc.onicegatheringstatechange = () => {
        log("ICE gathering state:", pc.iceGatheringState);
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
          
        } else if (pc.connectionState === 'failed') {
          logError("WebRTC connection failed");
          cleanup('connection failed').then(() => {
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
              await cleanup('disconnected timeout');
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
      
      await cleanup('connection error');
      setStateWithRef('error');
      setErrorMessage(error instanceof Error ? error.message : 'Connection failed');
      fetchApiStatus();
    }
  }, [cleanup, fetchApiStatus, setStateWithRef]);

  const handleSpeak = useCallback(async () => {
    if (state !== 'connected' || !session) {
      log("Cannot speak: state=" + state + ", session=" + !!session);
      return;
    }
    
    log("Speaking test text...");
    
    speakAbortRef.current = new AbortController();
    
    try {
      const response = await fetch(`/api/did-api/stream/${session.streamId}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          text: "Hello! I'm your AI enrollment specialist. How can I help you today?"
        }),
        signal: speakAbortRef.current.signal
      });
      
      if (!response.ok) {
        const error = await response.json();
        logError("Speak failed:", error);
      } else {
        log("Speak request sent ✓");
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        log("Speak request aborted");
      } else {
        logError("Speak error:", error);
      }
    } finally {
      speakAbortRef.current = null;
    }
  }, [session, state]);

  const handlePlayVideo = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.play()
        .then(() => {
          log("Manual video play succeeded ✓");
          video.muted = false;
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
    await cleanup('user stopped');
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
      cleanup('component unmount');
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
        {/* Video element - always mounted once user clicks start to avoid Safari issues */}
        {showVideo && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ minHeight: "520px" }}
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
              size="lg"
              className="gap-2"
            >
              <Volume2 className="w-5 h-5" />
              Restart Avatar
            </Button>
          </div>
        )}
      </div>
      
      {/* Controls */}
      {showVideo && (isConnected || isStarting) && !needsPlayGesture && (
        <div className="mt-3 flex justify-center gap-2">
          {isConnected && session && (
            <Button 
              variant="secondary" 
              size="sm"
              onClick={handleSpeak}
              disabled={isButtonDisabled}
              className="gap-2"
              data-testid="did-speak-button"
            >
              <Volume2 className="w-4 h-4" />
              Test Speak
            </Button>
          )}
          <Button 
            variant="outline" 
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
      )}
      
      {/* Status line */}
      {showVideo && (
        <p className="text-xs text-center text-muted-foreground mt-2">
          State: {state}{iceCandidatesSent > 0 ? ` | ICE: ${iceCandidatesSent}` : ''}
        </p>
      )}
    </div>
  );
}
