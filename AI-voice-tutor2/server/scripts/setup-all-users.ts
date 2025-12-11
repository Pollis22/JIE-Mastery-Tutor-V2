import * as dotenv from 'dotenv';

// Load environment variables from .env file
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
  return `${derivedKey.toString('hex')}.${salt}`;
}

async function setupAllUsers() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 COMPLETE USER SETUP');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('This will create:');
  console.log('  • 1 Admin user (Elite plan)');
  console.log('  • 1 Paid subscriber (Starter plan)');
  console.log('  • 10 Test users (various plans)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 1: Production Users
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    console.log('═════════════════════════════════════════════');
    console.log('👤 PRODUCTION USERS');
    console.log('═════════════════════════════════════════════\n');

    const productionUsers = [
      {
        email: 'pollis@mfhfoods.com',
        username: 'robbierobertson',
        password: 'Crenshaw22$$',
        firstName: 'Robbie',
        lastName: 'Robertson',
        isAdmin: true,
        subscriptionPlan: 'elite' as const,
        subscriptionMinutesLimit: 1800,
        maxConcurrentSessions: 3,
        maxConcurrentLogins: 3,
      },
      {
        email: 'pollis@aquavertclean.com',
        username: 'pollis',
        password: 'Crenshaw22$$',
        firstName: 'Pollis',
        lastName: 'User',
        isAdmin: false,
        subscriptionPlan: 'starter' as const,
        subscriptionMinutesLimit: 60,
        maxConcurrentSessions: 1,
        maxConcurrentLogins: 1,
      },
    ];

    for (const userData of productionUsers) {
      console.log(`📧 ${userData.email} (${userData.isAdmin ? 'ADMIN' : 'USER'})`);

      const hashedPassword = await hashPassword(userData.password);
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, userData.email),
      });

      if (existingUser) {
        await db.update(users)
          .set({
            password: hashedPassword,
            username: userData.username,
            firstName: userData.firstName,
            lastName: userData.lastName,
            isAdmin: userData.isAdmin,
            subscriptionPlan: userData.subscriptionPlan,
            subscriptionStatus: 'active',
            subscriptionMinutesLimit: userData.subscriptionMinutesLimit,
            subscriptionMinutesUsed: 0,
            maxConcurrentSessions: userData.maxConcurrentSessions,
            maxConcurrentLogins: userData.maxConcurrentLogins,
            billingCycleStart: new Date(),
            emailVerified: true, // Auto-verify all setup users
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id));
        console.log('   ✅ User updated');
      } else {
        const userId = crypto.randomUUID();
        await db.insert(users).values({
          id: userId,
          email: userData.email,
          username: userData.username,
          password: hashedPassword,
          firstName: userData.firstName,
          lastName: userData.lastName,
          isAdmin: userData.isAdmin,
          subscriptionPlan: userData.subscriptionPlan,
          subscriptionStatus: 'active',
          subscriptionMinutesLimit: userData.subscriptionMinutesLimit,
          subscriptionMinutesUsed: 0,
          maxConcurrentSessions: userData.maxConcurrentSessions,
          maxConcurrentLogins: userData.maxConcurrentLogins,
          billingCycleStart: new Date(),
          emailVerified: true, // Auto-verify all setup users
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log('   ✅ User created');
      }

      console.log(`   ✅ Plan: ${userData.subscriptionPlan} (${userData.subscriptionMinutesLimit} min)\n`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 2: Test Users
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    console.log('═════════════════════════════════════════════');
    console.log('🧪 TEST USERS');
    console.log('═════════════════════════════════════════════\n');

    const testPassword = await hashPassword('TestPass123');

    const testUsers = [
      // All Elite with 5 concurrent sessions
      { num: 1, plan: 'elite' as const, minutes: 1800, maxSessions: 5, maxLogins: 5 },
      { num: 2, plan: 'elite' as const, minutes: 1800, maxSessions: 5, maxLogins: 5 },
      { num: 3, plan: 'elite' as const, minutes: 1800, maxSessions: 5, maxLogins: 5 },
      { num: 4, plan: 'elite' as const, minutes: 1800, maxSessions: 5, maxLogins: 5 },
      { num: 5, plan: 'elite' as const, minutes: 1800, maxSessions: 5, maxLogins: 5 },
      { num: 6, plan: 'elite' as const, minutes: 1800, maxSessions: 5, maxLogins: 5 },
      { num: 7, plan: 'elite' as const, minutes: 1800, maxSessions: 5, maxLogins: 5 },
      { num: 8, plan: 'elite' as const, minutes: 1800, maxSessions: 5, maxLogins: 5 },
      { num: 9, plan: 'elite' as const, minutes: 1800, maxSessions: 5, maxLogins: 5 },
      { num: 10, plan: 'elite' as const, minutes: 1800, maxSessions: 5, maxLogins: 5 },
    ];

    for (const testUser of testUsers) {
      const email = `Test${testUser.num}@example.com`;
      console.log(`📧 ${email}`);

      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      const userData = {
        password: testPassword,
        username: `test${testUser.num}`,
        firstName: 'Test',
        lastName: `User ${testUser.num}`,
        subscriptionPlan: testUser.plan,
        subscriptionStatus: testUser.plan ? ('active' as const) : undefined,
        subscriptionMinutesLimit: testUser.minutes || 0,
        subscriptionMinutesUsed: 0,
        maxConcurrentSessions: testUser.maxSessions,
        maxConcurrentLogins: testUser.maxLogins,
        emailVerified: true, // Auto-verify all setup users
        updatedAt: new Date(),
      };

      if (existingUser) {
        await db.update(users)
          .set(userData)
          .where(eq(users.id, existingUser.id));
        console.log('   ✅ User updated');
      } else {
        const userId = crypto.randomUUID();
        await db.insert(users).values({
          id: userId,
          email,
          ...userData,
          createdAt: new Date(),
        });
        console.log('   ✅ User created');
      }

      if (testUser.plan && testUser.minutes) {
        console.log(`   ✅ Plan: ${testUser.plan} (${testUser.minutes} min)`);
      } else {
        console.log('   ℹ️  No subscription (free tier)');
      }
      console.log('');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Summary
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ALL USERS CREATED SUCCESSFULLY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🔑 PRODUCTION CREDENTIALS:');
    console.log('  Admin: pollis@mfhfoods.com / Crenshaw22$$');
    console.log('  User:  pollis@aquavertclean.com / Crenshaw22$$\n');

    console.log('🧪 TEST CREDENTIALS:');
    console.log('  Test1-Test10@example.com / TestPass123\n');

    console.log('📊 PLAN DISTRIBUTION:');
    console.log('  • Elite:    Test1-Test10, Admin (1800 min)');
    console.log('  • Concurrent Sessions: 5 per user');
    console.log('  • Concurrent Logins: 5 per user\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.error(error instanceof Error ? error.stack : '');
    process.exit(1);
  }
}

setupAllUsers();
