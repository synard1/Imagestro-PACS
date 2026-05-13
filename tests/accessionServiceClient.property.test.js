// tests/accessionServiceClient.property.test.js
// Property-based tests for AccessionServiceClient API methods (Properties 4-7, 11)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// Mock dependencies before importing the module
vi.mock('../src/services/api-registry', () => ({
  loadRegistry: () => ({
    accession: { enabled: true, baseUrl: '/accession-api', healthPath: '/healthz', timeoutMs: 5000 }
  })
}));

vi.mock('../src/services/auth-storage', () => ({
  getAuthHeader: () => ({ Authorization: 'Bearer test-token' })
}));

vi.mock('../src/services/config', () => ({
  getConfig: async () => ({ apiBaseUrl: '', timeoutMs: 5000 }),
  getConfigSync: () => ({ apiBaseUrl: '' })
}));

vi.mock('../src/services/error-parser', () => ({
  createCleanError: (err, status) => {
    const e = new Error(err.message);
    e.status = status || err.status;
    e.code = err.code;
    e.originalError = err;
    return e;
  },
  parseErrorMessage: (err) => err.message
}));

vi.mock('../src/utils/csrf', () => ({
  addCSRFHeader: async () => ({})
}));

vi.mock('../src/utils/security', () => ({
  redactSensitiveData: (data) => data
}));

vi.mock('../src/services/settingsService', () => ({
  getSettings: async () => ({ useServerAccession: true })
}));

vi.mock('../src/services/notifications', () => ({
  notify: vi.fn()
}));

vi.mock('../src/services/accession', () => ({
  generateAccessionAsync: async () => 'LOCAL-001',
  loadAccessionConfig: () => ({ pattern: '{SEQ4}' }),
  saveAccessionConfig: () => true
}));

import {
  createAccession,
  createAccessionBatch,
  getAccessions,
  getAccessionByNumber,
  prepareOrderAccessions
} from '../src/services/accessionServiceClient.js';

// Helper: create a fetch mock that captures the last request
function createCapturingFetch(responseBody) {
  let lastUrl = null;
  let lastOptions = null;
  const mockFn = vi.fn(async (url, options = {}) => {
    lastUrl = url;
    lastOptions = options;
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  });
  return { mockFn, getLastUrl: () => lastUrl, getLastOptions: () => lastOptions };
}

describe('Feature: accession-worker-integration, Property 4: CreateAccession request body mapping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SHALL produce a POST request body where patient.id equals patientId and modality equals provided modality', async () => {
    // **Validates: Requirements 2.1**
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z0-9]{1,20}$/),
        fc.stringMatching(/^[A-Za-z0-9]{1,20}$/),
        async (modality, patientId) => {
          const { mockFn, getLastUrl, getLastOptions } = createCapturingFetch({
            id: 'uuid-1', accession_number: 'ACC-001', issuer: 'TEST'
          });
          globalThis.window = globalThis;
          globalThis.window.fetch = mockFn;

          await createAccession({ modality, patientId });

          const capturedOptions = getLastOptions();
          expect(capturedOptions).not.toBeNull();
          expect(capturedOptions.body).toBeDefined();

          const body = JSON.parse(capturedOptions.body);
          expect(body.modality).toBe(modality);
          expect(body.patient).toBeDefined();
          expect(body.patient.id).toBe(patientId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: accession-worker-integration, Property 5: CreateAccessionBatch request body structure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SHALL produce a POST request body with procedures array and shared patient fields at top level', async () => {
    // **Validates: Requirements 2.2**
    const procedureArb = fc.record({
      modality: fc.stringMatching(/^[A-Z]{2}$/),
      procedure_code: fc.stringMatching(/^[A-Z0-9]{2,10}$/),
      procedure_name: fc.stringMatching(/^[A-Za-z ]{2,20}$/)
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(procedureArb, { minLength: 1, maxLength: 5 }),
        fc.stringMatching(/^[0-9]{6,16}$/),
        fc.stringMatching(/^[A-Za-z ]{2,30}$/),
        async (procedures, patient_national_id, patient_name) => {
          const { mockFn, getLastOptions } = createCapturingFetch({ accessions: [] });
          globalThis.window = globalThis;
          globalThis.window.fetch = mockFn;

          await createAccessionBatch({ procedures, patient_national_id, patient_name });

          const capturedOptions = getLastOptions();
          expect(capturedOptions).not.toBeNull();
          expect(capturedOptions.body).toBeDefined();

          const body = JSON.parse(capturedOptions.body);

          // Verify shared patient fields at top level
          expect(body.patient_national_id).toBe(patient_national_id);
          expect(body.patient_name).toBe(patient_name);

          // Verify procedures array matches input
          expect(body.procedures).toBeDefined();
          expect(Array.isArray(body.procedures)).toBe(true);
          expect(body.procedures.length).toBe(procedures.length);

          for (let i = 0; i < procedures.length; i++) {
            expect(body.procedures[i].modality).toBe(procedures[i].modality);
            expect(body.procedures[i].procedure_code).toBe(procedures[i].procedure_code);
            expect(body.procedures[i].procedure_name).toBe(procedures[i].procedure_name);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: accession-worker-integration, Property 6: GetAccessions filter-to-query-parameter mapping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SHALL produce a GET request with query parameters that exactly match the provided filter keys and values', async () => {
    // **Validates: Requirements 2.3**
    const filterArb = fc.record({
      limit: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
      cursor: fc.option(fc.stringMatching(/^[A-Za-z0-9]{5,15}$/), { nil: undefined }),
      source: fc.option(fc.constantFrom('worker', 'client', 'external'), { nil: undefined }),
      modality: fc.option(fc.constantFrom('CT', 'MR', 'US', 'XR', 'CR', 'DX'), { nil: undefined }),
      patient_national_id: fc.option(fc.stringMatching(/^[0-9]{6,16}$/), { nil: undefined }),
      from_date: fc.option(fc.constantFrom('2024-01-01', '2024-06-15', '2025-01-01'), { nil: undefined }),
      to_date: fc.option(fc.constantFrom('2024-12-31', '2025-06-30', '2025-12-31'), { nil: undefined })
    }).map(obj => {
      const result = {};
      Object.entries(obj).forEach(([key, value]) => {
        if (value !== undefined) result[key] = value;
      });
      return result;
    }).filter(obj => Object.keys(obj).length > 0);

    await fc.assert(
      fc.asyncProperty(filterArb, async (filters) => {
        const { mockFn, getLastUrl } = createCapturingFetch({
          items: [], next_cursor: null, has_more: false
        });
        globalThis.window = globalThis;
        globalThis.window.fetch = mockFn;

        await getAccessions(filters);

        const capturedUrl = getLastUrl();
        expect(capturedUrl).not.toBeNull();

        // Parse the URL to extract query parameters
        const url = new URL(capturedUrl, 'http://localhost');
        const params = url.searchParams;

        // Every filter key should appear as a query parameter with matching value
        const filterKeys = Object.keys(filters);
        for (const key of filterKeys) {
          expect(params.get(key)).toBe(String(filters[key]));
        }

        // No extra query parameters beyond what was provided
        const paramKeys = [...params.keys()];
        expect(paramKeys.length).toBe(filterKeys.length);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: accession-worker-integration, Property 7: GetAccessionByNumber URL construction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SHALL produce a GET request to /api/accessions/{accessionNumber} with correct URL encoding', async () => {
    // **Validates: Requirements 2.4**
    const accessionNumberArb = fc.stringMatching(/^[A-Za-z0-9\-]{1,30}$/);

    await fc.assert(
      fc.asyncProperty(accessionNumberArb, async (accessionNumber) => {
        const { mockFn, getLastUrl } = createCapturingFetch({
          id: 'uuid-1', accession_number: accessionNumber
        });
        globalThis.window = globalThis;
        globalThis.window.fetch = mockFn;

        await getAccessionByNumber(accessionNumber);

        const capturedUrl = getLastUrl();
        expect(capturedUrl).not.toBeNull();

        // The URL should contain the encoded accession number in the path
        const url = new URL(capturedUrl, 'http://localhost');
        const pathSegments = url.pathname.split('/').filter(s => s.length > 0);

        // Last segment should be the accession number (URL-encoded)
        const lastSegment = pathSegments[pathSegments.length - 1];

        // Decode the URL-encoded segment and compare to original
        expect(decodeURIComponent(lastSegment)).toBe(accessionNumber);

        // Verify the path structure includes /api/accessions/
        expect(url.pathname).toContain('/api/accessions/');
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: accession-worker-integration, Property 11: Batch response matching by procedure_code and modality', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SHALL pair each response accession to exactly one request procedure where both procedure_code and modality match', async () => {
    // **Validates: Requirements 4.6**
    const modalityArb = fc.constantFrom('CT', 'MR', 'US', 'XR', 'CR', 'DX', 'MG', 'NM');
    const codeArb = fc.stringMatching(/^[A-Z][A-Z0-9]{1,8}$/);

    const proceduresArb = fc.array(
      fc.record({
        modality: modalityArb,
        procedure_code: codeArb,
        procedure_name: fc.stringMatching(/^[A-Za-z ]{3,20}$/)
      }),
      { minLength: 2, maxLength: 6 }
    ).filter(procs => {
      // Ensure unique procedure_code + modality combinations
      const keys = procs.map(p => `${p.procedure_code}:${p.modality}`);
      return new Set(keys).size === keys.length;
    });

    await fc.assert(
      fc.asyncProperty(proceduresArb, async (procedures) => {
        // Create a mock batch response that matches the procedures
        const mockAccessions = procedures.map((proc, idx) => ({
          id: `uuid-${idx}`,
          accession_number: `ACC-${String(idx + 1).padStart(3, '0')}`,
          issuer: 'TEST',
          procedure_code: proc.procedure_code,
          modality: proc.modality
        }));

        // Shuffle the response to ensure matching works regardless of order
        const shuffledAccessions = [...mockAccessions].sort(() => Math.random() - 0.5);

        const mockFn = vi.fn(async (url, options = {}) => {
          return new Response(JSON.stringify({ accessions: shuffledAccessions }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        });
        globalThis.window = globalThis;
        globalThis.window.fetch = mockFn;

        const result = await prepareOrderAccessions({
          procedures,
          patientId: 'patient123',
          patientName: 'Test Patient',
          patientNationalId: 'NID123'
        });

        expect(result).toBeDefined();
        expect(result.length).toBe(procedures.length);

        // Each result should match the corresponding procedure
        for (let i = 0; i < procedures.length; i++) {
          expect(result[i].procedure_code).toBe(procedures[i].procedure_code);
          expect(result[i].modality).toBe(procedures[i].modality);
          // The accession_number should come from the matching response item
          const matchingResponse = shuffledAccessions.find(
            a => a.procedure_code === procedures[i].procedure_code && a.modality === procedures[i].modality
          );
          expect(result[i].accession_number).toBe(matchingResponse.accession_number);
        }
      }),
      { numRuns: 100 }
    );
  });
});
