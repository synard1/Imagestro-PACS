import { describe, it, expect } from "vitest";
import { newUuidV7, isUuid } from "../src/utils/uuid";

describe("uuid utilities", () => {
  describe("newUuidV7", () => {
    it("returns a valid UUID string", () => {
      const id = newUuidV7();
      expect(isUuid(id)).toBe(true);
    });

    it("generates unique values on each call", () => {
      const ids = new Set(Array.from({ length: 100 }, () => newUuidV7()));
      expect(ids.size).toBe(100);
    });

    it("produces v7 format (version nibble is 7)", () => {
      const id = newUuidV7();
      // Version is the high nibble of the 7th byte (position 14 in the string)
      expect(id[14]).toBe("7");
    });
  });

  describe("isUuid", () => {
    it("accepts a valid UUID v4", () => {
      expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });

    it("accepts a valid UUID v7", () => {
      const id = newUuidV7();
      expect(isUuid(id)).toBe(true);
    });

    it("accepts uppercase UUIDs", () => {
      expect(isUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    });

    it("rejects strings without hyphens", () => {
      expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
    });

    it("rejects strings with wrong length", () => {
      expect(isUuid("550e8400-e29b-41d4-a716-44665544000")).toBe(false);
    });

    it("rejects strings with non-hex characters", () => {
      expect(isUuid("550e8400-e29b-41d4-a716-44665544000g")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isUuid("")).toBe(false);
    });

    it("rejects random text", () => {
      expect(isUuid("not-a-uuid-at-all")).toBe(false);
    });
  });
});
