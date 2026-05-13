/**
 * Token parser for accession number format patterns.
 *
 * Supports the following token placeholders:
 * - Date tokens: {YYYY}, {YY}, {MM}, {DD}, {DOY}, {HOUR}, {MIN}, {SEC}
 * - Context tokens: {MOD}, {ORG}, {SITE}
 * - Sequence tokens: {NNN...} (N count = digits), {SEQn} (e.g., {SEQ4})
 * - Random tokens: {RANDn} (e.g., {RAND3})
 */

/**
 * Represents a parsed segment of a format pattern.
 */
export interface Token {
  /** true if this is a {placeholder}, false if literal text */
  isToken: boolean;
  /** original text (e.g., "{YYYY}" or "-") */
  text: string;
  /** normalized token name (e.g., "YYYY", "SEQ4", "RAND3") */
  normalized?: string;
  /** true for {NNN...} or {SEQn} tokens */
  isSequence?: boolean;
  /** true for {RANDn} tokens */
  isRandom?: boolean;
  /** number of digits for sequence/random tokens */
  digits?: number;
}

/** Known simple token names (date, modality, org, site). */
const KNOWN_TOKENS = new Set([
  "YYYY",
  "YY",
  "MM",
  "DD",
  "DOY",
  "HOUR",
  "MIN",
  "SEC",
  "MOD",
  "ORG",
  "SITE",
]);

/** Matches {SEQn} where n is one or more digits. */
const SEQ_REGEX = /^SEQ(\d+)$/;

/** Matches {RANDn} where n is one or more digits. */
const RAND_REGEX = /^RAND(\d+)$/;

/** Matches {NNN...} — one or more consecutive N characters. */
const N_REPEAT_REGEX = /^N+$/;

/**
 * Parse a format pattern string into an array of Token objects.
 *
 * Splits the pattern into literal text segments and `{...}` token segments.
 * Each token is classified and normalized according to its type.
 *
 * @param pattern - The format pattern string (e.g., "{ORG}-{YYYY}{MM}{DD}-{NNNN}")
 * @returns An array of Token objects representing the parsed pattern
 */
export function tokenize(pattern: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < pattern.length) {
    if (pattern[i] === "{") {
      // Find the closing brace
      const closeIdx = pattern.indexOf("}", i + 1);
      if (closeIdx === -1) {
        // No closing brace found — treat rest as literal text
        tokens.push({
          isToken: false,
          text: pattern.slice(i),
        });
        break;
      }

      const fullText = pattern.slice(i, closeIdx + 1); // e.g., "{YYYY}"
      const inner = pattern.slice(i + 1, closeIdx);     // e.g., "YYYY"

      tokens.push(parseTokenContent(fullText, inner));
      i = closeIdx + 1;
    } else {
      // Accumulate literal text until the next `{` or end of string
      const nextBrace = pattern.indexOf("{", i);
      const end = nextBrace === -1 ? pattern.length : nextBrace;
      tokens.push({
        isToken: false,
        text: pattern.slice(i, end),
      });
      i = end;
    }
  }

  return tokens;
}

/**
 * Classify and normalize a single token's inner content.
 */
function parseTokenContent(fullText: string, inner: string): Token {
  // Check for {NNN...} pattern (all N characters)
  if (N_REPEAT_REGEX.test(inner)) {
    const digits = inner.length;
    return {
      isToken: true,
      text: fullText,
      normalized: `SEQ${digits}`,
      isSequence: true,
      digits,
    };
  }

  // Check for {SEQn} pattern
  const seqMatch = SEQ_REGEX.exec(inner);
  if (seqMatch) {
    const digits = parseInt(seqMatch[1]!, 10);
    return {
      isToken: true,
      text: fullText,
      normalized: `SEQ${digits}`,
      isSequence: true,
      digits,
    };
  }

  // Check for {RANDn} pattern
  const randMatch = RAND_REGEX.exec(inner);
  if (randMatch) {
    const digits = parseInt(randMatch[1]!, 10);
    return {
      isToken: true,
      text: fullText,
      normalized: `RAND${digits}`,
      isRandom: true,
      digits,
    };
  }

  // Check for known simple tokens (date, modality, org, site)
  if (KNOWN_TOKENS.has(inner)) {
    return {
      isToken: true,
      text: fullText,
      normalized: inner,
    };
  }

  // Unknown token — still mark as a token with normalized name
  return {
    isToken: true,
    text: fullText,
    normalized: inner,
  };
}
