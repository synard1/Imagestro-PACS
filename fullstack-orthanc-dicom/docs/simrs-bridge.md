# SIMRS Bridge (SATUSEHAT)

Bridges local order flow to SATUSEHAT FHIR by generating accession numbers and posting `ServiceRequest` with proper identifiers.

- Base (internal): `http://simrs-bridge:8089`
- Access via Gateway: proxied through `http://localhost:8888` when enabled in compose
- Env: `SATUSEHAT_BASE`, `CLIENT_ID`, `CLIENT_SECRET`, `ORG_IHS`, `REQUESTER_REF`, `PERFORMER_REF`, `ACSN_SYSTEM_BASE`, `ACCESSION_API`

## Endpoints

### GET /health
- Response:
```json
{ "status": "healthy" }
```

### POST /api/orders
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "patientId": "100000030009",        // Patient resource ID only
  "encounterId": "<uuid>",            // Encounter resource ID
  "loincCode": "12345-6",             // LOINC code
  "modality": "CT",
  "note": "Optional note"
}
```
- Flow:
  1) Request accession number from Accession API (`POST /api/accessions`).
  2) Obtain SATUSEHAT OAuth2 token using `CLIENT_ID`/`CLIENT_SECRET`.
  3) Build FHIR `ServiceRequest`:
     - `identifier.system` = `${ACSN_SYSTEM_BASE}/${ORG_IHS}`
     - `identifier.value` = accession number
     - `requester` = `REQUESTER_REF`, `performer` = `PERFORMER_REF`
     - `authoredOn`: current UTC minus 60s (no microseconds)
  4) POST to `FHIR_BASE/ServiceRequest` with `Authorization: Bearer <token>`.
- Success response:
```json
{
  "service_request_id": "<id>",
  "accession_number": "ACC...",
  "identifier_system": "http://sys-ids.kemkes.go.id/accessionno/<ORG_IHS>",
  "upstream": { "status": 201, "x_request_id": "...", "url": ".../ServiceRequest" }
}
```
- Error response (SATUSEHAT rejection):
```json
{
  "error": "ServiceRequest rejected by SATUSEHAT",
  "upstream": {
    "status": 4xx|5xx,
    "reason": "...",
    "x_request_id": "...",
    "url": "...",
    "body_snippet": "OperationOutcome or body snippet"
  },
  "sent": { /* the ServiceRequest JSON posted */ }
}
```
- Response headers include:
  - `X-Upstream-Request-ID`, `X-Upstream-Status`, `X-Upstream-URL`, `X-Accession-Number`.

## Examples
```bash
curl -X POST http://localhost:8888/api/orders \
  -H "Content-Type: application/json" \
  -d '{"patientId":"100000030009","encounterId":"<uuid>","loincCode":"12345-6","modality":"CT"}'
```

## Notes
- `CLIENT_ID`/`CLIENT_SECRET` must be configured; otherwise a `500` is raised.
- Accession API errors propagate as `502` with upstream details.
- Token caching reduces OAuth calls; expiry tracked internally.