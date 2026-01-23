/**
 * D-ID Agent WebRTC Component
 * 
 * Uses the D-ID Realtime Agents Streams API with WebRTC.
 * Does NOT depend on the iframe embed domain (agents.d-id.com).
 * 
 * Features:
 * - WebRTC connection to D-ID API
 * - Video element for avatar stream
 * - Status display and retry functionality
 * - Speak test button
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONNECTION_TIMEOUT_MS = 15000;
const DEBUG = true;

function log(...args: unknown[]) {
  if (DEBUG) console.log("[D-ID WebRTC]", ...args);
}

function logError(...args: unknown[]) {
  console.error("[D-ID WebRTC]", ...args);
}

type ConnectionStatus = 'idle' | 'creating' | 'connecting' | 'connected' | 'error' | 'timeout';

interface StreamSession {
  streamId: string;
  sessionId: string;
}

interface ApiStatus {
  ok: boolean;
  configured: boolean;
  mode: string;
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
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    log("Cleaning up...");
    
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
    
    cleanup();
    setStatus('creating');
    setErrorMessage(null);
    
    log("Starting WebRTC connection...");
    
    timeoutRef.current = setTimeout(() => {
      if (mountedRef.current && status !== 'connected') {
        logError("Connection timeout");
        setStatus('timeout');
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
      log("Stream created:", streamId);
      
      setSession({ streamId, sessionId });
      setStatus('connecting');
      
      const pc = new RTCPeerConnection({
        iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;
      
      pc.ontrack = (event) => {
        log("Track received:", event.track.kind);
        if (event.track.kind === 'video' && videoRef.current) {
          const stream = new MediaStream([event.track]);
          videoRef.current.srcObject = stream;
          
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          
          setStatus('connected');
          log("Video stream attached ✓");
        }
      };
      
      pc.onicecandidate = async (event) => {
        if (event.candidate && session) {
          log("Sending ICE candidate...");
          try {
            await fetch(`/api/did-api/stream/${streamId}/ice`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId,
                candidate: {
                  candidate: event.candidate.candidate,
                  sdpMid: event.candidate.sdpMid,
                  sdpMLineIndex: event.candidate.sdpMLineIndex
                }
              })
            });
          } catch (e) {
            logError("Failed to send ICE candidate:", e);
          }
        }
      };
      
      pc.onconnectionstatechange = () => {
        log("Connection state:", pc.connectionState);
        if (pc.connectionState === 'failed') {
          setStatus('error');
          setErrorMessage("WebRTC connection failed");
        }
      };
      
      await pc.setRemoteDescription({
        type: 'offer',
        sdp: offerSdp
      });
      log("Remote description set");
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log("Local description set, sending answer...");
      
      const sdpResponse = await fetch(`/api/did-api/stream/${streamId}/sdp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
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
    }
  }, [cleanup, fetchApiStatus, session, status]);

  const handleSpeak = useCallback(async () => {
    if (!session) return;
    
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
    setHasUserGesture(true);
    connect();
  }, [connect]);

  const handleRetry = useCallback(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    fetchApiStatus();
    
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup, fetchApiStatus]);

  if (!hasUserGesture) {
    return (
      <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-webrtc">
        <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
          Talk to our Live Enrollment Specialist
        </p>
        <div 
          className="w-full rounded-2xl border border-border bg-muted/30 p-8 text-center"
          style={{ minHeight: "300px" }}
        >
          <div className="flex flex-col items-center justify-center h-full">
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
            <p className="text-xs text-muted-foreground mt-4 max-w-sm">
              This will connect to our AI enrollment specialist via video.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error' || status === 'timeout') {
    return (
      <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-webrtc">
        <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
          Talk to our Live Enrollment Specialist
        </p>
        <div 
          className="w-full rounded-2xl border border-border bg-muted/30 p-6 text-center"
          style={{ minHeight: "300px" }}
        >
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <p className="text-base font-medium text-foreground mb-2">
            {status === 'timeout' ? 'Connection Timeout' : 'Connection Failed'}
          </p>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
            {errorMessage || "Unable to connect to the avatar service."}
          </p>
          
          {apiStatus && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg text-left text-xs space-y-1">
              <p className="font-medium text-foreground mb-2">Diagnostics:</p>
              <div className="flex items-center gap-2">
                {apiStatus.configured ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-500" />
                )}
                <span>API Key: {apiStatus.configured ? 'Configured' : 'Missing'}</span>
              </div>
              <div className="flex items-center gap-2">
                {apiStatus.canResolveApiDomain ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-500" />
                )}
                <span>DNS: {apiStatus.canResolveApiDomain ? 'OK' : 'Failed'}</span>
              </div>
              <div className="flex items-center gap-2">
                {apiStatus.outboundHttpOk ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-500" />
                )}
                <span>D-ID API: {apiStatus.outboundHttpOk ? 'Reachable' : 'Unreachable'}</span>
              </div>
              <div className="text-muted-foreground mt-1">
                Mode: {apiStatus.mode}
              </div>
            </div>
          )}
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRetry}
            className="gap-2"
            data-testid="did-retry-button"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto lg:mx-0 mt-6" data-testid="did-agent-webrtc">
      <p className="text-sm font-semibold text-muted-foreground mb-3 text-center lg:text-left">
        Talk to our Live Enrollment Specialist
      </p>
      <div 
        className="w-full rounded-2xl overflow-hidden border border-border shadow-lg bg-black relative"
        style={{ height: "520px" }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={false}
          className="w-full h-full object-cover"
          data-testid="did-video"
        />
        
        {(status === 'creating' || status === 'connecting') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-3" />
            <p className="text-sm text-white">
              {status === 'creating' ? 'Creating stream...' : 'Connecting...'}
            </p>
          </div>
        )}
      </div>
      
      {status === 'connected' && session && (
        <div className="mt-3 flex justify-center gap-2">
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
        </div>
      )}
      
      <p className="text-xs text-center text-muted-foreground mt-2">
        Status: {status === 'connected' ? 'Connected' : status}
      </p>
    </div>
  );
}
