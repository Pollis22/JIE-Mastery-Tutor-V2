# JIE Mastery Tutor - Replit Deployment Guide

## 🚀 Deployment Strategy: Autoscale (Built for 1M Users)

Your app is configured for **Replit Autoscale Deployment** which can scale to handle millions of users.

---

## ✅ Pre-Deployment Checklist

### 1. Environment Variables (Required)
Make sure these are set in Replit Secrets:

**Critical:**
- ✅ `DATABASE_URL` - PostgreSQL connection (auto-set by Replit)
- ✅ `OPENAI_API_KEY` - For AI tutoring and embeddings
- ✅ `SESSION_SECRET` - Random 32+ character string for sessions

**Stripe (Payment Processing):**
- ✅ `STRIPE_SECRET_KEY` - Stripe API key
- ✅ `STRIPE_PUBLISHABLE_KEY` - Public key
- ✅ `VITE_STRIPE_PUBLIC_KEY` - Frontend public key
- ✅ `STRIPE_WEBHOOK_SECRET` - For webhook verification
- ✅ `STRIPE_PRICE_STARTER` - Should be `price_xxx` format
- ✅ `STRIPE_PRICE_STANDARD` - Should be `price_xxx` format  
- ✅ `STRIPE_PRICE_PRO` - Should be `price_xxx` format
- ✅ `STRIPE_PRICE_TOPUP_60` - Should be `price_xxx` format

**Email (Resend):**
- ✅ `RESEND_API_KEY` - For transactional emails
- ✅ `RESEND_FROM_EMAIL` - Verified sender email

**Voice Services (Optional):**
- ✅ `ELEVENLABS_API_KEY` - If using ElevenLabs
- ✅ `AZURE_SPEECH_KEY` - If using Azure TTS
- ✅ `USE_CONVAI` - Set to `false` to use OpenAI Realtime

---

## 📊 Scalability Architecture

### Current Configuration: **Autoscale Deployment**

**What it means:**
- ✅ Automatically scales from 0 to multiple instances based on demand
- ✅ Supports WebSockets (OpenAI Realtime API works!)
- ✅ High availability with automatic failover
- ✅ Pay only for active usage (billed per compute unit + requests)

### Expected Performance:

| User Count | Expected Cost/Month | Configuration |
|-----------|-------------------|---------------|
| 0-1,000 | $1-20 | Autoscale starts |
| 1,000-10,000 | $20-100 | Multi-instance scaling |
| 10,000-100,000 | $100-500 | Horizontal scaling active |
| 100,000-1,000,000 | $500-2,000 | Full autoscale capacity |

**Note:** 1M users typically means 50-100k concurrent users (5-10% concurrency rate)

---

## 🔧 Deployment Steps

### Method 1: One-Click Deploy (Recommended)

1. Click the **"Deploy"** button in Replit (top right)
2. Choose **"Autoscale"** deployment type
3. **CRITICAL:** Verify build configuration:
   - **Build command:** `bash -c "npm install && npm run build"` (compiles Vite frontend)
   - **Run command:** `npm start` (starts Express + serves built assets)
   - **Port:** `5000` (auto-detected)
4. Review environment variables (all secrets must be set)
5. Click **"Deploy"**
6. Wait 2-5 minutes for deployment
7. Test at your deployed URL

**⚠️ Important:** The build step is REQUIRED. Without `npm run build`, your frontend will show 404 errors in production.

### Method 2: CLI Deploy

```bash
# Install Replit CLI (if needed)
npm install -g @replit/cli

# Login
replit login

# Deploy
replit deploy
```

---

## 🌐 Custom Domain Setup

After deployment:

1. Go to your deployment settings
2. Click **"Custom Domains"**
3. Add your domain (e.g., `app.jiemastery.com`)
4. Add these DNS records to your registrar:

```
Type: CNAME
Name: app (or @)
Value: [your-replit-deployment-url]
TTL: 3600
```

5. Wait 5-60 minutes for DNS propagation
6. SSL certificate auto-provisions

---

## 📈 Monitoring & Scaling

### Built-in Monitoring:
- Real-time request metrics
- CPU/Memory usage
- Response times
- Error rates

### Access Monitoring:
1. Go to **Publishing** workspace
2. Click your deployment
3. View **Analytics** tab

### Scaling Triggers:
- Autoscale automatically adds instances when:
  - CPU usage > 80%
  - Request queue builds up
  - Response times increase
- Scales down to 0 when idle (saves costs)

---

## 🔐 Production Database

Your PostgreSQL database automatically:
- ✅ Scales with your app (managed by Neon)
- ✅ Provides built-in backups
- ✅ Includes connection pooling
- ✅ Handles high concurrency (check your plan limits)

**Connection:** Already configured via `DATABASE_URL`

---

## 🚨 Troubleshooting

### If deployment fails:

1. **Check logs:** Publishing → Logs tab
2. **Verify secrets:** All required env vars set?
3. **Test locally:** `npm start` should work in Replit
4. **Database:** Run `npm run db:push` before deploying

### Common Issues:

**"Port already in use"**
- Solution: App already configured for port 5000 ✅

**"Database connection failed"**
- Solution: Ensure `DATABASE_URL` is set
- Run: `npm run db:push` to sync schema

**"Stripe errors"**
- Solution: Verify all `STRIPE_PRICE_*` use `price_xxx` format (not dollar amounts)

---

## 🎯 Post-Deployment Tasks

After successful deployment:

1. ✅ Test login: `https://your-app.replit.app/auth`
2. ✅ Test password reset: `/forgot-password`
3. ✅ Test voice session: Start a tutoring session
4. ✅ Verify Stripe: Make a test subscription
5. ✅ Check email: Test welcome email sends
6. ✅ Monitor logs: First 24 hours closely

---

## 💰 Cost Optimization Tips

1. **Use Autoscale** (not Reserved VM) for variable traffic
2. **Implement caching** for AI responses (already done via SemanticCache)
3. **Optimize database queries** (use indexes)
4. **CDN for static assets** (Replit includes this)
5. **Monitor usage** regularly via Analytics

---

## 🔄 Continuous Deployment

Replit auto-deploys when you:
1. Push to your connected Git repo
2. Click "Deploy" button again
3. Use CLI: `replit deploy`

**Recommendation:** Connect to GitHub for automatic deployments on merge to `main`

---

## ✅ Ready to Deploy!

Your app is fully configured and ready for production. 

**Next Steps:**
1. Review all environment variables
2. Test locally one more time
3. Click **Deploy** button
4. Monitor first deployment closely
5. Add custom domain
6. Start onboarding users!

---

## 📞 Support Resources

- **Replit Docs:** https://docs.replit.com/hosting
- **Status Page:** https://status.replit.com
- **Community:** https://replit.com/talk

**For JIE Mastery Tutor specific issues:**
- Check server logs: Publishing → Logs
- Review database: Database workspace tool
- Monitor analytics: Publishing → Analytics

---

**🎉 You're ready to scale to 1 million users!**
