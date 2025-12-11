import * as dotenv from 'dotenv';
dotenv.config();

// Script to reset password for specific user
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

async function resetUserPassword() {
  const email = 'pollis@mfhfoods.com';
  const newPassword = 'Crenshaw22$$';
  
  console.log(`🔧 Resetting password for ${email}...`);
  
  try {
    // Hash the new password
    const hashedPassword = await hashPassword(newPassword);
    console.log('✅ Password hashed successfully');
    
    // Update the user's password
    const result = await db
      .update(users)
      .set({
        password: hashedPassword,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.email, email));
    
    console.log(`✅ Password reset successfully for ${email}`);
    
    // Verify the user exists and show current status
    const [user] = await db
      .select({
        email: users.email,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt
      })
      .from(users)
      .where(eq(users.email, email));
    
    if (user) {
      console.log('\n📊 User status:');
      console.log(`  Email: ${user.email}`);
      console.log(`  Email Verified: ${user.emailVerified}`);
      console.log(`  Created: ${user.createdAt}`);
      console.log('\n✅ You can now log in with:');
      console.log(`  Email: ${email}`);
      console.log(`  Password: ${newPassword}`);
    } else {
      console.error('❌ User not found after update');
    }
    
  } catch (error) {
    console.error('❌ Failed to reset password:', error);
    throw error;
  }
}

// Run the password reset
resetUserPassword()
  .then(() => {
    console.log('\n✅ Password reset complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Password reset failed:', error);
    process.exit(1);
  });