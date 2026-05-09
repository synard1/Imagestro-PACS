# Order Management Service

Creates and manages imaging orders, provides listing and retrieval, and orchestrates end-to-end flows including SATUSEHAT sync and MWL creation. Access via API Gateway `/orders/...` with RBAC enforced.

- Base (internal): `http://order-management:8001`
- Access via Gateway: `http://localhost:8888/orders/...`

## Permissions via Gateway
- `GET` → `order:read`
- `POST` → `order:create`
- `PUT` → `order:update`
- `DELETE` → `order:delete`
- `'*'` (admin) bypasses checks.

## Endpoints

### POST /orders/create
- Headers: `Authorization: Bearer <JWT>`, `Content-Type: application/json`
- Body (SIMRS example):
```json
{
  "modality": "CT",
  "procedure_code": "CTABDOMEN",
  "procedure_name": "CTABDOMEN 0001",
  "scheduled_at": "2025-10-22T09:30:00Z",
  "patient_national_id": "1234567890123456",
  "patient_name": "John Doe",
  "gender": "male",
  "birth_date": "1990-01-01",
  "medical_record_number": "12345678",
  "ihs_number": "123456789",
  "registration_number": "RJ2025102300001"
}
```
- Behavior: Validates required fields, requests Accession from `ACCESSION_API_URL` (`POST /accession/create`), persists order aligned to unified schema, returns order detail and next steps.
- Success response (shape):
```json
{
  "status": "success",
  "order": {
    "id": "<uuid>",
    "order_number": "ORD20251022001",
    "accession_number": "CT.251022.000001",
    "modality": "CT",
    "procedure_code": "CTABDOMEN",
    "procedure_name": "CTABDOMEN 0001",
    "scheduled_at": "2025-10-22T09:30:00Z",
    "patient_national_id": "1234567890123456",
    "patient_name": "John Doe",
    "gender": "male",
    "birth_date": "1990-01-01",
    "medical_record_number": "12345678",
    "ihs_number": "123456789",
    "registration_number": "RJ2025102300001",
    "status": "CREATED"
  },
  "next": ["sync_to_satusehat", "create_worklist"]
}
```


### GET /orders/list
- Headers: `Authorization: Bearer <JWT>`
- Query params: `status`, `date_from`, `date_to`, `modality`, `limit` (default 20), `offset` (default 0)
- Response:
```json
{
  "status": "success",
  "orders": [ { /* summarized order fields */ } ],
  "count": 20,
  "total": 135,
  "limit": 20,
  "offset": 0
}
```

### GET /orders/<identifier>
- Headers: `Authorization: Bearer <JWT>`
- Path `identifier`: order `id` (UUID), `order_number`, or `accession_number`.
- Response:
```json
{
  "status": "success",
  "order": { /* full order detail */ }
}
```

### POST /orders/<identifier>/sync-satusehat
- Headers: `Authorization: Bearer <JWT>`, `Content-Type: application/json`
- Behavior: Creates FHIR `ServiceRequest` in SATUSEHAT using `ACCESSION_NUMBER` as identifier (`system` from env), returns SATUSEHAT response summary.
- Response (shape):
```json
{
  "status": "success",
  "service_request_id": "<fhir-id>",
  "identifier_system": "http://sys-ids.kemkes.go.id/accessionno/<ORG_IHS>",
  "upstream": { "status": 201, "x_request_id": "...", "url": ".../ServiceRequest" }
}
```

### POST /orders/<identifier>/create-worklist
- Headers: `Authorization: Bearer <JWT>`, `Content-Type: application/json`
- Behavior: Builds MWL payload from order and posts to MWL Writer; updates status to `SCHEDULED`.
- Response:
```json
{
  "status": "success",
  "worklist": {
    "worklist_id": "<uuid>",
    "filename": "ACC20251020001.wl",
    "accession_number": "ACC20251020001"
  }
}
```

### GET|POST /orders/complete-flow
- Headers: `Authorization: Bearer <JWT>`
- Behavior: Orchestrates the full flow: create order → sync to SATUSEHAT → create MWL. Returns a combined status and identifiers.
- Response:
```json
{
  "status": "success",
  "flow": {
    "order": { "status": "CREATED", "accession_number": "ACC..." },
    "satusehat": { "status": "OK", "service_request_id": "..." },
    "worklist": { "status": "OK", "worklist_id": "...", "filename": "..." }
  }
}
```

## Examples
- Create order:
```bash
curl -X POST http://localhost:8888/orders/create \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"P12345","patient_name":"Jane Doe","modality":"CT","procedure_code":"CTABDOMEN"}'
```
- Complete flow:
```bash
curl -X POST http://localhost:8888/orders/complete-flow \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"P12345","patient_name":"Jane Doe","modality":"CT","procedure_code":"CTABDOMEN"}'
```

## Environment Variables
- `ACCESSION_API_URL`: Base URL to Accession API or Gateway (default `http://accession-api:8180`). The service calls `POST /accession/create` here.