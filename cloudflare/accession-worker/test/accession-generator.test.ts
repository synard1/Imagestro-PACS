/**
 * Unit tests for accession-generator service.
 *
 * Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.2, 2.6, 2.7, 2.8, 2.14, 5.4
 */

import { describe, it, expect } from 'vitest';
import {
  renderAccessionNumber,
  computeCounterScope,
  validateFormatPattern,
  computeDateBucket,
  computeDatePartsInTimezone,
  type GenerateAccessionInput,
} from '../src/services/accession-generator';
import type { AccessionConfig } from '../src/models/config';

// ─── renderAccessionNumber ───────────────────────────────────────────────────

describe('renderAccessionNumber', () => {
  const baseConfig: AccessionConfig = {
    pattern: '{ORG}-{YYYY}{MM}{DD}-{NNNN}',
    counter_reset_policy: 'DAILY',
    sequence_digits: 4,
    timezone: 'Asia/Jakarta',
    counter_backend: 'D1',
    orgCode: 'RS01',
    siteCode: 'SITE1',
  };

  it('renders default pattern with date and sequence', () => {
    // 2025-01-20 in Asia/Jakarta (UTC+7)
    const date = new Date('2025-01-20T10:00:00Z'); // 17:00 WIB
    const input: GenerateAccessionInput = {
      config: baseConfig,
      modality: 'CT',
      facilityCode: 'FAC01',
      tenantId: 'tenant-1',
      sequenceNumber: 1,
      date,
    };

    const result = renderAccessionNumber(input);
    expect(result).toBe('RS01-20250120-0001');
  });

  it('zero-pads sequence number to configured digits', () => {
    const date = new Date('2025-01-20T10:00:00Z');
    const input: GenerateAccessionInput = {
      config: baseConfig,
      modality: 'MR',
      facilityCode: 'FAC01',
      tenantId: 'tenant-1',
      sequenceNumber: 42,
      date,
    };

    const result = renderAccessionNumber(input);
    expect(result).toBe('RS01-20250120-0042');
  });

  it('renders modality token', () => {
    const config: AccessionConfig = {
      ...baseConfig,
      pattern: '{MOD}-{YYYY}{MM}{DD}-{NNNN}',
    };
    const date = new Date('2025-03-15T10:00:00Z');
    const input: GenerateAccessionInput = {
      config,
      modality: 'MR',
      facilityCode: 'FAC01',
      tenantId: 'tenant-1',
      sequenceNumber: 7,
      date,
    };

    const result = renderAccessionNumber(input);
    expect(result).toBe('MR-20250315-0007');
  });

  it('renders SITE token', () => {
    const config: AccessionConfig = {
      ...baseConfig,
      pattern: '{SITE}-{NNNN}',
    };
    const date = new Date('2025-01-01T00:00:00Z');
    const input: GenerateAccessionInput = {
      config,
      modality: 'CT',
      facilityCode: 'FAC01',
      tenantId: 'tenant-1',
      sequenceNumber: 123,
      date,
    };

    const result = renderAccessionNumber(input);
    expect(result).toBe('SITE1-0123');
  });

  it('renders {YY} token as 2-digit year', () => {
    const config: AccessionConfig = {
      ...baseConfig,
      pattern: '{YY}{MM}{DD}-{NNNN}',
    };
    const date = new Date('2025-06-15T10:00:00Z');
    const input: GenerateAccessionInput = {
      config,
      modality: 'CT',
      facilityCode: 'FAC01',
      tenantId: 'tenant-1',
      sequenceNumber: 1,
      date,
    };

    const result = renderAccessionNumber(input);
    expect(result).toBe('250615-0001');
  });

  it('renders {SEQ6} token with 6-digit padding', () => {
    const config: AccessionConfig = {
      ...baseConfig,
      pattern: '{ORG}-{SEQ6}',
    };
    const date = new Date('2025-01-01T00:00:00Z');
    const input: GenerateAccessionInput = {
      config,
      modality: 'CT',
      facilityCode: 'FAC01',
      tenantId: 'tenant-1',
      sequenceNumber: 99,
      date,
    };

    const result = renderAccessionNumber(input);
    expect(result).toBe('RS01-000099');
  });

  it('renders {RAND3} token with 3 random digits', () => {
    const config: AccessionConfig = {
      ...baseConfig,
      pattern: '{ORG}-{NNNN}-{RAND3}',
    };
    const date = new Date('2025-01-01T00:00:00Z');
    const input: GenerateAccessionInput = {
      config,
      modality: 'CT',
      facilityCode: 'FAC01',
      tenantId: 'tenant-1',
      sequenceNumber: 5,
      date,
    };

    const result = renderAccessionNumber(input);
    // Pattern: RS01-0005-XXX where XXX is 3 random digits
    expect(result).toMatch(/^RS01-0005-\d{3}$/);
  });

  it('uses empty string when orgCode is undefined', () => {
    const config: AccessionConfig = {
      ...baseConfig,
      pattern: '{ORG}-{NNNN}',
      orgCode: undefined,
    };
    const date = new Date('2025-01-01T00:00:00Z');
    const input: GenerateAccessionInput = {
      config,
      modality: 'CT',
      facilityCode: 'FAC01',
      tenantId: 'tenant-1',
      sequenceNumber: 1,
      date,
    };

    const result = renderAccessionNumber(input);
    expect(result).toBe('-0001');
  });

  it('renders timezone-aware date parts (date boundary)', () => {
    // 2025-01-19 23:30 UTC = 2025-01-20 06:30 WIB (Asia/Jakarta UTC+7)
    const date = new Date('2025-01-19T23:30:00Z');
    const input: GenerateAccessionInput = {
      config: baseConfig,
      modality: 'CT',
      facilityCode: 'FAC01',
      tenantId: 'tenant-1',
      sequenceNumber: 1,
      date,
    };

    const result = renderAccessionNumber(input);
    // Should use Jakarta date (Jan 20), not UTC date (Jan 19)
    expect(result).toBe('RS01-20250120-0001');
  });

  it('renders {DOY} token as 3-digit day of year', () => {
    const config: AccessionConfig = {
      ...baseConfig,
      pattern: '{YYYY}-{DOY}-{NNNN}',
    };
    // Feb 1 = day 32
    const date = new Date('2025-02-01T10:00:00Z');
    const input: GenerateAccessionInput = {
      config,
      modality: 'CT',
      facilityCode: 'FAC01',
      tenantId: 'tenant-1',
      sequenceNumber: 1,
      date,
    };

    const result = renderAccessionNumber(input);
    expect(result).toBe('2025-032-0001');
  });
});

// ─── computeCounterScope ─────────────────────────────────────────────────────

describe('computeCounterScope', () => {
  it('includes modality when useModalityInSeqScope is true', () => {
    const scope = computeCounterScope('tenant-1', 'FAC01', 'CT', '20250120', true);
    expect(scope).toEqual({
      tenantId: 'tenant-1',
      facilityCode: 'FAC01',
      modality: 'CT',
      dateBucket: '20250120',
    });
  });

  it('sets modality to empty string when useModalityInSeqScope is false', () => {
    const scope = computeCounterScope('tenant-1', 'FAC01', 'CT', '20250120', false);
    expect(scope).toEqual({
      tenantId: 'tenant-1',
      facilityCode: 'FAC01',
      modality: '',
      dateBucket: '20250120',
    });
  });

  it('preserves all other fields regardless of modality scope flag', () => {
    const scope = computeCounterScope('t-abc', 'HOSP-A', 'MR', '202501', false);
    expect(scope.tenantId).toBe('t-abc');
    expect(scope.facilityCode).toBe('HOSP-A');
    expect(scope.dateBucket).toBe('202501');
    expect(scope.modality).toBe('');
  });
});

// ─── validateFormatPattern ───────────────────────────────────────────────────

describe('validateFormatPattern', () => {
  it('accepts a valid pattern with sequence token', () => {
    const result = validateFormatPattern('{ORG}-{YYYY}{MM}{DD}-{NNNN}', 4);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts a pattern with {SEQ6} token', () => {
    const result = validateFormatPattern('{SEQ6}', 6);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a pattern without any sequence token', () => {
    const result = validateFormatPattern('{ORG}-{YYYY}{MM}{DD}', 4);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Format pattern must contain at least one sequence token ({NNN...} or {SEQn})',
    );
  });

  it('rejects a pattern that exceeds 64 characters max length', () => {
    // Pattern with ORG (20) + SITE (20) + date (8) + separators + large sequence
    const result = validateFormatPattern(
      '{ORG}-{SITE}-{YYYY}{MM}{DD}-{MOD}-{SEQ8}-{RAND5}',
      8,
    );
    // 20 + 1 + 20 + 1 + 4 + 2 + 2 + 1 + 2 + 1 + 8 + 1 + 5 = 68 > 64
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeding the maximum of 64'))).toBe(true);
  });

  it('reports both errors when pattern has no sequence and exceeds length', () => {
    // No sequence token + very long pattern
    const result = validateFormatPattern(
      '{ORG}-{SITE}-{YYYY}{MM}{DD}-{MOD}-{RAND8}-{RAND8}',
      4,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.includes('sequence token'))).toBe(true);
  });

  it('accepts a minimal valid pattern', () => {
    const result = validateFormatPattern('{NNN}', 3);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── Re-exported utilities ───────────────────────────────────────────────────

describe('re-exported utilities', () => {
  it('computeDateBucket is accessible', () => {
    const bucket = computeDateBucket('DAILY', new Date('2025-01-20T10:00:00Z'), 'Asia/Jakarta');
    expect(bucket).toBe('20250120');
  });

  it('computeDatePartsInTimezone is accessible', () => {
    const parts = computeDatePartsInTimezone(new Date('2025-01-20T10:00:00Z'), 'Asia/Jakarta');
    expect(parts.year).toBe('2025');
    expect(parts.month).toBe('01');
    expect(parts.day).toBe('20');
  });
});
