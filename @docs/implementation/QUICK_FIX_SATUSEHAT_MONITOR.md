# QUICK FIX - SatuSehat Monitor "No Orders Found"

## 🚨 Fast Solution (1 minute)

Jika SatuSehat Monitor menunjukkan "No orders found" setelah update auth:

### Step 1: Create `.env.local` file

**Di root project** (sejajar dengan `package.json`), buat file baru: `.env.local`

```bash
# .env.local
VITE_SATUSEHAT_MONITOR_AUTH_TYPE=basic
VITE_SATUSEHAT_MONITOR_BASIC_USER=admin
VITE_SATUSEHAT_MONITOR_BASIC_PASS=password123
```

### Step 2: Restart Dev Server

```bash
# Stop server (Ctrl+C)
npm run dev
```

### Step 3: Test

```bash
1. Buka: http://localhost:5173/satusehat-monitor
2. Data should appear now! ✅
```

## ✅ Verify It's Working

**Check browser console (F12):**
```
[http] Using Basic Auth for satusehatMonitor (from env)
[satusehatMonitorService] Got data array, length: 10
```

**Check Network tab:**
```
Request Headers:
Authorization: Basic YWRtaW46cGFzc3dvcmQxMjM=
```

## 📋 What This Does

- Temporarily uses Basic Auth instead of Bearer token
- Backend masih expect username/password yang lama
- Credentials dari environment variable (aman, tidak commit ke git)
- Bisa switch ke Bearer token nanti saat backend ready

## ⚠️ Important Notes

1. **`.env.local` tidak akan commit ke git** (sudah di .gitignore)
2. **Ini solusi sementara** - eventually harus pakai Bearer token
3. **Jangan commit credentials** ke `.env` atau source code
4. **Production harus pakai Bearer token** untuk keamanan

## 🔄 Switch Back to Bearer Token Later

Saat backend sudah support Bearer token:

**Edit `.env.local`:**
```bash
# Change from basic to bearer
VITE_SATUSEHAT_MONITOR_AUTH_TYPE=bearer
```

**Or delete `.env.local` entirely** (bearer is default)

## 🐛 Still Not Working?

**Check console for errors:**

```javascript
// In browser console
console.log({
  authType: import.meta.env.VITE_SATUSEHAT_MONITOR_AUTH_TYPE,
  hasUser: !!import.meta.env.VITE_SATUSEHAT_MONITOR_BASIC_USER,
  hasPass: !!import.meta.env.VITE_SATUSEHAT_MONITOR_BASIC_PASS
})
```

**Expected output:**
```javascript
{
  authType: "basic",
  hasUser: true,
  hasPass: true
}
```

**If all false:**
- Make sure file is named exactly `.env.local` (not `.env.local.txt`)
- Make sure file is in project root
- Restart dev server

## 📚 More Info

For detailed explanation, see: `SATUSEHAT_MONITOR_FIX_NO_DATA.md`

---

That's it! Your SatuSehat Monitor should work now. 🎉
