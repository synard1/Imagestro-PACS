# Fix: UI Not Updating After Code Changes

## Problem
Code sudah diubah di `orderService.js` dan `Orders.jsx`, tapi UI masih menampilkan data lama (procedure dan scheduled kosong).

---

## Root Cause
Kemungkinan penyebab:
1. **Vite dev server belum rebuild** - Hot module reload gagal
2. **Browser cache agresif** - Browser masih pakai bundled JS lama
3. **Offline orders di localStorage** - Override data server
4. **node_modules/.vite cache** - Vite cache perlu di-clear

---

## Solution Steps

### Step 1: Clear LocalStorage (Browser Console)

Buka Browser Console (`F12`), jalankan:

```javascript
// Clear offline orders
localStorage.removeItem('orders_offline')
console.log('✅ Offline orders cleared')

// Verify cleared
console.log('orders_offline:', localStorage.getItem('orders_offline'))  // Should be null
```

### Step 2: Test Backend Direct (Browser Console)

Masih di console, copy dan paste **SELURUH** isi file `test-inline-debug.js`, lalu jalankan:

```javascript
runQuickFix()
```

**Expected Output:**
```
✅ ALL CHECKS PASSED!
Backend has procedure_name: ✅
Backend has scheduled_at: ✅
Normalized has procedure_name: ✅
Normalized has scheduled_at: ✅
```

**Jika FAILED:**
- Check apakah backend mengirim data dengan benar
- Check token valid
- Check network tab di browser DevTools

### Step 3: Stop Vite Dev Server

Di terminal tempat `npm run dev` berjalan:
1. Tekan `Ctrl + C` untuk stop server
2. Tunggu sampai benar-benar berhenti

### Step 4: Clear Vite Cache

```bash
# Windows CMD/PowerShell
rmdir /s /q node_modules\.vite

# Atau Git Bash / Linux
rm -rf node_modules/.vite
```

### Step 5: Restart Dev Server

```bash
npm run dev
```

Tunggu sampai muncul:
```
VITE v5.x.x  ready in XXX ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

### Step 6: Hard Refresh Browser

**Jangan cuma F5! Harus hard refresh:**

- **Windows/Linux:** `Ctrl + Shift + R` atau `Ctrl + F5`
- **Mac:** `Cmd + Shift + R`

Atau manual:
1. `F12` buka DevTools
2. Klik kanan icon Refresh di browser
3. Pilih "Empty Cache and Hard Reload"

### Step 7: Verify Data di Browser Console

```javascript
// Test fetch orders
fetch('http://103.42.117.19:8888/orders', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
})
.then(r => r.json())
.then(data => {
  const first = data.orders[0]
  console.table({
    'procedure_name': first.procedure_name,
    'procedure_code': first.procedure_code,
    'scheduled_at': first.scheduled_at
  })
})
```

**Expected:**
```
procedure_name  | CT Head with Contrast
procedure_code  | LP23456-7
scheduled_at    | Fri, 07 Nov 2025 09:00:00 GMT
```

---

## Still Not Working?

### Option A: Verify Code Changes Applied

Check file content di browser DevTools:

1. Open DevTools (`F12`)
2. Go to **Sources** tab
3. Find `orderService.js` di file tree
4. Search untuk line `scheduled_at: scheduledStartAt`
5. Pastikan ada 2 lines:
   ```javascript
   scheduled_at: scheduledStartAt,
   scheduled_start_at: scheduledStartAt,
   ```

6. Find `Orders.jsx`
7. Search untuk `r.procedure_name || r.requested_procedure`
8. Pastikan prioritas procedure_name PERTAMA

**Jika code masih lama:**
- Vite belum rebuild
- Ulangi Step 3-6

### Option B: Build Production untuk Test

```bash
# Stop dev server
# Build production
npm run build

# Serve production build
npm run preview
```

Buka `http://localhost:4173` (atau port yang ditampilkan)

**Jika production build works tapi dev tidak:**
- Ada issue dengan Vite HMR
- Gunakan production build sementara
- Atau restart VS Code / editor Anda

### Option C: Nuclear Option

```bash
# 1. Stop dev server
Ctrl+C

# 2. Remove all caches
rmdir /s /q node_modules\.vite
rmdir /s /q dist

# 3. Clear browser
# Browser console:
localStorage.clear()
sessionStorage.clear()

# 4. Restart everything
npm run dev

# 5. Hard refresh: Ctrl+Shift+R
```

---

## Debugging Checklist

Run these in browser console to verify each step:

```javascript
// 1. Check localStorage
console.log('Offline orders:', localStorage.getItem('orders_offline'))
// Expected: null

// 2. Check backend
fetch('http://103.42.117.19:8888/orders', {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
})
.then(r => r.json())
.then(d => console.log('Backend data:', d.orders[0]))
// Expected: has procedure_name and scheduled_at

// 3. Check current page data
const firstRow = document.querySelector('table.table tbody tr')
const procedureCell = firstRow?.querySelectorAll('td')[4]
const scheduledCell = firstRow?.querySelectorAll('td')[5]
console.log('UI Procedure:', procedureCell?.textContent.trim())
console.log('UI Scheduled:', scheduledCell?.textContent.trim())
// Expected: NOT "—" or "Missing Procedure"
```

---

## Common Issues

### Issue 1: "localhost refused to connect"
**Cause:** Dev server not running
**Fix:** Run `npm run dev`

### Issue 2: Blank page or errors in console
**Cause:** Build error or syntax error
**Fix:**
- Check terminal for error messages
- Check browser console for errors
- Fix any TypeScript/JavaScript errors

### Issue 3: Still showing old data after all steps
**Cause:** Browser cache extremely aggressive
**Fix:**
1. Try different browser (Chrome → Firefox or vice versa)
2. Try incognito/private mode
3. Clear ALL browsing data (not just cache)

### Issue 4: Data shows in console but not in table
**Cause:** React component not re-rendering
**Fix:**
```javascript
// Force re-render by clearing React state
// Click "Refresh" button on Orders page
// Or run in console:
location.reload()
```

---

## Expected Final Result

After all steps, the Orders table should show:

| Order Number | Procedure | Scheduled |
|--------------|-----------|-----------|
| ORD2025110700005 | **CT Head with Contrast**<br><small>Code: LP23456-7</small> | **07/11/2025**<br><small>09:00</small> |

NOT:
- ❌ "—" in Procedure column
- ❌ "Missing Procedure" badge
- ❌ "—" in Scheduled column

---

## Quick Reference Commands

```bash
# Stop server
Ctrl+C

# Clear Vite cache
rm -rf node_modules/.vite

# Restart server
npm run dev

# Build production
npm run build
npm run preview
```

**Browser:**
```javascript
// Clear localStorage
localStorage.removeItem('orders_offline')

// Run debug
runQuickFix()

// Hard refresh
Ctrl+Shift+R
```

---

**Last Updated:** 2025-11-09
**Priority:** HIGH - Code changes not reflecting in UI
