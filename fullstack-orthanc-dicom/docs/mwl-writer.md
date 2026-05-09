# MWL Writer (DICOM Modality Worklist)

Creates DICOM worklist files and stores records in PostgreSQL. Protected by JWT with RBAC enforced in the API Gateway.

- Base (internal): `http://mwl-writer:8000`
- Access via Gateway: `http://localhost:8888/worklist/...`

## Permissions via Gateway
- `worklist:create` for creation
- `worklist:read` for listing and retrieval
- `worklist:update` for status updates (enforced downstream or via gateway proxy rules)
- `'*'` (admin) bypasses checks

## Endpoints

### POST /worklist/create
- Headers: `Authorization: Bearer <JWT>`, `Content-Type: application/json`
- Required fields: `patient_name`, `patient_id`, `accession_number`
- Optional fields: `modality`, `scheduled_at`, `issuer`, `procedure_code`, `note`
- Behavior: Validates input, creates DICOM worklist file (e.g., `ACC20251020001.wl`), inserts DB record with generated worklist UUID.
- Success response:
```json
{
  "status": "success",
  "message": "Worklist created",
  "worklist_id": "<uuid>",
  "filename": "ACC20251020001.wl",
  "accession_number": "ACC20251020001",
  "created_by": "<username>"
}
```
- Errors: `409` for duplicate accession numbers, `400`/`500` for validation/other errors.

### GET /worklist/list
- Headers: `Authorization: Bearer <JWT>`
- Query params: `status`, `date_from`, `date_to`, `limit` (default 20), `offset` (default 0)
- Response:
```json
{
  "status": "success",
  "worklists": [ { /* summarized worklist */ } ],
  "count": 20,
  "total": 120,
  "limit": 20,
  "offset": 0
}
```

### GET /worklist/<identifier>
- Headers: `Authorization: Bearer <JWT>`
- Path `identifier`: worklist UUID or `accession_number`
- Response:
```json
{
  "status": "success",
  "worklist": { /* full worklist detail */ }
}
```

### PUT /worklist/<identifier>/status
- Headers: `Authorization: Bearer <JWT>`, `Content-Type: application/json`
- Body:
```json
{ "status": "SCHEDULED|IN_PROGRESS|COMPLETED|CANCELLED" }
```
- Path `identifier`: worklist UUID or `accession_number`
- Response: success message and updated status.

### GET /worklist/search
- Headers: `Authorization: Bearer <JWT>`
- Query params: `patient_id`, `patient_name`, `modality`
- Response: list of matching worklists.

## Examples
- Create worklist:
```bash
curl -X POST http://localhost:8888/worklist/create \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"patient_name":"Jane Doe","patient_id":"P123","accession_number":"ACC20251020001","modality":"CT"}'
```
- Update status:
```bash
curl -X PUT http://localhost:8888/worklist/ACC20251020001/status \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"status":"COMPLETED"}'
```