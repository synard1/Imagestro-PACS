# Order Management Service – Order Update API

## Endpoint

- `PUT /orders/{identifier}`

where `{identifier}` is one of:

- `id` (UUID)
- `accession_number`
- `order_number`

Example:

- `PUT /orders/c42a688b-d214-4fd4-b1e4-3db87052518a`
- `PUT /orders/2025110600002.001`
- `PUT /orders/ORD2025110700001`

---

## Authentication

- Header: `Authorization: Bearer <JWT>`

Error responses:

- Missing/invalid header:
  - `401 Unauthorized`
  - `{"status":"error","message":"Missing or invalid authorization header"}`
- Invalid/expired token:
  - `401 Unauthorized`
  - `{"status":"error","message":"Invalid or expired token"}`

(Concrete message may vary slightly depending on verification branch.)

---

## Semantics

- Partial update:
  - Only fields provided in the request body are considered for update.
- Immutable/critical fields are protected.
- Unknown or unsupported fields cause a `400` with an explanation.
- Some commonly used aliases are mapped to canonical column names.
- JSON fields are persisted correctly.

---

## Protected (Non-updatable) Fields

These MUST NOT be updated via this endpoint.
If sent, they are treated as invalid and will trigger `400`:

- `id`
- `order_number`
- `accession_number`
- `created_at`
- `updated_at`
- `satusehat_service_request_id`

Rationale: identity, audit timestamps, and SATUSEHAT linkage are managed by the system.

---

## Supported Aliases

The API accepts certain frontend-friendly names and maps them internally:

- `requested_procedure` → `procedure_name`
- `station_ae_title` → `ordering_station_aet`
- `scheduled_start_at` → `scheduled_at`

Notes:

- `accession_no` is intentionally NOT mapped for updates
  (accession_number is treated as immutable once issued).

If you use these aliases and other fields are valid, the update will succeed.

---

## Auto-Mapping Feature

The frontend OrderForm component automatically handles field mapping between frontend and backend:

- Automatically excludes protected fields (`id`, `accession_no`, etc.)
- Maps frontend aliases to backend canonical names:
  - `requested_procedure` → `procedure_name`
  - `station_ae_title` → `ordering_station_aet`
  - `scheduled_start_at` → `scheduled_at`
- Properly formats datetime fields
- Handles metadata fields correctly

This ensures all updates comply with the API specification without manual intervention.

---

## Updatable Fields (Canonical)

Below are the main `orders` table fields that can be updated
(assuming they exist in your schema and are not protected):

Patient / Encounter:

- `patient_id` (UUID)
  - Reference to `patients` table. Use only if you know the correct UUID.
- `patient_national_id` (e.g. NIK)
- `patient_name`
- `gender`
- `birth_date` (`YYYY-MM-DD`)
- `patient_phone`
- `patient_address`
- `medical_record_number`
- `satusehat_ihs_number`
- `registration_number`
- `satusehat_encounter_id`

Order / Procedure:

- `modality` (e.g. `CT`, `MR`, `CR`, etc.)
- `procedure_code`
- `procedure_name`
- `procedure_description`
- `referring_doctor`
- `ordering_physician_name`
- `performing_physician_name`
- `ordering_station_aet`
- `scheduled_at`
  - Recommended: `YYYY-MM-DDTHH:MM:SS` (ISO 8601)
  - Also accepted (Postgres-native): `YYYY-MM-DD HH:MM:SS`
- `clinical_indication`
- `clinical_notes`

Status Fields:

- `status`
  - High-level order status (e.g. `CREATED`, `CANCELLED`, etc.)
- `order_status`
- `worklist_status`
- `imaging_status`
- `satusehat_synced` (bool)
- `satusehat_sync_date` (timestamp)

Organizational:

- `org_id`
  - Type/semantics depend on schema (UUID or text). Use with care.

JSON / Metadata:

- `details` (JSONB)
- `metadata` (JSON/JSONB, if such column exists in your DB)

For JSON fields, the service uses `psycopg2.extras.Json` to store them correctly.

---

## Validation Behavior

The update logic performs these steps:

1. Resolve order by:
   - `id` as UUID, or
   - `accession_number` / `order_number`.

2. For each field in request body:
   - If it is an alias, convert to the canonical field name.
   - If it is in the protected list:
     - Mark as invalid.
   - Else if the canonical field does not exist in the fetched row:
     - Mark as invalid.
   - Else:
     - Add to the SQL `SET` clause.
     - If field is JSON (`details`, `metadata`), encode with `Json(...)`.

3. If `invalid_fields` is non-empty:
   - Return `400 Bad Request` with:
     - `status: "error"`
     - `message`: explanation
     - `invalid_fields`: list of rejected keys from request
     - `allowed_fields`: list of valid updatable columns
     - `hint`: alias usage guidance

4. If there are no valid fields at all:
   - Return `400 Bad Request`:
     - `{"status":"error","message":"No valid fields to update"}`

5. If there are valid fields and no invalid fields:
   - Execute update.
   - Always set `updated_at = CURRENT_TIMESTAMP`.
   - Write audit log (`ORDER_UPDATED`).
   - Return `200 OK`:
     - `{"status":"success","message":"Order updated successfully","order_id":"...","accession_number":"..."}`

---

## Error Response Examples

1. Unknown / Not allowed fields

Request:

```http
PUT /orders/{id}
Content-Type: application/json

{
  "accession_no": "2025110600002.001",
  "foo": "bar",
  "requested_procedure": "CT Head with Contrast"
}
```

Response:

```json
{
  "status": "error",
  "message": "Some fields are not allowed or not recognized for update",
  "invalid_fields": ["accession_no", "foo"],
  "allowed_fields": [
    "modality",
    "procedure_code",
    "procedure_name",
    "procedure_description",
    "referring_doctor",
    "ordering_physician_name",
    "performing_physician_name",
    "ordering_station_aet",
    "scheduled_at",
    "patient_national_id",
    "patient_name",
    "gender",
    "birth_date",
    "patient_phone",
    "patient_address",
    "medical_record_number",
    "satusehat_ihs_number",
    "registration_number",
    "status",
    "order_status",
    "worklist_status",
    "imaging_status",
    "clinical_indication",
    "clinical_notes",
    "satusehat_encounter_id",
    "satusehat_synced",
    "satusehat_sync_date",
    "org_id",
    "patient_id",
    "details",
    "metadata"
  ],
  "hint": "Use canonical column names or supported aliases: requested_procedure→procedure_name, station_ae_title→ordering_station_aet, scheduled_start_at→scheduled_at"
}
```

2. No valid fields

```json
{
  "status": "error",
  "message": "No valid fields to update"
}
```

---

## Correct Usage Examples

1. Update using canonical fields

```http
PUT /orders/c42a688b-d214-4fd4-b1e4-3db87052518a
Content-Type: application/json
Authorization: Bearer <token>

{
  "patient_name": "Ardianto Putra",
  "procedure_name": "CT Head with Contrast",
  "ordering_station_aet": "CT_ROOM1",
  "scheduled_at": "2025-11-07T09:00:00",
  "status": "CREATED"
}
```

2. Update using supported aliases

```http
PUT /orders/c42a688b-d214-4fd4-b1e4-3db87052518a
Content-Type: application/json
Authorization: Bearer <token>

{
  "patient_name": "Ardianto Putra",
  "requested_procedure": "CT Head with Contrast",
  "station_ae_title": "CT_ROOM1",
  "scheduled_start_at": "2025-11-07T09:00:00",
  "status": "CREATED"
}
```

3. Update JSON details

```http
PUT /orders/c42a688b-d214-4fd4-b1e4-3db87052518a
Content-Type: application/json
Authorization: Bearer <token>

{
  "details": {
    "note": "Updated from UI",
    "source": "simrs-order-ui"
  }
}
```

---

## Notes

- Backend uses the actual columns present in `orders` at runtime. If your schema differs,
  `allowed_fields` in the error response reflects the real updatable columns on that environment.
- Avoid updating `patient_id`, `org_id`, or SATUSEHAT-related fields unless you fully understand
  the implications, as they are part of cross-service relations and audit trails.