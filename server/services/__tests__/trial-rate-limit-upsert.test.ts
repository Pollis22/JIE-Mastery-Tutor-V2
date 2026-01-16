/**
 * Trial Rate Limit UPSERT Tests
 * 
 * Verifies that IP rate-limit updates are idempotent:
 * - Second call with same IP does NOT throw unique constraint violation
 * - Count increments correctly on subsequent calls
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { db } from '../../db';
import { trialRateLimits } from '../../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

// Helper to create a unique IP hash for testing
function createTestIpHash(): string {
  return crypto.createHash('sha256')
    .update(`test-ip-${Date.now()}-${Math.random()}`)
    .digest('hex');
}

// The actual UPSERT logic extracted for testing
async function upsertIpRateLimit(ipHash: string): Promise<void> {
  await db.insert(trialRateLimits)
    .values({
      ipHash,
      attemptCount: 1,
      windowStart: new Date(),
    })
    .onConflictDoUpdate({
      target: trialRateLimits.ipHash,
      set: {
        attemptCount: sql`${trialRateLimits.attemptCount} + 1`,
      },
    });
}

describe('Trial Rate Limit UPSERT', () => {
  const testIpHash = createTestIpHash();

  afterAll(async () => {
    // Cleanup test data
    try {
      await db.delete(trialRateLimits).where(eq(trialRateLimits.ipHash, testIpHash));
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should insert new rate limit row on first call', async () => {
    // First call - should insert
    await upsertIpRateLimit(testIpHash);

    // Verify row exists with count = 1
    const rows = await db.select()
      .from(trialRateLimits)
      .where(eq(trialRateLimits.ipHash, testIpHash));

    expect(rows.length).toBe(1);
    expect(rows[0].attemptCount).toBe(1);
  });

  it('should NOT throw on second call with same IP (upsert works)', async () => {
    // Second call - should NOT throw, should update
    await expect(upsertIpRateLimit(testIpHash)).resolves.not.toThrow();
  });

  it('should increment count on second call', async () => {
    // Verify count is now 2
    const rows = await db.select()
      .from(trialRateLimits)
      .where(eq(trialRateLimits.ipHash, testIpHash));

    expect(rows.length).toBe(1);
    expect(rows[0].attemptCount).toBe(2);
  });

  it('should increment count on third call', async () => {
    // Third call
    await upsertIpRateLimit(testIpHash);

    // Verify count is now 3
    const rows = await db.select()
      .from(trialRateLimits)
      .where(eq(trialRateLimits.ipHash, testIpHash));

    expect(rows.length).toBe(1);
    expect(rows[0].attemptCount).toBe(3);
  });
});
