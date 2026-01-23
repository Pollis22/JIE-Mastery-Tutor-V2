/**
 * D-ID API Client
 * 
 * Centralized client for all D-ID API calls.
 * Uses the official D-ID Realtime Agents Streams API.
 * 
 * All secrets are kept server-side only.
 */

const DID_API_BASE_URL = 'https://api.d-id.com';
const DEFAULT_TIMEOUT_MS = 8000;

interface DidClientConfig {
  apiKey: string;
  agentId: string;
}

interface DidApiError {
  ok: false;
  status: number;
  message: string;
  upstream?: string;
}

interface DidApiSuccess<T> {
  ok: true;
  data: T;
}

type DidApiResponse<T> = DidApiSuccess<T> | DidApiError;

function getConfig(): DidClientConfig | null {
  const apiKey = process.env.DID_API_KEY || process.env.DID_CLIENT_KEY;
  const agentId = process.env.DID_AGENT_ID || 'v2_agt_0KyN0XA6';
  
  if (!apiKey) {
    return null;
  }
  
  return { apiKey, agentId };
}

function getAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(apiKey + ':').toString('base64')}`;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<DidApiResponse<T>> {
  const config = getConfig();
  
  if (!config) {
    return {
      ok: false,
      status: 500,
      message: 'D-ID API key not configured'
    };
  }
  
  const url = `${DID_API_BASE_URL}${path}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const headers: Record<string, string> = {
      'Authorization': getAuthHeader(config.apiKey),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    const options: RequestInit = {
      method,
      headers,
      signal: controller.signal
    };
    
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }
    
    console.log(`[D-ID API] ${method} ${path}`);
    
    const response = await fetch(url, options);
    clearTimeout(timeoutId);
    
    const contentType = response.headers.get('content-type');
    let data: T | null = null;
    let rawBody = '';
    
    if (contentType?.includes('application/json')) {
      try {
        data = await response.json() as T;
      } catch (e) {
        rawBody = await response.text();
      }
    } else {
      rawBody = await response.text();
    }
    
    if (!response.ok) {
      console.log(`[D-ID API] Error ${response.status}: ${rawBody || JSON.stringify(data)}`);
      return {
        ok: false,
        status: response.status,
        message: `D-ID API error: ${response.statusText}`,
        upstream: rawBody || JSON.stringify(data)?.slice(0, 200)
      };
    }
    
    console.log(`[D-ID API] Success ${response.status}`);
    
    return {
      ok: true,
      data: data as T
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[D-ID API] Request failed:`, message);
    
    if (message.includes('abort')) {
      return {
        ok: false,
        status: 408,
        message: 'Request timeout'
      };
    }
    
    return {
      ok: false,
      status: 500,
      message
    };
  }
}

export interface CreateStreamResponse {
  id: string;
  session_id: string;
  offer: {
    type: 'offer';
    sdp: string;
  };
  ice_servers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

export interface SdpResponse {
  status: string;
}

export interface IceResponse {
  status: string;
}

export interface SpeakResponse {
  id?: string;
  status?: string;
}

export const didClient = {
  getConfig,
  
  isConfigured(): boolean {
    return getConfig() !== null;
  },
  
  getAgentId(): string {
    return getConfig()?.agentId || '';
  },
  
  async checkApiReachability(): Promise<{ dnsOk: boolean; httpOk: boolean; httpStatus?: number; error?: string }> {
    const dns = await import('dns');
    const { promisify } = await import('util');
    const dnsLookup = promisify(dns.lookup);
    
    let dnsOk = false;
    let httpOk = false;
    let httpStatus: number | undefined;
    let error: string | undefined;
    
    try {
      await dnsLookup('api.d-id.com');
      dnsOk = true;
    } catch (e) {
      error = `DNS lookup failed: ${e instanceof Error ? e.message : 'unknown'}`;
      return { dnsOk, httpOk, error };
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('https://api.d-id.com/', {
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      httpStatus = response.status;
      httpOk = response.status < 500;
    } catch (e) {
      error = `HTTP check failed: ${e instanceof Error ? e.message : 'unknown'}`;
    }
    
    return { dnsOk, httpOk, httpStatus, error };
  },
  
  async createStream(): Promise<DidApiResponse<CreateStreamResponse>> {
    const config = getConfig();
    if (!config) {
      return { ok: false, status: 500, message: 'D-ID not configured' };
    }
    
    return request<CreateStreamResponse>(
      'POST',
      `/agents/${config.agentId}/streams`,
      {}
    );
  },
  
  async sendSdpAnswer(streamId: string, sessionId: string, answerSdp: string): Promise<DidApiResponse<SdpResponse>> {
    const config = getConfig();
    if (!config) {
      return { ok: false, status: 500, message: 'D-ID not configured' };
    }
    
    return request<SdpResponse>(
      'POST',
      `/agents/${config.agentId}/streams/${streamId}/sdp`,
      {
        session_id: sessionId,
        answer: {
          type: 'answer',
          sdp: answerSdp
        }
      }
    );
  },
  
  async sendIceCandidate(streamId: string, sessionId: string, candidate: RTCIceCandidateInit): Promise<DidApiResponse<IceResponse>> {
    const config = getConfig();
    if (!config) {
      return { ok: false, status: 500, message: 'D-ID not configured' };
    }
    
    return request<IceResponse>(
      'POST',
      `/agents/${config.agentId}/streams/${streamId}/ice`,
      {
        session_id: sessionId,
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex
      }
    );
  },
  
  async speak(streamId: string, sessionId: string, text: string): Promise<DidApiResponse<SpeakResponse>> {
    const config = getConfig();
    if (!config) {
      return { ok: false, status: 500, message: 'D-ID not configured' };
    }
    
    return request<SpeakResponse>(
      'POST',
      `/agents/${config.agentId}/streams/${streamId}`,
      {
        session_id: sessionId,
        script: {
          type: 'text',
          input: text
        }
      }
    );
  }
};

export default didClient;
