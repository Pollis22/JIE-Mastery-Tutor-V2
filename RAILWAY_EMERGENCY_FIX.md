# 🚨 EMERGENCY FIX: Railway Login Issue

## The Problem
Railway's database is **missing critical columns** that the login code requires:
- ❌ `subscription_minutes_used` - BLOCKING ALL LOGINS
- ❌ `email_verified` - BLOCKING ALL LOGINS  
- ❌ Other voice tracking columns

## One-Command Fix

### Option 1: Run the Complete Fix Script (RECOMMENDED)

**In your terminal, run this single command:**

```bash
railway run npx tsx server/scripts/fix-railway-database.ts
```

This will:
1. ✅ Add ALL missing columns to Railway database
2. ✅ Mark your email as verified
3. ✅ Reset your password to `Crenshaw22$$`
4. ✅ Verify everything works

**Expected Output:**
```
🔧 RAILWAY DATABASE FIX SCRIPT
================================
✅ Connected to database
✅ Voice tracking columns added
✅ Email verification columns added
✅ All database columns are now present
✅ Password reset successfully!

╔═══════════════════════════════════════════════════════╗
║         🎉 RAILWAY DATABASE FIXED! 🎉                 ║
╠═══════════════════════════════════════════════════════╣
║  LOGIN CREDENTIALS:                                   ║
║  Email:    pollis@mfhfoods.com                       ║
║  Password: Crenshaw22$$                               ║
╚═══════════════════════════════════════════════════════╝
```

### Option 2: Manual SQL Fix (if Railway CLI isn't working)

**Copy this ENTIRE block and run it in one command:**

```bash
cat > /tmp/railway-fix.sql << 'SQLFIX'
-- Add all missing columns
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS subscription_minutes_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_minutes_limit INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS purchased_minutes_balance INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_opt_out_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Mark all users as verified
UPDATE users 
SET email_verified = true, 
    email_verified_at = COALESCE(email_verified_at, NOW())
WHERE email_verified IS NULL OR email_verified = false;

-- Show results
SELECT 
  'DATABASE FIXED!' as status,
  email,
  email_verified,
  subscription_minutes_limit,
  subscription_minutes_used
FROM users 
WHERE email = 'pollis@mfhfoods.com';
SQLFIX

railway run psql $DATABASE_URL < /tmp/railway-fix.sql
```

Then reset the password:
```bash
railway run npx tsx server/scripts/reset-railway-password.ts
```

### Option 3: Railway Dashboard (Visual Method)

1. Go to https://railway.app/dashboard
2. Click your project → PostgreSQL → Data tab → Query
3. Paste this SQL:

```sql
-- Add all missing columns at once
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS subscription_minutes_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_minutes_limit INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS purchased_minutes_balance INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

-- Mark users as verified
UPDATE users SET email_verified = true WHERE email_verified IS NULL;

-- Check it worked
SELECT email, email_verified, subscription_minutes_limit FROM users;
```

4. Click "Run Query"
5. Then run the password reset script from Option 1

---

## Verification

After running the fix, verify it worked:

```bash
railway logs --tail
```

**Before (BAD):**
```
ERROR: column "subscription_minutes_used" does not exist
```

**After (GOOD):**
```
[Auth] Login attempt for: pollis@mfhfoods.com
[Auth] Login successful
```

---

## Test Login Now

1. Go to: https://jie-mastery-tutor-v2-production.up.railway.app/auth
2. Email: `pollis@mfhfoods.com`
3. Password: `Crenshaw22$$`
4. **Should work immediately!** ✅

---

## If Railway CLI Not Installed

```bash
npm i -g @railway/cli
railway login
railway link  # Select your project
```

Then run the fix command again.

---

## Success Checklist

- [ ] Script runs without errors
- [ ] Output shows "RAILWAY DATABASE FIXED!"
- [ ] No more column errors in Railway logs
- [ ] Login works on production URL
- [ ] Dashboard loads after login

---

## This Is CRITICAL 🚨

**Nothing will work until these columns are added.** The login code crashes trying to read non-existent columns. Run the fix script NOW!