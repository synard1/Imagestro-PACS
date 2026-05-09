/**
 * Password Generator Utility
 * Generate secure random passwords with customizable options
 */

/**
 * Character sets for password generation
 */
const CHAR_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

/**
 * Generate a random password based on options
 * @param {Object} options - Password generation options
 * @param {number} options.length - Length of password (default: 12)
 * @param {boolean} options.uppercase - Include uppercase letters (default: true)
 * @param {boolean} options.lowercase - Include lowercase letters (default: true)
 * @param {boolean} options.numbers - Include numbers (default: true)
 * @param {boolean} options.symbols - Include symbols (default: true)
 * @returns {string} Generated password
 */
export const generatePassword = (options = {}) => {
  const {
    length = 12,
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
  } = options;

  // Build character pool based on selected options
  let charPool = '';
  const requiredChars = [];

  if (uppercase) {
    charPool += CHAR_SETS.uppercase;
    requiredChars.push(CHAR_SETS.uppercase[Math.floor(Math.random() * CHAR_SETS.uppercase.length)]);
  }
  if (lowercase) {
    charPool += CHAR_SETS.lowercase;
    requiredChars.push(CHAR_SETS.lowercase[Math.floor(Math.random() * CHAR_SETS.lowercase.length)]);
  }
  if (numbers) {
    charPool += CHAR_SETS.numbers;
    requiredChars.push(CHAR_SETS.numbers[Math.floor(Math.random() * CHAR_SETS.numbers.length)]);
  }
  if (symbols) {
    charPool += CHAR_SETS.symbols;
    requiredChars.push(CHAR_SETS.symbols[Math.floor(Math.random() * CHAR_SETS.symbols.length)]);
  }

  // If no character set selected, use all
  if (charPool.length === 0) {
    charPool = CHAR_SETS.uppercase + CHAR_SETS.lowercase + CHAR_SETS.numbers + CHAR_SETS.symbols;
  }

  // Generate password
  let password = '';
  const minLength = Math.max(length, requiredChars.length);

  // Add required characters first to ensure at least one of each type
  for (let i = 0; i < requiredChars.length; i++) {
    password += requiredChars[i];
  }

  // Fill remaining length with random characters
  for (let i = requiredChars.length; i < minLength; i++) {
    const randomIndex = Math.floor(Math.random() * charPool.length);
    password += charPool[randomIndex];
  }

  // Shuffle password to randomize position of required characters
  password = password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');

  return password;
};

/**
 * Calculate password strength
 * @param {string} password - Password to evaluate
 * @returns {Object} Strength information
 */
export const calculatePasswordStrength = (password) => {
  if (!password) {
    return { score: 0, label: 'None', color: 'gray' };
  }

  let score = 0;
  const length = password.length;

  // Length score
  if (length >= 8) score += 1;
  if (length >= 12) score += 1;
  if (length >= 16) score += 1;

  // Character variety score
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  // Determine strength level
  if (score <= 2) {
    return { score, label: 'Weak', color: 'red' };
  } else if (score <= 4) {
    return { score, label: 'Fair', color: 'yellow' };
  } else if (score <= 6) {
    return { score, label: 'Good', color: 'blue' };
  } else {
    return { score, label: 'Strong', color: 'green' };
  }
};

/**
 * Default password generation options
 */
export const DEFAULT_PASSWORD_OPTIONS = {
  length: 12,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
};

export default {
  generatePassword,
  calculatePasswordStrength,
  DEFAULT_PASSWORD_OPTIONS,
};
