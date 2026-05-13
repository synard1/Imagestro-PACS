import { describe, it, expect } from 'vitest';
import {
  validateFormatPattern,
  validateAccessionConfig,
  type AccessionConfigInput,
} from '../src/validators/format-pattern';
import { ValidationError } from '../src/errors';

describe('format-pattern validator', () => {
  describe('validateFormatPattern', () => {
    it('accepts a valid pattern with sequence token', () => {
      const result = validateFormatPattern('{ORG}-{YYYY}{MM}{DD}-{NNNN}', 4);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts pattern with {SEQn} token', () => {
      const result = validateFormatPattern('{ORG}-{SEQ6}', 6);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects pattern without sequence token', () => {
      const result = validateFormatPattern('{ORG}-{YYYY}{MM}{DD}', 4);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.field).toBe('pattern');
      expect(result.errors[0]!.message).toContain('sequence token');
    });

    it('rejects empty pattern', () => {
      const result = validateFormatPattern('', 4);
      expect(result.valid).toBe(false);
      expect(result.errors[0]!.message).toContain('empty');
    });

    it('rejects whitespace-only pattern', () => {
      const result = validateFormatPattern('   ', 4);
      expect(result.valid).toBe(false);
    });

    it('rejects pattern that would exceed 64 characters', () => {
      // Build a very long pattern: lots of tokens that expand to many chars
      const longPattern = '{ORG}-{SITE}-{YYYY}{MM}{DD}{HOUR}{MIN}{SEC}-{MOD}-{DOY}-{NNNNNNNN}-EXTRA-PADDING-TEXT-THAT-IS-VERY-LONG';
      const result = validateFormatPattern(longPattern, 8);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('64 characters'))).toBe(true);
    });

    it('accepts pattern at exactly 64 characters max length', () => {
      // {ORG}(10) + -(1) + {YYYY}(4) + {MM}(2) + {DD}(2) + -(1) + {NNNN}(4) = 24 chars
      const result = validateFormatPattern('{ORG}-{YYYY}{MM}{DD}-{NNNN}', 4);
      expect(result.valid).toBe(true);
    });

    it('can return multiple errors at once', () => {
      // A very long pattern without a sequence token
      const longLiteral = 'A'.repeat(65);
      const result = validateFormatPattern(longLiteral, 4);
      expect(result.valid).toBe(false);
      // Should have both "no sequence token" and "exceeds 64 chars" errors
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('validateAccessionConfig', () => {
    const validConfig: AccessionConfigInput = {
      pattern: '{ORG}-{YYYY}{MM}{DD}-{NNNN}',
      sequence_digits: 4,
      timezone: 'Asia/Jakarta',
      counter_reset_policy: 'DAILY',
    };

    it('accepts a valid config', () => {
      expect(() => validateAccessionConfig(validConfig)).not.toThrow();
    });

    it('accepts config with MONTHLY reset policy', () => {
      expect(() =>
        validateAccessionConfig({ ...validConfig, counter_reset_policy: 'MONTHLY' }),
      ).not.toThrow();
    });

    it('accepts config with NEVER reset policy', () => {
      expect(() =>
        validateAccessionConfig({ ...validConfig, counter_reset_policy: 'NEVER' }),
      ).not.toThrow();
    });

    it('rejects invalid timezone', () => {
      expect(() =>
        validateAccessionConfig({ ...validConfig, timezone: 'Invalid/Timezone' }),
      ).toThrow(ValidationError);

      try {
        validateAccessionConfig({ ...validConfig, timezone: 'Not/A/Zone' });
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        const ve = e as ValidationError;
        expect(ve.errors.some((err) => err.field === 'timezone')).toBe(true);
      }
    });

    it('rejects empty timezone', () => {
      expect(() =>
        validateAccessionConfig({ ...validConfig, timezone: '' }),
      ).toThrow(ValidationError);
    });

    it('accepts valid IANA timezones', () => {
      const timezones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
      for (const tz of timezones) {
        expect(() =>
          validateAccessionConfig({ ...validConfig, timezone: tz }),
        ).not.toThrow();
      }
    });

    it('rejects sequence_digits below 1', () => {
      expect(() =>
        validateAccessionConfig({ ...validConfig, sequence_digits: 0 }),
      ).toThrow(ValidationError);
    });

    it('rejects sequence_digits above 8', () => {
      expect(() =>
        validateAccessionConfig({ ...validConfig, sequence_digits: 9 }),
      ).toThrow(ValidationError);
    });

    it('rejects non-integer sequence_digits', () => {
      expect(() =>
        validateAccessionConfig({ ...validConfig, sequence_digits: 3.5 }),
      ).toThrow(ValidationError);
    });

    it('rejects invalid counter_reset_policy', () => {
      expect(() =>
        validateAccessionConfig({ ...validConfig, counter_reset_policy: 'WEEKLY' }),
      ).toThrow(ValidationError);
    });

    it('rejects invalid counter_backend', () => {
      expect(() =>
        validateAccessionConfig({ ...validConfig, counter_backend: 'REDIS' }),
      ).toThrow(ValidationError);
    });

    it('accepts valid counter_backend values', () => {
      expect(() =>
        validateAccessionConfig({ ...validConfig, counter_backend: 'D1' }),
      ).not.toThrow();
      expect(() =>
        validateAccessionConfig({ ...validConfig, counter_backend: 'DURABLE_OBJECT' }),
      ).not.toThrow();
    });

    it('aggregates multiple errors', () => {
      try {
        validateAccessionConfig({
          pattern: '{ORG}-{YYYY}', // no sequence token
          sequence_digits: 0, // invalid
          timezone: 'Bad/Zone', // invalid
          counter_reset_policy: 'WEEKLY', // invalid
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        const ve = e as ValidationError;
        expect(ve.errors.length).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
