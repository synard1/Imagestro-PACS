import { describe, it, expect } from "vitest";
import { redact } from "../src/utils/redaction";

describe("redaction utility", () => {
  describe("non-object inputs", () => {
    it("returns null as-is", () => {
      expect(redact(null)).toBe(null);
    });

    it("returns undefined as-is", () => {
      expect(redact(undefined)).toBe(undefined);
    });

    it("returns numbers as-is", () => {
      expect(redact(42)).toBe(42);
    });

    it("returns strings as-is", () => {
      expect(redact("hello")).toBe("hello");
    });

    it("returns booleans as-is", () => {
      expect(redact(true)).toBe(true);
    });
  });

  describe("patient_national_id redaction", () => {
    it("masks NIK showing last 4 digits", () => {
      const result = redact({ patient_national_id: "1234567890123456" });
      expect(result).toEqual({ patient_national_id: "****3456" });
    });

    it("handles short values by showing last 4 chars", () => {
      const result = redact({ patient_national_id: "ABCD" });
      expect(result).toEqual({ patient_national_id: "****ABCD" });
    });

    it("handles values shorter than 4 chars", () => {
      const result = redact({ patient_national_id: "12" });
      expect(result).toEqual({ patient_national_id: "****12" });
    });

    it("handles empty string", () => {
      const result = redact({ patient_national_id: "" });
      expect(result).toEqual({ patient_national_id: "****" });
    });

    it("handles non-string values", () => {
      const result = redact({ patient_national_id: 12345 });
      expect(result).toEqual({ patient_national_id: "****" });
    });
  });

  describe("patient_ihs_number redaction", () => {
    it("replaces with P***********", () => {
      const result = redact({ patient_ihs_number: "P12345678901" });
      expect(result).toEqual({ patient_ihs_number: "P***********" });
    });

    it("replaces regardless of actual value", () => {
      const result = redact({ patient_ihs_number: "anything" });
      expect(result).toEqual({ patient_ihs_number: "P***********" });
    });

    it("handles null value", () => {
      const result = redact({ patient_ihs_number: null });
      expect(result).toEqual({ patient_ihs_number: "P***********" });
    });
  });

  describe("password/token/secret redaction", () => {
    it("redacts password field", () => {
      const result = redact({ password: "my-secret-pass" });
      expect(result).toEqual({ password: "[REDACTED]" });
    });

    it("redacts token field", () => {
      const result = redact({ token: "jwt-token-value" });
      expect(result).toEqual({ token: "[REDACTED]" });
    });

    it("redacts secret field", () => {
      const result = redact({ secret: "super-secret" });
      expect(result).toEqual({ secret: "[REDACTED]" });
    });

    it("redacts case-insensitively (PASSWORD)", () => {
      const result = redact({ PASSWORD: "value" });
      expect(result).toEqual({ PASSWORD: "[REDACTED]" });
    });

    it("redacts case-insensitively (Token)", () => {
      const result = redact({ Token: "value" });
      expect(result).toEqual({ Token: "[REDACTED]" });
    });

    it("redacts case-insensitively (SECRET)", () => {
      const result = redact({ SECRET: "value" });
      expect(result).toEqual({ SECRET: "[REDACTED]" });
    });
  });

  describe("recursive redaction", () => {
    it("redacts nested objects", () => {
      const input = {
        patient: {
          patient_national_id: "1234567890123456",
          name: "John Doe",
        },
      };
      const result = redact(input);
      expect(result).toEqual({
        patient: {
          patient_national_id: "****3456",
          name: "John Doe",
        },
      });
    });

    it("redacts arrays of objects", () => {
      const input = [
        { patient_national_id: "1111222233334444" },
        { patient_national_id: "5555666677778888" },
      ];
      const result = redact(input);
      expect(result).toEqual([
        { patient_national_id: "****4444" },
        { patient_national_id: "****8888" },
      ]);
    });

    it("redacts deeply nested structures", () => {
      const input = {
        data: {
          records: [
            {
              patient_national_id: "1234567890123456",
              patient_ihs_number: "P12345678901",
              auth: { token: "bearer-xyz" },
            },
          ],
        },
      };
      const result = redact(input);
      expect(result).toEqual({
        data: {
          records: [
            {
              patient_national_id: "****3456",
              patient_ihs_number: "P***********",
              auth: { token: "[REDACTED]" },
            },
          ],
        },
      });
    });
  });

  describe("immutability", () => {
    it("does not mutate the original object", () => {
      const original = {
        patient_national_id: "1234567890123456",
        name: "Test",
      };
      const originalCopy = { ...original };
      redact(original);
      expect(original).toEqual(originalCopy);
    });

    it("does not mutate nested objects", () => {
      const nested = { patient_national_id: "1234567890123456" };
      const original = { data: nested };
      redact(original);
      expect(nested.patient_national_id).toBe("1234567890123456");
    });
  });

  describe("non-sensitive fields pass through", () => {
    it("preserves non-sensitive fields unchanged", () => {
      const input = {
        accession_number: "RS01-20250120-0001",
        modality: "CT",
        facility_code: "RS01",
        created_at: "2025-01-20T10:00:00Z",
      };
      const result = redact(input);
      expect(result).toEqual(input);
    });
  });
});
