import { IncomingMessage } from 'http';

/**
 * WebSocket Rate Limiter
 * 
 * Token bucket rate limiter for WebSocket upgrades to prevent DoS attacks.
 * Tracks both concurrent connections and request rate per IP address.
 * 
 * Limits:
 * - Max 5 concurrent WebSocket connections per IP
 * - Max 20 upgrade requests per minute per IP
 */

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  concurrentConnections: number;
}

class WsRateLimiter {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  
  // Configuration
  private readonly MAX_CONCURRENT_PER_IP = 5;
  private readonly MAX_REQUESTS_PER_MINUTE = 20;
  private readonly REFILL_RATE_MS = 3000; // Refill 1 token every 3 seconds (20 per minute)
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Clean up every 5 minutes
  
  constructor() {
    // Periodically clean up inactive IP buckets
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }
  
  /**
   * Check if an IP address is allowed to make an upgrade request
   * Only checks request rate limit (tokens), not concurrent connections
   * Concurrent connections are tracked separately via trackConnection/releaseConnection
   */
  canUpgrade(ip: string): { allowed: boolean; reason?: string } {
    const bucket = this.getOrCreateBucket(ip);
    
    // Refill tokens based on time elapsed
    this.refillTokens(bucket);
    
    // Check rate limit (tokens only - concurrent limit checked separately)
    if (bucket.tokens < 1) {
      return {
        allowed: false,
        reason: `Rate limit exceeded (${this.MAX_REQUESTS_PER_MINUTE}/minute)`
      };
    }
    
    // Consume a token for this upgrade attempt
    bucket.tokens -= 1;
    
    return { allowed: true };
  }
  
  /**
   * Track a new WebSocket connection for an IP
   * Must be called after successful upgrade
   * Returns false if concurrent connection limit exceeded
   */
  trackConnection(ip: string): { allowed: boolean; reason?: string } {
    const bucket = this.getOrCreateBucket(ip);
    
    // Enforce concurrent connection limit
    if (bucket.concurrentConnections >= this.MAX_CONCURRENT_PER_IP) {
      return {
        allowed: false,
        reason: `Concurrent connection limit exceeded (${this.MAX_CONCURRENT_PER_IP})`
      };
    }
    
    bucket.concurrentConnections += 1;
    return { allowed: true };
  }
  
  /**
   * Release a WebSocket connection for an IP
   * Must be called when connection closes
   */
  releaseConnection(ip: string): void {
    const bucket = this.buckets.get(ip);
    if (bucket) {
      bucket.concurrentConnections = Math.max(0, bucket.concurrentConnections - 1);
    }
  }
  
  /**
   * Get or create a rate limit bucket for an IP
   */
  private getOrCreateBucket(ip: string): RateLimitBucket {
    let bucket = this.buckets.get(ip);
    
    if (!bucket) {
      bucket = {
        tokens: this.MAX_REQUESTS_PER_MINUTE,
        lastRefill: Date.now(),
        concurrentConnections: 0
      };
      this.buckets.set(ip, bucket);
    }
    
    return bucket;
  }
  
  /**
   * Refill tokens based on time elapsed (token bucket algorithm)
   */
  private refillTokens(bucket: RateLimitBucket): void {
    const now = Date.now();
    const timeSinceRefill = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(timeSinceRefill / this.REFILL_RATE_MS);
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(
        this.MAX_REQUESTS_PER_MINUTE,
        bucket.tokens + tokensToAdd
      );
      bucket.lastRefill = now;
    }
  }
  
  /**
   * Clean up inactive IP buckets (no connections and full tokens)
   */
  private cleanup(): void {
    const now = Date.now();
    const inactiveThreshold = 10 * 60 * 1000; // 10 minutes
    
    for (const [ip, bucket] of this.buckets.entries()) {
      // Remove if no concurrent connections and inactive for 10+ minutes
      const timeSinceActivity = now - bucket.lastRefill;
      if (bucket.concurrentConnections === 0 && timeSinceActivity > inactiveThreshold) {
        this.buckets.delete(ip);
      }
    }
  }
  
  /**
   * Destroy the rate limiter and clean up resources
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
  }
  
  /**
   * Get stats for monitoring/debugging
   */
  getStats(): { totalIPs: number; totalConnections: number } {
    let totalConnections = 0;
    for (const bucket of this.buckets.values()) {
      totalConnections += bucket.concurrentConnections;
    }
    return {
      totalIPs: this.buckets.size,
      totalConnections
    };
  }
}

// Singleton instance
export const wsRateLimiter = new WsRateLimiter();

/**
 * Extract IP address from request, considering X-Forwarded-For header
 * (important for Railway which uses a reverse proxy)
 */
export function getClientIp(request: IncomingMessage): string {
  // Check X-Forwarded-For header (Railway, proxies)
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    // Take the first IP in the list (original client)
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }
  
  // Check X-Real-IP header
  const realIp = request.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  
  // Fallback to socket remote address
  return request.socket.remoteAddress || 'unknown';
}
