import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateIdempotencyKey,
  computeRequestHash,
  computeBatchRequestHash,
  checkIdempotency,
  storeIdempotency,
  type IdempotencyRecord,
} from '../src/services/idempotency';

// ─── validateIdempotencyKey ──────────────────────────────────────────────────

describe('validateIdempotencyKey', () => {
  it('returns valid for a 1-character key', () => {
    const result = validateIdempotencyKey('a');
    expect(result).toEqual({ valid: true });
  });

  it('returns valid for a 128-character key', () => {
    const key = 'x'.repeat(128);
    const result = validateIdempotencyKey(key);
    expect(result).toEqual({ valid: true });
  });

  it('returns valid for a typical UUID key', () => {
    const result = validateIdempotencyKey('550e8400-e29b-41d4-a716-446655440000');
    expect(result).toEqual({ valid: true });
  });

  it('returns invalid for an empty string', () => {
    const result = validateIdempotencyKey('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns invalid for a key exceeding 128 characters', () => {
    const key = 'x'.repeat(129);
    const result = validateIdempotencyKey(key);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('128');
  });
});

// ─── computeRequestHash ──────────────────────────────────────────────────────

describe('computeRequestHash', () => {
  it('returns a 64-character hex string (SHA-256)', async () => {
    const hash = await computeRequestHash('CT', '1234567890123456');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same hash for the same inputs', async () => {
    const hash1 = await computeRequestHash('MR', '9876543210123456');
    const hash2 = await computeRequestHash('MR', '9876543210123456');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different modalities', async () => {
    const hash1 = await computeRequestHash('CT', '1234567890123456');
    const hash2 = await computeRequestHash('MR', '1234567890123456');
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hashes for different patient IDs', async () => {
    const hash1 = await computeRequestHash('CT', '1111111111111111');
    const hash2 = await computeRequestHash('CT', '2222222222222222');
    expect(hash1).not.toBe(hash2);
  });
});

// ─── computeBatchRequestHash ─────────────────────────────────────────────────

describe('computeBatchRequestHash', () => {
  const procedures = [
    { modality: 'CT', patient_national_id: '1234567890123456', procedure_code: 'CT001' },
    { modality: 'MR', patient_national_id: '1234567890123456', procedure_code: 'MR001' },
  ];

  it('returns a 64-character hex string (SHA-256)', async () => {
    const hash = await computeBatchRequestHash(procedures);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same hash regardless of array order', async () => {
    const reversed = [...procedures].reverse();
    const hash1 = await computeBatchRequestHash(procedures);
    const hash2 = await computeBatchRequestHash(reversed);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different procedure sets', async () => {
    const other = [
      { modality: 'US', patient_national_id: '1234567890123456', procedure_code: 'US001' },
    ];
    const hash1 = await computeBatchRequestHash(procedures);
    const hash2 = await computeBatchRequestHash(other);
    expect(hash1).not.toBe(hash2);
  });
});

// ─── checkIdempotency ────────────────────────────────────────────────────────

describe('checkIdempotency', () => {
  let mockDb: any;
  let mockFirst: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFirst = vi.fn();
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
        }),
      }),
    };
  });

  it('returns miss when no record exists', async () => {
    mockFirst.mockResolvedValue(null);

    const result = await checkIdempotency(mockDb, 'tenant-1', 'key-1', 'hash-abc');
    expect(result.status).toBe('miss');
    expect(result.record).toBeUndefined();
  });

  it('returns hit when record exists with matching hash', async () => {
    mockFirst.mockResolvedValue({
      key: 'key-1',
      tenant_id: 'tenant-1',
      accession_id: 'acc-123',
      request_hash: 'hash-abc',
      payload_type: 'single',
      payload: '{"accession_number":"RS01-20250120-0001"}',
      created_at: '2025-01-20T10:00:00.000Z',
      expires_at: '2025-01-21T10:00:00.000Z',
    });

    const result = await checkIdempotency(mockDb, 'tenant-1', 'key-1', 'hash-abc');
    expect(result.status).toBe('hit');
    expect(result.record).toBeDefined();
    expect(result.record!.accessionId).toBe('acc-123');
    expect(result.record!.payloadType).toBe('single');
  });

  it('returns conflict when record exists with different hash', async () => {
    mockFirst.mockResolvedValue({
      key: 'key-1',
      tenant_id: 'tenant-1',
      accession_id: 'acc-123',
      request_hash: 'hash-different',
      payload_type: 'single',
      payload: '{"accession_number":"RS01-20250120-0001"}',
      created_at: '2025-01-20T10:00:00.000Z',
      expires_at: '2025-01-21T10:00:00.000Z',
    });

    const result = await checkIdempotency(mockDb, 'tenant-1', 'key-1', 'hash-abc');
    expect(result.status).toBe('conflict');
    expect(result.record).toBeDefined();
  });

  it('queries with correct tenant_id and key', async () => {
    mockFirst.mockResolvedValue(null);

    await checkIdempotency(mockDb, 'my-tenant', 'my-key', 'my-hash');

    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('tenant_id'));
    const bindCall = mockDb.prepare().bind;
    expect(bindCall).toHaveBeenCalledWith('my-tenant', 'my-key');
  });
});

// ─── storeIdempotency ────────────────────────────────────────────────────────

describe('storeIdempotency', () => {
  let mockDb: any;
  let mockRun: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRun = vi.fn().mockResolvedValue({ success: true });
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: mockRun,
        }),
      }),
    };
  });

  it('stores a record with the provided expires_at', async () => {
    const record: IdempotencyRecord = {
      key: 'key-1',
      tenantId: 'tenant-1',
      accessionId: 'acc-123',
      requestHash: 'hash-abc',
      payloadType: 'single',
      payload: '{"accession_number":"RS01-20250120-0001"}',
      createdAt: '2025-01-20T10:00:00.000Z',
      expiresAt: '2025-01-21T10:00:00.000Z',
    };

    await storeIdempotency(mockDb, record);

    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO idempotency_keys'));
    const bindCall = mockDb.prepare().bind;
    expect(bindCall).toHaveBeenCalledWith(
      'tenant-1',
      'key-1',
      'acc-123',
      'hash-abc',
      'single',
      '{"accession_number":"RS01-20250120-0001"}',
      '2025-01-20T10:00:00.000Z',
      '2025-01-21T10:00:00.000Z',
    );
  });

  it('computes expires_at as 24h after createdAt when not provided', async () => {
    const record: IdempotencyRecord = {
      key: 'key-2',
      tenantId: 'tenant-2',
      accessionId: 'acc-456',
      requestHash: 'hash-def',
      payloadType: 'batch',
      payload: '{"accessions":[]}',
      createdAt: '2025-06-15T12:00:00.000Z',
      expiresAt: '', // empty → should compute 24h later
    };

    await storeIdempotency(mockDb, record);

    const bindCall = mockDb.prepare().bind;
    // The last argument should be the computed expiresAt (24h after createdAt)
    const expectedExpires = '2025-06-16T12:00:00.000Z';
    expect(bindCall).toHaveBeenCalledWith(
      'tenant-2',
      'key-2',
      'acc-456',
      'hash-def',
      'batch',
      '{"accessions":[]}',
      '2025-06-15T12:00:00.000Z',
      expectedExpires,
    );
  });
});
