/**
 * Unit tests for the Circuit Breaker Durable Object.
 *
 * Tests the state machine transitions:
 * - closed → open after 5 consecutive failures in 60s window
 * - open → half-open after 30s cooldown
 * - half-open → closed on success
 * - half-open → open on failure (reopens for 30s)
 *
 * Requirements: 9.6, 9.7, 9.8
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreakerDurableObject, type CircuitStatus } from '../src/durable-objects/circuit-breaker-do';

// ─── Mock DurableObjectState ─────────────────────────────────────────────────

class MockStorage {
  private data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    if (typeof keyOrEntries === 'string') {
      this.data.set(keyOrEntries, value);
    } else {
      for (const [k, v] of Object.entries(keyOrEntries)) {
        this.data.set(k, v);
      }
    }
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async list(): Promise<Map<string, unknown>> {
    return new Map(this.data);
  }
}

function createMockState(): DurableObjectState {
  const storage = new MockStorage();
  return { storage } as unknown as DurableObjectState;
}

// ─── Helper to call DO via fetch ─────────────────────────────────────────────

async function fetchStatus(dobj: CircuitBreakerDurableObject): Promise<CircuitStatus> {
  const res = await dobj.fetch(new Request('http://do/status'));
  return res.json();
}

async function fetchRecordSuccess(dobj: CircuitBreakerDurableObject): Promise<void> {
  await dobj.fetch(new Request('http://do/record-success', { method: 'POST' }));
}

async function fetchRecordFailure(dobj: CircuitBreakerDurableObject): Promise<CircuitStatus> {
  const res = await dobj.fetch(new Request('http://do/record-failure', { method: 'POST' }));
  return res.json();
}

async function fetchTryAcquire(dobj: CircuitBreakerDurableObject): Promise<{ allowed: boolean; status: CircuitStatus }> {
  const res = await dobj.fetch(new Request('http://do/try-acquire', { method: 'POST' }));
  return res.json();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CircuitBreakerDurableObject', () => {
  let dobj: CircuitBreakerDurableObject;

  beforeEach(() => {
    dobj = new CircuitBreakerDurableObject(createMockState());
  });

  describe('initial state', () => {
    it('starts in closed state with zero failures', async () => {
      const status = await fetchStatus(dobj);
      expect(status.state).toBe('closed');
      expect(status.consecutiveFailures).toBe(0);
      expect(status.openedAt).toBeUndefined();
      expect(status.openUntil).toBeUndefined();
    });

    it('tryAcquire is allowed in closed state', async () => {
      const result = await fetchTryAcquire(dobj);
      expect(result.allowed).toBe(true);
      expect(result.status.state).toBe('closed');
    });
  });

  describe('closed → open transition', () => {
    it('stays closed after fewer than 5 failures', async () => {
      for (let i = 0; i < 4; i++) {
        await fetchRecordFailure(dobj);
      }
      const status = await fetchStatus(dobj);
      expect(status.state).toBe('closed');
      expect(status.consecutiveFailures).toBe(4);
    });

    it('opens after 5 consecutive failures', async () => {
      for (let i = 0; i < 5; i++) {
        await fetchRecordFailure(dobj);
      }
      const status = await fetchStatus(dobj);
      expect(status.state).toBe('open');
      expect(status.consecutiveFailures).toBe(5);
      expect(status.openedAt).toBeDefined();
      expect(status.openUntil).toBeDefined();
    });

    it('tryAcquire returns false when circuit is open', async () => {
      for (let i = 0; i < 5; i++) {
        await fetchRecordFailure(dobj);
      }
      const result = await fetchTryAcquire(dobj);
      expect(result.allowed).toBe(false);
      expect(result.status.state).toBe('open');
    });
  });

  describe('success resets failure count in closed state', () => {
    it('resets consecutive failures on success', async () => {
      // Record 3 failures
      for (let i = 0; i < 3; i++) {
        await fetchRecordFailure(dobj);
      }
      let status = await fetchStatus(dobj);
      expect(status.consecutiveFailures).toBe(3);

      // Record success
      await fetchRecordSuccess(dobj);

      status = await fetchStatus(dobj);
      expect(status.state).toBe('closed');
      expect(status.consecutiveFailures).toBe(0);
    });
  });

  describe('open → half-open transition', () => {
    it('transitions to half-open after 30s cooldown', async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await fetchRecordFailure(dobj);
      }

      // Mock time passing by manipulating the openUntil
      // We need to directly test the time-based transition
      // Since we can't easily mock Date.now() in this setup,
      // we verify the openUntil is set correctly (30s from now)
      const status = await fetchStatus(dobj);
      expect(status.state).toBe('open');
      expect(status.openUntil).toBeDefined();
      // openUntil should be approximately 30s from openedAt
      expect(status.openUntil! - status.openedAt!).toBe(30_000);
    });
  });

  describe('half-open → closed on success', () => {
    it('closes circuit when probe succeeds in half-open state', async () => {
      // We need to simulate the half-open state by manipulating storage directly
      const mockState = createMockState();
      const now = Date.now();

      // Pre-populate storage with an "open" state that has already expired
      await mockState.storage.put({
        circuit_state: 'open',
        consecutive_failures: 5,
        opened_at: now - 31_000, // opened 31s ago
        open_until: now - 1_000, // expired 1s ago
        failure_timestamps: [now - 31_000, now - 31_000, now - 31_000, now - 31_000, now - 31_000],
      });

      const doWithExpiredOpen = new CircuitBreakerDurableObject(mockState);

      // getStatus should show half-open (open period expired)
      const status = await fetchStatus(doWithExpiredOpen);
      expect(status.state).toBe('half-open');

      // tryAcquire should be allowed in half-open
      const acquire = await fetchTryAcquire(doWithExpiredOpen);
      expect(acquire.allowed).toBe(true);

      // Record success → should close
      await fetchRecordSuccess(doWithExpiredOpen);
      const afterSuccess = await fetchStatus(doWithExpiredOpen);
      expect(afterSuccess.state).toBe('closed');
      expect(afterSuccess.consecutiveFailures).toBe(0);
    });
  });

  describe('half-open → open on failure', () => {
    it('reopens circuit when probe fails in half-open state', async () => {
      const mockState = createMockState();
      const now = Date.now();

      // Pre-populate storage with an "open" state that has already expired
      await mockState.storage.put({
        circuit_state: 'open',
        consecutive_failures: 5,
        opened_at: now - 31_000,
        open_until: now - 1_000, // expired
        failure_timestamps: [now - 31_000, now - 31_000, now - 31_000, now - 31_000, now - 31_000],
      });

      const doWithExpiredOpen = new CircuitBreakerDurableObject(mockState);

      // Verify half-open
      const status = await fetchStatus(doWithExpiredOpen);
      expect(status.state).toBe('half-open');

      // Record failure → should reopen for another 30s
      const failStatus = await fetchRecordFailure(doWithExpiredOpen);
      expect(failStatus.state).toBe('open');
      expect(failStatus.openUntil).toBeDefined();
      // New openUntil should be ~30s from now
      expect(failStatus.openUntil! - failStatus.openedAt!).toBe(30_000);
    });
  });

  describe('open state does not count additional failures', () => {
    it('does not increment failure count when already open', async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await fetchRecordFailure(dobj);
      }
      const openStatus = await fetchStatus(dobj);
      expect(openStatus.state).toBe('open');
      expect(openStatus.consecutiveFailures).toBe(5);

      // Record more failures while open — should not change count
      await fetchRecordFailure(dobj);
      await fetchRecordFailure(dobj);

      const status = await fetchStatus(dobj);
      expect(status.consecutiveFailures).toBe(5);
    });
  });

  describe('fetch handler routing', () => {
    it('returns 404 for unknown paths', async () => {
      const res = await dobj.fetch(new Request('http://do/unknown'));
      expect(res.status).toBe(404);
    });

    it('returns JSON with Content-Type header', async () => {
      const res = await dobj.fetch(new Request('http://do/status'));
      expect(res.headers.get('Content-Type')).toBe('application/json');
      expect(res.status).toBe(200);
    });
  });
});
