import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function makeAdmin(email: string) {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email)
    });
    
    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }
    
    if (user.isAdmin) {
      console.log(`ℹ️  User ${email} is already an admin`);
      process.exit(0);
    }
    
    await db.update(users)
      .set({ isAdmin: true })
      .where(eq(users.id, user.id));
      
    console.log(`✅ ${email} is now an admin!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error making user admin:', error);
    process.exit(1);
  }
}

const emailToMakeAdmin = process.argv[2] || process.env.ADMIN_EMAIL;

if (!emailToMakeAdmin) {
  console.error('❌ Please provide an email address');
  console.log('Usage: tsx server/scripts/make-admin.ts <email>');
  console.log('   or: ADMIN_EMAIL=user@example.com tsx server/scripts/make-admin.ts');
  process.exit(1);
}

makeAdmin(emailToMakeAdmin);
