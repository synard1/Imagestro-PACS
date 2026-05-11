/**
 * AES-GCM encrypted localStorage wrapper.
 *
 * Encryption key is derived from a random seed stored in sessionStorage,
 * meaning the key is regenerated each browser session (tab close).
 * This protects against:
 *   - localStorage scraping by malicious extensions
 *   - XSS from a different tab/window reading the same storage
 *   - Persistence attacks that read localStorage after logout
 *
 * Limitation: does NOT fully protect against XSS within the same tab/session,
 * because the attacker would also have sessionStorage access.
 * Full protection requires httpOnly cookies — tracked in security backlog.
 */

const SESSION_KEY_NAME = '__sk_v1';

async function getOrCreateSessionKey() {
  let raw = sessionStorage.getItem(SESSION_KEY_NAME);
  if (!raw) {
    const keyData = crypto.getRandomValues(new Uint8Array(32));
    raw = btoa(String.fromCharCode(...keyData));
    sessionStorage.setItem(SESSION_KEY_NAME, raw);
  }
  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function toBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

/**
 * Encrypt and store a value in localStorage.
 * Falls back to plaintext on unsupported environments (no crypto.subtle).
 */
export async function setEncrypted(storageKey, value) {
  try {
    if (!crypto?.subtle) {
      localStorage.setItem(storageKey, JSON.stringify(value));
      return;
    }
    const key = await getOrCreateSessionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const payload = JSON.stringify({ iv: toBase64(iv), ct: toBase64(ciphertext) });
    localStorage.setItem(storageKey, payload);
  } catch (err) {
    console.error('[encryptedStorage] Encrypt failed, storing plaintext:', err);
    localStorage.setItem(storageKey, JSON.stringify(value));
  }
}

/**
 * Retrieve and decrypt a value from localStorage.
 * Returns null if the key is missing or decryption fails (e.g., session key changed).
 */
export async function getEncrypted(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    // Legacy plaintext entry (no iv/ct fields) — return as-is and let caller re-save
    if (!parsed?.iv || !parsed?.ct) {
      return parsed;
    }

    if (!crypto?.subtle) return parsed;

    const key = await getOrCreateSessionKey();
    const iv = fromBase64(parsed.iv);
    const ciphertext = fromBase64(parsed.ct);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    // Key mismatch (e.g., sessionStorage was cleared) — entry is unreadable, remove it
    console.warn('[encryptedStorage] Decrypt failed — clearing stale entry:', storageKey);
    localStorage.removeItem(storageKey);
    return null;
  }
}

export function removeEncrypted(storageKey) {
  localStorage.removeItem(storageKey);
}
