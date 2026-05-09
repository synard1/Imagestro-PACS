# Panduan Testing Keamanan

## Quick Test - Development Mode

### 1. Start Development Server
```bash
npm run dev
```

### 2. Test Debug Storage (Development Only)

**Sebagai Superadmin**:
1. Login dengan user superadmin
2. Buka menu Tools → Cek ada "Debug Storage (Dev)"
3. Klik menu atau akses `/debug-storage`
4. ✅ **Expected**: Halaman debug terbuka, bisa lihat data localStorage

**Sebagai User Biasa**:
1. Login dengan user non-admin
2. Akses `/debug-storage` langsung via URL
3. ✅ **Expected**: Redirect ke halaman Unauthorized (403)

**Tanpa Login**:
1. Logout atau akses dalam incognito mode
2. Akses `/debug-storage` langsung via URL
3. ✅ **Expected**: Redirect ke `/login`

### 3. Test Protected Routes

**Test `/settings`**:
```
1. Logout
2. Akses: http://localhost:5173/settings
3. ✅ Expected: Redirect ke /login
4. Login → redirect kembali ke /settings
```

**Test `/profile`**:
```
1. Logout
2. Akses: http://localhost:5173/profile
3. ✅ Expected: Redirect ke /login
4. Login → redirect kembali ke /profile
```

**Test `/dicom-viewer`**:
```
1. Logout
2. Akses: http://localhost:5173/dicom-viewer
3. ✅ Expected: Redirect ke /login
4. Login dengan user tanpa permission study.view
5. ✅ Expected: Halaman Unauthorized
6. Login dengan user yang punya permission study.view
7. ✅ Expected: Halaman viewer terbuka
```

## Quick Test - Production Build

### 1. Build untuk Production
```bash
npm run build
```

### 2. Preview Production Build
```bash
npm run preview
```

### 3. Test Debug Storage di Production

**Cek Menu**:
1. Login sebagai superadmin
2. Buka menu Tools
3. ✅ **Expected**: Menu "Debug Storage (Dev)" **TIDAK ADA**

**Cek Route**:
1. Akses: `http://localhost:4173/debug-storage`
2. ✅ **Expected**: Halaman 404 (Not Found)

**Cek Console**:
1. Buka DevTools → Console
2. Tidak ada error tentang DebugStorage component
3. ✅ **Expected**: Component tidak di-load sama sekali

### 4. Verify Environment
```bash
# Di browser console
console.log(import.meta.env.MODE)  // "production"
console.log(import.meta.env.PROD)  // true
console.log(import.meta.env.DEV)   // false
```

## Test Matrix

| Route | Tidak Login | User Biasa | Admin | Dev Mode | Prod Mode |
|-------|------------|------------|-------|----------|-----------|
| `/login` | ✅ Allow | ✅ Allow | ✅ Allow | ✅ | ✅ |
| `/dashboard` | ❌ → Login | ✅ Allow* | ✅ Allow | ✅ | ✅ |
| `/settings` | ❌ → Login | ✅ Allow | ✅ Allow | ✅ | ✅ |
| `/profile` | ❌ → Login | ✅ Allow | ✅ Allow | ✅ | ✅ |
| `/debug-storage` | ❌ → Login | ❌ → 403 | ✅ Allow | ✅ | ❌ 404 |
| `/dicom-viewer` | ❌ → Login | ✅/❌** | ✅ Allow | ✅ | ✅ |

*\* Tergantung permissions*
*\*\* Tergantung permissions (study.view)*

## Automated Test Script

Buat file `test-security.js`:

```javascript
// test-security.js
const routes = [
  '/settings',
  '/profile',
  '/debug-storage',
  '/dicom-viewer',
  '/dicom-viewer-demo',
  '/dicom-uid-generator'
];

async function testRoute(url) {
  try {
    const response = await fetch(url);
    console.log(`${url}: ${response.status} ${response.statusText}`);
    return response.status;
  } catch (error) {
    console.error(`${url}: Error - ${error.message}`);
    return null;
  }
}

async function runTests() {
  console.log('Testing Production Build...\n');

  for (const route of routes) {
    const url = `http://localhost:4173${route}`;
    await testRoute(url);
  }
}

runTests();
```

Run dengan:
```bash
node test-security.js
```

## Manual Checklist

### Development Mode ✓
- [ ] Debug Storage menu terlihat di Tools
- [ ] Superadmin bisa akses /debug-storage
- [ ] User biasa tidak bisa akses /debug-storage (403)
- [ ] Tanpa login redirect ke /login
- [ ] Semua protected routes redirect ke login jika tidak auth

### Production Mode ✓
- [ ] Debug Storage menu **TIDAK** terlihat
- [ ] Akses /debug-storage return **404**
- [ ] No errors di console tentang DebugStorage
- [ ] Semua protected routes masih berfungsi
- [ ] Login redirect berfungsi dengan baik

## Common Issues & Solutions

### Issue 1: Debug Storage masih terlihat di production
**Solution**:
```bash
# Clear cache
rm -rf node_modules/.vite
rm -rf dist
npm run build
npm run preview
```

### Issue 2: Protected route tidak redirect
**Solution**:
- Cek localStorage untuk token: `localStorage.getItem('authToken')`
- Cek console untuk error messages
- Verify ProtectedRoute wrapper ada di route definition

### Issue 3: Unauthorized page muncul untuk admin
**Solution**:
- Cek role user: `localStorage.getItem('currentUser')`
- Verify permissions di user object
- Cek console log dari ProtectedRoute

## Debug Commands

```javascript
// Di browser console

// 1. Cek current user
console.log(JSON.parse(localStorage.getItem('currentUser')))

// 2. Cek auth token
console.log(localStorage.getItem('authToken'))

// 3. Cek environment
console.log({
  mode: import.meta.env.MODE,
  dev: import.meta.env.DEV,
  prod: import.meta.env.PROD
})

// 4. Cek all localStorage keys
console.log(Object.keys(localStorage))

// 5. Clear auth (force re-login)
localStorage.removeItem('authToken')
localStorage.removeItem('currentUser')
window.location.reload()
```

## Success Criteria

✅ **Development**: Debug Storage accessible only to superadmin
✅ **Production**: Debug Storage completely hidden (404)
✅ **All Modes**: Protected routes redirect to login
✅ **All Modes**: Permission system works correctly
✅ **All Modes**: Login redirect preserves intended destination

## Next Steps

Setelah semua test passed:
1. Commit changes ke git
2. Deploy ke staging environment
3. Re-run tests di staging
4. Deploy ke production
5. Monitor logs untuk unauthorized access attempts
