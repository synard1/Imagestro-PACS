import { describe, it, expect } from "vitest";
import { tokenize, Token } from "../src/utils/format-tokens";

describe("format-tokens", () => {
  describe("tokenize", () => {
    it("parses a simple literal string with no tokens", () => {
      const tokens = tokenize("ABC-123");
      expect(tokens).toEqual([
        { isToken: false, text: "ABC-123" },
      ]);
    });

    it("parses a single date token", () => {
      const tokens = tokenize("{YYYY}");
      expect(tokens).toEqual([
        { isToken: true, text: "{YYYY}", normalized: "YYYY" },
      ]);
    });

    it("parses the default pattern {ORG}-{YYYY}{MM}{DD}-{NNNN}", () => {
      const tokens = tokenize("{ORG}-{YYYY}{MM}{DD}-{NNNN}");
      expect(tokens).toHaveLength(7);
      expect(tokens[0]).toEqual({ isToken: true, text: "{ORG}", normalized: "ORG" });
      expect(tokens[1]).toEqual({ isToken: false, text: "-" });
      expect(tokens[2]).toEqual({ isToken: true, text: "{YYYY}", normalized: "YYYY" });
      expect(tokens[3]).toEqual({ isToken: true, text: "{MM}", normalized: "MM" });
      expect(tokens[4]).toEqual({ isToken: true, text: "{DD}", normalized: "DD" });
      expect(tokens[5]).toEqual({ isToken: false, text: "-" });
      expect(tokens[6]).toEqual({
        isToken: true,
        text: "{NNNN}",
        normalized: "SEQ4",
        isSequence: true,
        digits: 4,
      });
    });

    it("parses all supported date tokens", () => {
      const pattern = "{YYYY}{YY}{MM}{DD}{DOY}{HOUR}{MIN}{SEC}";
      const tokens = tokenize(pattern);
      const normalized = tokens.map((t) => t.normalized);
      expect(normalized).toEqual(["YYYY", "YY", "MM", "DD", "DOY", "HOUR", "MIN", "SEC"]);
      for (const t of tokens) {
        expect(t.isToken).toBe(true);
        expect(t.isSequence).toBeUndefined();
        expect(t.isRandom).toBeUndefined();
      }
    });

    it("parses {MOD}, {ORG}, {SITE} context tokens", () => {
      const tokens = tokenize("{MOD}/{ORG}/{SITE}");
      expect(tokens).toHaveLength(5);
      expect(tokens[0]).toEqual({ isToken: true, text: "{MOD}", normalized: "MOD" });
      expect(tokens[1]).toEqual({ isToken: false, text: "/" });
      expect(tokens[2]).toEqual({ isToken: true, text: "{ORG}", normalized: "ORG" });
      expect(tokens[3]).toEqual({ isToken: false, text: "/" });
      expect(tokens[4]).toEqual({ isToken: true, text: "{SITE}", normalized: "SITE" });
    });

    describe("{NNN...} sequence tokens", () => {
      it("parses {N} as 1-digit sequence", () => {
        const tokens = tokenize("{N}");
        expect(tokens[0]).toEqual({
          isToken: true,
          text: "{N}",
          normalized: "SEQ1",
          isSequence: true,
          digits: 1,
        });
      });

      it("parses {NNNN} as 4-digit sequence", () => {
        const tokens = tokenize("{NNNN}");
        expect(tokens[0]).toEqual({
          isToken: true,
          text: "{NNNN}",
          normalized: "SEQ4",
          isSequence: true,
          digits: 4,
        });
      });

      it("parses {NNNNNNNN} as 8-digit sequence", () => {
        const tokens = tokenize("{NNNNNNNN}");
        expect(tokens[0]).toEqual({
          isToken: true,
          text: "{NNNNNNNN}",
          normalized: "SEQ8",
          isSequence: true,
          digits: 8,
        });
      });
    });

    describe("{SEQn} sequence tokens", () => {
      it("parses {SEQ4} as 4-digit sequence", () => {
        const tokens = tokenize("{SEQ4}");
        expect(tokens[0]).toEqual({
          isToken: true,
          text: "{SEQ4}",
          normalized: "SEQ4",
          isSequence: true,
          digits: 4,
        });
      });

      it("parses {SEQ1} as 1-digit sequence", () => {
        const tokens = tokenize("{SEQ1}");
        expect(tokens[0]).toEqual({
          isToken: true,
          text: "{SEQ1}",
          normalized: "SEQ1",
          isSequence: true,
          digits: 1,
        });
      });

      it("parses {SEQ10} as 10-digit sequence", () => {
        const tokens = tokenize("{SEQ10}");
        expect(tokens[0]).toEqual({
          isToken: true,
          text: "{SEQ10}",
          normalized: "SEQ10",
          isSequence: true,
          digits: 10,
        });
      });
    });

    describe("{RANDn} random tokens", () => {
      it("parses {RAND3} as 3-digit random", () => {
        const tokens = tokenize("{RAND3}");
        expect(tokens[0]).toEqual({
          isToken: true,
          text: "{RAND3}",
          normalized: "RAND3",
          isRandom: true,
          digits: 3,
        });
      });

      it("parses {RAND6} as 6-digit random", () => {
        const tokens = tokenize("{RAND6}");
        expect(tokens[0]).toEqual({
          isToken: true,
          text: "{RAND6}",
          normalized: "RAND6",
          isRandom: true,
          digits: 6,
        });
      });
    });

    describe("mixed patterns", () => {
      it("handles pattern with sequence and random tokens", () => {
        const tokens = tokenize("{ORG}-{YYYY}{MM}{DD}-{SEQ4}-{RAND3}");
        const seqToken = tokens.find((t) => t.isSequence);
        const randToken = tokens.find((t) => t.isRandom);
        expect(seqToken).toBeDefined();
        expect(seqToken!.normalized).toBe("SEQ4");
        expect(seqToken!.digits).toBe(4);
        expect(randToken).toBeDefined();
        expect(randToken!.normalized).toBe("RAND3");
        expect(randToken!.digits).toBe(3);
      });

      it("handles pattern with multiple sequence tokens", () => {
        const tokens = tokenize("{NNN}-{SEQ2}");
        const seqTokens = tokens.filter((t) => t.isSequence);
        expect(seqTokens).toHaveLength(2);
        expect(seqTokens[0]!.normalized).toBe("SEQ3");
        expect(seqTokens[1]!.normalized).toBe("SEQ2");
      });
    });

    describe("edge cases", () => {
      it("returns empty array for empty string", () => {
        expect(tokenize("")).toEqual([]);
      });

      it("handles unclosed brace as literal text", () => {
        const tokens = tokenize("prefix{UNCLOSED");
        expect(tokens).toHaveLength(2);
        expect(tokens[0]).toEqual({ isToken: false, text: "prefix" });
        expect(tokens[1]).toEqual({ isToken: false, text: "{UNCLOSED" });
      });

      it("handles unknown token content gracefully", () => {
        const tokens = tokenize("{UNKNOWN}");
        expect(tokens[0]).toEqual({
          isToken: true,
          text: "{UNKNOWN}",
          normalized: "UNKNOWN",
        });
      });

      it("handles empty braces as unknown token", () => {
        const tokens = tokenize("{}");
        expect(tokens[0]).toEqual({
          isToken: true,
          text: "{}",
          normalized: "",
        });
      });

      it("handles consecutive literals between tokens", () => {
        const tokens = tokenize("A{MM}B{DD}C");
        expect(tokens).toHaveLength(5);
        expect(tokens[0]).toEqual({ isToken: false, text: "A" });
        expect(tokens[1]).toEqual({ isToken: true, text: "{MM}", normalized: "MM" });
        expect(tokens[2]).toEqual({ isToken: false, text: "B" });
        expect(tokens[3]).toEqual({ isToken: true, text: "{DD}", normalized: "DD" });
        expect(tokens[4]).toEqual({ isToken: false, text: "C" });
      });

      it("preserves original text in token.text", () => {
        const tokens = tokenize("{NNNN}");
        expect(tokens[0]!.text).toBe("{NNNN}");
        expect(tokens[0]!.normalized).toBe("SEQ4");
      });
    });
  });
});
