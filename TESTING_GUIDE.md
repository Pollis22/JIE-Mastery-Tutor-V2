# Frontend Testing Guide for CHANGELOG Endpoints

This guide shows you where to test each endpoint mentioned in the CHANGELOG from the frontend.

## 📍 Navigation

All endpoints can be tested from the **Dashboard** page at `/dashboard` (or `/dashboard?tab=...`)

---

## 1. `PATCH /api/user/profile` - Update Profile

**Location:** Dashboard → **Account** tab → **Profile** sub-tab

**How to test:**
1. Navigate to `/dashboard?tab=account` (or click "Account" tab in dashboard)
2. Click the **"Edit Profile"** button in the Profile section
3. Update any of these fields:
   - First Name
   - Last Name  
   - Email
4. Click **"Save Changes"**
5. Verify the success toast appears and profile updates

**Component:** `client/src/components/dashboard/account-settings.tsx` (lines 62-84, 120-123)

---

## 2. `DELETE /api/user/account` - Delete Account

**Location:** Dashboard → **Account** tab → **Danger Zone** sub-tab

**How to test:**
1. Navigate to `/dashboard?tab=account`
2. Click the **"Danger Zone"** tab
3. Scroll to the **"Delete Account"** section
4. Click the **"Delete Account"** button
5. Confirm the deletion in the browser prompt
6. Verify account is deleted and you're redirected to `/auth`

**Component:** `client/src/components/dashboard/account-settings.tsx` (lines 178-195, 414-434)

⚠️ **Warning:** This action is permanent and cannot be undone!

---

## 3. `GET /api/user/export-data` - Export User Data

**Location:** Dashboard → **Account** tab → **Privacy** sub-tab

**How to test:**
1. Navigate to `/dashboard?tab=account`
2. Click the **"Privacy"** tab
3. Find the **"Export Your Data"** section
4. Click the **"Export Data"** button
5. Verify a JSON file downloads with your user data (profile, sessions, documents)

**Component:** `client/src/components/dashboard/account-settings.tsx` (lines 152-176, 389-411)

---

## 4. `POST /api/subscription/cancel` - Cancel Subscription

**Location:** Dashboard → **Subscription** tab

**How to test:**
1. Navigate to `/dashboard?tab=subscription` (or click "Subscription" tab in dashboard)
2. In the **"Current Subscription"** card, find the action buttons
3. Click the **"Cancel Subscription"** button (only visible if you have an active subscription)
4. Verify the success toast appears with message about retaining access until period end
5. Check that subscription status updates

**Component:** `client/src/components/dashboard/subscription-manager.tsx` (lines 209-230, 365-372)

**Note:** You must have an active subscription to test this. The button only appears when `subscriptionStatus === 'active'`.

---

## 5. `GET /api/voice/live-token` - Legacy Voice Token

**Location:** Any page that uses voice functionality (typically the main tutor interface)

**How to test:**
1. Navigate to a page that uses voice (e.g., main tutor session page)
2. The hook `use-voice.tsx` automatically calls this endpoint when initializing voice
3. Check browser DevTools → Network tab for the request to `/api/voice/live-token`
4. Verify it returns a token successfully

**Component:** `client/src/hooks/use-voice.tsx` (line 44)

**Note:** This is called automatically when voice is initialized, so you don't need to manually trigger it.

---

## 6. `POST /api/voice/generate-response` - Legacy Voice Response

**Location:** Any page that uses voice functionality (typically the main tutor interface)

**How to test:**
1. Navigate to a page that uses voice (e.g., main tutor session page)
2. Start a voice session and speak to the tutor
3. The hook `use-voice.tsx` calls this endpoint when generating AI responses
4. Check browser DevTools → Network tab for the request to `/api/voice/generate-response`
5. Verify the response is generated and voice playback works

**Component:** `client/src/hooks/use-voice.tsx` (line 124)

**Note:** This is called automatically during voice interactions, so you need to actually use the voice feature to test it.

---

## 🗺️ Quick Reference Map

```
Dashboard (/dashboard)
│
├── Account Tab (tab=account)
│   ├── Profile Sub-tab
│   │   └── ✅ PATCH /api/user/profile (Edit Profile button)
│   ├── Privacy Sub-tab
│   │   └── ✅ GET /api/user/export-data (Export Data button)
│   └── Danger Zone Sub-tab
│       └── ✅ DELETE /api/user/account (Delete Account button)
│
├── Subscription Tab (tab=subscription)
│   └── ✅ POST /api/subscription/cancel (Cancel Subscription button)
│
└── Voice Features (any voice-enabled page)
    ├── ✅ GET /api/voice/live-token (auto-called on init)
    └── ✅ POST /api/voice/generate-response (auto-called during voice interaction)
```

---

## 🧪 Testing Checklist

- [ ] **Profile Update**: Edit first name, last name, or email in Account → Profile tab
- [ ] **Data Export**: Click Export Data in Account → Privacy tab, verify JSON download
- [ ] **Account Deletion**: Delete account in Account → Danger Zone tab (use test account!)
- [ ] **Subscription Cancel**: Cancel subscription in Subscription tab (requires active subscription)
- [ ] **Voice Token**: Check Network tab when voice initializes
- [ ] **Voice Response**: Use voice feature and check Network tab for response generation

---

## 📝 Notes

- All user-related endpoints require authentication
- Subscription cancel requires an active subscription
- Account deletion is permanent - use a test account
- Voice endpoints are automatically called during normal voice usage
- Check browser DevTools → Network tab to verify API calls
- Check browser DevTools → Console for any errors

---

## 🔍 Finding Components in Code

- **Account Settings**: `client/src/components/dashboard/account-settings.tsx`
- **Subscription Manager**: `client/src/components/dashboard/subscription-manager.tsx`
- **Voice Hook**: `client/src/hooks/use-voice.tsx`
- **Dashboard Page**: `client/src/pages/dashboard.tsx`
