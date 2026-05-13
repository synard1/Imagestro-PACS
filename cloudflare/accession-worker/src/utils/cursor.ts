/**
 * Opaque keyset pagination cursor encode/decode.
 *
 * The cursor encodes the (createdAt, id) tuple as base64url JSON,
 * enabling stable keyset pagination over (created_at DESC, id DESC).
 */

export interface DecodedCursor {
  createdAt: string; // ISO 8601
  id: string; // UUID v7
}

/**
 * Encode a cursor object into a base64url string.
 * The result is URL-safe (no +, /, or = characters).
 */
export function encodeCursor(cursor: DecodedCursor): string {
  const json = JSON.stringify({ createdAt: cursor.createdAt, id: cursor.id });
  const base64 = btoa(json);
  // Convert standard base64 to base64url
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decode a base64url-encoded cursor string back into a DecodedCursor.
 * Returns null if the input is invalid in any way (never throws).
 */
export function decodeCursor(encoded: string): DecodedCursor | null {
  try {
    // Convert base64url back to standard base64
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    // Restore padding
    const remainder = base64.length % 4;
    if (remainder === 2) {
      base64 += "==";
    } else if (remainder === 3) {
      base64 += "=";
    }

    const json = atob(base64);
    const parsed = JSON.parse(json);

    // Validate shape: both createdAt and id must be non-empty strings
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.id !== "string" ||
      parsed.createdAt.length === 0 ||
      parsed.id.length === 0
    ) {
      return null;
    }

    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}
