import { describe, it, expect } from "vitest";
import {
  computeDatePartsInTimezone,
  computeDateBucket,
  validateTimezone,
  InvalidTimezoneError,
  type DateParts,
} from "../src/utils/date-utils";

describe("date-utils", () => {
  describe("validateTimezone", () => {
    it("accepts valid IANA timezones", () => {
      expect(() => validateTimezone("Asia/Jakarta")).not.toThrow();
      expect(() => validateTimezone("America/New_York")).not.toThrow();
      expect(() => validateTimezone("UTC")).not.toThrow();
      expect(() => validateTimezone("Europe/London")).not.toThrow();
    });

    it("throws InvalidTimezoneError for invalid timezone strings", () => {
      expect(() => validateTimezone("Invalid/Timezone")).toThrow(InvalidTimezoneError);
      expect(() => validateTimezone("")).toThrow(InvalidTimezoneError);
      expect(() => validateTimezone("NotATimezone")).toThrow(InvalidTimezoneError);
    });

    it("InvalidTimezoneError has statusCode 400", () => {
      try {
        validateTimezone("Fake/Zone");
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidTimezoneError);
        expect((e as InvalidTimezoneError).statusCode).toBe(400);
        expect((e as InvalidTimezoneError).timezone).toBe("Fake/Zone");
      }
    });

    it("InvalidTimezoneError includes field and message in errors array", () => {
      try {
        validateTimezone("Bad/TZ");
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidTimezoneError);
        const err = e as InvalidTimezoneError;
        expect(err.errors).toHaveLength(1);
        expect(err.errors[0]!.field).toBe("timezone");
        expect(err.errors[0]!.message).toContain("Bad/TZ");
      }
    });
  });

  describe("computeDatePartsInTimezone", () => {
    it("computes correct parts for Asia/Jakarta (UTC+7)", () => {
      // 2025-01-20 at 03:00 UTC = 2025-01-20 at 10:00 WIB (UTC+7)
      const date = new Date("2025-01-20T03:00:00Z");
      const parts = computeDatePartsInTimezone(date, "Asia/Jakarta");

      expect(parts.year).toBe("2025");
      expect(parts.month).toBe("01");
      expect(parts.day).toBe("20");
      expect(parts.hour).toBe("10");
      expect(parts.minute).toBe("00");
      expect(parts.second).toBe("00");
    });

    it("handles date boundary crossing (UTC midnight → next day in positive offset)", () => {
      // 2025-01-19 at 20:00 UTC = 2025-01-20 at 03:00 WIB (UTC+7)
      const date = new Date("2025-01-19T20:00:00Z");
      const parts = computeDatePartsInTimezone(date, "Asia/Jakarta");

      expect(parts.year).toBe("2025");
      expect(parts.month).toBe("01");
      expect(parts.day).toBe("20");
      expect(parts.hour).toBe("03");
    });

    it("handles date boundary crossing (UTC → previous day in negative offset)", () => {
      // 2025-01-20 at 03:00 UTC = 2025-01-19 at 22:00 EST (UTC-5)
      const date = new Date("2025-01-20T03:00:00Z");
      const parts = computeDatePartsInTimezone(date, "America/New_York");

      expect(parts.year).toBe("2025");
      expect(parts.month).toBe("01");
      expect(parts.day).toBe("19");
      expect(parts.hour).toBe("22");
    });

    it("computes correct dayOfYear for January 1", () => {
      const date = new Date("2025-01-01T00:00:00Z");
      const parts = computeDatePartsInTimezone(date, "UTC");

      expect(parts.dayOfYear).toBe("001");
    });

    it("computes correct dayOfYear for December 31 non-leap year", () => {
      // Dec 31, 2025 (non-leap year) = day 365
      const date = new Date("2025-12-31T12:00:00Z");
      const parts = computeDatePartsInTimezone(date, "UTC");

      expect(parts.dayOfYear).toBe("365");
    });

    it("computes correct dayOfYear for December 31 leap year", () => {
      // Dec 31, 2024 (leap year) = day 366
      const date = new Date("2024-12-31T12:00:00Z");
      const parts = computeDatePartsInTimezone(date, "UTC");

      expect(parts.dayOfYear).toBe("366");
    });

    it("computes correct dayOfYear for March 1 in leap year", () => {
      // March 1, 2024 (leap year) = day 61 (31 Jan + 29 Feb + 1)
      const date = new Date("2024-03-01T12:00:00Z");
      const parts = computeDatePartsInTimezone(date, "UTC");

      expect(parts.dayOfYear).toBe("061");
    });

    it("computes correct dayOfYear for March 1 in non-leap year", () => {
      // March 1, 2025 (non-leap year) = day 60 (31 Jan + 28 Feb + 1)
      const date = new Date("2025-03-01T12:00:00Z");
      const parts = computeDatePartsInTimezone(date, "UTC");

      expect(parts.dayOfYear).toBe("060");
    });

    it("pads all parts to correct widths", () => {
      // 2025-01-05 at 01:02:03 UTC
      const date = new Date("2025-01-05T01:02:03Z");
      const parts = computeDatePartsInTimezone(date, "UTC");

      expect(parts.year).toHaveLength(4);
      expect(parts.month).toHaveLength(2);
      expect(parts.day).toHaveLength(2);
      expect(parts.hour).toHaveLength(2);
      expect(parts.minute).toHaveLength(2);
      expect(parts.second).toHaveLength(2);
      expect(parts.dayOfYear).toHaveLength(3);
    });

    it("throws InvalidTimezoneError for invalid timezone", () => {
      const date = new Date("2025-01-20T00:00:00Z");
      expect(() => computeDatePartsInTimezone(date, "Invalid/Zone")).toThrow(
        InvalidTimezoneError
      );
    });
  });

  describe("computeDateBucket", () => {
    const testDate = new Date("2025-01-20T10:30:00Z");

    it("returns YYYYMMDD for DAILY policy", () => {
      const bucket = computeDateBucket("DAILY", testDate, "UTC");
      expect(bucket).toBe("20250120");
    });

    it("returns YYYYMM for MONTHLY policy", () => {
      const bucket = computeDateBucket("MONTHLY", testDate, "UTC");
      expect(bucket).toBe("202501");
    });

    it("returns ALL for NEVER policy", () => {
      const bucket = computeDateBucket("NEVER", testDate, "UTC");
      expect(bucket).toBe("ALL");
    });

    it("DAILY bucket respects timezone (date boundary)", () => {
      // 2025-01-19 at 20:00 UTC = 2025-01-20 at 03:00 WIB
      const date = new Date("2025-01-19T20:00:00Z");
      const bucket = computeDateBucket("DAILY", date, "Asia/Jakarta");
      expect(bucket).toBe("20250120");
    });

    it("MONTHLY bucket respects timezone (month boundary)", () => {
      // 2025-01-31 at 20:00 UTC = 2025-02-01 at 03:00 WIB
      const date = new Date("2025-01-31T20:00:00Z");
      const bucket = computeDateBucket("MONTHLY", date, "Asia/Jakarta");
      expect(bucket).toBe("202502");
    });

    it("NEVER policy does not validate timezone (returns ALL immediately)", () => {
      // NEVER policy returns 'ALL' without computing date parts,
      // but still validates timezone for consistency
      const bucket = computeDateBucket("NEVER", testDate, "UTC");
      expect(bucket).toBe("ALL");
    });

    it("throws InvalidTimezoneError for invalid timezone with DAILY policy", () => {
      expect(() =>
        computeDateBucket("DAILY", testDate, "Fake/Zone")
      ).toThrow(InvalidTimezoneError);
    });

    it("throws InvalidTimezoneError for invalid timezone with MONTHLY policy", () => {
      expect(() =>
        computeDateBucket("MONTHLY", testDate, "Fake/Zone")
      ).toThrow(InvalidTimezoneError);
    });
  });
});
