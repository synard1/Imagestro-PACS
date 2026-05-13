/**
 * Audit record type definitions for accession mutations.
 *
 * Requirements: 7A.4 (audit logging for PATCH/DELETE), 8.2 (accession_audit table schema)
 */

/**
 * Represents a row in the `accession_audit` D1 table.
 * Every PATCH or DELETE operation on an accession creates an audit entry.
 */
export interface AuditRecord {
  /** UUID v7 primary key */
  id: string;
  /** Reference to the accession being modified */
  accession_id: string;
  /** Tenant identifier for isolation */
  tenant_id: string;
  /** User ID or service name from JWT (sub claim) */
  actor: string;
  /** Type of mutation performed */
  action: 'UPDATE' | 'DELETE';
  /** JSON-encoded diff of changes (stringified object) */
  changes: string;
  /** Timestamp of the audit event (ISO 8601) */
  created_at: string;
}
