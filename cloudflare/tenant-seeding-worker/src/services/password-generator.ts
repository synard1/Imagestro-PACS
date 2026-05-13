/**
 * Secure password generator for tenant default users.
 *
 * Generates 16-character passwords with guaranteed complexity:
 * at least one uppercase, one lowercase, one digit, and one special character.
 * Uses crypto.getRandomValues() for cryptographically secure randomness.
 */

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SPECIAL = '!@#$%^&*';

const ALL_CHARS = UPPER + LOWER + DIGITS + SPECIAL;

const PASSWORD_LENGTH = 16;

/**
 * Pick a random character from the given character set using secure randomness.
 */
function randomChar(charset: string): string {
  const randomBytes = new Uint32Array(1);
  crypto.getRandomValues(randomBytes);
  const index = randomBytes[0]! % charset.length;
  return charset[index]!;
}

/**
 * Fisher-Yates shuffle using crypto.getRandomValues() for unbiased randomness.
 */
function shuffleArray(arr: string[]): string[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const j = randomBytes[0]! % (i + 1);
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }
  return shuffled;
}

/**
 * Generate a secure 16-character password.
 *
 * Guarantees at least one character from each category:
 * uppercase, lowercase, digit, and special character.
 * Remaining characters are drawn from the full character set.
 * The result is shuffled to avoid predictable patterns.
 */
export function generatePassword(): string {
  const chars: string[] = [];

  // Guarantee at least one from each required category
  chars.push(randomChar(UPPER));
  chars.push(randomChar(LOWER));
  chars.push(randomChar(DIGITS));
  chars.push(randomChar(SPECIAL));

  // Fill remaining slots from the full character set
  for (let i = chars.length; i < PASSWORD_LENGTH; i++) {
    chars.push(randomChar(ALL_CHARS));
  }

  // Shuffle to avoid predictable positions
  return shuffleArray(chars).join('');
}
