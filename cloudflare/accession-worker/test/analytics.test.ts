import { describe, it, expect, vi } from 'vitest';
import {
  emitAccessionMetric,
  emitRateLimitEvent,
  emitCircuitEvent,
  emitJobRun,
} from '../src/services/analytics';
import type { Env } from '../src/types';

function createMockDataset() {
  return { writeDataPoint: vi.fn() };
}

function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    METRICS: createMockDataset(),
    RATE_LIMIT_EVENTS: createMockDataset(),
    CIRCUIT_EVENTS: createMockDataset(),
    JOB_RUNS: createMockDataset(),
    ...overrides,
  } as unknown as Env;
}

describe('analytics service', () => {
  describe('emitAccessionMetric', () => {
    it('writes a data point with correct blobs, doubles, and indexes', () => {
      const env = createMockEnv();
      emitAccessionMetric(env, {
        tenantId: 'tenant-1',
        modality: 'CT',
        endpoint: '/api/accessions',
        statusCode: 201,
        durationMs: 42,
      });

      expect((env.METRICS as any).writeDataPoint).toHaveBeenCalledWith({
        blobs: ['tenant-1', 'CT', '/api/accessions'],
        doubles: [42, 201],
        indexes: ['2xx'],
      });
    });

    it('maps 4xx status codes to "4xx" group', () => {
      const env = createMockEnv();
      emitAccessionMetric(env, {
        tenantId: 't',
        modality: 'MR',
        endpoint: '/api/accessions',
        statusCode: 400,
        durationMs: 5,
      });

      expect((env.METRICS as any).writeDataPoint).toHaveBeenCalledWith(
        expect.objectContaining({ indexes: ['4xx'] })
      );
    });

    it('maps 5xx status codes to "5xx" group', () => {
      const env = createMockEnv();
      emitAccessionMetric(env, {
        tenantId: 't',
        modality: 'DX',
        endpoint: '/api/accessions',
        statusCode: 500,
        durationMs: 100,
      });

      expect((env.METRICS as any).writeDataPoint).toHaveBeenCalledWith(
        expect.objectContaining({ indexes: ['5xx'] })
      );
    });

    it('does not throw when METRICS binding is unavailable', () => {
      const env = createMockEnv({ METRICS: undefined as any });
      expect(() =>
        emitAccessionMetric(env, {
          tenantId: 't',
          modality: 'CT',
          endpoint: '/api/accessions',
          statusCode: 201,
          durationMs: 10,
        })
      ).not.toThrow();
    });
  });

  describe('emitRateLimitEvent', () => {
    it('writes a data point with correct shape', () => {
      const env = createMockEnv();
      emitRateLimitEvent(env, {
        tenantId: 'tenant-2',
        endpoint: '/api/accessions',
        statusCode: 429,
      });

      expect((env.RATE_LIMIT_EVENTS as any).writeDataPoint).toHaveBeenCalledWith({
        blobs: ['tenant-2', '/api/accessions'],
        doubles: [429],
        indexes: ['tenant-2'],
      });
    });

    it('does not throw when RATE_LIMIT_EVENTS binding is unavailable', () => {
      const env = createMockEnv({ RATE_LIMIT_EVENTS: undefined as any });
      expect(() =>
        emitRateLimitEvent(env, {
          tenantId: 't',
          endpoint: '/api/accessions',
          statusCode: 429,
        })
      ).not.toThrow();
    });
  });

  describe('emitCircuitEvent', () => {
    it('writes a data point with correct shape', () => {
      const env = createMockEnv();
      emitCircuitEvent(env, {
        service: 'mwl-writer',
        state: 'open',
        action: 'trip',
      });

      expect((env.CIRCUIT_EVENTS as any).writeDataPoint).toHaveBeenCalledWith({
        blobs: ['mwl-writer', 'open', 'trip'],
        doubles: [],
        indexes: ['mwl-writer'],
      });
    });

    it('does not throw when CIRCUIT_EVENTS binding is unavailable', () => {
      const env = createMockEnv({ CIRCUIT_EVENTS: undefined as any });
      expect(() =>
        emitCircuitEvent(env, {
          service: 'mwl-writer',
          state: 'closed',
          action: 'reset',
        })
      ).not.toThrow();
    });
  });

  describe('emitJobRun', () => {
    it('writes a data point with status "success" when success is true', () => {
      const env = createMockEnv();
      emitJobRun(env, {
        jobName: 'idempotency_cleanup',
        deletedCount: 150,
        elapsedMs: 320,
        success: true,
      });

      expect((env.JOB_RUNS as any).writeDataPoint).toHaveBeenCalledWith({
        blobs: ['idempotency_cleanup', 'success'],
        doubles: [150, 320],
        indexes: ['idempotency_cleanup'],
      });
    });

    it('writes a data point with status "error" when success is false', () => {
      const env = createMockEnv();
      emitJobRun(env, {
        jobName: 'soft_delete_purge',
        deletedCount: 0,
        elapsedMs: 50,
        success: false,
      });

      expect((env.JOB_RUNS as any).writeDataPoint).toHaveBeenCalledWith({
        blobs: ['soft_delete_purge', 'error'],
        doubles: [0, 50],
        indexes: ['soft_delete_purge'],
      });
    });

    it('does not throw when JOB_RUNS binding is unavailable', () => {
      const env = createMockEnv({ JOB_RUNS: undefined as any });
      expect(() =>
        emitJobRun(env, {
          jobName: 'idempotency_cleanup',
          deletedCount: 0,
          elapsedMs: 10,
          success: true,
        })
      ).not.toThrow();
    });
  });
});
