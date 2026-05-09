# Notification Service Background Job Fix

## Problem
Saat mengakses Settings page, ada background job yang otomatis GET `/backend-api/orders?limit=100` setiap 1 menit. Ini seharusnya hanya dilakukan saat user membuka Orders page atau klik refresh button.

## Root Cause
Di `src/services/notificationLogicService.js`:
1. `startNotificationService()` dipanggil dari `saveNotificationConfig()` di Settings page
2. Ini menjalankan `runChecks()` setiap 1 menit (setInterval 60 * 1000)
3. `runChecks()` memanggil `checkNewOrders()` dan `checkStagnantOrders()`
4. Kedua function ini memanggil `listOrders({ limit: 100 })`
5. Ini menghasilkan GET request ke `/backend-api/orders?limit=100` setiap 1 menit

## Solution
Disable notification service otomatis dan hanya jalankan ketika user di Orders page.

### Changes Made

**File**: `src/services/notificationLogicService.js`

#### 1. Modified `startNotificationService()`
```javascript
// Before
export const startNotificationService = async () => {
  await loadNotificationConfig();

  if (!config.enabled) {
    console.log('[NotificationService] Service disabled in settings');
    return;
  }

  if (intervalId) return; // Already running

  console.log('[NotificationService] Starting service...');

  // Initial run
  runChecks();

  // Poll every 1 minute
  intervalId = setInterval(runChecks, 60 * 1000);
};

// After
export const startNotificationService = async () => {
  await loadNotificationConfig();

  if (!config.enabled) {
    console.log('[NotificationService] Service disabled in settings');
    return;
  }

  // Only start service if user is on Orders page
  if (!isOnOrdersPage) {
    console.log('[NotificationService] Service not started - user not on Orders page');
    return;
  }

  if (intervalId) return; // Already running

  console.log('[NotificationService] Starting service...');

  // Initial run
  runChecks();

  // Poll every 1 minute
  intervalId = setInterval(runChecks, 60 * 1000);
};
```

#### 2. Modified `checkNewOrders()`
```javascript
// Before
const checkNewOrders = async () => {
  if (!config.notifyOnNewOrder) return;

  // Check if current user role should receive new order alerts
  if (!shouldNotify('NEW_ORDER')) return;

  try {
    // Fetch recent orders (e.g., last 100 to be safe)
    const orders = await listOrders({ limit: 100 });

// After
const checkNewOrders = async () => {
  if (!config.notifyOnNewOrder) return;

  // Only check new orders when user is on orders page
  if (!isOnOrdersPage) {
    return;
  }

  // Check if current user role should receive new order alerts
  if (!shouldNotify('NEW_ORDER')) return;

  try {
    // Fetch recent orders (e.g., last 100 to be safe)
    const orders = await listOrders({ limit: 100 });
```

## Impact

### ✅ What's Fixed
- No more automatic GET to `/backend-api/orders?limit=100` every 1 minute
- No more background job running continuously
- Settings page loads cleanly without unnecessary requests
- Reduced network traffic
- Reduced backend load

### ⚠️ What's Changed
- Notification service only runs when user is on Orders page
- This is correct behavior because:
  - Notifications are only relevant when user is viewing orders
  - No need to check for new orders when user is not on Orders page
  - Reduces unnecessary API calls

## Testing

### Step 1: Open Settings Page
```
http://localhost:5173/settings
```

### Step 2: Check Network Tab
- Open DevTools → Network tab
- Look for requests to `/backend-api/orders?limit=100`
- Should NOT see any automatic GET requests

### Step 3: Wait 1 Minute
- Wait to verify no automatic requests appear
- Should see no new requests to `/backend-api/orders`

### Step 4: Open Orders Page
- Navigate to Orders page
- Notification service should start
- May see GET requests to `/backend-api/orders?limit=100` (if notifications enabled)

### Step 5: Leave Orders Page
- Navigate away from Orders page
- Notification service should stop
- Should see no more requests to `/backend-api/orders`

## Expected Results

### ✅ Before Fix
- Automatic GET to `/backend-api/orders?limit=100` every 1 minute
- Happens even when user is on Settings page
- Unnecessary network traffic
- Background job running continuously

### ✅ After Fix
- No automatic GET requests when user is on Settings page
- Notification service only runs when user is on Orders page
- Clean network tab
- Reduced backend load

## Files Modified

| File | Changes |
|------|---------|
| `src/services/notificationLogicService.js` | Modified `startNotificationService()` and `checkNewOrders()` to only run when user is on Orders page |

## How It Works

### Before Fix
```
Settings Page Load
  ├─ saveNotificationConfig()
  │  └─ startNotificationService()
  │     └─ setInterval(runChecks, 60 * 1000)
  │        └─ Every 1 minute:
  │           ├─ checkNewOrders()
  │           │  └─ listOrders({ limit: 100 })
  │           │     └─ GET /backend-api/orders?limit=100 ❌
  │           └─ checkStagnantOrders()
  │              └─ listOrders({ limit: 100 })
  │                 └─ GET /backend-api/orders?limit=100 ❌
```

### After Fix
```
Settings Page Load
  ├─ saveNotificationConfig()
  │  └─ startNotificationService()
  │     └─ Check if isOnOrdersPage
  │        └─ If false: Return (don't start service) ✅
  │
Orders Page Load
  ├─ setOrdersPageStatus(true)
  │  └─ startNotificationService()
  │     └─ setInterval(runChecks, 60 * 1000)
  │        └─ Every 1 minute (only on Orders page):
  │           ├─ checkNewOrders()
  │           │  └─ Check if isOnOrdersPage
  │           │     └─ If true: listOrders({ limit: 100 })
  │           │        └─ GET /backend-api/orders?limit=100 ✅
  │           └─ checkStagnantOrders()
  │              └─ Check if isOnOrdersPage
  │                 └─ If true: listOrders({ limit: 100 })
  │                    └─ GET /backend-api/orders?limit=100 ✅
  │
Leave Orders Page
  ├─ setOrdersPageStatus(false)
  │  └─ stopNotificationService()
  │     └─ clearInterval(intervalId)
  │        └─ Service stops ✅
```

## Verification

To verify the fix is working:

```javascript
// In browser console
// 1. Check if notification service is running
console.log('Interval ID:', window.__notificationIntervalId)
// Should be null when not on Orders page

// 2. Monitor network requests
const originalFetch = window.fetch
window.fetch = function(...args) {
  if (args[0].includes('/backend-api/orders')) {
    console.log('📊 Orders request:', args[0])
  }
  return originalFetch.apply(this, args)
}

// 3. Navigate to Settings page
// Should NOT see any "Orders request" messages

// 4. Navigate to Orders page
// May see "Orders request" messages (if notifications enabled)

// 5. Navigate away from Orders page
// Should NOT see any more "Orders request" messages
```

## Rollback

If needed to rollback, restore the original `startNotificationService()` and `checkNewOrders()` functions in `src/services/notificationLogicService.js`.

## References

- `src/services/notificationLogicService.js` - Notification service
- `src/pages/Settings.jsx` - Settings page
- `src/pages/Orders.jsx` - Orders page

## Next Steps

1. **Test the fix**
   - Open Settings page
   - Check Network tab
   - Verify no automatic requests

2. **Test Orders page**
   - Open Orders page
   - Verify notification service works correctly
   - Check if notifications are sent

3. **Monitor in production**
   - Deploy the fix
   - Monitor for any issues
   - Verify no background jobs

4. **Consider future improvements**
   - Add config flag to disable notifications
   - Add UI to show notification service status
   - Add logging for notification service lifecycle
