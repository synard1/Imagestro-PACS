/**
 * Accession record type definitions matching the D1 schema.
 *
 * Requirements: 8.1 (D1 accessions table schema)
 */

import type { Modality } from '../types';

/**
 * Represents a row in the `accessions` D1 table.
 * All columns map 1:1 to the schema defined in migrations/0001_initial_schema.sql.
 */
export interface AccessionRecord {
  /** UUID v7 primary key (time-ordered) */
  id: string;
  /** Tenant identifier extracted from JWT */
  tenant_id: string;
  /** Generated or externally-supplied accession number */
  accession_number: string;
  /** SATUSEHAT issuer URI */
  issuer: string | null;
  /** Facility code for the accession */
  facility_code: string | null;
  /** Imaging modality (CT, MR, CR, etc.) */
  modality: Modality;
  /** Patient NIK - 16 numeric characters */
  patient_national_id: string;
  /** Patient full name */
  patient_name: string;
  /** Patient IHS number (P + 11 digits) */
  patient_ihs_number: string | null;
  /** Patient date of birth (YYYY-MM-DD) */
  patient_birth_date: string | null;
  /** Patient sex */
  patient_sex: 'male' | 'female' | 'other' | 'unknown' | null;
  /** Medical record number */
  medical_record_number: string | null;
  /** Procedure code */
  procedure_code: string | null;
  /** Procedure name/description */
  procedure_name: string | null;
  /** Scheduled examination time (ISO 8601) */
  scheduled_at: string | null;
  /** Free-text note */
  note: string | null;
  /** Origin of the accession: 'internal' (generated) or 'external' (SIMRS-supplied) */
  source: 'internal' | 'external';
  /** Record creation timestamp (ISO 8601) */
  created_at: string;
  /** Soft-delete timestamp (ISO 8601), NULL if active */
  deleted_at: string | null;
}
