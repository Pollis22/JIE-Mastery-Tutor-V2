// Script to reset password on Railway production database
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import pkg from 'pg';
const { Client } = pkg;

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

async function resetPasswordOnRailway() {
  const email = 'pollis@mfhfoods.com';
  const newPassword = 'Crenshaw22$$';
  
  console.log('🔐 Resetting password on Railway production database...');
  console.log('Email:', email);
  console.log('');
  
  // Connect to Railway PostgreSQL
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false
    } : undefined
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Check if user exists
    const checkResult = await client.query(
      'SELECT id, email, username FROM users WHERE email = $1',
      [email]
    );
    
    if (checkResult.rows.length === 0) {
      console.error('❌ User not found:', email);
      console.log('Available users:');
      const allUsers = await client.query('SELECT email FROM users LIMIT 10');
      allUsers.rows.forEach(u => console.log('  -', u.email));
      process.exit(1);
    }
    
    const user = checkResult.rows[0];
    console.log('✅ User found:', user.email);
    
    // Hash the password
    const hashedPassword = await hashPassword(newPassword);
    console.log('✅ Password hashed');
    
    // Update the password and ensure email is verified
    const result = await client.query(`
      UPDATE users 
      SET password = $1,
          email_verified = true,
          email_verified_at = COALESCE(email_verified_at, NOW()),
          updated_at = NOW()
      WHERE email = $2
      RETURNING id, email, username
    `, [hashedPassword, email]);
    
    if (result.rows.length === 0) {
      console.error('❌ Failed to update password');
      process.exit(1);
    }
    
    const updatedUser = result.rows[0];
    console.log('✅ Password updated successfully!');
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 LOGIN CREDENTIALS FOR RAILWAY PRODUCTION:');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Email:    ', email);
    console.log('Password: ', newPassword);
    console.log('User ID:  ', updatedUser.id);
    console.log('Username: ', updatedUser.username);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('🌐 Test at: https://jie-mastery-tutor-v2-production.up.railway.app/auth');
    console.log('');
    
    // Verify the update
    const verifyResult = await client.query(`
      SELECT 
        email, 
        email_verified,
        substring(password, 1, 30) as password_preview,
        created_at
      FROM users 
      WHERE email = $1
    `, [email]);
    
    if (verifyResult.rows.length > 0) {
      const verified = verifyResult.rows[0];
      console.log('✅ Verification:');
      console.log('  Email Verified:', verified.email_verified);
      console.log('  Password Hash:', verified.password_preview + '...');
      console.log('  Account Created:', verified.created_at);
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('Error Code:', error.code);
    }
    throw error;
  } finally {
    await client.end();
    console.log('');
    console.log('Database connection closed');
  }
}

resetPasswordOnRailway()
  .then(() => {
    console.log('');
    console.log('✅ Script completed successfully');
    console.log('You can now log in to Railway production!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });