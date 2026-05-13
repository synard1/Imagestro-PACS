/**
 * Circuit Breaker Durable Object for MWL Writer integration.
 *
 * Implements the circuit breaker pattern with three states:
 * - closed: Normal operation, requests pass through
 * - open: Failures exceeded threshold, requests are blocked for 30s
 * - half-open: After cooldown, one probe request is allowed through
 *
 * State transitions:
 * - closed → open: After 5 consecutive failures within a 60s window
 * - open → half-open: After 30s cooldown elapses
 * - half-open → closed: On success of the probe request
 * - half-open → open: On failure of the probe request (reopens for 30s)
 *
 * Requirements: 9.6, 9.7, 9.8
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitStatus {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt?: number; // epoch ms
  openUntil?: number; // epoch ms
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Number of consecutive failures within the window to trip the circuit */
const FAILURE_THRESHOLD = 5;

/** Time window (ms) in which failures are counted */
const FAILURE_WINDOW_MS = 60_000; // 60 seconds

/** Duration (ms) the circuit stays open before transitioning to half-open */
const OPEN_DURATION_MS = 30_000; // 30 seconds

// ─── Storage Keys ────────────────────────────────────────────────────────────

const KEY_STATE = 'circuit_state';
const KEY_CONSECUTIVE_FAILURES = 'consecutive_failures';
const KEY_OPENED_AT = 'opened_at';
const KEY_OPEN_UNTIL = 'open_until';
const KEY_FAILURE_TIMESTAMPS = 'failure_timestamps';

// ─── Durable Object ──────────────────────────────────────────────────────────

/**
 * Circuit Breaker Durable Object that tracks MWL Writer failures
 * and prevents cascading failures by blocking requests when the
 * downstream service is unhealthy.
 */
export class CircuitBreakerDurableObject {
  private state: DurableObjectState;

  // In-memory cached state (lazy-loaded from storage)
  private circuitState: CircuitState = 'closed';
  private consecutiveFailures: number = 0;
  private openedAt?: number;
  private openUntil?: number;
  private failureTimestamps: number[] = [];
  private loaded: boolean = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  // ─── State Management ────────────────────────────────────────────────────

  /**
   * Lazy-load all circuit breaker state from durable storage.
   * Called once per DO instance lifetime (until eviction).
   */
  private async loadState(): Promise<void> {
    if (this.loaded) return;

    const [state, failures, openedAt, openUntil, timestamps] = await Promise.all([
      this.state.storage.get<CircuitState>(KEY_STATE),
      this.state.storage.get<number>(KEY_CONSECUTIVE_FAILURES),
      this.state.storage.get<number>(KEY_OPENED_AT),
      this.state.storage.get<number>(KEY_OPEN_UNTIL),
      this.state.storage.get<number[]>(KEY_FAILURE_TIMESTAMPS),
    ]);

    this.circuitState = state ?? 'closed';
    this.consecutiveFailures = failures ?? 0;
    this.openedAt = openedAt ?? undefined;
    this.openUntil = openUntil ?? undefined;
    this.failureTimestamps = timestamps ?? [];
    this.loaded = true;
  }

  /**
   * Persist all circuit breaker state to durable storage atomically.
   */
  private async persistState(): Promise<void> {
    await this.state.storage.put({
      [KEY_STATE]: this.circuitState,
      [KEY_CONSECUTIVE_FAILURES]: this.consecutiveFailures,
      [KEY_OPENED_AT]: this.openedAt,
      [KEY_OPEN_UNTIL]: this.openUntil,
      [KEY_FAILURE_TIMESTAMPS]: this.failureTimestamps,
    });
  }

  // ─── State Transition Helpers ────────────────────────────────────────────

  /**
   * Check if the open period has elapsed and transition to half-open if so.
   */
  private checkOpenExpiry(now: number): void {
    if (this.circuitState === 'open' && this.openUntil && now >= this.openUntil) {
      this.circuitState = 'half-open';
    }
  }

  /**
   * Prune failure timestamps outside the 60s window.
   */
  private pruneFailureTimestamps(now: number): void {
    const cutoff = now - FAILURE_WINDOW_MS;
    this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > cutoff);
  }

  /**
   * Transition the circuit to the open state.
   */
  private openCircuit(now: number): void {
    this.circuitState = 'open';
    this.openedAt = now;
    this.openUntil = now + OPEN_DURATION_MS;
  }

  /**
   * Transition the circuit to the closed state and reset counters.
   */
  private closeCircuit(): void {
    this.circuitState = 'closed';
    this.consecutiveFailures = 0;
    this.openedAt = undefined;
    this.openUntil = undefined;
    this.failureTimestamps = [];
  }

  // ─── RPC Methods ─────────────────────────────────────────────────────────

  /**
   * Returns the current circuit breaker status.
   * Checks for open→half-open transition based on elapsed time.
   */
  async getStatus(): Promise<CircuitStatus> {
    await this.loadState();
    const now = Date.now();
    this.checkOpenExpiry(now);

    return {
      state: this.circuitState,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      openUntil: this.openUntil,
    };
  }

  /**
   * Records a successful call to the downstream service.
   * - In half-open state: closes the circuit (probe succeeded)
   * - In closed state: resets consecutive failure count
   */
  async recordSuccess(): Promise<void> {
    await this.loadState();
    const now = Date.now();
    this.checkOpenExpiry(now);

    if (this.circuitState === 'half-open') {
      // Probe succeeded — close the circuit
      this.closeCircuit();
    } else if (this.circuitState === 'closed') {
      // Reset failure tracking on success
      this.consecutiveFailures = 0;
      this.failureTimestamps = [];
    }

    await this.persistState();
  }

  /**
   * Records a failed call to the downstream service.
   * - In closed state: increments failure count; opens circuit if threshold reached
   * - In half-open state: reopens circuit for another 30s
   *
   * Returns the updated circuit status after recording the failure.
   */
  async recordFailure(): Promise<CircuitStatus> {
    await this.loadState();
    const now = Date.now();
    this.checkOpenExpiry(now);

    if (this.circuitState === 'half-open') {
      // Probe failed — reopen the circuit for another 30s
      this.openCircuit(now);
    } else if (this.circuitState === 'closed') {
      // Track failure timestamp and increment consecutive count
      this.failureTimestamps.push(now);
      this.consecutiveFailures++;

      // Prune old timestamps outside the 60s window
      this.pruneFailureTimestamps(now);

      // Check if we've hit the threshold within the window
      if (this.consecutiveFailures >= FAILURE_THRESHOLD && this.failureTimestamps.length >= FAILURE_THRESHOLD) {
        this.openCircuit(now);
      }
    }
    // If already open, do nothing (skipped calls shouldn't count as new failures per Req 9.7)

    await this.persistState();

    return {
      state: this.circuitState,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      openUntil: this.openUntil,
    };
  }

  /**
   * Attempts to acquire permission to make a downstream call.
   * - closed: always allowed
   * - open: denied (circuit is protecting downstream)
   * - half-open: allowed (one probe request)
   *
   * Returns whether the call is allowed and the current status.
   */
  async tryAcquire(): Promise<{ allowed: boolean; status: CircuitStatus }> {
    await this.loadState();
    const now = Date.now();
    this.checkOpenExpiry(now);

    // After checking expiry, determine if the call is allowed
    const allowed = this.circuitState !== 'open';

    const status: CircuitStatus = {
      state: this.circuitState,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      openUntil: this.openUntil,
    };

    // Persist any state change from checkOpenExpiry
    await this.persistState();

    return { allowed, status };
  }

  // ─── Fetch Handler ───────────────────────────────────────────────────────

  /**
   * Durable Object fetch handler — routes requests by pathname.
   *
   * - GET  /status         → getStatus
   * - POST /record-success → recordSuccess
   * - POST /record-failure → recordFailure
   * - POST /try-acquire    → tryAcquire
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/status': {
          const status = await this.getStatus();
          return jsonResponse(status);
        }

        case '/record-success': {
          await this.recordSuccess();
          return jsonResponse({ ok: true });
        }

        case '/record-failure': {
          const status = await this.recordFailure();
          return jsonResponse(status);
        }

        case '/try-acquire': {
          const result = await this.tryAcquire();
          return jsonResponse(result);
        }

        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error';
      return new Response(
        JSON.stringify({ error: message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
