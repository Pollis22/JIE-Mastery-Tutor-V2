/**
 * D-ID Agent WebRTC Component
 * 
 * Uses the D-ID Realtime Agents Streams API with WebRTC.
 * Does NOT depend on the iframe embed domain (agents.d-id.com).
 * 
 * Features:
 * - WebRTC connection to D-ID API
 * - Video element for avatar stream (always mounted to avoid Safari issues)
 * - Status display and retry functionality
 * - Speak test button
 * - Proper ICE candidate exchange
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Volume2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONNECTION_TIMEOUT_MS = 15000;
const DEBUG = true;

function log(...args: unknown[]) {
  if (DEBUG) console.log("[D-ID WebRTC]", ...args);
}

function logError(...args: unknown[]) {
  console.error("[D-ID WebRTC]", ...args);
}

type ConnectionStatus = 'idle' | 'creating' | 'connecting' | 'connected' | 'error' | 'timeout' | 'stopped';

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

export function DidAgentWebRTC() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [session, setSession] = useState<StreamSession | null>(null);
  const [hasUserGesture, setHasUserGesture] = useState(false);
  const [iceCandidatesSent, setIceCandidatesSent] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const isConnectingRef = useRef(false);

  const cleanup = useCallback((reason: string = 'unknown') => {
    log("Cleaning up, reason:", reason);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setSession(null);
    setIceCandidatesSent(0);
    isConnectingRef.current = false;
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

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;
    if (isConnectingRef.current) {
      log("Already connecting, ignoring duplicate request");
      return;
    }
    
    isConnectingRef.current = true;
    cleanup('new connection');
    setStatus('creating');
    setErrorMessage(null);
    
    log("Starting WebRTC connection...");
    
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current && peerConnectionRef.current?.connectionState !== 'connected') {
        logError("Connection timeout after", CONNECTION_TIMEOUT_MS, "ms");
        setStatus('timeout');
        setErrorMessage("Connection timed out. The D-ID service may be unavailable.");
        fetchApiStatus();
        isConnectingRef.current = false;
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
      
      setSession({ streamId, sessionId });
      setStatus('connecting');
      
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
        
        if (event.track.kind === 'video' && videoRef.current) {
          log("Attaching video track to video element...");
          
          const stream = new MediaStream([event.track]);
          videoRef.current.srcObject = stream;
          
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              log("Video playback started ✓");
            }).catch((e) => {
              log("Video play() needs user gesture:", e.message);
            });
          }
          
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          
          setStatus('connected');
          log("Video stream attached ✓");
        }
        
        if (event.track.kind === 'audio' && videoRef.current) {
          log("Audio track received, adding to stream");
          const existingStream = videoRef.current.srcObject as MediaStream;
          if (existingStream) {
            existingStream.addTrack(event.track);
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
        
        if (pc.connectionState === 'connected') {
          log("WebRTC connection established ✓");
          setStatus('connected');
          isConnectingRef.current = false;
          
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        } else if (pc.connectionState === 'failed') {
          logError("WebRTC connection failed");
          setStatus('error');
          setErrorMessage("WebRTC connection failed. ICE candidates: " + localIceCount);
          isConnectingRef.current = false;
        } else if (pc.connectionState === 'disconnected') {
          log("WebRTC connection disconnected (may reconnect)");
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
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Connection failed');
      fetchApiStatus();
      isConnectingRef.current = false;
    }
  }, [cleanup, fetchApiStatus]);

  const handleSpeak = useCallback(async () => {
    if (!session) {
      log("No session, cannot speak");
      return;
    }
    
    log("Speaking test text...");
    
    try {
      const response = await fetch(`/api/did-api/stream/${session.streamId}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          text: "Hello! I'm your AI enrollment specialist. How can I help you today?"
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        logError("Speak failed:", error);
      } else {
        log("Speak request sent ✓");
      }
    } catch (error) {
      logError("Speak error:", error);
    }
  }, [session]);

  const handleStart = useCallback(() => {
    log("User clicked Start Avatar");
    setHasUserGesture(true);
    connect();
  }, [connect]);

  const handleStop = useCallback(() => {
    log("User clicked Stop");
    cleanup('user stopped');
    setStatus('stopped');
  }, [cleanup]);

  const handleRetry = useCallback(() => {
    log("User clicked Retry");
    connect();
  }, [connect]);

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
  const isLoading = status === 'creating' || status === 'connecting';
  const isError = status === 'error' || status === 'timeout';
  const isStopped = status === 'stopped';
  const isConnected = status === 'connected';

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
            muted={false}
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
        
        {/* Loading overlay */}
        {showVideo && isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-3" />
            <p className="text-sm text-white">
              {status === 'creating' ? 'Creating stream...' : 'Connecting...'}
            </p>
            {iceCandidatesSent > 0 && (
              <p className="text-xs text-white/70 mt-2">
                ICE candidates sent: {iceCandidatesSent}
              </p>
            )}
          </div>
        )}
        
        {/* Error overlay - shown OVER the video, not replacing it */}
        {showVideo && isError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 p-6">
            <AlertTriangle className="w-10 h-10 text-amber-500 mb-4" />
            <p className="text-base font-medium text-white mb-2">
              {status === 'timeout' ? 'Connection Timeout' : 'Connection Failed'}
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
              className="gap-2"
              data-testid="did-retry-button"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
          </div>
        )}
        
        {/* Stopped overlay */}
        {showVideo && isStopped && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10">
            <p className="text-base font-medium text-white mb-4">
              Avatar stopped
            </p>
            <Button 
              onClick={handleRetry}
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
      {showVideo && (isConnected || isLoading) && (
        <div className="mt-3 flex justify-center gap-2">
          {isConnected && session && (
            <Button 
              variant="secondary" 
              size="sm"
              onClick={handleSpeak}
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
          Status: {status}{iceCandidatesSent > 0 ? ` | ICE: ${iceCandidatesSent}` : ''}
        </p>
      )}
    </div>
  );
}
