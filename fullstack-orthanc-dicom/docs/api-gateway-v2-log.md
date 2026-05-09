
## 2026-05-04 - Feature: API Gateway v2 (Basic)
- Layers: Backend (API Gateway)
- Files: fullstack-orthanc-dicom/api-gateway-v2/src/index.ts
- Env vars: JWT_SECRET, POSTGRES_*, AUTH_SERVICE_URL
- Migrations: none
- Next: Implement proxy for other services (PACS, MWL, Order)

## 2026-05-04 - Deployment: API Gateway v2 (Remote)
- Host: 100.113.207.79:8889
- Status: DEPLOYED & VERIFIED
- Test Results: Login (200), Patients (200), Doctors (200), Procedures (200), Settings (200)
- Changes: Switched to @hono/node-server for Node.js compatibility. Added Dockerfile.
