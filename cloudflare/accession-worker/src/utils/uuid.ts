import { uuidv7 } from "uuidv7";

/**
 * Generate a new UUID v7 (time-ordered).
 * Wraps the `uuidv7` package for consistent usage across the codebase.
 */
export function newUuidV7(): string {
  return uuidv7();
}

/**
 * Validate that a string matches the standard UUID format (8-4-4-4-12 hex with hyphens).
 * Accepts both v4 and v7 forms.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_REGEX.test(s);
}
