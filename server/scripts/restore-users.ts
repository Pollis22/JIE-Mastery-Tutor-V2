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

async function restoreProductionUsers() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👤 RESTORING PRODUCTION USERS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const userData of productionUsers) {
    try {
      console.log(`📧 Processing: ${userData.email} (${userData.isAdmin ? 'ADMIN' : 'USER'})`);

      const hashedPassword = await hashPassword(userData.password);

      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, userData.email),
      });

      if (existingUser) {
        console.log(`   ⚠️  User exists, updating...`);

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
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id));

        updated++;
        console.log(`   ✅ User updated`);
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
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        created++;
        console.log(`   ✅ User created`);
      }

      console.log(`   ✅ Plan: ${userData.subscriptionPlan} (${userData.subscriptionMinutesLimit} min)\n`);
    } catch (error) {
      console.error(`   ❌ Error processing ${userData.email}:`, error instanceof Error ? error.message : error);
      errors++;
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Created: ${created} users`);
  console.log(`🔄 Updated: ${updated} users`);
  console.log(`❌ Errors: ${errors} users\n`);

  console.log('🔑 PRODUCTION CREDENTIALS:');
  console.log('  Admin: pollis@mfhfoods.com / Crenshaw22$$');
  console.log('  User:  pollis@aquavertclean.com / Crenshaw22$$\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Production Users Ready!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  process.exit(0);
}

restoreProductionUsers().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
