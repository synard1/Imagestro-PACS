# Orthanc UI & Gating

The gateway provides a controlled access layer to the Orthanc Web UI and selected API endpoints. Behavior is controlled by environment variables.

## Modes
- `ALLOW_ORTHANC_UI_PUBLIC=true` (default):
  - Allowed methods anywhere: `GET`, `HEAD`, `OPTIONS`.
  - Allowed `POST` only for `tools/find` and `tools/lookup`.
  - Other `POST|PUT|DELETE` return `403 Operation not allowed in public mode`.
- `ALLOW_ORTHANC_UI_PUBLIC=false`:
  - Requires HTTP Basic Auth to access `/orthanc-ui`, `/ui`, `/app`, and the minimal API set.
  - Credentials: `ADMIN_USERNAME` and `ADMIN_PASSWORD` (gateway-level check).
  - The proxy authenticates to Orthanc with `ORTHANC_USERNAME`/`ORTHANC_PASSWORD`.

## Endpoints
- Web UI root: `GET /orthanc-ui` and `GET /orthanc-ui/`
- Web UI passthrough: `GET|POST|PUT|DELETE /orthanc-ui/<path>`
- Static assets: `GET /ui[/**]`, `GET /app[/**]`
- Minimal API set proxied via `_proxy_orthanc_direct`:
  - `GET /system`, `GET /statistics`, `GET|POST /tools[/**]`
  - `GET /instances[/**]`, `GET /studies[/**]`, `GET /series[/**]`, `GET /patients[/**]`
  - `GET /changes`, `GET /peers[/**]`, `GET /modalities[/**]`, `GET /plugins[/**]`, `GET /jobs[/**]`

## Example (Public Mode)
```bash
curl -X GET http://localhost:8888/system
curl -X POST http://localhost:8888/tools/find -d '{"Level":"Study","Query":{"PatientName":"DOE^JANE"}}' \
  -H "Content-Type: application/json"
```

## Example (Non-Public Mode)
```bash
curl -X GET http://localhost:8888/system \
  -u admin:Admin@12345
```

## Notes
- The gateway filters sensitive headers when proxying to Orthanc (`Host`, `Authorization`).
- For full Orthanc API access with JWT and RBAC, use `GET|POST|PUT|DELETE /orthanc/<path>` which requires `orthanc:read` or `'*'`.