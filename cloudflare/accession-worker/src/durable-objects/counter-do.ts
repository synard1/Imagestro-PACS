/**
 * Hot counter Durable Object for high-throughput tenants.
 *
 * Provides strongly-consistent, single-threaded counter increments that
 * bypass D1's ~1000 writes/sec ceiling. Each instance is keyed by the
 * SHA-256 hash of the Counter_Scope, ensuring one DO per scope.
 *
 * Requirements: 3A.3, 3A.4
 */

import type { IncrementResult } from '../models/counter';

/**
 * Durable Object class that manages a single counter scope.
 *
 * - Lazy-loads `current_value` from transactional storage on first access.
 * - Exposes a `fetch('/increment')` handler that accepts `{ maxValue, count }`
 *   and returns `{ startValue, endValue }` or HTTP 409 on exhaustion.
 * - Persists the counter value after each increment to survive restarts.
 */
export class CounterDurableObject {
  private state: DurableObjectState;
  private current: number = 0;
  private loaded: boolean = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  /**
   * Handles the `/increment` request.
   *
   * Expects JSON body: `{ maxValue: number; count?: number }`
   * - `maxValue`: The maximum allowed counter value (10^sequence_digits - 1).
   * - `count`: Number of sequence numbers to reserve (default 1, used for batch).
   *
   * Returns:
   * - HTTP 200 with `{ startValue, endValue }` on success.
   * - HTTP 409 with `{ error: 'sequence_exhausted' }` when current + count > maxValue.
   */
  private async increment(request: Request): Promise<Response> {
    const { maxValue, count = 1 } = await request.json<{ maxValue: number; count?: number }>();

    // Lazy-load current value from durable storage on first access
    if (!this.loaded) {
      this.current = (await this.state.storage.get<number>('current_value')) ?? 0;
      this.loaded = true;
    }

    // Check if incrementing would exceed the maximum allowed value
    if (this.current + count > maxValue) {
      return new Response(
        JSON.stringify({ error: 'sequence_exhausted' }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Reserve the range and persist
    const startValue = this.current + 1;
    this.current += count;
    await this.state.storage.put('current_value', this.current);

    const result: IncrementResult = { startValue, endValue: this.current };

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  /**
   * Durable Object fetch handler — routes requests by pathname.
   *
   * - `/increment` → increment logic
   * - All other paths → 404
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/increment') {
      return this.increment(request);
    }

    return new Response('Not Found', { status: 404 });
  }
}
