import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor, DecodedCursor } from "../src/utils/cursor";

describe("cursor encode/decode", () => {
  const validCursor: DecodedCursor = {
    createdAt: "2025-01-20T10:30:00.000Z",
    id: "019467a0-b1c2-7def-8901-234567890abc",
  };

  describe("encodeCursor", () => {
    it("returns a base64url string without padding", () => {
      const encoded = encodeCursor(validCursor);
      // Should not contain +, /, or =
      expect(encoded).not.toMatch(/[+/=]/);
    });

    it("produces a non-empty string", () => {
      const encoded = encodeCursor(validCursor);
      expect(encoded.length).toBeGreaterThan(0);
    });
  });

  describe("decodeCursor", () => {
    it("round-trips a valid cursor", () => {
      const encoded = encodeCursor(validCursor);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(validCursor);
    });

    it("returns null for empty string", () => {
      expect(decodeCursor("")).toBeNull();
    });

    it("returns null for invalid base64", () => {
      expect(decodeCursor("!!!not-base64!!!")).toBeNull();
    });

    it("returns null for valid base64 but invalid JSON", () => {
      const encoded = btoa("not json at all")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      expect(decodeCursor(encoded)).toBeNull();
    });

    it("returns null when createdAt is missing", () => {
      const encoded = btoa(JSON.stringify({ id: "some-id" }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      expect(decodeCursor(encoded)).toBeNull();
    });

    it("returns null when id is missing", () => {
      const encoded = btoa(JSON.stringify({ createdAt: "2025-01-01T00:00:00Z" }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      expect(decodeCursor(encoded)).toBeNull();
    });

    it("returns null when createdAt is empty string", () => {
      const encoded = btoa(JSON.stringify({ createdAt: "", id: "some-id" }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      expect(decodeCursor(encoded)).toBeNull();
    });

    it("returns null when id is empty string", () => {
      const encoded = btoa(JSON.stringify({ createdAt: "2025-01-01T00:00:00Z", id: "" }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      expect(decodeCursor(encoded)).toBeNull();
    });

    it("returns null when createdAt is not a string", () => {
      const encoded = btoa(JSON.stringify({ createdAt: 12345, id: "some-id" }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      expect(decodeCursor(encoded)).toBeNull();
    });

    it("returns null when id is not a string", () => {
      const encoded = btoa(JSON.stringify({ createdAt: "2025-01-01T00:00:00Z", id: 999 }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      expect(decodeCursor(encoded)).toBeNull();
    });

    it("returns null for null input value encoded as JSON", () => {
      const encoded = btoa("null")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      expect(decodeCursor(encoded)).toBeNull();
    });
  });

  describe("round-trip stability", () => {
    it("preserves various ISO 8601 timestamps", () => {
      const cursors: DecodedCursor[] = [
        { createdAt: "2025-12-31T23:59:59.999Z", id: "019467a0-0000-7000-8000-000000000001" },
        { createdAt: "2020-01-01T00:00:00Z", id: "01234567-89ab-7cde-f012-3456789abcde" },
        { createdAt: "2025-06-15T12:00:00+07:00", id: "019467a0-b1c2-7def-8901-ffffffffffff" },
      ];

      for (const cursor of cursors) {
        const encoded = encodeCursor(cursor);
        const decoded = decodeCursor(encoded);
        expect(decoded).toEqual(cursor);
      }
    });
  });
});
