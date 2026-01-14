# Tracking Verification Checklist

This document describes the Google Ads + Meta Pixel tracking implementation for JIE Mastery.

## Tag IDs

| Platform    | ID                | Type          |
|-------------|-------------------|---------------|
| Google Ads  | AW-17252974185    | Conversion    |
| Meta Pixel  | 833118612039393   | Pixel ID      |

## Implementation Architecture

This is a **Single Page Application (SPA)** using React with Wouter routing.

### Script Initialization

Tags are initialized in `client/index.html`:
- Google Ads gtag.js loads asynchronously
- Meta Pixel loads and fires initial PageView

### SPA Route Change Tracking

The `useTracking` hook in `client/src/hooks/use-tracking.ts`:
- Fires `page_view` (Google) and `PageView` (Meta) on every route change
- Skips duplicate firing with URL deduplication
- Skips initial load (already fired by index.html)
- Excludes `/admin` and `/api` paths

### Events Tracked

| Event           | Google Event       | Meta Event       | Trigger                    |
|-----------------|-------------------|------------------|----------------------------|
| Page View       | `page_view`       | `PageView`       | Every SPA route change     |
| Begin Checkout  | `begin_checkout`  | `InitiateCheckout` | Subscribe page load      |
| View Content    | -                 | `ViewContent`    | Offer page load            |
| Purchase        | `conversion`      | `Subscribe`      | Registration success       |

## Debug Mode

Enable tracking debug logs in development:

```bash
# In .env or environment variables
VITE_TRACKING_DEBUG=1
```

When enabled, console logs show:
- `[Tracking] GA page_view fired: /path`
- `[Tracking] Meta PageView fired: /path`
- `[Tracking] Skipped (duplicate): url`
- `[Tracking] Skipped (excluded path): /admin`

## Verification Steps

### 1. Initial Page Load

1. Open browser DevTools → Console
2. Enable `VITE_TRACKING_DEBUG=1`
3. Load homepage
4. Verify console shows: `[Tracking] Initial load - PageView already fired by index.html for: /`
5. Check Network tab for `fbevents.js` and `gtag/js` requests

### 2. SPA Navigation

1. Click to navigate to `/offer`
2. Verify console shows:
   - `[Tracking] GA page_view fired: /offer`
   - `[Tracking] Meta PageView fired: /offer`
3. Navigate to `/benefits` and `/pricing`
4. Verify page_view fires once per route (no duplicates)

### 3. Google Tag Assistant / GA4 DebugView

1. Install Google Tag Assistant Chrome extension
2. Navigate through the site
3. Confirm page_view events appear for each navigation

### 4. Meta Pixel Helper

1. Install Meta Pixel Helper Chrome extension
2. Navigate through the site
3. Confirm PageView events fire on each route change
4. Confirm ViewContent fires on `/offer` page

### 5. Purchase Conversion (DO NOT MODIFY)

Purchase conversion is handled in `client/src/pages/registration-success-page.tsx`:
- Google Ads: `AW-17252974185/OverCP_hvtsbEOn87aJA`
- Meta: `Subscribe` event
- Protected by sessionStorage to prevent duplicate firing

To verify:
1. Complete a test purchase flow
2. Check console for `[Google Ads] Conversion tracked` log
3. Verify in Google Ads conversion tracking UI

## Files Changed

| File | Purpose |
|------|---------|
| `client/src/hooks/use-tracking.ts` | SPA page view tracking hook |
| `client/src/App.tsx` | Hook integration in Router |
| `docs/TRACKING.md` | This documentation |

## Rollback

To disable SPA tracking without removing code:

1. Remove `useTracking()` call from `client/src/App.tsx`
2. Or set `VITE_TRACKING_DEBUG=0` to silence logs only

To fully rollback:
```bash
git revert <commit-hash>
```

## Notes

- Google Ads "Tag inactive" status may take 24-48 hours to update after tracking is fixed
- Do not modify purchase conversion logic in `registration-success-page.tsx`
- All tracking respects user privacy - no PII is transmitted
