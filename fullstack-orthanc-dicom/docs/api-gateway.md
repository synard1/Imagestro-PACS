# API Gateway

Single entry point that proxies requests to internal services and enforces RBAC, rate limits, CORS, and Orthanc UI gating.

- Base: `http://localhost:8888`
- Env variables (examples): `AUTH_SERVICE_URL`, `MWL_SERVICE_URL`, `ORDER_SERVICE_URL`, `ORTHANC_SERVICE_URL`, `ORTHANC_WEB_URL`, `ACCESSION_API_URL`, `JWT_SECRET`, `ALLOW_ORTHANC_UI_PUBLIC`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
- Global rate limits: `1000/hour`, `60/minute` per IP. Additional limit: `POST /auth/login` → `5/minute`.

## Auth Routes

- `POST /auth/login` → Proxy to auth service. No prior auth required.
- `POST /auth/verify` → Proxy to auth service. No prior auth required.
- `POST /auth/register` → Requires `'*'` (admin).
- `GET|POST|PUT|DELETE /auth/<path>` → Requires valid JWT (RBAC enforced downstream).

## Worklist Routes (proxied to MWL Writer)

- `POST /worklist/create` → Requires `worklist:create` or `'*'`.
- `GET /worklist/list` → Requires `worklist:read` or `'*'`.
- `GET|POST|PUT|DELETE /worklist/<path>` → Requires `worklist:read` or `'*'`.

## Orders Routes (proxied to Order Management)

- `GET|POST|PUT|DELETE /orders/<path>` → Requires permission based on HTTP method:
  - `GET` → `order:read`
  - `POST` → `order:create`
  - `PUT` → `order:update`
  - `DELETE` → `order:delete`
  - Users with `'*'` bypass checks.

## Accession Routes (proxied to Accession API)

- `POST /accession/create` → Requires `accession:create` or `'*'`. Creates new accession number.
- `GET /accession/<accession_number>` → Requires `accession:read` or `'*'`. Retrieves accession details.
- `GET /accession/verify` → Requires `accession:read` or `'*'`. Verifies accession number integrity (query param: `an`).
- `POST /accession/hooks/missing-acc` → Requires `accession:admin` or `'*'`. Handles missing accession hook (admin only).
- `GET|POST|PUT|DELETE /accession/<path>` → Generic proxy with method-specific permissions:
  - `GET` → `accession:read`
  - `POST` → `accession:create`
  - `PUT` → `accession:update`
  - `DELETE` → `accession:delete`
  - Users with `'*'` bypass checks.

## Orthanc API & Web UI

- API proxy: `GET|POST|PUT|DELETE /orthanc/<path>` → Requires `orthanc:read` or `'*'`.
- Web UI: `GET /orthanc-ui`, `GET|POST|PUT|DELETE /orthanc-ui/<path>` → Direct proxy to `ORTHANC_WEB_URL` with optional basic auth gating. See [Orthanc UI & Gating](./orthanc-ui.md).
- Static assets: `GET /ui[/**]` and `GET /app[/**]` proxied; in non-public mode require basic auth.

## Headers and Forwarding

- Authorization: Gateway forwards `Authorization: Bearer <JWT>` to services when present.
- Body: JSON bodies are forwarded; query params preserved.
- Sensitive headers (`Host`, `Authorization`) are handled appropriately in Orthanc UI direct proxy.

## Example Calls

- Login:

```bash
curl -X POST http://localhost:8888/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@12345"}'
```

- Create worklist (requires `worklist:create`):

```bash
curl -X POST http://localhost:8888/worklist/create \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"patient_name":"Jane Doe","patient_id":"P123","accession_number":"ACC20251020001","modality":"CT"}'
```

- List orders (requires `order:read`):

```bash
curl -X GET 'http://localhost:8888/orders/list?status=SCHEDULED&limit=20&offset=0' \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

- Create accession number (requires `accession:create`):

```bash
curl -X POST http://localhost:8888/accession/create \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"facilityCode":"RSUD","modalityType":"CT","studyDescription":"CT Scan Abdomen"}'
```

- Get accession details (requires `accession:read`):

```bash
curl -X GET http://localhost:8888/accession/ACC20251020001 \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

- Verify accession number (requires `accession:read`):

```bash
curl -X GET 'http://localhost:8888/accession/verify?an=ACC20251020001' \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```
