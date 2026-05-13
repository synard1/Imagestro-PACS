import { describe, it, expect } from "vitest";
import { sleep, backoffSchedule, isContentionError } from "../src/utils/backoff";

describe("backoff utilities", () => {
  describe("sleep", () => {
    it("resolves after the specified delay", async () => {
      const start = Date.now();
      await sleep(20);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(15); // allow small timing variance
    });

    it("returns a Promise<void>", async () => {
      const result = await sleep(0);
      expect(result).toBeUndefined();
    });
  });

  describe("backoffSchedule", () => {
    it("contains exactly [10, 40, 160]", () => {
      expect(backoffSchedule).toEqual([10, 40, 160]);
    });

    it("has 3 entries (matching 3 retry attempts)", () => {
      expect(backoffSchedule).toHaveLength(3);
    });

    it("is typed as readonly (compile-time immutability)", () => {
      // TypeScript enforces readonly at compile time via `readonly number[]`
      // Verify the values are correct and the array is not accidentally mutated
      const copy = [...backoffSchedule];
      expect(copy).toEqual([10, 40, 160]);
    });
  });

  describe("isContentionError", () => {
    it("returns true for error with 'busy' in message", () => {
      expect(isContentionError(new Error("database is busy"))).toBe(true);
    });

    it("returns true for error with 'locked' in message", () => {
      expect(isContentionError(new Error("database locked"))).toBe(true);
    });

    it("returns true for error with 'contention' in message", () => {
      expect(isContentionError(new Error("write contention detected"))).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(isContentionError(new Error("Database BUSY"))).toBe(true);
      expect(isContentionError(new Error("LOCKED resource"))).toBe(true);
      expect(isContentionError(new Error("CONTENTION error"))).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      expect(isContentionError(new Error("network timeout"))).toBe(false);
      expect(isContentionError(new Error("schema error"))).toBe(false);
      expect(isContentionError(new Error("not found"))).toBe(false);
    });

    it("handles null/undefined gracefully", () => {
      expect(isContentionError(null)).toBe(false);
      expect(isContentionError(undefined)).toBe(false);
    });

    it("handles non-Error objects with message property", () => {
      expect(isContentionError({ message: "database is busy" })).toBe(true);
      expect(isContentionError({ message: "something else" })).toBe(false);
    });

    it("handles objects without message property", () => {
      expect(isContentionError({})).toBe(false);
      expect(isContentionError({ code: 500 })).toBe(false);
    });

    it("handles string values (no message property)", () => {
      expect(isContentionError("busy")).toBe(false);
    });
  });
});
