# Modality Simulator

Simulates a medical imaging device by querying worklists and sending DICOM images to a DICOM Router.

- Base (internal): `http://modality-simulator:8090`
- Access via Gateway: `http://localhost:8888` if proxied (check compose `ENABLE_MODALITY_SIMULATOR`).

## Endpoints

### GET /health
- Response: service health status.

### POST /worklist/query
- Headers: `Content-Type: application/json`
- Body (filters, optional):
```json
{
  "patient_name": "DOE^JANE",
  "patient_id": "P123",
  "accession_number": "ACC20251020001",
  "date": "2025-10-22",
  "modality": "CT"
}
```
- Behavior: Performs DICOM C-FIND against Orthanc for MWL items based on provided filters.
- Response: list of matching worklist items with relevant DICOM tags.

### POST /scan/simulate
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "patient": {
    "id": "P123",
    "name": "Jane Doe",
    "sex": "F",
    "dob": "1990-01-01"
  },
  "study": {
    "accession_number": "ACC20251020001",
    "description": "CT Abdomen",
    "date": "2025-10-22"
  },
  "series": { "modality": "CT", "number": 1 },
  "instance": { "number": 1 },
  "router": { "host": "dicom-router", "port": 11112 }
}
```
- Behavior: Generates a synthetic DICOM image and sends via C-STORE to configured DICOM Router.
- Response: status of send and identifiers.

## Notes
- Ensure Orthanc and DICOM Router are reachable from the simulator container/network.
- Use the simulator to validate end-to-end C-FIND and C-STORE flows.