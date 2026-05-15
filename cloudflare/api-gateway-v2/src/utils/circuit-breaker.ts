/**
 * In-memory circuit breaker (per-isolate).
 *
 * Tracks failures per upstream service. When failures exceed the threshold,
 * the circuit opens and rejects requests for a cooldown period.
 * After cooldown, transitions to half-open (allows one probe request).
 */

import { CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_RESET_MS } from './constants';

export interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuits = new Map<string, CircuitState>();

export function getCircuit(service: string): CircuitState {
  if (!circuits.has(service)) {
    circuits.set(service, { failures: 0, lastFailure: 0, state: 'closed' });
  }
  return circuits.get(service)!;
}

export function recordSuccess(service: string): void {
  const circuit = getCircuit(service);
  circuit.failures = 0;
  circuit.state = 'closed';
}

export function recordFailure(service: string): void {
  const circuit = getCircuit(service);
  circuit.failures++;
  circuit.lastFailure = Date.now();
  if (circuit.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuit.state = 'open';
  }
}

export function isCircuitOpen(service: string): boolean {
  const circuit = getCircuit(service);
  if (circuit.state === 'closed') return false;
  if (circuit.state === 'open') {
    if (Date.now() - circuit.lastFailure > CIRCUIT_BREAKER_RESET_MS) {
      circuit.state = 'half-open';
      return false; // Allow one probe request
    }
    return true;
  }
  return false; // half-open allows requests
}

export function getAllCircuits(): Record<string, CircuitState> {
  const status: Record<string, CircuitState> = {};
  circuits.forEach((state, key) => { status[key] = state; });
  return status;
}
