import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { storage } from '../storage';
import session from 'express-session';
import cookie from 'cookie';
import signature from 'cookie-signature';

/**
 * WebSocket Session Validator
 * 
 * Production-grade session validation for WebSocket upgrades.
 * Validates sessions directly from the session store without reusing Express middleware,
 * preventing passport double-initialization and state cross-contamination.
 * 
 * Security Features:
 * - Direct session store validation
 * - Session freshness enforcement (30min rotation)
 * - Unsigned cookie verification
 * - Explicit rejection of stale/invalidated sessions
 */

export interface WsSessionValidationResult {
  valid: boolean;
  userId?: string;
  sessionId?: string;
  error?: string;
  statusCode?: number;
}

interface SessionData {
  cookie: any;
  passport?: {
    user?: string;
  };
  lastRotatedAt?: number;
  [key: string]: any;
}

/**
 * Validate a WebSocket upgrade request's session
 * 
 * @param request - The incoming HTTP upgrade request
 * @param sessionSecret - The session secret for cookie verification
 * @param sessionCookieName - The name of the session cookie (default: 'connect.sid')
 * @returns Promise<WsSessionValidationResult>
 */
export async function validateWsSession(
  request: IncomingMessage,
  sessionSecret: string,
  sessionCookieName: string = 'connect.sid'
): Promise<WsSessionValidationResult> {
  
  try {
    // Step 1: Parse cookies from request
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return {
        valid: false,
        error: 'No cookies present in request',
        statusCode: 401
      };
    }

    const cookies = cookie.parse(cookieHeader);
    let signedSessionCookie = cookies[sessionCookieName];
    
    if (!signedSessionCookie) {
      return {
        valid: false,
        error: 'Session cookie not found',
        statusCode: 401
      };
    }

    // Decode URL-encoded cookie value (Express sends cookies URL-encoded)
    // Wrap in try/catch to handle malformed percent-encoded strings
    try {
      signedSessionCookie = decodeURIComponent(signedSessionCookie);
    } catch (decodeError) {
      return {
        valid: false,
        error: 'Malformed cookie value',
        statusCode: 400
      };
    }

    // Step 2: Unsign the session cookie
    // Format is 's:sessionId.signature' - we need to verify and extract the sessionId
    // Check for 's:' prefix
    if (!signedSessionCookie.startsWith('s:')) {
      return {
        valid: false,
        error: 'Invalid session cookie format',
        statusCode: 401
      };
    }
    
    const unsignedSessionId = signature.unsign(signedSessionCookie.slice(2), sessionSecret);
    
    if (unsignedSessionId === false) {
      return {
        valid: false,
        error: 'Invalid session signature',
        statusCode: 401
      };
    }

    // Step 3: Retrieve session from the session store
    const sessionData = await getSessionFromStore(storage.sessionStore, unsignedSessionId as string);
  
  if (!sessionData) {
    return {
      valid: false,
      error: 'Session not found in store',
      statusCode: 401
    };
  }

  // Step 4: Verify user presence in session (passport authentication)
  if (!sessionData.passport || !sessionData.passport.user) {
    return {
      valid: false,
      error: 'User not authenticated in session',
      statusCode: 401
    };
  }

  const userId = sessionData.passport.user;

  // Step 5: Check session freshness (30-minute rotation requirement)
  const sessionFreshnessMinutes = 30;
  if (sessionData.lastRotatedAt) {
    const sessionAge = Date.now() - sessionData.lastRotatedAt;
    const maxAge = sessionFreshnessMinutes * 60 * 1000;
    
    if (sessionAge > maxAge) {
      return {
        valid: false,
        error: 'Session expired - requires rotation',
        statusCode: 401
      };
    }
  }

  // Step 6: Verify session cookie hasn't expired
  if (sessionData.cookie && sessionData.cookie.expires) {
    const expiryDate = new Date(sessionData.cookie.expires);
    if (expiryDate < new Date()) {
      return {
        valid: false,
        error: 'Session cookie expired',
        statusCode: 401
      };
    }
  }

    // Session is valid
    return {
      valid: true,
      userId: userId,
      sessionId: unsignedSessionId as string
    };
  } catch (error) {
    // Catch any unexpected errors during validation
    console.error('[WsSessionValidator] Unexpected error during validation:', error);
    return {
      valid: false,
      error: 'Internal validation error',
      statusCode: 500
    };
  }
}

/**
 * Helper function to retrieve session from store
 * Promisifies the session store's get method
 */
function getSessionFromStore(
  store: session.Store,
  sessionId: string
): Promise<SessionData | null> {
  return new Promise((resolve, reject) => {
    store.get(sessionId, (err, sessionData) => {
      if (err) {
        reject(err);
      } else {
        resolve(sessionData as SessionData | null);
      }
    });
  });
}

/**
 * Write a rejection response to the socket and close it
 * Must be called before handleUpgrade to prevent connection
 */
export function rejectWsUpgrade(socket: Socket, statusCode: number, message: string): void {
  const response = [
    `HTTP/1.1 ${statusCode} ${getStatusMessage(statusCode)}`,
    'Content-Type: text/plain',
    'Connection: close',
    '',
    message
  ].join('\r\n');
  
  socket.write(response);
  socket.destroy();
}

function getStatusMessage(code: number): string {
  const messages: Record<number, string> = {
    401: 'Unauthorized',
    403: 'Forbidden',
    429: 'Too Many Requests',
    500: 'Internal Server Error'
  };
  return messages[code] || 'Error';
}

/**
 * Invalidate a session by deleting it from the session store
 * Should be called on logout or user suspension
 */
export function invalidateSession(
  store: session.Store,
  sessionId: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    store.destroy(sessionId, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
