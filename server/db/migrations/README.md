# Database Migrations Guide

## Quick Fix for Railway Production

Your Railway production database is missing the `realtime_sessions` table. Here are **two ways** to fix it:

---

## Option 1: Automatic Schema Push (Recommended) ⚡

This is the fastest and safest way. Drizzle will sync your schema automatically.

### Steps:

1. **Run the push command:**
   ```bash
   npm run db:push
   ```

2. **If you see a data-loss warning, force it:**
   ```bash
   npm run db:push --force
   ```

3. **Verify it worked:**
   ```bash
   curl https://your-railway-app.railway.app/api/health/db
   ```
   Should return:
   ```json
   {
     "status": "healthy",
     "checks": {
       "database": true,
       "realtimeSessions": true
     }
   }
   ```

**That's it!** The table is created automatically from your `shared/schema.ts` definition.

---

## Option 2: Manual SQL Migration (If needed) 🔧

If the automatic push doesn't work, run the SQL directly:

### Via Railway Dashboard:

1. Go to **Railway → Your Postgres Service → Data → Query**
2. Copy and paste the contents of `003_create_realtime_sessions.sql`
3. Click **Run Query**

### Via Command Line:

```bash
# Make sure you're connected to Railway
railway link

# Run the migration
railway run psql $DATABASE_URL -f server/db/migrations/003_create_realtime_sessions.sql
```

---

## Testing Checklist

After running the migration, verify everything works:

✅ **Health Check:**
```bash
curl https://your-app.railway.app/api/health/db
```

✅ **Voice Session Test:**
1. Open your production app
2. Click "Start Voice Session"
3. Check Railway logs - should see no table errors
4. Session should save successfully

✅ **Database Verification:**
```bash
railway run psql $DATABASE_URL -c "SELECT count(*) FROM realtime_sessions;"
```

---

## What Was Changed

### 1. **Migration File Created**
- `server/db/migrations/003_create_realtime_sessions.sql`
- Creates the table with proper indexes and foreign keys

### 2. **Fail-Soft Error Handling Added**
- `server/storage.ts` - All realtime session methods now handle missing table gracefully
- Voice sessions will work even if DB writes fail
- Logs warnings instead of crashing

### 3. **Health Check Endpoint Added**
- `GET /api/health/db` - Monitors database table status
- Returns 200 if healthy, 503 if table missing

---

## Why This Happened

The `realtime_sessions` table exists in your **dev database** (Replit) but not in **production** (Railway).

- Same code ✅
- Same API keys ✅  
- Different database schemas ❌

The fix ensures both environments have the same schema.

---

## Rollback (if needed)

If something goes wrong, you can drop the table:

```sql
DROP TABLE IF EXISTS realtime_sessions CASCADE;
```

Then re-run the migration.

---

## Next Steps

After fixing Railway:

1. ✅ Verify health endpoint shows "healthy"
2. ✅ Test voice session end-to-end
3. ✅ Confirm session data saves to database
4. 🎉 Your production app is ready!

---

## Auto-Migration on Deploy (Optional)

To automatically run migrations on every deploy, update your Railway start command:

```bash
npm run db:push --force && npm start
```

This ensures the database schema stays in sync with code changes.
