# 🚀 Stripe & Railway Production Setup Guide

## 🎯 The Problem You're Seeing

Your Railway app is showing these errors:
```
API Error 500: The "price" parameter should be the ID of a price object
```

**Why?** The Stripe Price IDs in your Railway environment variables are either missing or invalid.

---

## 📝 Step 1: Create Stripe Price Objects

You need to create **4 Price objects** in your Stripe Dashboard:

### Go to: https://dashboard.stripe.com/test/products

### Create These Prices:

#### 1️⃣ **Starter Plan** - $19/month
- Click "Add product"
- Product name: "JIE Tutor - Starter Plan"
- Description: "60 minutes of voice tutoring per month"
- Pricing model: **Recurring**
- Price: **$19.00 USD**
- Billing period: **Monthly**
- Click "Save product"
- **Copy the Price ID** (looks like `price_1ABC123...`)

#### 2️⃣ **Standard Plan** - $59/month
- Click "Add product"
- Product name: "JIE Tutor - Standard Plan"
- Description: "240 minutes of voice tutoring per month"
- Pricing model: **Recurring**
- Price: **$59.00 USD**
- Billing period: **Monthly**
- Click "Save product"
- **Copy the Price ID**

#### 3️⃣ **Pro Plan** - $99/month
- Click "Add product"
- Product name: "JIE Tutor - Pro Plan"
- Description: "600 minutes of voice tutoring per month"
- Pricing model: **Recurring**
- Price: **$99.00 USD**
- Billing period: **Monthly**
- Click "Save product"
- **Copy the Price ID**

#### 4️⃣ **Minute Top-Up** - $19.99 one-time
- Click "Add product"
- Product name: "60-Minute Top-Up"
- Description: "One-time purchase of 60 additional voice minutes"
- Pricing model: **One time**
- Price: **$19.99 USD**
- Click "Save product"
- **Copy the Price ID**

---

## 📋 Step 2: Add Price IDs to Railway

1. Go to your Railway project: **JIE-Mastery-Tutor-V2**
2. Click on your service
3. Click **"Variables"** tab
4. Add these **4 new environment variables**:

```bash
STRIPE_PRICE_STARTER=price_xxxxxxxxxxxxx     # Your Starter Plan Price ID
STRIPE_PRICE_STANDARD=price_xxxxxxxxxxxxx    # Your Standard Plan Price ID
STRIPE_PRICE_PRO=price_xxxxxxxxxxxxx         # Your Pro Plan Price ID
STRIPE_PRICE_TOPUP_60=price_xxxxxxxxxxxxx    # Your 60-Minute Top-Up Price ID
```

**Replace `price_xxxxxxxxxxxxx` with the actual Price IDs you copied from Stripe!**

5. Click **"Save"** or **"Deploy"**

---

## ✅ Step 3: Verify Setup

After Railway redeploys (takes 3-4 minutes):

1. Go to: `https://your-app.railway.app/pricing`
2. Click "Subscribe Now" on any plan
3. You should be redirected to a **Stripe Checkout page**
4. ✅ If you see the Stripe checkout form → **Success!**
5. ❌ If you see errors → Check the Price IDs are correct

---

## 🔍 Common Issues

### Issue: "API endpoint not found"
- **Cause:** Session table doesn't exist yet
- **Fix:** Run these commands to deploy the fix:
  ```bash
  git add -A
  git commit -m "Fix: Auto-create session table on startup"
  git push origin main
  ```

### Issue: "Price parameter should be ID of price object"
- **Cause:** Invalid or missing Price IDs in Railway variables
- **Fix:** Double-check you copied the **full Price ID** from Stripe (starts with `price_`)

### Issue: Checkout works but shows wrong price
- **Cause:** Using Test Mode prices in Production or vice versa
- **Fix:** Make sure you're using **Test Mode** Price IDs for testing

---

## 🎉 What Happens After Setup

Once configured correctly:

1. ✅ Users can register and login
2. ✅ Users can click "Subscribe Now" 
3. ✅ Stripe Checkout opens with correct pricing
4. ✅ After payment, users get access to voice minutes
5. ✅ Subscription management works via Stripe Customer Portal

---

## 🔐 Production vs Test Mode

**For Testing (Development):**
- Use **Test Mode** Price IDs from Stripe Dashboard
- Use **Test Mode** API keys (starts with `sk_test_`)

**For Production (Live Users):**
1. Switch Stripe Dashboard to **Live Mode**
2. Create the same 4 products/prices in **Live Mode**
3. Update Railway variables with **Live Mode** Price IDs
4. Update `STRIPE_SECRET_KEY` with **Live Mode** key (starts with `sk_live_`)

---

## 📞 Need Help?

- **Stripe Documentation:** https://stripe.com/docs/billing/prices-guide
- **Railway Documentation:** https://docs.railway.app/develop/variables
- **Your Stripe Dashboard:** https://dashboard.stripe.com/test/products
