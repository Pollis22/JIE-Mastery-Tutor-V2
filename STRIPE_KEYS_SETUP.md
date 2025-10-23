# 🔑 Stripe API Keys Setup Guide

## Quick Overview

You need to enter **2 keys from Stripe** (one will be used twice):

1. **Secret Key** - For backend payment processing
2. **Publishable Key** - For frontend checkout forms (entered twice)

---

## 📋 Step-by-Step Instructions

### Step 1: Get Your Keys from Stripe

1. Go to: **https://dashboard.stripe.com/apikeys**
2. You'll see two keys:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)
3. Click "Reveal test key" or "Reveal live key" to see them

---

### Step 2: Enter Keys in Replit Secrets

Open Replit Secrets (🔒 icon in left sidebar) and enter these **3 secrets**:

#### 1️⃣ STRIPE_SECRET_KEY
```
┌──────────────────────────────────────────────────┐
│ sk_test_                                         │
│                                                  │
└──────────────────────────────────────────────────┘
```
- **What it is:** Your Stripe Secret Key
- **Format:** Starts with `sk_test_` (test) or `sk_live_` (production)
- **Example:** `sk_test_51Abc123DEF456xyz789...` (much longer)
- **Where to get:** Stripe Dashboard → Developers → API keys → Secret key
- **⚠️ Keep secret!** Never share this publicly

---

#### 2️⃣ STRIPE_PUBLISHABLE_KEY
```
┌──────────────────────────────────────────────────┐
│ pk_test_                                         │
│                                                  │
└──────────────────────────────────────────────────┘
```
- **What it is:** Your Stripe Publishable Key (for backend)
- **Format:** Starts with `pk_test_` (test) or `pk_live_` (production)
- **Example:** `pk_test_51Abc123DEF456xyz789...`
- **Where to get:** Stripe Dashboard → Developers → API keys → Publishable key
- **✅ Safe to expose** in frontend code

---

#### 3️⃣ VITE_STRIPE_PUBLIC_KEY
```
┌──────────────────────────────────────────────────┐
│ pk_test_                                         │
│ (SAME as STRIPE_PUBLISHABLE_KEY above)           │
└──────────────────────────────────────────────────┘
```
- **What it is:** Your Stripe Publishable Key (for Vite frontend)
- **Format:** Starts with `pk_test_` (test) or `pk_live_` (production)
- **Value:** **EXACT SAME** as `STRIPE_PUBLISHABLE_KEY` above
- **Why needed:** Vite requires `VITE_` prefix to expose to frontend
- **✅ Safe to expose** in frontend code

---

## 🎯 Quick Copy Template

Fill this out, then paste into Replit Secrets:

```
┌────────────────────────────────────────────────────────┐
│  SECRET NAME              │  VALUE                     │
├────────────────────────────────────────────────────────┤
│                                                        │
│  STRIPE_SECRET_KEY        │  sk_test_____________     │
│                           │  (Copy from Stripe)        │
│                                                        │
│  STRIPE_PUBLISHABLE_KEY   │  pk_test_____________     │
│                           │  (Copy from Stripe)        │
│                                                        │
│  VITE_STRIPE_PUBLIC_KEY   │  pk_test_____________     │
│                           │  (SAME as above)           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## ✅ Verification Checklist

After entering all 3 secrets:

- [ ] `STRIPE_SECRET_KEY` starts with `sk_test_` or `sk_live_`
- [ ] `STRIPE_PUBLISHABLE_KEY` starts with `pk_test_` or `pk_live_`
- [ ] `VITE_STRIPE_PUBLIC_KEY` is **identical** to `STRIPE_PUBLISHABLE_KEY`
- [ ] All 3 secrets are saved in Replit Secrets
- [ ] Server has been restarted (auto-restarts after saving)

---

## 🔄 Test vs Production Keys

### For Development/Testing:
- Use **Test Mode** keys (start with `sk_test_` and `pk_test_`)
- No real charges, safe to experiment
- Get from: https://dashboard.stripe.com/test/apikeys

### For Production (Live):
- Use **Live Mode** keys (start with `sk_live_` and `pk_live_`)
- Real charges to real customers
- Get from: https://dashboard.stripe.com/apikeys

**Start with test keys!** Switch to live keys only when ready to accept real payments.

---

## 📝 Example (Test Mode)

If your Stripe test keys are:

| Key Type | Value |
|----------|-------|
| Secret key | `sk_test_51AbcDEF123xyz789...` |
| Publishable key | `pk_test_51GhiJKL456uvw123...` |

Then your Replit Secrets should be:

```
STRIPE_SECRET_KEY = sk_test_51AbcDEF123xyz789...
STRIPE_PUBLISHABLE_KEY = pk_test_51GhiJKL456uvw123...
VITE_STRIPE_PUBLIC_KEY = pk_test_51GhiJKL456uvw123...
```

Notice: The publishable key is entered **twice** (once for backend, once for Vite frontend).

---

## ❓ FAQ

**Q: Why do I need the publishable key twice?**  
A: Your backend uses `STRIPE_PUBLISHABLE_KEY`, but Vite (frontend build tool) only exposes environment variables that start with `VITE_`. So we need both.

**Q: Is it safe to expose the publishable key?**  
A: Yes! Publishable keys (`pk_`) are designed to be public. They can only create checkout sessions, not process payments.

**Q: What about the secret key?**  
A: **NEVER** expose your secret key (`sk_`)! It should only be in Replit Secrets, never in frontend code.

**Q: Test or live mode?**  
A: Start with **test mode** (`sk_test_` and `pk_test_`). Switch to live mode only when ready for production.

---

## 🚨 Security Warnings

✅ **Safe to share:**
- Publishable keys (`pk_test_` or `pk_live_`)

❌ **NEVER share:**
- Secret keys (`sk_test_` or `sk_live_`)
- Webhook secret (`whsec_`)

🔒 **Always:**
- Keep secret keys in Replit Secrets only
- Use test mode for development
- Rotate keys if accidentally exposed

---

## 🎉 After Setup

Once all 3 secrets are entered:

1. ✅ Server auto-restarts with new keys
2. ✅ Stripe integration fully configured
3. ✅ Ready to test checkout flow
4. ✅ Ready to deploy!

---

## 📞 Need Your Keys?

Go to: **https://dashboard.stripe.com/apikeys**

- For test keys: https://dashboard.stripe.com/test/apikeys
- For live keys: https://dashboard.stripe.com/apikeys (switch to "Live" mode)

Click "Reveal" to see your keys, then copy/paste into Replit Secrets!