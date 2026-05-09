Refactor Response Endpoint

This document outlines the changes made to the `mwl-writer` service to enrich the response of worklist endpoints and hide specific columns.

## Changes

1.  **Database Join**: Updated `list_worklists`, `get_worklist`, and `search_worklists` functions in `mwl-writer/mwl_writer_secured.py` to perform a `LEFT JOIN` with the `patients` table (from `master-data-service`).
    -   Join Condition: `w.patient_id = p.medical_record_number OR w.patient_id = p.patient_national_id`.

2.  **Field Population**:
    -   `gender`: Populated from `patients.gender` if `worklists.patient_sex` is missing. Mapped between 'male'/'female' and 'M'/'F'.
    -   `patient_national_id`: Populated from `patients.patient_national_id`. If missing and `patient_id` is a 16-digit number, it is heuristically used as NIK.
    -   `scheduled_at`: Constructed from `scheduled_date` (YYYYMMDD) and `scheduled_time` (HHMMSS) into a standard timestamp format (`YYYY-MM-DD HH:MM:SS`).

3.  **Column Hiding**: The following columns have been removed from the direct response of the `list_worklists`, `get_worklist`, and `search_worklists` endpoints:
    *   `scheduled_date`
    *   `scheduled_time`
    *   `record_status`
    *   `patient_id`
    *   `patient_birth_date`
    *   `filename`
    *   `study_instance_uid`
    *   `patient_sex`
    (Internal temporary fields `_scheduled_date_hidden`, `_scheduled_time_hidden`, `_patient_id_hidden`, `_patient_sex_hidden` are used for processing and then removed.)

4.  **New Column Added**:
    *   `patient_medical_record_number`: Added to the response, populated from `patients.medical_record_number`.

5.  **Consistency**: These changes have been applied consistently across `GET /worklists` (list), `GET /worklists/<id>` (detail), and `GET /worklist/search` (search) endpoints.

## Verification

The endpoint `GET /worklists` now returns JSON objects with the updated fields and hidden columns. A sample response snippet shows:
- `gender` is present.
- `patient_national_id` is present.
- `scheduled_at` is present.
- `patient_medical_record_number` is present.
- The removed fields are no longer visible in the response.

```json
{
  "accession_number": "CT.251106.000014",
  "created_at": "Thu, 06 Nov 2025 17:43:39 GMT",
  "gender": "male",
  "id": "69d779ca-b6a8-4c53-92da-706326437bb3",
  "modality": "CT",
  "patient_medical_record_number": "10000001",
  "patient_name": "Ardianto^Putra",
  "patient_national_id": "9271060312000001",
  "physician_name": null,
  "procedure_description": "CT Head with Contrast",
  "scheduled_at": "2025-11-07 16:00:00",
  "station_aet": "SCANNER01",
  "status": "SCHEDULED",
  "updated_at": "Thu, 06 Nov 2025 17:43:39 GMT"
}
```