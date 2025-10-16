# Railway Deployment Guide

## Automatic Database Migration

This project includes an automatic database migration script that runs on every Railway deployment to ensure the database schema is up-to-date.

### How It Works

1. **Migration Script**: `scripts/init-railway-db.js`
   - Automatically runs before the server starts on Railway
   - Adds missing columns to the `users` table
   - Creates required tables (`minute_purchases`, `user_documents`, `document_chunks`, `document_embeddings`, etc.)
   - Enables pgvector extension for document embeddings
   - Safe to run multiple times (idempotent)

2. **Startup Sequence**: 
   ```bash
   npm run start
   ├── npm run init-db (runs migration)
   └── tsx server/index.ts (starts server)
   ```

### What Gets Created/Updated

#### Users Table Updates
- Hybrid minute tracking: `subscription_minutes_used`, `subscription_minutes_limit`, `purchased_minutes_balance`
- Subscription fields: `stripe_customer_id`, `stripe_subscription_id`, `subscription_plan`
- User profile: `parent_name`, `student_name`, `student_age`, `grade_level`
- Marketing: `marketing_opt_in`, `marketing_opt_in_date`
- Preferences: `preferred_language`, `voice_style`, `speech_speed`
- Admin: `is_admin`, email verification fields

#### New Tables
- **minute_purchases**: Tracks purchased voice minutes with FIFO rollover
- **user_documents**: RAG document management
- **document_chunks**: Text segments for RAG
- **document_embeddings**: Vector embeddings for semantic search
- **admin_logs**: Admin action tracking
- **marketing_campaigns**: Email campaign tracking

### Environment Variables Required

Ensure these are set in Railway:

```bash
DATABASE_URL=postgresql://...
NODE_ENV=production
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
# ... other environment variables
```

### Deployment Steps

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Add Railway database migration"
   git push origin main
   ```

2. **Railway Auto-Deploy**:
   - Railway detects the push
   - Runs build command: `npm run build`
   - Runs start command: `npm run start`
   - Migration runs automatically before server starts
   - Server starts after successful migration

### Manual Migration

To run the migration manually:

```bash
npm run init-db
```

### Troubleshooting

**Error: pgvector extension not found**
- Solution: Enable pgvector in Railway PostgreSQL settings

**Error: column already exists**
- This is normal - the script uses `IF NOT EXISTS` and continues

**Error: relation does not exist**
- Ensure base tables (users, sessions, subjects, lessons, etc.) exist
- Run Drizzle push first: `npm run db:push`

### Database Schema Sync

The migration script is designed to work alongside Drizzle ORM:

1. **First time**: Drizzle creates base tables
2. **Migration**: Adds any missing columns/tables
3. **Updates**: Safe to run on every deployment

### Support

If you encounter issues:
1. Check Railway logs for migration output
2. Verify DATABASE_URL is set correctly
3. Ensure PostgreSQL is running and accessible
4. Check that pgvector extension is enabled
