// src/services/__tests__/backwardCompatibility.test.js
// Backward Compatibility Unit Tests
// Requirements: 9.1, 9.2, 9.5
//
// Validates:
// 1. All existing accession.js exports are callable without errors
// 2. Client-side generation produces expected format when useServerAccession=false
// 3. createOrder() function signature is unchanged
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks for accession.js dependencies ---

// Mock settingsService (used by generateAccessionAsync via dynamic import)
vi.mock('../settingsService', () => ({
  getSettings: vi.fn().mockResolvedValue({ useServerAccession: false }),
  getAccessionConfig: vi.fn().mockResolvedValue({
    pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
    resetPolicy: 'daily',
    seqPadding: 4,
    orgCode: 'RS01',
    siteCode: 'RAD',
    useModalityInSeqScope: false,
    allowedSeparators: ['-', '_', '/'],
  }),
}));

// Mock config service (used by previewAccession/previewAccessionFromConfig)
vi.mock('../config', () => ({
  getConfig: vi.fn().mockResolvedValue({ modalities: ['CT', 'MR'] }),
}));

// Mock http module (used by orderService)
vi.mock('../http', () => ({
  apiClient: vi.fn(() => ({
    get: vi.fn().mockResolvedValue({ status: 'success', data: [] }),
    post: vi.fn().mockResolvedValue({ status: 'success', order_id: 'test-id' }),
    put: vi.fn().mockResolvedValue({ status: 'success' }),
    delete: vi.fn().mockResolvedValue({ status: 'success' }),
  })),
}));

// Mock api-registry (used by orderService)
vi.mock('../api-registry', () => ({
  loadRegistry: vi.fn(() => ({
    orders: { enabled: true, baseUrl: '/backend-api', timeoutMs: 5000 },
    settings: { enabled: true, baseUrl: '/backend-api', timeoutMs: 6000 },
    accession: { enabled: true, baseUrl: '/accession-api', healthPath: '/healthz', timeoutMs: 5000 },
  })),
  saveRegistry: vi.fn(),
  DEFAULT_REGISTRY: {},
}));

// Mock auth-storage
vi.mock('../auth-storage', () => ({
  getAuthHeader: vi.fn(() => 'Bearer test-token'),
  getAuth: vi.fn(() => ({ token: 'test-token' })),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================
// Test Suite 1: All accession.js exports are callable
// ============================================================
describe('Backward Compatibility - All accession.js exports are callable (Req 9.1)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('accession.config', JSON.stringify({
      pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
      resetPolicy: 'daily',
      seqPadding: 4,
      orgCode: 'RS01',
      siteCode: 'RAD',
      useModalityInSeqScope: false,
      allowedSeparators: ['-', '_', '/'],
    }));
    localStorage.removeItem('accession.seq');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('exports generateAccession as a function', async () => {
    const mod = await import('../accession.js');
    expect(typeof mod.generateAccession).toBe('function');
  });

  it('exports generateAccessionAsync as a function', async () => {
    const mod = await import('../accession.js');
    expect(typeof mod.generateAccessionAsync).toBe('function');
  });

  it('exports previewAccession as a function', async () => {
    const mod = await import('../accession.js');
    expect(typeof mod.previewAccession).toBe('function');
  });

  it('exports previewAccessionFromConfig as a function', async () => {
    const mod = await import('../accession.js');
    expect(typeof mod.previewAccessionFromConfig).toBe('function');
  });

  it('exports loadAccessionConfig as a function', async () => {
    const mod = await import('../accession.js');
    expect(typeof mod.loadAccessionConfig).toBe('function');
  });

  it('exports saveAccessionConfig as a function', async () => {
    const mod = await import('../accession.js');
    expect(typeof mod.saveAccessionConfig).toBe('function');
  });

  it('exports resetAllCounters as a function', async () => {
    const mod = await import('../accession.js');
    expect(typeof mod.resetAllCounters).toBe('function');
  });

  it('exports generateDeterministicAccession as a function', async () => {
    const mod = await import('../accession.js');
    expect(typeof mod.generateDeterministicAccession).toBe('function');
  });

  it('calls generateAccession without errors', async () => {
    const { generateAccession } = await import('../accession.js');
    expect(() => generateAccession({ modality: 'CT' })).not.toThrow();
    const result = generateAccession({ modality: 'CT' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('calls generateAccessionAsync without errors', async () => {
    const { generateAccessionAsync } = await import('../accession.js');
    const result = await generateAccessionAsync({ modality: 'CT' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('calls previewAccession without errors', async () => {
    const { previewAccession } = await import('../accession.js');
    const result = await previewAccession({ modality: 'CT' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('calls previewAccessionFromConfig without errors', async () => {
    const { previewAccessionFromConfig } = await import('../accession.js');
    const cfg = {
      pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
      resetPolicy: 'daily',
      seqPadding: 4,
      orgCode: 'RS01',
      siteCode: 'RAD',
      useModalityInSeqScope: false,
      allowedSeparators: ['-', '_', '/'],
    };
    const result = await previewAccessionFromConfig(cfg, { modality: 'CT' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('calls loadAccessionConfig without errors', async () => {
    const { loadAccessionConfig } = await import('../accession.js');
    const config = loadAccessionConfig();
    expect(config).toBeDefined();
    expect(config.pattern).toBe('{ORG}-{YYYY}{MM}{DD}-{SEQ4}');
    expect(config.orgCode).toBe('RS01');
  });

  it('calls saveAccessionConfig without errors', async () => {
    const { saveAccessionConfig } = await import('../accession.js');
    expect(() => {
      saveAccessionConfig({
        pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
        resetPolicy: 'daily',
        seqPadding: 4,
        orgCode: 'TEST',
      });
    }).not.toThrow();
  });

  it('calls resetAllCounters without errors', async () => {
    const { resetAllCounters } = await import('../accession.js');
    expect(() => resetAllCounters()).not.toThrow();
  });

  it('calls generateDeterministicAccession without errors', async () => {
    const { generateDeterministicAccession } = await import('../accession.js');
    const result = generateDeterministicAccession('ORD123', 0, 'ACC');
    expect(result).toBe('ACC-ORD123-1');
  });
});

// ============================================================
// Test Suite 2: Client-side generation produces expected format
// ============================================================
describe('Backward Compatibility - Client-side generation format (Req 9.2)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('accession.config', JSON.stringify({
      pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
      resetPolicy: 'daily',
      seqPadding: 4,
      orgCode: 'RS01',
      siteCode: 'RAD',
      useModalityInSeqScope: false,
      allowedSeparators: ['-', '_', '/'],
    }));
    localStorage.removeItem('accession.seq');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('produces accession in expected format: RS01-YYYYMMDD-0001', async () => {
    const { generateAccession } = await import('../accession.js');
    const fixedDate = new Date(2025, 0, 15); // January 15, 2025
    const result = generateAccession({ modality: 'CT', date: fixedDate });

    // Expected format: RS01-20250115-0001
    expect(result).toMatch(/^RS01-20250115-\d{4}$/);
    expect(result).toBe('RS01-20250115-0001');
  });

  it('increments sequence on subsequent calls', async () => {
    const { generateAccession } = await import('../accession.js');
    const fixedDate = new Date(2025, 0, 15);

    const first = generateAccession({ modality: 'CT', date: fixedDate });
    const second = generateAccession({ modality: 'CT', date: fixedDate });

    expect(first).toBe('RS01-20250115-0001');
    expect(second).toBe('RS01-20250115-0002');
  });

  it('uses localStorage-based sequence counters', async () => {
    const { generateAccession } = await import('../accession.js');
    const fixedDate = new Date(2025, 0, 15);

    // Pre-set counter in localStorage (scope key for daily reset: SEQ:YYYYMMDD)
    const scopeKey = 'SEQ:20250115';
    localStorage.setItem('accession.seq', JSON.stringify({ [scopeKey]: 41 }));

    const result = generateAccession({ modality: 'CT', date: fixedDate });
    expect(result).toBe('RS01-20250115-0042');
  });

  it('respects orgCode from localStorage config', async () => {
    const { generateAccession } = await import('../accession.js');

    // Change orgCode in localStorage
    localStorage.setItem('accession.config', JSON.stringify({
      pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
      resetPolicy: 'daily',
      seqPadding: 4,
      orgCode: 'HOSP',
      siteCode: 'RAD',
      useModalityInSeqScope: false,
      allowedSeparators: ['-', '_', '/'],
    }));

    const fixedDate = new Date(2025, 0, 15);
    const result = generateAccession({ modality: 'CT', date: fixedDate });
    expect(result).toMatch(/^HOSP-20250115-\d{4}$/);
  });

  it('generateAccessionAsync returns a string (same return type as sync version)', async () => {
    const { generateAccessionAsync } = await import('../accession.js');
    const fixedDate = new Date(2025, 0, 15);
    const result = await generateAccessionAsync({ modality: 'CT', date: fixedDate });
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^RS01-20250115-\d{4}$/);
  });

  it('handles pattern with modality token', async () => {
    const { generateAccession } = await import('../accession.js');

    localStorage.setItem('accession.config', JSON.stringify({
      pattern: '{ORG}-{MOD}-{YYYY}{MM}{DD}-{SEQ4}',
      resetPolicy: 'daily',
      seqPadding: 4,
      orgCode: 'RS01',
      siteCode: 'RAD',
      useModalityInSeqScope: false,
      allowedSeparators: ['-', '_', '/'],
    }));

    const fixedDate = new Date(2025, 0, 15);
    const result = generateAccession({ modality: 'CT', date: fixedDate });
    expect(result).toBe('RS01-CT-20250115-0001');
  });
});

// ============================================================
// Test Suite 3: createOrder() function signature is unchanged
// ============================================================
describe('Backward Compatibility - createOrder() signature unchanged (Req 9.5)', () => {
  it('exports createOrder as a function from orderService', async () => {
    const orderService = await import('../orderService.js');
    expect(typeof orderService.createOrder).toBe('function');
  });

  it('exports createOrder in the default export object', async () => {
    const orderService = await import('../orderService.js');
    expect(typeof orderService.default.createOrder).toBe('function');
  });

  it('createOrder accepts a single orderData parameter', async () => {
    const orderService = await import('../orderService.js');
    // Function.length returns the number of declared parameters
    expect(orderService.createOrder.length).toBe(1);
  });

  it('orderService exports other expected functions alongside createOrder', async () => {
    const orderService = await import('../orderService.js');
    expect(typeof orderService.listOrders).toBe('function');
    expect(typeof orderService.getOrder).toBe('function');
    expect(typeof orderService.updateOrder).toBe('function');
    expect(typeof orderService.deleteOrder).toBe('function');
    expect(typeof orderService.updateOrderStatus).toBe('function');
  });

  it('createOrder is an async function', async () => {
    const orderService = await import('../orderService.js');
    // Async functions have constructor name 'AsyncFunction'
    expect(orderService.createOrder.constructor.name).toBe('AsyncFunction');
  });
});
