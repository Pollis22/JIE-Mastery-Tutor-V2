import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

interface TestUser {
  num: number;
  plan: 'starter' | 'standard' | 'pro' | 'elite' | null;
  minutes: number | null;
  maxSessions: number;
  maxLogins: number;
}

async function createTestUsers() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Creating Test Users');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testUsers: TestUser[] = [
    // Starter Family users (60 minutes)
    { num: 1, plan: 'starter', minutes: 60, maxSessions: 1, maxLogins: 1 },
    { num: 2, plan: 'starter', minutes: 60, maxSessions: 1, maxLogins: 1 },
    { num: 3, plan: 'starter', minutes: 60, maxSessions: 1, maxLogins: 1 },
    // Standard Family users (240 minutes)
    { num: 4, plan: 'standard', minutes: 240, maxSessions: 1, maxLogins: 1 },
    { num: 5, plan: 'standard', minutes: 240, maxSessions: 1, maxLogins: 1 },
    // Pro Family users (600 minutes)
    { num: 6, plan: 'pro', minutes: 600, maxSessions: 1, maxLogins: 1 },
    { num: 7, plan: 'pro', minutes: 600, maxSessions: 1, maxLogins: 1 },
    // Elite Family users (1800 minutes)
    { num: 8, plan: 'elite', minutes: 1800, maxSessions: 3, maxLogins: 3 },
    { num: 9, plan: 'elite', minutes: 1800, maxSessions: 3, maxLogins: 3 },
    // Free/Trial user (no subscription)
    { num: 10, plan: null, minutes: null, maxSessions: 1, maxLogins: 1 },
  ];

  const hashedPassword = await hashPassword('TestPass123');
  console.log('✅ Password hashed: TestPass123\n');

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const testUser of testUsers) {
    try {
      const email = `Test${testUser.num}@example.com`;
      console.log(`📧 Processing: ${email}`);

      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      const userData = {
        password: hashedPassword,
        username: `test${testUser.num}`,
        firstName: 'Test',
        lastName: `User ${testUser.num}`,
        subscriptionPlan: testUser.plan,
        subscriptionStatus: testUser.plan ? ('active' as const) : undefined,
        subscriptionMinutesLimit: testUser.minutes || 0,
        subscriptionMinutesUsed: 0,
        maxConcurrentSessions: testUser.maxSessions,
        maxConcurrentLogins: testUser.maxLogins,
        emailVerified: true, // Auto-verify test users
        updatedAt: new Date(),
      };

      if (existingUser) {
        console.log(`   ⚠️  User exists, updating...`);

        await db.update(users)
          .set(userData)
          .where(eq(users.id, existingUser.id));

        updated++;
        console.log(`   ✅ User updated`);
      } else {
        const userId = crypto.randomUUID();

        await db.insert(users).values({
          id: userId,
          email,
          ...userData,
          createdAt: new Date(),
        });

        created++;
        console.log(`   ✅ User created`);
      }

      if (testUser.plan && testUser.minutes) {
        console.log(`   ✅ Plan: ${testUser.plan} (${testUser.minutes} min)`);
      } else {
        console.log(`   ℹ️  No subscription (free tier)`);
      }

      console.log('');
    } catch (error) {
      console.error(`   ❌ Error processing Test${testUser.num}:`, error instanceof Error ? error.message : error);
      errors++;
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Created: ${created} users`);
  console.log(`🔄 Updated: ${updated} users`);
  console.log(`❌ Errors: ${errors} users`);
  console.log(`📝 Total: ${created + updated} test users ready\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔑 Test Credentials');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Password (all users): TestPass123\n');
  
  console.log('STARTER FAMILY (60 minutes):');
  console.log('  • Test1@example.com');
  console.log('  • Test2@example.com');
  console.log('  • Test3@example.com\n');
  
  console.log('STANDARD FAMILY (240 minutes):');
  console.log('  • Test4@example.com');
  console.log('  • Test5@example.com\n');
  
  console.log('PRO FAMILY (600 minutes):');
  console.log('  • Test6@example.com');
  console.log('  • Test7@example.com\n');
  
  console.log('ELITE FAMILY (1800 minutes):');
  console.log('  • Test8@example.com');
  console.log('  • Test9@example.com\n');
  
  console.log('FREE TIER (no subscription):');
  console.log('  • Test10@example.com\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Test Users Ready!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  process.exit(0);
}

createTestUsers().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
