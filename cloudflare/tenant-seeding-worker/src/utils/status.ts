/**
 * Status utility functions for tenant user seeding operations.
 *
 * Provides logic for determining the final seeding status based on
 * user creation outcomes, and for truncating error details to stay
 * within KV storage limits.
 */

import type { ErrorEntry } from '../types';

/** Maximum number of error entries stored in a seeding status record */
const MAX_ERROR_ENTRIES = 50;

/** Maximum character length for each error message */
const MAX_ERROR_LENGTH = 500;

/**
 * Determines the final seeding status based on creation outcome counts.
 *
 * - users_failed == 0 → "completed" (all users created successfully)
 * - users_created > 0 AND users_failed > 0 → "partial" (some succeeded, some failed)
 * - users_created == 0 → "failed" (no users created)
 *
 * @param usersCreated - Number of users successfully created
 * @param usersFailed - Number of users that failed to create
 * @returns The determined seeding status
 */
export function determineStatus(
  usersCreated: number,
  usersFailed: number
): 'completed' | 'partial' | 'failed' {
  if (usersFailed === 0) {
    return 'completed';
  }

  if (usersCreated > 0 && usersFailed > 0) {
    return 'partial';
  }

  return 'failed';
}

/**
 * Truncates error details to stay within KV storage limits.
 *
 * - Caps the array at 50 entries (takes the first 50)
 * - Truncates each entry's `error` field to a maximum of 500 characters
 *
 * @param errors - Array of error entries to truncate
 * @returns A new array with truncated entries
 */
export function truncateErrorDetails(errors: ErrorEntry[]): ErrorEntry[] {
  const capped = errors.slice(0, MAX_ERROR_ENTRIES);

  return capped.map((entry) => ({
    ...entry,
    error: entry.error.length > MAX_ERROR_LENGTH
      ? entry.error.slice(0, MAX_ERROR_LENGTH)
      : entry.error,
  }));
}
