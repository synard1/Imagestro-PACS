# Cloudflare Worker Deployment Guide

## Overview
This Cloudflare Worker acts as a reverse proxy between the Cloudflare Pages frontend and the backend API, solving the CORS and same-origin issues.

## Architecture
```
Browser (imagestro-pacs.pages.dev)
    ↓ POST /backend-api/auth/login
Cloudflare Worker (transparent proxy)
    ↓ POST https://dev-pacs-backend.satupintudigital.co.id/backend-api/auth/login
Backend API
    ↓ Response
Cloudflare Worker (adds CORS headers)
    ↓ Response
Browser (same origin - no CORS issues)
```

## Files Created
- `cloudflare/worker.js` - Worker script that proxies requests
- `cloudflare/wrangler.toml` - Worker configuration
- `public/_redirects` - Updated (commented out invalid proxy rules)

## Deployment Steps

### 1. Install Wrangler CLI (if not already installed)
```bash
npm install -g wrangler
```

### 2. Login to Cloudflare
```bash
wrangler login
```
This will open a browser window for authentication.

### 3. Deploy the Worker
```bash
cd E:\Project\Imagestro-PACS\cloudflare
wrangler deploy
```

### 4. Configure Routes in Cloudflare Dashboard

After deployment, you need to bind the Worker to your Pages domain:

**Option A: Via Cloudflare Dashboard (Recommended)**
1. Go to Cloudflare Dashboard → Workers & Pages
2. Click on your worker: `imagestro-pacs-proxy`
3. Go to **Settings** → **Triggers** → **Routes**
4. Add these routes:
   - `imagestro-pacs.pages.dev/backend-api/*`
   - `imagestro-pacs.pages.dev/api/*`
   - `imagestro-pacs.pages.dev/wado-rs/*`
5. Select your zone (domain)
6. Save

**Option B: Via Wrangler CLI**
```bash
wrangler deploy --route "imagestro-pacs.pages.dev/backend-api/*"
wrangler deploy --route "imagestro-pacs.pages.dev/api/*"
wrangler deploy --route "imagestro-pacs.pages.dev/wado-rs/*"
```

### 5. Commit and Push Changes
```bash
cd E:\Project\Imagestro-PACS
git add cloudflare/ public/_redirects
git commit -m "feat(cloudflare): add Worker proxy for backend API

- Create Cloudflare Worker to proxy /backend-api/*, /api/*, /wado-rs/*
- Worker acts as transparent reverse proxy to backend
- Solves CORS issues by maintaining same-origin behavior
- Comment out invalid _redirects proxy rules (Pages limitation)

Cloudflare Pages cannot proxy to external URLs with status 200.
Worker provides server-side proxying like nginx proxy_pass."

git push origin main
```

### 6. Test the Deployment

After Worker is deployed and routes are configured:

1. Open `https://imagestro-pacs.pages.dev`
2. Open DevTools → Network tab
3. Try to login
4. Check the request to `/backend-api/auth/login`:
   - Should return 200 OK (or 401 if credentials wrong)
   - Should NOT have 307 redirect
   - Should NOT have CORS errors
   - Origin should stay `imagestro-pacs.pages.dev`

## Verification Checklist

- [ ] Worker deployed successfully
- [ ] Routes configured in Cloudflare Dashboard
- [ ] `_redirects` file updated (invalid rules commented out)
- [ ] Changes committed and pushed to GitHub
- [ ] Cloudflare Pages rebuilt (automatic after push)
- [ ] Login works without CORS errors
- [ ] No 307 redirects in Network tab
- [ ] Layout matches remote server

## Troubleshooting

### Worker not intercepting requests
- Check routes are configured correctly in Dashboard
- Verify route pattern matches exactly: `imagestro-pacs.pages.dev/backend-api/*`
- Check Worker logs in Dashboard → Workers & Pages → [worker] → Logs

### Still getting CORS errors
- Verify Worker is deployed and active
- Check Worker logs for errors
- Ensure backend ALLOWED_ORIGINS includes `https://imagestro-pacs.pages.dev`

### 405 Method Not Allowed
- Worker routes not configured yet
- Deploy Worker first, then configure routes

### Backend connection errors (502)
- Check backend URL is correct in `worker.js`
- Verify backend is accessible from Cloudflare network
- Check Worker logs for detailed error messages

## Monitoring

View Worker logs:
```bash
wrangler tail
```

Or in Cloudflare Dashboard:
- Workers & Pages → [worker] → Logs → Real-time Logs

## Cost
Cloudflare Workers Free Tier:
- 100,000 requests/day
- 10ms CPU time per request
- Should be sufficient for development/testing

## Next Steps After Deployment

1. Monitor Worker logs during first login test
2. Verify authentication flow works end-to-end
3. Test other API endpoints (studies, patients, etc.)
4. Consider adding caching in Worker for static assets
5. Monitor Worker usage in Cloudflare Dashboard

## Alternative: Cloudflare Pages Functions

If you prefer not to use a separate Worker, you can use Cloudflare Pages Functions:
- Create `functions/backend-api/[[path]].js`
- Similar proxy logic but integrated with Pages
- Automatically deployed with Pages build
- No separate Worker deployment needed

Let me know if you want to explore this alternative approach.
