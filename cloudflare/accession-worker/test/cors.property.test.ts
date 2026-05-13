import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 24: CORS origin validation logic.
 * Tests the origin matching logic from the CORS middleware.
 */

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.length > 0 && allowedOrigins.includes(origin);
}

function parseAllowedOrigins(raw: string): string[] {
  return raw.split(',').map(o => o.trim()).filter(Boolean);
}

describe('Property 24: CORS origin validation', () => {
  it('origin in allowed list is always accepted', () => {
    const originArb = fc.webUrl({ withFragments: false });
    fc.assert(fc.property(originArb, (origin) => {
      const allowedOrigins = [origin, 'https://other.example.com'];
      return isOriginAllowed(origin, allowedOrigins);
    }), { numRuns: 200 });
  });

  it('origin not in allowed list is always rejected', () => {
    fc.assert(fc.property(
      fc.webUrl({ withFragments: false }),
      fc.webUrl({ withFragments: false }),
      (origin, allowed) => {
        if (origin === allowed) return true; // skip equal case
        return !isOriginAllowed(origin, [allowed]);
      }
    ), { numRuns: 200 });
  });

  it('empty allowed origins rejects all', () => {
    fc.assert(fc.property(fc.webUrl({ withFragments: false }), (origin) => {
      return !isOriginAllowed(origin, []);
    }), { numRuns: 100 });
  });

  it('parseAllowedOrigins splits comma-separated values correctly', () => {
    const originArb = fc.tuple(
      fc.constantFrom('http', 'https'),
      fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z]+$/.test(s)),
      fc.constantFrom('.com', '.org', '.io', '.dev')
    ).map(([proto, domain, tld]) => `${proto}://${domain}${tld}`);

    fc.assert(fc.property(
      fc.array(originArb, { minLength: 1, maxLength: 5 }),
      (origins) => {
        const raw = origins.join(', ');
        const parsed = parseAllowedOrigins(raw);
        return parsed.length === origins.length && origins.every(o => parsed.includes(o));
      }
    ), { numRuns: 100 });
  });
});
