# Auth Service

Authentication and user management with JWT, password hashing, audit logging, and RBAC. Exposed via the API Gateway (`/auth/...`).

- Base (internal): `http://auth-service:5000`
- Access via Gateway: `http://localhost:8888/auth/...`
- JWT: HS256, `JWT_SECRET` required; `JWT_EXPIRATION_HOURS` controls access token TTL; `REFRESH_TOKEN_DAYS` controls refresh TTL.

## Endpoints

### GET /health
- Response:
```json
{
  "status": "healthy",
  "database": "healthy|unhealthy",
  "timestamp": "2025-10-22T10:00:00.000Z"
}
```

### POST /auth/login
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "username": "admin", // or email
  "password": "Admin@12345"
}
```
- Success response:
```json
{
  "status": "success",
  "message": "Login successful",
  "access_token": "<JWT>",
  "refresh_token": "<opaque>",
  "token_type": "Bearer",
  "expires_in": 86400,
  "user": {
    "id": "<uuid>",
    "username": "admin",
    "email": "admin@example.com",
    "full_name": "Administrator",
    "role": "ADMIN",
    "permissions": ["*"]
  }
}
```
- Error responses: `400` (missing credentials), `401` (invalid credentials), `403` (inactive/locked account), `500` (server error).
- Notes: Gateway enforces `5/minute` rate limit.

### POST /auth/register
- Access: Admin-only via gateway (`'*'` permission).
- Headers: `Content-Type: application/json`
- Body fields: `username`, `email`, `password`, `full_name`, `role` (`ADMIN|DOCTOR|TECHNICIAN|RECEPTIONIST|VIEWER`).
- Behavior: Password strength check, bcrypt hash, insert to DB; error for existing username/email; assigns role and permissions based on `ROLES`.
- Success response example:
```json
{
  "status": "success",
  "message": "User created",
  "user": { "id": "<uuid>", "username": "jdoe", "role": "RECEPTIONIST" }
}
```

### POST /auth/verify
- Accepts token via `Authorization: Bearer <JWT>` or JSON body `{ "token": "<JWT>" }` or `{ "access_token": "<JWT>" }`.
- Response:
```json
{
  "status": "success",
  "valid": true,
  "payload": {
    "user_id": "<uuid>",
    "username": "admin",
    "role": "ADMIN",
    "permissions": ["*"]
  }
}
```
- Errors: `401` with messages `Missing token`, `Token expired`, or `Invalid token: ...`.

### GET /auth/me
- Headers: `Authorization: Bearer <JWT>`
- Response:
```json
{
  "status": "success",
  "user": {
    "id": "<uuid>",
    "username": "admin",
    "email": "admin@example.com",
    "full_name": "Administrator",
    "role": "ADMIN",
    "is_active": true,
    "created_at": "...",
    "last_login": "..."
  }
}
```

## Tokens
- Access token payload includes: `user_id`, `username`, `role`, `permissions`, `exp`, `iat`, `type: "access"`.
- Refresh tokens: opaque, bcrypt-hashed in `refresh_tokens` table with `expires_at`, `ip_address`, `user_agent`.
- Audit: events stored in `auth_audit_log` with `action` (`LOGIN`, etc.), `success`, `details`.

## Roles & Permissions
- `ADMIN`: `[*]`
- `DOCTOR`: `order:read`, `order:create`, `worklist:read`, `worklist:update`, `orthanc:read`
- `TECHNICIAN`: `worklist:read`, `worklist:update`, `worklist:scan`, `orthanc:read`, `orthanc:write`
- `RECEPTIONIST`: `order:read`, `order:create`, `worklist:create`, `worklist:read`, `worklist:search`
- `VIEWER`: `worklist:read`, `orthanc:read`

## Missing (Advertised but not Implemented)
The service index lists these routes, but no handlers exist yet:
- `POST /auth/refresh` — should accept `refresh_token`, validate against hashed store, return new `access_token` and rotated refresh token.
- `POST /auth/logout` — should revoke refresh tokens for the user (or specific token).
- `GET /auth/users` — admin-only list with pagination.
- `POST /auth/change-password` — verify current password, update hash, log audit.

## Examples
- Login:
```bash
curl -X POST http://localhost:8888/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@12345"}'
```
- Verify:
```bash
curl -X POST http://localhost:8888/auth/verify \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```
- Me:
```bash
curl -X GET http://localhost:8888/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```