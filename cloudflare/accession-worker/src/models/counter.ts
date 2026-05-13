/**
 * Counter scope and increment result type definitions.
 *
 * Requirements: 2.12, 3A.1 (Counter_Scope definition and Durable Object fallback)
 */

/**
 * Defines the boundary for sequence number generation.
 * Maps to the composite primary key of the `accession_counters` table.
 */
export interface CounterScope {
  /** Tenant identifier */
  tenantId: string;
  /** Facility code */
  facilityCode: string;
  /** Modality code, or empty string if not scoped by modality */
  modality: string;
  /** Date bucket: 'YYYYMMDD' (daily), 'YYYYMM' (monthly), or 'ALL' (never reset) */
  dateBucket: string;
}

/**
 * Result of an atomic counter increment operation.
 * Supports both single and batch (range reservation) increments.
 */
export interface IncrementResult {
  /** First sequence number in the reserved range (inclusive) */
  startValue: number;
  /** Last sequence number in the reserved range (inclusive) */
  endValue: number;
}
