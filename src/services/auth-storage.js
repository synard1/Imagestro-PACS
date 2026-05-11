// src/services/auth-storage.js
import { logger } from '../utils/logger'
import { setEncrypted, getEncrypted, removeEncrypted } from '../utils/encryptedStorage'

const KEY = 'auth.session.v1';

// In-memory cache so synchronous callers (getAuth, getAuthHeader) work without awaiting
let _cache = null;

/**
 * Initialize the in-memory auth cache from encrypted localStorage.
 * Call once at app startup (before any getAuth() calls).
 */
export async function initAuthCache() {
  try {
    const data = await getEncrypted(KEY);
    _cache = data || null;
    logger.debug('[AUTH-STORAGE] Cache initialized', { hasToken: !!_cache?.access_token });
  } catch (err) {
    logger.error('[AUTH-STORAGE] Failed to init cache:', err);
    _cache = null;
  }
}

export async function setAuth(sess) {
  try {
    const expiresAt = Date.now() + ((+sess.expires_in || 0) * 1000);
    const data = {
      access_token: sess.access_token,
      refresh_token: sess.refresh_token,
      token_type: sess.token_type || 'Bearer',
      expires_in: +sess.expires_in || 0,
      expires_at: expiresAt,
      username: sess.user?.username || '',
      email: sess.user?.email || '',
      role: sess.user?.role || '',
      full_name: sess.user?.full_name || '',
      user_id: sess.user?.id || ''
    };

    logger.info('[AUTH-STORAGE] Saving auth:', {
      key: KEY,
      token_length: data.access_token?.length || 0,
      expires_at: new Date(expiresAt).toISOString()
    });

    await setEncrypted(KEY, data);
    _cache = data;

    logger.info('[AUTH-STORAGE] Auth saved successfully');
    return data;
  } catch (error) {
    logger.error('[AUTH-STORAGE] Error saving auth:', error);
    throw error;
  }
}

export function getAuth() {
  // Returns synchronously from in-memory cache (populated by setAuth or initAuthCache)
  return _cache;
}

export function clearAuth() {
  logger.debug('[AUTH-STORAGE] Clearing auth');
  _cache = null;
  removeEncrypted(KEY);
}

export function isExpired(a = getAuth()) {
  if (!a || !a.expires_at) return true;
  return Date.now() >= a.expires_at;
}

export function getAuthHeader() {
  const a = getAuth();
  if (!a || !a.access_token || isExpired(a)) {
    console.debug('[AUTH-STORAGE] Auth header returning empty (no token or expired)');
    return {};
  }
  const scheme = a.token_type || 'Bearer';
  const header = { Authorization: `${scheme} ${a.access_token}` };
  console.debug('[AUTH-STORAGE] Auth header returning:', { Authorization: '[REDACTED]' });
  return header;
}
