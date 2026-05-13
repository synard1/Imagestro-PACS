import { describe, it, expect, beforeEach } from 'vitest';
import { CounterDurableObject } from '../src/durable-objects/counter-do';

/**
 * Unit tests for CounterDurableObject.
 *
 * Validates: Requirements 3A.3, 3A.4
 */

/** Minimal mock of DurableObjectState.storage */
function createMockStorage(initialValue?: number) {
  const store = new Map<string, unknown>();
  if (initialValue !== undefined) {
    store.set('current_value', initialValue);
  }
  return {
    get: async <T>(key: string): Promise<T | undefined> => store.get(key) as T | undefined,
    put: async (key: string, value: unknown): Promise<void> => { store.set(key, value); },
    _store: store,
  };
}

function createMockState(initialValue?: number) {
  const storage = createMockStorage(initialValue);
  return { storage } as unknown as DurableObjectState;
}

function makeIncrementRequest(body: { maxValue: number; count?: number }): Request {
  return new Request('http://fake-host/increment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('CounterDurableObject', () => {
  describe('fetch routing', () => {
    it('returns 404 for unknown paths', async () => {
      const state = createMockState();
      const dobj = new CounterDurableObject(state);

      const response = await dobj.fetch(
        new Request('http://fake-host/unknown'),
      );

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });

    it('routes /increment to the increment handler', async () => {
      const state = createMockState();
      const dobj = new CounterDurableObject(state);

      const response = await dobj.fetch(makeIncrementRequest({ maxValue: 9999 }));

      expect(response.status).toBe(200);
    });
  });

  describe('/increment — single increment', () => {
    it('returns startValue=1, endValue=1 on first increment from empty storage', async () => {
      const state = createMockState();
      const dobj = new CounterDurableObject(state);

      const response = await dobj.fetch(makeIncrementRequest({ maxValue: 9999 }));
      const body = await response.json() as { startValue: number; endValue: number };

      expect(response.status).toBe(200);
      expect(body.startValue).toBe(1);
      expect(body.endValue).toBe(1);
    });

    it('increments sequentially on repeated calls', async () => {
      const state = createMockState();
      const dobj = new CounterDurableObject(state);

      const r1 = await dobj.fetch(makeIncrementRequest({ maxValue: 9999 }));
      const b1 = await r1.json() as { startValue: number; endValue: number };
      expect(b1).toEqual({ startValue: 1, endValue: 1 });

      const r2 = await dobj.fetch(makeIncrementRequest({ maxValue: 9999 }));
      const b2 = await r2.json() as { startValue: number; endValue: number };
      expect(b2).toEqual({ startValue: 2, endValue: 2 });

      const r3 = await dobj.fetch(makeIncrementRequest({ maxValue: 9999 }));
      const b3 = await r3.json() as { startValue: number; endValue: number };
      expect(b3).toEqual({ startValue: 3, endValue: 3 });
    });

    it('lazy-loads current_value from storage', async () => {
      const state = createMockState(42);
      const dobj = new CounterDurableObject(state);

      const response = await dobj.fetch(makeIncrementRequest({ maxValue: 9999 }));
      const body = await response.json() as { startValue: number; endValue: number };

      expect(body.startValue).toBe(43);
      expect(body.endValue).toBe(43);
    });

    it('persists current_value to storage after increment', async () => {
      const state = createMockState();
      const dobj = new CounterDurableObject(state);

      await dobj.fetch(makeIncrementRequest({ maxValue: 9999 }));

      const stored = await state.storage.get<number>('current_value');
      expect(stored).toBe(1);
    });
  });

  describe('/increment — batch (count > 1)', () => {
    it('reserves a range of count values', async () => {
      const state = createMockState();
      const dobj = new CounterDurableObject(state);

      const response = await dobj.fetch(makeIncrementRequest({ maxValue: 9999, count: 5 }));
      const body = await response.json() as { startValue: number; endValue: number };

      expect(response.status).toBe(200);
      expect(body.startValue).toBe(1);
      expect(body.endValue).toBe(5);
    });

    it('reserves consecutive ranges across multiple batch calls', async () => {
      const state = createMockState();
      const dobj = new CounterDurableObject(state);

      const r1 = await dobj.fetch(makeIncrementRequest({ maxValue: 100, count: 3 }));
      const b1 = await r1.json() as { startValue: number; endValue: number };
      expect(b1).toEqual({ startValue: 1, endValue: 3 });

      const r2 = await dobj.fetch(makeIncrementRequest({ maxValue: 100, count: 4 }));
      const b2 = await r2.json() as { startValue: number; endValue: number };
      expect(b2).toEqual({ startValue: 4, endValue: 7 });
    });

    it('defaults count to 1 when not provided', async () => {
      const state = createMockState(10);
      const dobj = new CounterDurableObject(state);

      const response = await dobj.fetch(makeIncrementRequest({ maxValue: 9999 }));
      const body = await response.json() as { startValue: number; endValue: number };

      expect(body.startValue).toBe(11);
      expect(body.endValue).toBe(11);
    });
  });

  describe('/increment — exhaustion (HTTP 409)', () => {
    it('returns 409 when current + count > maxValue', async () => {
      const state = createMockState(9998);
      const dobj = new CounterDurableObject(state);

      const response = await dobj.fetch(makeIncrementRequest({ maxValue: 9999, count: 2 }));
      const body = await response.json() as { error: string };

      expect(response.status).toBe(409);
      expect(body.error).toBe('sequence_exhausted');
    });

    it('returns 409 when already at maxValue', async () => {
      const state = createMockState(9999);
      const dobj = new CounterDurableObject(state);

      const response = await dobj.fetch(makeIncrementRequest({ maxValue: 9999 }));
      const body = await response.json() as { error: string };

      expect(response.status).toBe(409);
      expect(body.error).toBe('sequence_exhausted');
    });

    it('allows increment when current + count == maxValue exactly', async () => {
      const state = createMockState(9998);
      const dobj = new CounterDurableObject(state);

      const response = await dobj.fetch(makeIncrementRequest({ maxValue: 9999, count: 1 }));
      const body = await response.json() as { startValue: number; endValue: number };

      expect(response.status).toBe(200);
      expect(body.startValue).toBe(9999);
      expect(body.endValue).toBe(9999);
    });

    it('does not persist value when exhausted', async () => {
      const state = createMockState(9999);
      const dobj = new CounterDurableObject(state);

      await dobj.fetch(makeIncrementRequest({ maxValue: 9999 }));

      const stored = await state.storage.get<number>('current_value');
      // Value should remain at 9999 (unchanged from initial)
      expect(stored).toBe(9999);
    });
  });
});
