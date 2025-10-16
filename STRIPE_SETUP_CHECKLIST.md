# 🔐 Stripe Secret Keys Setup Checklist

## Quick Setup Guide

Copy your Stripe Price IDs from the Stripe Dashboard and paste them into Replit Secrets.

---

## 📋 Required Stripe Secrets

### 1. STRIPE_PRICE_STARTER
**What it is:** Price ID for your Starter subscription plan  
**Format:** `price_` followed by alphanumeric characters  
**Example:** `price_1OabcdefGHIjklmnop123456`  
**Current Value:** ❌ `19.99` (INVALID - needs Price ID)

**How to get it:**
1. Go to [Stripe Dashboard → Products](https://dashboard.stripe.com/products)
2. Click on your **Starter Plan** product
3. Find the price (e.g., $19.99/month)
4. Copy the **Price ID** (starts with `price_`)

**Where to paste:**
- Open Replit Secrets (🔒 icon in left sidebar)
- Find `STRIPE_PRICE_STARTER`
- Paste your Price ID
- Click Save

---

### 2. STRIPE_PRICE_STANDARD
**What it is:** Price ID for your Standard subscription plan  
**Format:** `price_` followed by alphanumeric characters  
**Example:** `price_2PbcdefgHIJklmnop234567`  
**Current Value:** ❌ `59.99` (INVALID - needs Price ID)

**How to get it:**
1. Go to [Stripe Dashboard → Products](https://dashboard.stripe.com/products)
2. Click on your **Standard Plan** product
3. Find the price (e.g., $59.99/month)
4. Copy the **Price ID** (starts with `price_`)

**Where to paste:**
- Open Replit Secrets (🔒 icon in left sidebar)
- Find `STRIPE_PRICE_STANDARD`
- Paste your Price ID
- Click Save

---

### 3. STRIPE_PRICE_PRO
**What it is:** Price ID for your Pro subscription plan  
**Format:** `price_` followed by alphanumeric characters  
**Example:** `price_3QcdefghIJKlmnop345678`  
**Current Value:** ❌ `99.99` (INVALID - needs Price ID)

**How to get it:**
1. Go to [Stripe Dashboard → Products](https://dashboard.stripe.com/products)
2. Click on your **Pro Plan** product
3. Find the price (e.g., $99.99/month)
4. Copy the **Price ID** (starts with `price_`)

**Where to paste:**
- Open Replit Secrets (🔒 icon in left sidebar)
- Find `STRIPE_PRICE_PRO`
- Paste your Price ID
- Click Save

---

### 4. STRIPE_PRICE_TOPUP_60
**What it is:** Price ID for 60-minute voice minutes top-up  
**Format:** `price_` followed by alphanumeric characters  
**Example:** `price_4RdefghiJKLmnopq456789`  
**Current Value:** ❌ `19.99` (INVALID - needs Price ID)

**How to get it:**
1. Go to [Stripe Dashboard → Products](https://dashboard.stripe.com/products)
2. Click on your **60 Minutes Top-up** product
3. Find the price (e.g., $19.99 one-time)
4. Copy the **Price ID** (starts with `price_`)

**Where to paste:**
- Open Replit Secrets (🔒 icon in left sidebar)
- Find `STRIPE_PRICE_TOPUP_60`
- Paste your Price ID
- Click Save

---

## ✅ Verification Checklist

After updating all secrets:

- [ ] All 4 price IDs start with `price_`
- [ ] All 4 price IDs are saved in Replit Secrets
- [ ] Server has been restarted (to load new secrets)
- [ ] No more Stripe validation warnings in console

---

## 🔄 Quick Steps to Update

### For Each Secret:

1. **Open Stripe Dashboard**
   - Go to: https://dashboard.stripe.com/products

2. **Find Your Product**
   - Click on the product (Starter, Standard, Pro, or Top-up)

3. **Copy Price ID**
   - Look for the price row
   - Click to expand if needed
   - Copy the ID that starts with `price_`

4. **Update Replit Secret**
   - In Replit, click 🔒 Secrets (left sidebar)
   - Find the matching secret name
   - Paste the Price ID
   - Click Save

5. **Repeat for All 4 Secrets**

---

## 📝 Example Setup

If your Stripe products look like this:

| Product | Price | Correct Price ID |
|---------|-------|------------------|
| Starter Plan | $19.99/month | `price_1ABC123starter` |
| Standard Plan | $59.99/month | `price_2DEF456standard` |
| Pro Plan | $99.99/month | `price_3GHI789pro` |
| 60 Min Top-up | $19.99 one-time | `price_4JKL012topup` |

Then your Replit Secrets should be:

```
STRIPE_PRICE_STARTER = price_1ABC123starter
STRIPE_PRICE_STANDARD = price_2DEF456standard
STRIPE_PRICE_PRO = price_3GHI789pro
STRIPE_PRICE_TOPUP_60 = price_4JKL012topup
```

---

## ❓ Need to Create Products First?

If you don't have these products in Stripe yet:

1. Go to [Stripe Dashboard → Products](https://dashboard.stripe.com/products)
2. Click **"+ Add Product"**
3. Create each product:
   - **Name:** Starter Plan / Standard Plan / Pro Plan / 60 Minute Top-up
   - **Price:** $19.99 / $59.99 / $99.99 / $19.99
   - **Billing:** Recurring monthly (or one-time for top-up)
4. Save the product
5. Copy the Price ID that's generated
6. Paste into Replit Secrets

---

## 🚨 Common Mistakes to Avoid

❌ **Don't use dollar amounts:** `19.99`  
✅ **Use Price IDs:** `price_1ABC123xyz`

❌ **Don't use Product IDs:** `prod_ABC123xyz`  
✅ **Use Price IDs:** `price_1ABC123xyz`

❌ **Don't include quotes:** `"price_1ABC123xyz"`  
✅ **Just the ID:** `price_1ABC123xyz`

---

## 🎯 After Setup

Once all secrets are updated:

1. **Restart your server** (workflow will auto-restart)
2. **Check the console** - Should see ✅ instead of ⚠️
3. **Test a subscription** - Try the checkout flow
4. **Ready to deploy!** - Your Stripe integration will work

---

## 📞 Need Help?

If you're stuck:
- Check that you're copying the **Price ID**, not the Product ID
- Make sure the ID starts with `price_`
- Verify you clicked Save in Replit Secrets
- Restart the server after updating secrets

The Price ID is the unique identifier Stripe uses for each price point, not the dollar amount!