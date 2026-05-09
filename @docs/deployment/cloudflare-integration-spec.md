# Integration Specification: Cloudflare Pages + Remote Backend

## Overview
This document specifies the configuration required to deploy the React frontend to Cloudflare Pages and integrate it with the remote API Gateway backend.

## 1. Frontend: Cloudflare Pages Proxy (`public/_redirects`)
Cloudflare Pages uses a `_redirects` file to handle routing. To maintain the same-origin behavior for the frontend, we use a `200` status code to proxy requests.

**File Location:** `public/_redirects` (Must be in the build output directory)

**Content:**
```text
# --- API Proxying ---
# Proxy all frontend requests to the remote API Gateway
# Format: [path] [destination] [status]

/api/*          https://api-pacs.hospital.com/api/:splat          200
/backend-api/*  https://api-pacs.hospital.com/backend-api/:splat  200
/wado-rs/*      https://api-pacs.hospital.com/wado-rs/:splat      200

# --- SPA Routing ---
# Ensure all other requests return index.html for client-side routing
/*              /index.html                                       200
```

## 2. Backend: CORS & API Gateway Configuration
The backend must be updated to accept requests from the new frontend origin and resolve the environment variable mismatch in `api-gateway`.

### 2.1 Environment File (`.env`)
Update the remote `.env` to include the production and preview domains.
```env
CORS_ALLOWED_ORIGINS=https://pacs.hospital.com,https://pacs-ui.pages.dev
```

### 2.2 Docker Configuration (`docker-compose.yml`)
Modify the `api-gateway` service to correctly map the `ALLOWED_ORIGINS` variable expected by `api_gateway.py`.

```yaml
  api-gateway:
    # ...
    environment:
      # Fix mismatch: api_gateway.py reads ALLOWED_ORIGINS
      ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS}
      # Maintain for other services
      CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS}
    # ...
```

## 3. Domain & DNS Strategy
| Component | Destination | Record Type |
|-----------|-------------|-------------|
| Frontend (Primary) | Cloudflare Pages | CNAME (`pacs.hospital.com`) |
| Backend API | 100.113.207.79 | A / CNAME (`api-pacs.hospital.com`) |

## 4. Security Considerations
- **No Wildcards**: `ALLOWED_ORIGINS` must never be set to `*` as the gateway supports credentials.
- **SSL/TLS**: All traffic must use HTTPS. Cloudflare handles this for the frontend; the backend server should have a valid certificate (e.g., via Let's Encrypt/Nginx) or be accessed via a secure tunnel.
- **Token Handling**: Proxied requests will automatically include the `Authorization` header.

## 5. Deployment Checklist
1. [ ] Point `api-pacs.hospital.com` to the remote server IP.
2. [ ] Update `.env` on the remote server with the new frontend domain.
3. [ ] Update `docker-compose.yml` on the remote server with the `ALLOWED_ORIGINS` mapping.
4. [ ] Run `docker compose up -d api-gateway` on the remote server.
5. [ ] Create `public/_redirects` in the local repository.
6. [ ] Deploy the frontend to Cloudflare Pages.
7. [ ] Verify cross-origin requests in the browser console.
