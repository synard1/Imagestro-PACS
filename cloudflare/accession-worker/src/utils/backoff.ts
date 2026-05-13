/**
 * Exponential backoff helper and contention-error predicate.
 * Used by the D1 sequence counter to retry on write contention.
 */

/**
 * Returns a Promise that resolves after the specified number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Backoff schedule in milliseconds for retry attempts on contention errors.
 * Three retries: 10ms → 40ms → 160ms.
 */
export const backoffSchedule: readonly number[] = [10, 40, 160] as const;

/**
 * Determines whether an error is a D1 write contention error
 * by checking if the lowercased error message contains 'busy', 'locked', or 'contention'.
 */
export function isContentionError(e: unknown): boolean {
  const msg = String(
    (e as { message?: string })?.message ?? ""
  ).toLowerCase();
  return msg.includes("busy") || msg.includes("locked") || msg.includes("contention");
}
