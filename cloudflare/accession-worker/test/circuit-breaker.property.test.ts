import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 31: Circuit breaker state machine transitions.
 * Tests the state machine logic conceptually without Durable Object storage.
 */

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreaker {
  state: CircuitState;
  consecutiveFailures: number;
  openUntil: number;
}

const FAILURE_THRESHOLD = 5;
const OPEN_DURATION_MS = 30_000;

function recordFailure(cb: CircuitBreaker, now: number): CircuitBreaker {
  if (cb.state === 'half-open') {
    return { state: 'open', consecutiveFailures: cb.consecutiveFailures, openUntil: now + OPEN_DURATION_MS };
  }
  if (cb.state === 'closed') {
    const newFailures = cb.consecutiveFailures + 1;
    if (newFailures >= FAILURE_THRESHOLD) {
      return { state: 'open', consecutiveFailures: newFailures, openUntil: now + OPEN_DURATION_MS };
    }
    return { ...cb, consecutiveFailures: newFailures };
  }
  return cb;
}

function recordSuccess(cb: CircuitBreaker): CircuitBreaker {
  if (cb.state === 'half-open') {
    return { state: 'closed', consecutiveFailures: 0, openUntil: 0 };
  }
  if (cb.state === 'closed') {
    return { ...cb, consecutiveFailures: 0 };
  }
  return cb;
}

function checkExpiry(cb: CircuitBreaker, now: number): CircuitBreaker {
  if (cb.state === 'open' && now >= cb.openUntil) {
    return { ...cb, state: 'half-open' };
  }
  return cb;
}

describe('Property 31: Circuit breaker state transitions', () => {
  it('N consecutive failures in closed state opens circuit when N >= threshold', () => {
    fc.assert(fc.property(fc.integer({ min: FAILURE_THRESHOLD, max: 20 }), (n) => {
      let cb: CircuitBreaker = { state: 'closed', consecutiveFailures: 0, openUntil: 0 };
      const now = Date.now();
      for (let i = 0; i < n; i++) { cb = recordFailure(cb, now); }
      return cb.state === 'open';
    }), { numRuns: 100 });
  });

  it('fewer than threshold failures keeps circuit closed', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: FAILURE_THRESHOLD - 1 }), (n) => {
      let cb: CircuitBreaker = { state: 'closed', consecutiveFailures: 0, openUntil: 0 };
      const now = Date.now();
      for (let i = 0; i < n; i++) { cb = recordFailure(cb, now); }
      return cb.state === 'closed';
    }), { numRuns: 100 });
  });

  it('success in half-open state closes circuit', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), (_) => {
      const cb: CircuitBreaker = { state: 'half-open', consecutiveFailures: 5, openUntil: 0 };
      const result = recordSuccess(cb);
      return result.state === 'closed' && result.consecutiveFailures === 0;
    }), { numRuns: 100 });
  });

  it('open circuit transitions to half-open after cooldown', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), (elapsed) => {
      const openedAt = 1000000;
      const cb: CircuitBreaker = { state: 'open', consecutiveFailures: 5, openUntil: openedAt + OPEN_DURATION_MS };
      const now = openedAt + OPEN_DURATION_MS + elapsed;
      const result = checkExpiry(cb, now);
      return result.state === 'half-open';
    }), { numRuns: 100 });
  });
});
