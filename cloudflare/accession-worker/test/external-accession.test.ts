import { describe, it, expect } from "vitest";
import { validateExternalAccessionNumber } from "../src/validators/external-accession";

describe("validateExternalAccessionNumber", () => {
  describe("valid inputs", () => {
    it("accepts a typical accession number", () => {
      const result = validateExternalAccessionNumber("SIMRS-20250120-0001");
      expect(result).toEqual({ valid: true });
    });

    it("accepts a single character", () => {
      const result = validateExternalAccessionNumber("A");
      expect(result).toEqual({ valid: true });
    });

    it("accepts exactly 64 characters", () => {
      const value = "A".repeat(64);
      const result = validateExternalAccessionNumber(value);
      expect(result).toEqual({ valid: true });
    });

    it("accepts printable ASCII with spaces in between", () => {
      const result = validateExternalAccessionNumber("ACC 2025 001");
      expect(result).toEqual({ valid: true });
    });

    it("accepts all printable ASCII characters (within length limit)", () => {
      // Use a subset of printable ASCII that fits within 64 chars
      let printableSubset = "";
      for (let i = 0x20; i <= 0x5f; i++) {
        printableSubset += String.fromCharCode(i);
      }
      // 64 chars: 0x20 to 0x5F inclusive
      expect(printableSubset.length).toBe(64);
      const result = validateExternalAccessionNumber(printableSubset);
      expect(result).toEqual({ valid: true });
    });

    it("accepts remaining printable ASCII characters", () => {
      // Chars from 0x60 (`) to 0x7E (~) = 31 chars
      let remaining = "";
      for (let i = 0x60; i <= 0x7e; i++) {
        remaining += String.fromCharCode(i);
      }
      const result = validateExternalAccessionNumber(remaining);
      expect(result).toEqual({ valid: true });
    });

    it("accepts string with leading/trailing spaces if not all whitespace", () => {
      const result = validateExternalAccessionNumber(" ACC-001 ");
      expect(result).toEqual({ valid: true });
    });
  });

  describe("empty or whitespace-only", () => {
    it("rejects empty string", () => {
      const result = validateExternalAccessionNumber("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("rejects whitespace-only (single space)", () => {
      const result = validateExternalAccessionNumber(" ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("whitespace");
    });

    it("rejects whitespace-only (multiple spaces)", () => {
      const result = validateExternalAccessionNumber("     ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("whitespace");
    });
  });

  describe("length constraint", () => {
    it("rejects string exceeding 64 characters", () => {
      const value = "A".repeat(65);
      const result = validateExternalAccessionNumber(value);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("64");
    });

    it("rejects very long string", () => {
      const value = "X".repeat(200);
      const result = validateExternalAccessionNumber(value);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("64");
    });
  });

  describe("control characters", () => {
    it("rejects null character (0x00)", () => {
      const result = validateExternalAccessionNumber("ACC\x00001");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid character");
    });

    it("rejects tab character (0x09)", () => {
      const result = validateExternalAccessionNumber("ACC\t001");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid character");
    });

    it("rejects newline (0x0A)", () => {
      const result = validateExternalAccessionNumber("ACC\n001");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid character");
    });

    it("rejects carriage return (0x0D)", () => {
      const result = validateExternalAccessionNumber("ACC\r001");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid character");
    });

    it("rejects DEL character (0x7F)", () => {
      const result = validateExternalAccessionNumber("ACC\x7F001");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid character");
    });

    it("rejects character below space (0x1F)", () => {
      const result = validateExternalAccessionNumber("ACC\x1F001");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid character");
    });

    it("reports the position of the invalid character", () => {
      const result = validateExternalAccessionNumber("AB\x01C");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("position 2");
    });
  });

  describe("non-ASCII characters", () => {
    it("rejects characters above 0x7E (e.g., extended Latin)", () => {
      const result = validateExternalAccessionNumber("ACC-ñ-001");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid character");
    });

    it("rejects emoji", () => {
      const result = validateExternalAccessionNumber("ACC-🏥-001");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid character");
    });
  });
});
