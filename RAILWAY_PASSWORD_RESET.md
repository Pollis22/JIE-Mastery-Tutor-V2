# Reset Password on Railway Production Database

## The Problem
✅ **Development (Replit):** Password reset successful - you can log in here  
❌ **Railway (Production):** Password still wrong - login fails

The dev and production databases are completely separate.

---

## Quick Fix (2 minutes)

### Option 1: Use Railway CLI (Recommended)

**Step 1: Run the password reset script on Railway**

```bash
railway run npx tsx server/scripts/reset-railway-password.ts
```

This will:
- Connect to Railway's PostgreSQL database
- Hash your password correctly
- Update your account: `pollis@mfhfoods.com`
- Verify the update was successful

**Expected Output:**
```
🔐 Resetting password on Railway production database...
✅ Connected to database
✅ User found: pollis@mfhfoods.com
✅ Password hashed
✅ Password updated successfully!

═══════════════════════════════════════════════════════
🎉 LOGIN CREDENTIALS FOR RAILWAY PRODUCTION:
═══════════════════════════════════════════════════════
Email:     pollis@mfhfoods.com
Password:  Crenshaw22$$
═══════════════════════════════════════════════════════

🌐 Test at: https://jie-mastery-tutor-v2-production.up.railway.app/auth
```

**Step 2: Test login on Railway**

1. Go to: https://jie-mastery-tutor-v2-production.up.railway.app/auth
2. Email: `pollis@mfhfoods.com`
3. Password: `Crenshaw22$$`
4. Click "Sign In"
5. ✅ Should redirect to dashboard

---

### Option 2: Manual SQL (if Railway CLI isn't available)

**Step 1: Generate password hash locally**

```bash
node -e "
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

(async () => {
  const password = 'Crenshaw22\$\$';
  const salt = crypto.randomBytes(16).toString('hex');
  const buf = await scrypt(password, salt, 64);
  const hash = buf.toString('hex') + '.' + salt;
  console.log('Copy this hash:');
  console.log(hash);
})();
"
```

**Step 2: Update in Railway Dashboard**

1. Go to https://railway.app → Your Project → PostgreSQL
2. Click "Query" tab
3. Run this SQL (replace with your hash from Step 1):

```sql
UPDATE users 
SET 
  password = 'YOUR_HASH_FROM_STEP_1',
  email_verified = true,
  email_verified_at = COALESCE(email_verified_at, NOW())
WHERE email = 'pollis@mfhfoods.com';

-- Verify it worked
SELECT 
  email, 
  email_verified,
  substring(password, 1, 30) as password_preview
FROM users 
WHERE email = 'pollis@mfhfoods.com';
```

---

## Troubleshooting

### If Railway CLI isn't installed:
```bash
npm i -g @railway/cli
railway login
railway link  # Select your project
```

### If script fails with "User not found":
Check which users exist in Railway database:
```bash
railway run psql $DATABASE_URL -c "SELECT email FROM users LIMIT 10;"
```

### Check Railway logs after login attempt:
```bash
railway logs --tail
```

Look for:
- ✅ `[Auth] Login successful for: pollis@mfhfoods.com`
- ❌ `[Auth] Password mismatch` (means password still wrong)

---

## Success Checklist

- [ ] Script runs without errors
- [ ] Output shows "Password updated successfully!"
- [ ] Login works on Railway production URL
- [ ] Dashboard loads after login
- [ ] Railway logs show "Login successful"

---

## After This Works

Once you're logged in, we can address:
1. Stripe Price ID configuration warnings
2. Any other production issues

But first, let's get your Railway login working! 🚀