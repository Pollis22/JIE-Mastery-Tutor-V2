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
      // Starter
      { num: 1, plan: 'starter' as const, minutes: 60, maxSessions: 1, maxLogins: 1 },
      { num: 2, plan: 'starter' as const, minutes: 60, maxSessions: 1, maxLogins: 1 },
      { num: 3, plan: 'starter' as const, minutes: 60, maxSessions: 1, maxLogins: 1 },
      // Standard
      { num: 4, plan: 'standard' as const, minutes: 240, maxSessions: 1, maxLogins: 1 },
      { num: 5, plan: 'standard' as const, minutes: 240, maxSessions: 1, maxLogins: 1 },
      // Pro
      { num: 6, plan: 'pro' as const, minutes: 600, maxSessions: 1, maxLogins: 1 },
      { num: 7, plan: 'pro' as const, minutes: 600, maxSessions: 1, maxLogins: 1 },
      // Elite
      { num: 8, plan: 'elite' as const, minutes: 1800, maxSessions: 3, maxLogins: 3 },
      { num: 9, plan: 'elite' as const, minutes: 1800, maxSessions: 3, maxLogins: 3 },
      // Free
      { num: 10, plan: null, minutes: null, maxSessions: 1, maxLogins: 1 },
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
    console.log('  • Starter:  Test1-Test3 (60 min)');
    console.log('  • Standard: Test4-Test5 (240 min)');
    console.log('  • Pro:      Test6-Test7 (600 min)');
    console.log('  • Elite:    Test8-Test9, Admin (1800 min)');
    console.log('  • Free:     Test10 (no subscription)\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    console.error(error instanceof Error ? error.stack : '');
    process.exit(1);
  }
}

setupAllUsers();
