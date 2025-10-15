// One-time migration to fix existing users who registered before email verification was added
import { db } from '../db';
import { users } from '@shared/schema';
import { eq, or, isNull } from 'drizzle-orm';

async function fixExistingUsers() {
  console.log('🔧 Fixing existing user accounts...');
  
  try {
    // Mark all existing users as email verified
    // (They registered before verification was required)
    const result = await db
      .update(users)
      .set({ 
        emailVerified: true,
        emailVerifiedAt: new Date()
      })
      .where(
        or(
          isNull(users.emailVerified),
          eq(users.emailVerified, false)
        )
      );
    
    console.log(`✅ Updated existing user accounts to verified status`);
    
    // Specifically verify the owner account
    await db
      .update(users)
      .set({
        emailVerified: true,
        emailVerifiedAt: new Date()
      })
      .where(eq(users.email, 'pollis@mfhfoods.com'));
    
    console.log('✅ Owner account verified');
    
    // List all users and their verification status
    const allUsers = await db.select({
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt
    }).from(users);
    
    console.log('\n📊 User verification status:');
    allUsers.forEach(user => {
      console.log(`  ${user.email}: verified=${user.emailVerified}, created=${user.createdAt}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to fix users:', error);
    throw error;
  }
}

// Run the fix
fixExistingUsers()
  .then(() => {
    console.log('\n✅ Migration complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });