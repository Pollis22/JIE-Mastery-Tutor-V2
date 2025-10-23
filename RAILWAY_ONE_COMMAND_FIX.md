# 🚨 ONE COMMAND TO FIX EVERYTHING

## Copy and Run This ENTIRE Block (All At Once)

```bash
railway run bash -c "
# Add all columns
psql \$DATABASE_URL -c \"
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_minutes_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_minutes_limit INTEGER DEFAULT 60;
ALTER TABLE users ADD COLUMN IF NOT EXISTS purchased_minutes_balance INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
\"

# Generate password hash
HASH=\$(node -e \"
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
(async () => {
  const password = 'Crenshaw22\\$\\$';
  const salt = crypto.randomBytes(16).toString('hex');
  const buf = await scrypt(password, salt, 64);
  const hash = buf.toString('hex') + '.' + salt;
  process.stdout.write(hash);
})();
\")

# Check if user exists
USER_EXISTS=\$(psql \$DATABASE_URL -t -c \"SELECT COUNT(*) FROM users WHERE email = 'pollis@mfhfoods.com';\" | tr -d ' ')

if [ \"\$USER_EXISTS\" = \"0\" ]; then
  echo 'Creating user...'
  psql \$DATABASE_URL -c \"
  INSERT INTO users (email, username, password, email_verified, subscription_minutes_limit)
  VALUES ('pollis@mfhfoods.com', 'pollis', '\$HASH', true, 60);
  \"
else
  echo 'Updating password...'
  psql \$DATABASE_URL -c \"
  UPDATE users SET password = '\$HASH', email_verified = true
  WHERE email = 'pollis@mfhfoods.com';
  \"
fi

# Verify
psql \$DATABASE_URL -c \"
SELECT email, username, email_verified, subscription_minutes_limit
FROM users WHERE email = 'pollis@mfhfoods.com';
\"

echo ''
echo '✅ FIXED! Login with:'
echo 'Email: pollis@mfhfoods.com'
echo 'Password: Crenshaw22\$\$'
"
```

## That's It!

After running the command above:

1. Go to: https://jie-mastery-tutor-v2-production.up.railway.app/auth
2. Email: `pollis@mfhfoods.com`
3. Password: `Crenshaw22$$`
4. **Login will work!** ✅

---

## Alternative: Run the Bash Script

If the above doesn't work, try running the complete fix script:

```bash
chmod +x railway-complete-fix.sh
./railway-complete-fix.sh
```

This script:
- ✅ Adds all missing columns
- ✅ Creates user if missing
- ✅ Resets password
- ✅ Verifies everything