/**
 * Gateway-wide constants.
 */

export const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB
export const PROXY_TIMEOUT_MS = 30_000; // 30 seconds
export const CIRCUIT_BREAKER_THRESHOLD = 5; // failures before opening
export const CIRCUIT_BREAKER_RESET_MS = 60_000; // 1 minute cooldown
export const VERSION = '2.0.0';
