# Patient Schema Correction

## Issue Identified

After re-analysis of the patient database schema, it was determined that the [registration_number](file://e:\Project\docker\fullstack-orthanc-dicom\simrs-order-ui\models.py#L178-L178) field was incorrectly placed in the patient table. As noted by the user, a patient can have multiple registrations/visits, making it inappropriate to store [registration_number](file://e:\Project\docker\fullstack-orthanc-dicom\simrs-order-ui\models.py#L178-L178) in the patient entity itself.

## Correction Made

The [registration_number](file://e:\Project\docker\fullstack-orthanc-dicom\simrs-order-ui\models.py#L178-L178) field has been removed from the patient table in all relevant schema definitions:

1. **PATIENT_DATABASE_SCHEMA.sql** - Main schema definition
2. **PATIENT_SCHEMA.md** - High-level schema overview
3. **PATIENT_SCHEMA_INTEGRATION.sql** - Integration script
4. **PATIENT_SCHEMA_INTEGRATION.md** - Integration plan
5. **PATIENT_SCHEMA_ERD.md** - Entity relationship diagram
6. **PATIENT_SCHEMA_DOCUMENTATION.md** - Detailed documentation

## Rationale

The corrected schema now properly reflects the relationship between patients and registrations:
- **Patient Table**: Contains static patient information that doesn't change between visits
- **Orders/Accessions Tables**: Contain visit-specific information including [registration_number](file://e:\Project\docker\fullstack-orthanc-dicom\simrs-order-ui\models.py#L178-L178)

This change ensures:
1. Proper data normalization
2. Accurate representation of patient visit history
3. Compliance with healthcare data modeling best practices
4. Support for patients with multiple registrations/visits

## Impact

This correction improves the data model by:
- Eliminating data redundancy
- Ensuring referential integrity
- Supporting better query performance
- Aligning with healthcare domain requirements

The existing services that currently use [registration_number](file://e:\Project\docker\fullstack-orthanc-dicom\simrs-order-ui\models.py#L178-L178) in their tables (orders, accessions, etc.) remain unchanged and will continue to function as expected.