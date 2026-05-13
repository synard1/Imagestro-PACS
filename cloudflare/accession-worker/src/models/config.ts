/**
 * Accession configuration type definitions.
 *
 * Requirements: 2.1 (configurable format), 3A.1 (counter_backend option)
 */

/**
 * Tenant-level accession number generation configuration.
 * Stored in `tenant_settings` table under key `accession_config`.
 */
export interface AccessionConfig {
  /** Format pattern with token placeholders, e.g. "{ORG}-{YYYY}{MM}{DD}-{NNNN}" */
  pattern: string;
  /** When to reset the sequence counter */
  counter_reset_policy: 'DAILY' | 'MONTHLY' | 'NEVER';
  /** Padding length for sequence numbers (1-8) */
  sequence_digits: number;
  /** IANA timezone identifier for date computations, default "Asia/Jakarta" */
  timezone: string;
  /** Counter backend: D1 (default) or Durable Object for hot scopes */
  counter_backend: 'D1' | 'DURABLE_OBJECT';
  /** Organization code used for {ORG} token */
  orgCode?: string;
  /** Site/facility code used for {SITE} token */
  siteCode?: string;
  /** When true, maintains separate sequence counters per modality */
  useModalityInSeqScope?: boolean;
}

/**
 * Default configuration applied when a tenant has no stored `accession_config`.
 * Requirement 2.1: default pattern, DAILY reset, 4-digit sequence, Asia/Jakarta timezone.
 */
export const DEFAULT_ACCESSION_CONFIG: AccessionConfig = {
  pattern: '{ORG}-{YYYY}{MM}{DD}-{NNNN}',
  counter_reset_policy: 'DAILY',
  sequence_digits: 4,
  timezone: 'Asia/Jakarta',
  counter_backend: 'D1',
};
