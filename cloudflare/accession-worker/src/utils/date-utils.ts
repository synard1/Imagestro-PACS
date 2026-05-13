/**
 * Timezone-aware date utilities for accession number generation.
 *
 * Uses `Intl.DateTimeFormat` to compute date parts in a tenant's configured
 * timezone, ensuring counter resets and date tokens align with local business hours.
 *
 * Requirements: 2.3, 2.4, 2.5, 2.13, 2.14, 3.3
 */

import { ValidationError } from '../errors';

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * Typed error for invalid IANA timezone identifiers.
 * Callers can catch this specifically and translate to HTTP 400.
 */
export class InvalidTimezoneError extends ValidationError {
  readonly timezone: string;

  constructor(timezone: string) {
    super([{ field: 'timezone', message: `Invalid IANA timezone: "${timezone}"` }]);
    this.name = 'InvalidTimezoneError';
    this.timezone = timezone;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DateParts {
  /** 4-digit year, e.g. "2025" */
  year: string;
  /** 2-digit month, e.g. "01" */
  month: string;
  /** 2-digit day, e.g. "07" */
  day: string;
  /** 2-digit hour (24h), e.g. "14" */
  hour: string;
  /** 2-digit minute, e.g. "05" */
  minute: string;
  /** 2-digit second, e.g. "09" */
  second: string;
  /** 3-digit day of year, e.g. "007" */
  dayOfYear: string;
}

export type CounterResetPolicy = 'DAILY' | 'MONTHLY' | 'NEVER';

// ─── Timezone Validation ─────────────────────────────────────────────────────

/**
 * Validates that the given string is a valid IANA timezone identifier.
 * Throws an InvalidTimezoneError if invalid, which callers can translate to HTTP 400.
 */
export function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch (e) {
    if (e instanceof RangeError) {
      throw new InvalidTimezoneError(timezone);
    }
    throw e;
  }
}

// ─── Date Parts Computation ──────────────────────────────────────────────────

/**
 * Computes date parts in the given IANA timezone using `Intl.DateTimeFormat`.
 *
 * @param date - The date to decompose
 * @param timezone - IANA timezone identifier (e.g. "Asia/Jakarta")
 * @returns DateParts with zero-padded string values
 * @throws Error if timezone is invalid
 */
export function computeDatePartsInTimezone(date: Date, timezone: string): DateParts {
  validateTimezone(timezone);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  let year = '';
  let month = '';
  let day = '';
  let hour = '';
  let minute = '';
  let second = '';

  for (const part of parts) {
    switch (part.type) {
      case 'year':
        year = part.value;
        break;
      case 'month':
        month = part.value;
        break;
      case 'day':
        day = part.value;
        break;
      case 'hour':
        hour = part.value;
        break;
      case 'minute':
        minute = part.value;
        break;
      case 'second':
        second = part.value;
        break;
    }
  }

  // Some environments return "24" for midnight hour; normalize to "00"
  if (hour === '24') {
    hour = '00';
  }

  // Compute day of year from the local date in the given timezone
  const dayOfYear = computeDayOfYear(parseInt(year, 10), parseInt(month, 10), parseInt(day, 10));

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfYear: dayOfYear.toString().padStart(3, '0'),
  };
}

// ─── Date Bucket Computation ─────────────────────────────────────────────────

/**
 * Computes the date bucket string used for counter scoping based on the
 * tenant's counter reset policy and timezone.
 *
 * @param policy - Counter reset policy: 'DAILY', 'MONTHLY', or 'NEVER'
 * @param date - The date to compute the bucket for
 * @param timezone - IANA timezone identifier
 * @returns Date bucket string: "YYYYMMDD" for DAILY, "YYYYMM" for MONTHLY, "ALL" for NEVER
 * @throws Error if timezone is invalid
 */
export function computeDateBucket(
  policy: CounterResetPolicy,
  date: Date,
  timezone: string,
): string {
  if (policy === 'NEVER') {
    return 'ALL';
  }

  const parts = computeDatePartsInTimezone(date, timezone);

  switch (policy) {
    case 'DAILY':
      return `${parts.year}${parts.month}${parts.day}`;
    case 'MONTHLY':
      return `${parts.year}${parts.month}`;
    default:
      // Exhaustive check — should never reach here with valid policy
      throw new Error(`Invalid counter reset policy: "${policy}"`);
  }
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Computes the day of year (1-366) for a given local date.
 */
function computeDayOfYear(year: number, month: number, day: number): number {
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let dayOfYear = 0;
  for (let i = 0; i < month - 1; i++) {
    dayOfYear += daysInMonth[i]!;
  }
  dayOfYear += day;
  return dayOfYear;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
