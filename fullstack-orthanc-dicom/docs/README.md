# Fullstack Orthanc DICOM — API & Integration Documentation

This repository provides a secured, single-entry API gateway in front of multiple services: Authentication, Order Management, DICOM Modality Worklist (MWL) Writer, Accession API, SIMRS Bridge (SATUSEHAT), Modality Simulator, Orthanc Proxy & Web UI, and a DICOM Router.

All external access flows through the API Gateway on `http://localhost:8888`. This documentation explains exposed endpoints, headers, payload schemas, permissions, and example calls.

## Base URLs & Ports
- API Gateway: `http://localhost:8888`
- Orthanc Web UI: proxied via gateway at `http://localhost:8888/orthanc-ui/`
- Internal service URLs (behind gateway, for reference):
  - `AUTH_SERVICE_URL` → `http://auth-service:5000`
  - `MWL_SERVICE_URL` → `http://mwl-writer:8000`
  - `ORDER_SERVICE_URL` → `http://order-management:8001`
  - `ORTHANC_SERVICE_URL` → `http://orthanc-proxy:8043`
  - `ORTHANC_WEB_URL` → `http://orthanc:8042`
  - `ACCESSION_API_URL` → `http://accession-api:8180`
  - `SIMRS_BRIDGE_URL` → `http://simrs-bridge:8089`
  - DICOM Router (DICOM): `dicom-router:11112` (HTTP API forwarded to host `8380:8080`)

## Authentication & RBAC
- JWT HS256; `JWT_SECRET` required. Access token expiry `JWT_EXPIRATION_HOURS` (default 24 hours).
- Refresh tokens hashed and stored (`refresh_tokens` table), expiry `REFRESH_TOKEN_DAYS` (default 30 days).
- Role-based permissions (examples): `order:*`, `worklist:*`, `orthanc:read`, `orthanc:write`, `*` (admin).
- Gateway enforces per-route permissions; login and token verify do not require prior auth.

## Quick Start
1. Login: `POST /auth/login` → get `access_token` and `refresh_token`.
2. Create order: `POST /orders/create` → returns order details and accession number.
3. Optionally run complete flow: `POST /orders/complete-flow` → create order, sync to SATUSEHAT, create MWL.
4. Manage worklists: `POST /worklist/create`, `GET /worklist/list`, status updates, search.
5. Access Orthanc UI: `GET /orthanc-ui/` (public or basic-auth gated based on env).

## Rate Limits
- Global defaults: `1000/hour`, `60/minute` per IP.
- `POST /auth/login`: `5/minute` rate-limited.

## Table of Contents
- [Auth Service](./auth-service.md)
- [API Gateway](./api-gateway.md)
- [Orthanc UI & Gating](./orthanc-ui.md)
- [Order Management](./order-management.md)
- [MWL Writer](./mwl-writer.md)
- [Accession API](./accession-api.md)
- [SIMRS Bridge](./simrs-bridge.md)
- [Modality Simulator](./modality-simulator.md)
- [DICOM Router](./dicom-router.md)

## Notes
- Some endpoints advertised by Auth Service index (`/auth/refresh`, `/auth/logout`, `/auth/users`, `/auth/change-password`) are not yet implemented in code; see Auth Service doc.
- All services should be accessed via the gateway; direct container URLs are shown for operator reference only.