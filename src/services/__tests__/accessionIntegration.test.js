// src/services/__tests__/accessionIntegration.test.js
// Unit tests for feature flag branching and order integration
// Requirements: 3.1-3.7, 4.1-4.6, 9.1, 9.2, 9.5
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../../services/settingsService', () => ({
  getSettings: vi.fn(),
  getAccessionConfig: vi.fn().mockResolvedValue({
    pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
    resetPolicy: 'daily',
    seqPadding: 4,
    orgCode: 'RS01',
    siteCode: 'RAD',
    useModalityInSeqScope: false,
    allowedSeparators: ['-', '_', '/']
  })
}));

vi.mock('../../services/api-registry', () => ({
  loadRegistry: () => ({
    accession: { enabled: true, baseUrl: '/accession-api', healthPath: '/healthz', timeoutMs: 5000 },
    orders: { enabled: true, baseUrl: '/backend-api', timeoutMs: 5000 },
    settings: { enabled: true, baseUrl: '/backend-api', timeoutMs: 6000 }
  }),
  saveRegistry: vi.fn(),
  DEFAULT_REGISTRY: {}
}));

vi.mock('../../services/notifications', () => ({
  notify: vi.fn()
}));

vi.mock('../../services/accession', () => ({
  generateAccession: vi.fn(),
  generateAccessionAsync: vi.fn(),
  previewAccession: vi.fn(),
  previewAccessionFromConfig: vi.fn(),
  loadAccessionConfig: vi.fn().mockReturnValue({
    pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
    resetPolicy: 'daily',
    seqPadding: 4,
    orgCode: 'RS01',
    siteCode: 'RAD',
    useModalityInSeqScope: false,
    allowedSeparators: ['-', '_', '/']
  }),
  saveAccessionConfig: vi.fn(),
  resetAllCounters: vi.fn(),
  generateDeterministicAccession: vi.fn()
}));

vi.mock('../../services/auth-storage', () => ({
  getAuthHeader: () => ({ Authorization: 'Bearer test-token' }),
  getAuth: () => ({ token: 'test-token' })
}));

vi.mock('../../services/config', () => ({
  getConfig: async () => ({ apiBaseUrl: '', timeoutMs: 5000 }),
  getConfigSync: () => ({ apiBaseUrl: '' })
}));

vi.mock('../../services/error-parser', () => ({
  createCleanError: (err, status) => {
    const e = new Error(err.message);
    e.status = status || err.status;
    e.code = err.code;
    e.originalError = err;
    return e;
  },
  parseErrorMessage: (err) => err.message
}));

vi.mock('../../utils/csrf', () => ({
  addCSRFHeader: async () => ({})
}));

vi.mock('../../utils/security', () => ({
  redactSensitiveData: (data) => data
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { getSettings } from '../../services/settingsService';
import { notify } from '../../services/notifications';
import { generateAccessionAsync } from '../../services/accession';
import { getAccessionNumber, prepareOrderAccessions } from '../../services/accessionServiceClient';

describe('Feature flag branching - getAccessionNumber()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.window = globalThis;
    // Default fetch mock that returns a successful accession response
    globalThis.window.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({
        id: 'uuid-1',
        accession_number: 'SRV-20250115-0001',
        issuer: 'HOSPITAL'
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls server (createAccession) when useServerAccession=true', async () => {
    getSettings.mockResolvedValue({ useServerAccession: true });

    const result = await getAccessionNumber({ modality: 'CT', patientId: 'P001' });

    expect(result).toBe('SRV-20250115-0001');
    expect(globalThis.window.fetch).toHaveBeenCalled();
    // Verify the fetch was called with a URL containing /api/accessions
    const fetchCall = globalThis.window.fetch.mock.calls[0];
    expect(fetchCall[0]).toContain('/api/accessions');
    // Should NOT call client-side generation
    expect(generateAccessionAsync).not.toHaveBeenCalled();
  });

  it('calls client-side (generateAccessionAsync) when useServerAccession=false', async () => {
    getSettings.mockResolvedValue({ useServerAccession: false });
    generateAccessionAsync.mockResolvedValue('RS01-20250115-0042');

    const result = await getAccessionNumber({ modality: 'CT', patientId: 'P001' });

    expect(result).toBe('RS01-20250115-0042');
    expect(generateAccessionAsync).toHaveBeenCalledWith({ modality: 'CT' });
    // Should NOT call the server
    expect(globalThis.window.fetch).not.toHaveBeenCalled();
  });

  it('defaults to client-side when useServerAccession is absent/undefined', async () => {
    getSettings.mockResolvedValue({}); // No useServerAccession property
    generateAccessionAsync.mockResolvedValue('RS01-20250115-0043');

    const result = await getAccessionNumber({ modality: 'MR', patientId: 'P002' });

    expect(result).toBe('RS01-20250115-0043');
    expect(generateAccessionAsync).toHaveBeenCalledWith({ modality: 'MR' });
    expect(globalThis.window.fetch).not.toHaveBeenCalled();
  });
});

describe('Fallback behavior - server failure with warning notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.window = globalThis;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to generateAccessionAsync and shows warning when server fails', async () => {
    getSettings.mockResolvedValue({ useServerAccession: true });
    generateAccessionAsync.mockResolvedValue('RS01-20250115-0099');

    // Mock fetch to always fail (simulating server unavailability)
    globalThis.window.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      });
    });

    const result = await getAccessionNumber({ modality: 'CT', patientId: 'P001' });

    // Should fall back to client-side generation
    expect(result).toBe('RS01-20250115-0099');
    expect(generateAccessionAsync).toHaveBeenCalledWith({ modality: 'CT' });

    // Should show a warning notification
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        message: expect.stringContaining('locally')
      })
    );
  });

  it('falls back to generateAccessionAsync on network error', async () => {
    getSettings.mockResolvedValue({ useServerAccession: true });
    generateAccessionAsync.mockResolvedValue('RS01-20250115-0100');

    // Mock fetch to throw a network error
    globalThis.window.fetch = vi.fn(async () => {
      throw new Error('Failed to fetch');
    });

    const result = await getAccessionNumber({ modality: 'MR', patientId: 'P003' });

    expect(result).toBe('RS01-20250115-0100');
    expect(generateAccessionAsync).toHaveBeenCalledWith({ modality: 'MR' });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning'
      })
    );
  });
});

describe('Order integration - prepareOrderAccessions()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.window = globalThis;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when useServerAccession=false (caller uses client-side flow)', async () => {
    getSettings.mockResolvedValue({ useServerAccession: false });

    const result = await prepareOrderAccessions({
      procedures: [{ modality: 'CT', procedure_code: 'CT001', procedure_name: 'CT Scan' }],
      patientId: 'P001',
      patientName: 'John Doe',
      patientNationalId: 'NAT001'
    });

    expect(result).toBeNull();
    // fetch should NOT have been called (no server request when flag is false)
    if (globalThis.window.fetch && vi.isMockFunction(globalThis.window.fetch)) {
      expect(globalThis.window.fetch).not.toHaveBeenCalled();
    }
  });

  it('returns null when useServerAccession is absent', async () => {
    getSettings.mockResolvedValue({});

    const result = await prepareOrderAccessions({
      procedures: [{ modality: 'CT', procedure_code: 'CT001', procedure_name: 'CT Scan' }],
      patientId: 'P001',
      patientName: 'John Doe',
      patientNationalId: 'NAT001'
    });

    expect(result).toBeNull();
  });

  it('calls createAccession for single procedure when flag=true', async () => {
    getSettings.mockResolvedValue({ useServerAccession: true });

    globalThis.window.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({
        id: 'uuid-single',
        accession_number: 'SRV-20250115-0010',
        issuer: 'HOSPITAL'
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      });
    });

    const result = await prepareOrderAccessions({
      procedures: [{ modality: 'CT', procedure_code: 'CT001', procedure_name: 'CT Scan' }],
      patientId: 'P001',
      patientName: 'John Doe',
      patientNationalId: 'NAT001'
    });

    expect(result).toEqual([
      { procedure_code: 'CT001', modality: 'CT', accession_number: 'SRV-20250115-0010' }
    ]);
    // Verify fetch was called (single accession endpoint)
    expect(globalThis.window.fetch).toHaveBeenCalled();
    const fetchCall = globalThis.window.fetch.mock.calls[0];
    expect(fetchCall[0]).toContain('/api/accessions');
    // Should NOT contain /batch in the URL for single procedure
    expect(fetchCall[0]).not.toContain('/batch');
  });

  it('calls createAccessionBatch for multi-procedure when flag=true', async () => {
    getSettings.mockResolvedValue({ useServerAccession: true });

    globalThis.window.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({
        accessions: [
          { id: 'uuid-a', accession_number: 'SRV-20250115-0020', issuer: 'HOSPITAL', modality: 'CT', procedure_code: 'CT001' },
          { id: 'uuid-b', accession_number: 'SRV-20250115-0021', issuer: 'HOSPITAL', modality: 'MR', procedure_code: 'MR001' }
        ]
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      });
    });

    const result = await prepareOrderAccessions({
      procedures: [
        { modality: 'CT', procedure_code: 'CT001', procedure_name: 'CT Scan' },
        { modality: 'MR', procedure_code: 'MR001', procedure_name: 'MRI Brain' }
      ],
      patientId: 'P001',
      patientName: 'John Doe',
      patientNationalId: 'NAT001'
    });

    expect(result).toEqual([
      { procedure_code: 'CT001', modality: 'CT', accession_number: 'SRV-20250115-0020' },
      { procedure_code: 'MR001', modality: 'MR', accession_number: 'SRV-20250115-0021' }
    ]);
    // Verify fetch was called with batch endpoint
    expect(globalThis.window.fetch).toHaveBeenCalled();
    const fetchCall = globalThis.window.fetch.mock.calls[0];
    expect(fetchCall[0]).toContain('/batch');
  });

  it('shows error notification and throws on failure (blocks order submission)', async () => {
    getSettings.mockResolvedValue({ useServerAccession: true });

    // Mock fetch to always fail
    globalThis.window.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'Database unavailable', request_id: 'req-fail' }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      });
    });

    await expect(
      prepareOrderAccessions({
        procedures: [{ modality: 'CT', procedure_code: 'CT001', procedure_name: 'CT Scan' }],
        patientId: 'P001',
        patientName: 'John Doe',
        patientNationalId: 'NAT001'
      })
    ).rejects.toThrow();

    // Should show error notification
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining('Failed to generate accession number')
      })
    );
  });

  it('preserves form data on failure (error is thrown, not swallowed)', async () => {
    getSettings.mockResolvedValue({ useServerAccession: true });

    // Mock fetch to fail with network error
    globalThis.window.fetch = vi.fn(async () => {
      throw new Error('Network error');
    });

    const formData = {
      procedures: [{ modality: 'CT', procedure_code: 'CT001', procedure_name: 'CT Scan' }],
      patientId: 'P001',
      patientName: 'John Doe',
      patientNationalId: 'NAT001'
    };

    // The error should propagate (not be swallowed), allowing the caller to preserve form data
    let thrownError = null;
    try {
      await prepareOrderAccessions(formData);
    } catch (err) {
      thrownError = err;
    }

    // Error was thrown (not swallowed) — caller can catch and preserve form data
    expect(thrownError).not.toBeNull();
    expect(thrownError).toBeInstanceOf(Error);

    // Form data object is unchanged (not mutated by the function)
    expect(formData.procedures).toHaveLength(1);
    expect(formData.patientId).toBe('P001');
    expect(formData.patientName).toBe('John Doe');
    expect(formData.patientNationalId).toBe('NAT001');
  });
});
