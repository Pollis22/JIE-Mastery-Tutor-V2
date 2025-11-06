# 🔧 Fix Document Upload 500 Errors on Railway

## Problem
Your Railway production database is **missing new columns** in the `user_documents` table, causing all document endpoints to fail with 500 errors:
- `GET /api/documents` → 500
- `GET /api/documents/list` → 500  
- `POST /api/documents/upload` → 500

## Root Cause
The production database schema is outdated. It's missing these columns:
- `subject`
- `grade`
- `title`
- `description`
- `processing_status`
- `processing_error`
- `retry_count`
- `next_retry_at`
- `parsed_text_path`
- `expires_at`
- `updated_at`

When the backend tries to SELECT or INSERT these columns, PostgreSQL throws "column does not exist" errors (error code 42703), which appear as 500 responses.

## Solution: Run Database Migration on Railway

### Option 1: Railway Dashboard (Recommended)

1. **Open Railway Dashboard**
   - Go to https://railway.app
   - Open your `jie-mastery-tutor-v2-production` project
   
2. **Find your service**
   - Click on the service running your Node.js app
   
3. **Open deployment logs**
   - Click on the latest deployment
   - Open the terminal/console view
   
4. **Run the migration command**
   ```bash
   npm run db:push --force
   ```
   
5. **Verify success**
   - Look for "✅ Database schema synchronized" or similar success message
   - Check that no errors appear
   
6. **Test the fix**
   - Refresh your production app
   - Try uploading a document
   - Check that document list loads without errors

### Option 2: Custom Migration Script

If `npm run db:push --force` doesn't work, use the custom migration script:

1. **SSH/Terminal access to Railway**
   - In Railway dashboard, click on your service
   - Open a shell/terminal session
   
2. **Run the migration script**
   ```bash
   tsx server/scripts/migrate-production-schema.ts
   ```
   
3. **Expected output**
   ```
   🔄 Starting production schema migration...
   
   📊 Checking user_documents table...
     ➕ Adding column: subject...
     ✅ Column subject ready
     ➕ Adding column: grade...
     ✅ Column grade ready
     ... (continues for all columns)
   
   📊 Creating indexes...
     ✅ idx_user_docs_status
     ✅ idx_user_docs_retry
     ✅ idx_user_docs_expires
   
   ✅ Production schema migration completed successfully!
   ```

4. **If migration fails**
   - Check Railway logs for specific error messages
   - Verify DATABASE_URL environment variable is set
   - Ensure database user has ALTER TABLE permissions
   - Contact Railway support if permissions issue

### Option 3: Manual SQL (Advanced)

If you have direct database access, run these SQL commands:

```sql
-- Add missing columns to user_documents table
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'queued';
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS parsed_text_path TEXT;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_docs_status ON user_documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_user_docs_retry ON user_documents(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_user_docs_expires ON user_documents(expires_at);
```

## Verification

After running the migration:

1. **Check Railway logs** for the migration success message
2. **Test document upload** in your production app
3. **Verify document list** loads without errors
4. **Monitor server logs** - no more "column does not exist" errors

## What This Migration Does

✅ **Safe operation** - Uses `ADD COLUMN IF NOT EXISTS`, so it won't fail if columns already exist  
✅ **No data loss** - Only adds new columns, doesn't modify or delete existing data  
✅ **Backward compatible** - Existing documents will have NULL values in new columns  
✅ **Production-ready** - Includes proper indexes for query performance  

## Prevention

To avoid this issue in the future:

1. **Always run migrations** when deploying schema changes to production
2. **Add to deployment process**: Include `npm run db:push --force` in your Railway deployment script
3. **Monitor logs**: Watch for database schema errors in production logs

## Need Help?

If you encounter issues:
1. Check Railway deployment logs for specific error messages
2. Verify DATABASE_URL environment variable is correctly set
3. Ensure your database user has sufficient permissions (ALTER TABLE, CREATE INDEX)
4. Share the error logs for further debugging

---

**Created:** November 6, 2025  
**Issue:** Document upload 500 errors on Railway production  
**Status:** Migration script ready to run
