# 🚨 Railway Login Fix - URGENT

## Problem
Login is failing on Railway with error: `column "max_concurrent_logins" does not exist`

The Railway database is missing columns that your code expects.

---

## ✅ QUICK FIX (Recommended - 2 minutes)

### Step 1: Go to Railway Dashboard
1. Open https://railway.app/
2. Click on your **jie-mastery-tutor-v2** project
3. Click on your **Postgres** database

### Step 2: Run SQL Fix
1. Click the **"Data"** tab
2. Click **"Query"** button (top right)
3. Copy the ENTIRE contents from `server/scripts/fix-railway-schema.sql`
4. Paste into the SQL query box
5. Click **"Run Query"** or press `Ctrl/Cmd + Enter`

### Step 3: Verify
You should see output showing:
- 4 columns added/verified
- Column list with data types
- User count (may be 0 if no users yet)

### Step 4: Restore Users
After the schema is fixed, run this in Railway:
1. Click on your **jie-mastery-tutor-v2** service (not the database)
2. Click **"Settings"** → **"Deploy"** → **"Redeploy"** (to make sure latest code is running)
3. Click **"Variables"** tab and ensure `DATABASE_URL` is set
4. Go back to Railway project root
5. Click **"Settings"** → **"Run a Command"**
6. Enter: `npm run setup-all-users`
7. Click **"Run"**

This will create your admin and test users with verified emails.

### Step 5: Test Login
1. Go to https://jie-mastery-tutor-v2-production.up.railway.app/auth
2. Try logging in with:
   - Email: `pollis@mfhfoods.com`
   - Password: `Crenshaw22$$`

✅ **Login should now work!**

---

## 🔧 Alternative: Using Railway CLI

If you have Railway CLI installed and linked:

```bash
# Link to your Railway project
railway link

# Run the schema fix script
railway run npm run fix-schema

# Then restore users
railway run npm run setup-all-users
```

---

## 📋 SQL Commands (Manual Copy/Paste)

If the SQL file doesn't work, copy these commands one by one:

```sql
-- Add missing columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_concurrent_logins INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMP;

-- Verify fix
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('max_concurrent_logins', 'email_verified', 'email_verification_token', 'email_verification_expiry');
```

---

## 🎯 What Gets Fixed

The schema fix adds these missing columns:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `max_concurrent_logins` | INTEGER | 1 | Concurrent device limit |
| `email_verified` | BOOLEAN | false | Email verification status |
| `email_verification_token` | TEXT | NULL | Verification token |
| `email_verification_expiry` | TIMESTAMP | NULL | Token expiration time |

---

## 🔍 Troubleshooting

### Issue: "Column already exists"
✅ **This is fine!** The script uses `IF NOT EXISTS` so it's safe to run multiple times.

### Issue: "Permission denied"
❌ You may not have database permissions. Contact Railway support or check database user permissions.

### Issue: "Still can't login after fix"
1. Make sure you ran `npm run setup-all-users` to create the users
2. Check Railway logs for errors: `railway logs`
3. Verify the columns exist: Run the verification query from the SQL file

### Issue: "setup-all-users command not found"
Make sure your Railway deployment has the latest code with the updated `package.json`.

---

## 📝 Why This Happened

Your local development database has the latest schema, but Railway's production database was created earlier and is missing newer columns added to the schema. This fix brings Railway's database in sync with your code.

---

## ✅ After Fix Checklist

- [ ] SQL ran successfully in Railway
- [ ] Columns verified in database
- [ ] Users restored with `setup-all-users`
- [ ] Can login as `pollis@mfhfoods.com`
- [ ] Dashboard loads correctly
- [ ] Voice tutoring works

---

## 🆘 Need Help?

If the fix doesn't work:
1. Check Railway deployment logs: https://railway.app/project/[your-project]/deployments
2. Check database query results for errors
3. Ensure `DATABASE_URL` environment variable is set correctly
4. Try redeploying the service after schema fix
