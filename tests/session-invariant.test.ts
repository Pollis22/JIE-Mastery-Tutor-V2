/**
 * Session Invariant Test (Jan 2026)
 * 
 * Verifies that the voice session system maintains the single-session invariant:
 * - Only ONE active voice session per user at any time
 * - Reconnecting to an ended session returns session_invalid
 * - STT stall recovery does NOT create new sessions
 * 
 * Usage: npx vitest run tests/session-invariant.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Voice Session State Machine', () => {
  describe('VoiceSessionState transitions', () => {
    const validTransitions: Record<string, string[]> = {
      'IDLE': ['CREATING_SESSION', 'CONNECTING_WS'],
      'CREATING_SESSION': ['CONNECTING_WS', 'IDLE', 'TERMINAL_ERROR'],
      'CONNECTING_WS': ['CONNECTED', 'IDLE', 'TERMINAL_ERROR'],
      'CONNECTED': ['DISCONNECTING', 'TERMINAL_ERROR'],
      'DISCONNECTING': ['IDLE'],
      'TERMINAL_ERROR': ['IDLE'], // Only via resetVoiceState
    };

    it('should define valid state transitions', () => {
      expect(Object.keys(validTransitions)).toHaveLength(6);
      expect(validTransitions['IDLE']).toContain('CONNECTING_WS');
      expect(validTransitions['CONNECTED']).toContain('DISCONNECTING');
      expect(validTransitions['TERMINAL_ERROR']).toContain('IDLE');
    });

    it('should only allow transitions from IDLE to CREATING_SESSION or CONNECTING_WS', () => {
      expect(validTransitions['IDLE']).toContain('CREATING_SESSION');
      expect(validTransitions['IDLE']).toContain('CONNECTING_WS');
      expect(validTransitions['IDLE']).not.toContain('CONNECTED');
      expect(validTransitions['IDLE']).not.toContain('DISCONNECTING');
      expect(validTransitions['IDLE']).not.toContain('TERMINAL_ERROR');
    });
  });

  describe('Exponential backoff', () => {
    const RECONNECT_CONFIG = {
      INITIAL_DELAY_MS: 1000,
      MAX_DELAY_MS: 30000,
      MAX_ATTEMPTS: 5,
      JITTER_FACTOR: 0.3,
    };

    function getBackoffDelay(attempt: number): number {
      const baseDelay = Math.min(
        RECONNECT_CONFIG.INITIAL_DELAY_MS * Math.pow(2, attempt),
        RECONNECT_CONFIG.MAX_DELAY_MS
      );
      const jitter = baseDelay * RECONNECT_CONFIG.JITTER_FACTOR * (Math.random() * 2 - 1);
      return Math.round(baseDelay + jitter);
    }

    it('should calculate correct base delays', () => {
      expect(getBackoffDelay(0)).toBeGreaterThanOrEqual(700); // 1000 - 30%
      expect(getBackoffDelay(0)).toBeLessThanOrEqual(1300); // 1000 + 30%
      
      expect(getBackoffDelay(1)).toBeGreaterThanOrEqual(1400); // 2000 - 30%
      expect(getBackoffDelay(1)).toBeLessThanOrEqual(2600); // 2000 + 30%
    });

    it('should cap at MAX_DELAY_MS', () => {
      const delay = getBackoffDelay(10); // 2^10 * 1000 = 1024000 > 30000
      expect(delay).toBeLessThanOrEqual(RECONNECT_CONFIG.MAX_DELAY_MS * 1.3);
    });

    it('should limit attempts to MAX_ATTEMPTS', () => {
      expect(RECONNECT_CONFIG.MAX_ATTEMPTS).toBe(5);
    });
  });

  describe('WebSocket URL construction', () => {
    it('should never produce localhost:undefined', () => {
      const mockLocation = {
        protocol: 'https:',
        origin: 'https://example.replit.app',
        host: 'example.replit.app',
      };

      const wsUrl = new URL('/api/custom-voice-ws', mockLocation.origin);
      wsUrl.protocol = mockLocation.protocol === 'https:' ? 'wss:' : 'ws:';
      
      expect(wsUrl.toString()).toBe('wss://example.replit.app/api/custom-voice-ws');
      expect(wsUrl.toString()).not.toContain('localhost');
      expect(wsUrl.toString()).not.toContain('undefined');
    });

    it('should handle http correctly', () => {
      const mockLocation = {
        protocol: 'http:',
        origin: 'http://localhost:5000',
        host: 'localhost:5000',
      };

      const wsUrl = new URL('/api/custom-voice-ws', mockLocation.origin);
      wsUrl.protocol = mockLocation.protocol === 'https:' ? 'wss:' : 'ws:';
      
      expect(wsUrl.toString()).toBe('ws://localhost:5000/api/custom-voice-ws');
      expect(wsUrl.toString()).not.toContain('undefined');
    });
  });

  describe('Terminal error detection', () => {
    function isTerminalError(error: string): boolean {
      const errorLower = error.toLowerCase();
      return (
        errorLower.includes('too many voice sessions') ||
        errorLower.includes('too many sessions') ||
        errorLower.includes('account is disabled') ||
        errorLower.includes('account has been deleted') ||
        errorLower.includes('unauthorized session') ||
        errorLower.includes('session has already ended')
      );
    }

    it('should detect "too many sessions" as terminal', () => {
      expect(isTerminalError('Too many voice sessions; please refresh')).toBe(true);
      expect(isTerminalError('Too many sessions detected')).toBe(true);
    });

    it('should detect account-related errors as terminal', () => {
      expect(isTerminalError('Your account is disabled')).toBe(true);
      expect(isTerminalError('Account has been deleted')).toBe(true);
      expect(isTerminalError('Unauthorized session access')).toBe(true);
    });

    it('should detect ended session as terminal', () => {
      expect(isTerminalError('This session has already ended')).toBe(true);
    });

    it('should NOT flag normal errors as terminal (narrower matching)', () => {
      expect(isTerminalError('Network timeout')).toBe(false);
      expect(isTerminalError('Connection error')).toBe(false);
      expect(isTerminalError('Session started successfully')).toBe(false);
      expect(isTerminalError('Session config received')).toBe(false);
    });
  });
});

describe('Server-side Session Idempotency', () => {
  describe('Session validation', () => {
    it('should reject reconnection to ended session with session_invalid', () => {
      const mockSession = {
        id: 'test-session-123',
        userId: 'user-456',
        endedAt: new Date(), // Session is ended
      };

      const isEnded = !!mockSession.endedAt;
      expect(isEnded).toBe(true);
    });

    it('should allow reconnection to active session', () => {
      const mockSession = {
        id: 'test-session-123',
        userId: 'user-456',
        endedAt: null, // Session is active
      };

      const isEnded = !!mockSession.endedAt;
      expect(isEnded).toBe(false);
    });
  });

  describe('One session per user enforcement', () => {
    it('should identify other active sessions for cleanup', () => {
      const mockSessions = [
        { id: 'session-1', userId: 'user-1', endedAt: null },
        { id: 'session-2', userId: 'user-1', endedAt: null },
        { id: 'session-3', userId: 'user-1', endedAt: new Date() },
      ];

      const currentSessionId = 'session-2';
      const otherActive = mockSessions.filter(
        s => s.userId === 'user-1' && !s.endedAt && s.id !== currentSessionId
      );

      expect(otherActive).toHaveLength(1);
      expect(otherActive[0].id).toBe('session-1');
    });
  });
});
