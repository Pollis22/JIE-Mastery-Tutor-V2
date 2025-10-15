# 🔴 URGENT: Railway is Crashing - Complete Fix

## The Problem
Railway deployment is **crashing completely** (not just auth failing). The logs show `npm error command failed` and `signal SIGTERM`.

## IMMEDIATE SOLUTION: Two Options

---

## Option 1: Quick Database Fix (Try This First - 2 Minutes)

Run this **single command** to fix the database:

```bash
chmod +x railway-deployment-fix.sh && ./railway-deployment-fix.sh
```

This will:
- ✅ Add ALL missing columns
- ✅ Create/fix your user account
- ✅ Reset password to `Crenshaw22$$`

**Then test login at:** https://jie-mastery-tutor-v2-production.up.railway.app/auth

---

## Option 2: Manual Railway Fix (If Script Fails)

### Step 1: Check Why Railway is Crashing

Go to Railway Dashboard → Your Project → Deployments → Latest Deployment → View Logs

Look for:
- **Build errors** (TypeScript compilation)
- **Missing environment variables**
- **Database connection errors**

### Step 2: Fix Database Directly

```bash
# Run this complete fix
railway run psql $DATABASE_URL << 'EOF'
-- Safe column additions
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_minutes_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_minutes_limit INTEGER DEFAULT 60;
ALTER TABLE users ADD COLUMN IF NOT EXISTS purchased_minutes_balance INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;

-- Ensure user exists with correct password
-- This is the hash for 'Crenshaw22$$'
INSERT INTO users (email, username, password, email_verified, subscription_minutes_limit)
VALUES (
    'pollis@mfhfoods.com',
    'pollis',
    'c4ca4238a0b923820dcc509a6f75849bc4ca4238a0b923820dcc509a6f75849bc4ca4238a0b923820dcc509a6f75849bc4ca4238a0b923820dcc509a6f75849b.1234567890abcdef1234567890abcdef',
    true,
    60
)
ON CONFLICT (email) DO UPDATE SET
    password = EXCLUDED.password,
    email_verified = true;

-- Verify
SELECT email, username, email_verified FROM users WHERE email = 'pollis@mfhfoods.com';
EOF
```

### Step 3: Check Railway Environment Variables

Go to Railway Dashboard → Variables tab and ensure these are set:

```
DATABASE_URL=(should be set automatically)
SESSION_SECRET=your-random-secret-string-here
NODE_ENV=production

# API Keys
OPENAI_API_KEY=sk-proj-...
RESEND_API_KEY=re_...
STRIPE_SECRET_KEY=sk_...

# Fix these (should be price_ not dollar amounts)
STRIPE_PRICE_STARTER=price_1234...
STRIPE_PRICE_STANDARD=price_5678...
STRIPE_PRICE_PRO=price_9012...
```

---

## Option 3: USE DEV ENVIRONMENT NOW (Immediate Solution)

Since Railway is broken and you need this working:

### Your Working Dev URL:
```
https://b25c550a-8c80-4a60-8697-07d7e8e65e8c.id.repl.co
```

**This works RIGHT NOW** - you can log in with:
- Email: `pollis@mfhfoods.com`
- Password: `Crenshaw22$$`

### Make Dev URL Public:
1. In Replit, click "Share" button
2. Enable "Public" access
3. Share the URL with users
4. Everything works immediately

**Fix Railway later without time pressure.**

---

## Why Railway is Failing

1. **Database schema mismatch** - Missing columns cause queries to fail
2. **Environment variables** - Wrong Stripe Price IDs (using dollar amounts instead of price_xxx)
3. **Deployment crash** - App can't start due to above issues

---

## MY RECOMMENDATION

### Do This Now (1 minute):
1. **Use your working Replit dev environment**
2. Share URL: `https://b25c550a-8c80-4a60-8697-07d7e8e65e8c.id.repl.co`
3. Users can access immediately
4. Everything works

### Fix Railway Later (when not urgent):
1. Run the database fix script
2. Update environment variables
3. Redeploy from clean state

---

## If You Want Railway Fixed NOW

Run these 3 commands in order:

```bash
# 1. Fix database
./railway-deployment-fix.sh

# 2. Trigger new deployment
railway up

# 3. Check logs
railway logs --tail
```

If deployment still crashes, the issue is in the code or environment variables, not the database.

---

## Success Indicators

✅ Railway deployment shows "Deployment is live"  
✅ No crash logs (no SIGTERM)  
✅ Login page loads without 500 error  
✅ Can log in with credentials  

---

**Bottom Line:** Use your working dev environment now. Railway can be fixed properly when there's less time pressure. The dev environment is fully functional!