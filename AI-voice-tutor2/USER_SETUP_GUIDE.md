# 🚀 User Setup Guide - Railway & Dev Environments

## Quick Start (Recommended)

### For Railway (Production)
```bash
# One command to create ALL users:
railway run npm run setup-all-users
```

### For Dev Environment
```bash
# One command to create ALL users:
npm run setup-all-users
```

This creates **12 users total**:
- ✅ 1 Admin (pollis@mfhfoods.com) - Elite Plan (1800 min)
- ✅ 1 Subscriber (pollis@aquavertclean.com) - Starter Plan (60 min)
- ✅ 10 Test Users (Test1-10@example.com) - Various Plans

---

## 🔑 Credentials Reference Card

### Production Users

| Role | Email | Password | Plan | Minutes |
|------|-------|----------|------|---------|
| **Admin** | pollis@mfhfoods.com | Crenshaw22$$ | Elite Family | 1800 |
| **User** | pollis@aquavertclean.com | Crenshaw22$$ | Starter Family | 60 |

### Test Users (All Password: `TestPass123`)

| Email | Plan | Minutes | Concurrent Sessions | Concurrent Logins |
|-------|------|---------|---------------------|-------------------|
| Test1@example.com | Starter | 60 | 1 | 1 |
| Test2@example.com | Starter | 60 | 1 | 1 |
| Test3@example.com | Starter | 60 | 1 | 1 |
| Test4@example.com | Standard | 240 | 1 | 1 |
| Test5@example.com | Standard | 240 | 1 | 1 |
| Test6@example.com | Pro | 600 | 1 | 1 |
| Test7@example.com | Pro | 600 | 1 | 1 |
| Test8@example.com | Elite | 1800 | 3 | 3 |
| Test9@example.com | Elite | 1800 | 3 | 3 |
| Test10@example.com | Free Tier | 0 | 1 | 1 |

---

## 📋 Available Scripts

### Option 1: Setup Everything (Recommended)
```bash
# Railway
railway run npm run setup-all-users

# Dev
npm run setup-all-users
```
Creates both production users AND test users in one go.

### Option 2: Production Users Only
```bash
# Railway
railway run npm run restore-users

# Dev
npm run restore-users
```
Creates only the 2 production users (admin + subscriber).

### Option 3: Test Users Only
```bash
# Railway
railway run npm run create-test-users

# Dev
npm run create-test-users
```
Creates only the 10 test users.

---

## 🧪 Testing Strategy

### Authentication Testing
- ✅ Login/logout with each tier
- ✅ Password reset flow
- ✅ Session persistence

### Subscription Tier Testing
- **Test1-3**: Starter features (60 min limit)
- **Test4-5**: Standard features (240 min limit)
- **Test6-7**: Pro features (600 min limit)
- **Test8-9**: Elite features (1800 min, 3 concurrent sessions/logins)
- **Test10**: Free tier limitations

### Minute Tracking Testing
1. Start voice session with Test1 (Starter - 60 min)
2. Verify minutes decrement during session
3. Use full 60 minutes to test limit behavior
4. Verify over-limit handling

### Voice Tutoring Testing
- Test with different subscription levels
- Verify document upload works for all tiers
- Test transcript saving
- Test session analytics

### Content Moderation Testing
- Test profanity detection
- Test 3-strike warning system
- Test parent notification emails

### Admin Features (use pollis@mfhfoods.com)
- View all users in admin dashboard
- View all sessions
- Suspend/activate test users
- View violation reports
- Review session analytics

---

## 🔄 Execution Checklist

Before deploying to Railway:
- [ ] Install Railway CLI: `npm i -g @railway/cli`
- [ ] Link to Railway project: `railway link`
- [ ] Run setup script: `railway run npm run setup-all-users`
- [ ] Verify script completes successfully
- [ ] Test login with admin: pollis@mfhfoods.com
- [ ] Test login with test user: Test1@example.com
- [ ] Verify admin has Elite plan (1800 min)
- [ ] Verify Test1 has Starter plan (60 min)
- [ ] Begin comprehensive testing

---

## 🛡️ Important Notes

### Script Safety
- ✅ **Idempotent**: Safe to run multiple times
- ✅ **Update mode**: Updates existing users instead of creating duplicates
- ✅ **No data loss**: Preserves user data, only updates credentials and plans

### Password Security
- Production passwords use secure scrypt hashing
- Test passwords use the same secure hashing
- Passwords are never logged or exposed

### Concurrent Access
- **Starter/Standard/Pro**: 1 concurrent device login, 1 voice session
- **Elite**: 3 concurrent device logins, 3 voice sessions
- Family sharing supported via student profiles

---

## 💡 Pro Tips

1. **Quick Login Testing**: Use Test1-10@example.com with `TestPass123` for fast testing
2. **Minute Limit Testing**: Test1 (60 min) is perfect for testing limit scenarios
3. **Elite Features**: Test8-9 have 3 concurrent sessions for multi-device testing
4. **Free Tier**: Test10 has no subscription for testing paywall behavior
5. **Admin Dashboard**: Use pollis@mfhfoods.com for full admin access

---

## 🆘 Troubleshooting

### Script Fails
```bash
# Check database connection
railway run npm run db:push

# Try individual scripts
railway run npm run restore-users
railway run npm run create-test-users
```

### User Already Exists
✅ **No problem!** Scripts update existing users automatically.

### Password Not Working
Run the script again - it updates passwords for existing users.

---

## 📞 Support

If you encounter issues:
1. Check Railway logs: `railway logs`
2. Verify database connection
3. Ensure all environment variables are set
4. Re-run the setup script (it's idempotent)

---

**Last Updated**: October 28, 2025
