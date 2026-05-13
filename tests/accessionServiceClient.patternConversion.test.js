import { describe, it, expect } from 'vitest';
import { workerPatternToUI, uiPatternToWorker } from '../src/services/accessionServiceClient.js';

describe('workerPatternToUI', () => {
  it('converts {NNNN} to {SEQ4}', () => {
    expect(workerPatternToUI('{NNNN}')).toBe('{SEQ4}');
  });

  it('converts {NN} to {SEQ2}', () => {
    expect(workerPatternToUI('{NN}')).toBe('{SEQ2}');
  });

  it('converts {N} to {SEQ1}', () => {
    expect(workerPatternToUI('{N}')).toBe('{SEQ1}');
  });

  it('converts {NNNNNNNN} to {SEQ8}', () => {
    expect(workerPatternToUI('{NNNNNNNN}')).toBe('{SEQ8}');
  });

  it('preserves other tokens in the pattern', () => {
    expect(workerPatternToUI('{ORG}-{YYYY}{MM}{DD}-{NNNN}')).toBe('{ORG}-{YYYY}{MM}{DD}-{SEQ4}');
  });

  it('handles patterns with no N tokens', () => {
    expect(workerPatternToUI('{ORG}-{YYYY}{MM}{DD}')).toBe('{ORG}-{YYYY}{MM}{DD}');
  });

  it('handles multiple N tokens in one pattern', () => {
    expect(workerPatternToUI('{NN}-{NNNN}')).toBe('{SEQ2}-{SEQ4}');
  });
});

describe('uiPatternToWorker', () => {
  it('converts {SEQ4} to {NNNN}', () => {
    expect(uiPatternToWorker('{SEQ4}')).toBe('{NNNN}');
  });

  it('converts {SEQ2} to {NN}', () => {
    expect(uiPatternToWorker('{SEQ2}')).toBe('{NN}');
  });

  it('converts {SEQ1} to {N}', () => {
    expect(uiPatternToWorker('{SEQ1}')).toBe('{N}');
  });

  it('converts {SEQ8} to {NNNNNNNN}', () => {
    expect(uiPatternToWorker('{SEQ8}')).toBe('{NNNNNNNN}');
  });

  it('preserves other tokens in the pattern', () => {
    expect(uiPatternToWorker('{ORG}-{YYYY}{MM}{DD}-{SEQ4}')).toBe('{ORG}-{YYYY}{MM}{DD}-{NNNN}');
  });

  it('handles patterns with no SEQ tokens', () => {
    expect(uiPatternToWorker('{ORG}-{YYYY}{MM}{DD}')).toBe('{ORG}-{YYYY}{MM}{DD}');
  });

  it('is case-insensitive for SEQ token', () => {
    expect(uiPatternToWorker('{seq4}')).toBe('{NNNN}');
    expect(uiPatternToWorker('{Seq4}')).toBe('{NNNN}');
  });

  it('handles multiple SEQ tokens in one pattern', () => {
    expect(uiPatternToWorker('{SEQ2}-{SEQ4}')).toBe('{NN}-{NNNN}');
  });
});

describe('Pattern round-trip conversion', () => {
  it('workerPatternToUI → uiPatternToWorker returns original', () => {
    const original = '{ORG}-{YYYY}{MM}{DD}-{NNNN}';
    const ui = workerPatternToUI(original);
    expect(uiPatternToWorker(ui)).toBe(original);
  });

  it('uiPatternToWorker → workerPatternToUI returns original', () => {
    const original = '{ORG}-{YYYY}{MM}{DD}-{SEQ4}';
    const worker = uiPatternToWorker(original);
    expect(workerPatternToUI(worker)).toBe(original);
  });
});
