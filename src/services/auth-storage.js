// src/services/auth-storage.js
import { logger } from '../utils/logger'

const KEY = 'auth.session.v1';

export function setAuth(sess) {
  try {
    // sess: { access_token, refresh_token, token_type, expires_in, user }
    const expiresAt = Date.now() + ((+sess.expires_in || 0) * 1000);
    const data = {
      access_token: sess.access_token,
      refresh_token: sess.refresh_token,
      token_type: sess.token_type || 'Bearer',
      expires_in: +sess.expires_in || 0,
      expires_at: expiresAt,
      // Store user info for session management
      username: sess.user?.username || '',
      email: sess.user?.email || '',
      role: sess.user?.role || '',
      full_name: sess.user?.full_name || '',
      user_id: sess.user?.id || ''
    };

    logger.info('[AUTH-STORAGE] Saving auth to localStorage:', {
      key: KEY,
      token_length: data.access_token?.length || 0,
      expires_at: new Date(expiresAt).toISOString(),
      username: data.username,
      role: data.role
    });

    localStorage.setItem(KEY, JSON.stringify(data));

    // Verify it was saved
    const saved = localStorage.getItem(KEY);
    if (!saved) {
      logger.error('[AUTH-STORAGE] Failed to save auth to localStorage!');
      throw new Error('localStorage.setItem failed');
    }

    logger.info('[AUTH-STORAGE] Auth saved and verified successfully');
    return data;
  } catch (error) {
    logger.error('[AUTH-STORAGE] Error saving auth:', error);
    throw error;
  }
}

export function getAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      logger.debug('[AUTH-STORAGE] No auth found in localStorage');
      return null;
    }

    const parsed = JSON.parse(raw);
    logger.debug('[AUTH-STORAGE] Auth loaded from localStorage:', {
      has_token: !!parsed.access_token,
      token_length: parsed.access_token?.length || 0,
      expires_at: parsed.expires_at ? new Date(parsed.expires_at).toISOString() : 'unknown',
      is_expired: parsed.expires_at ? Date.now() >= parsed.expires_at : true
    });

    return parsed;
  } catch (error) {
    logger.error('[AUTH-STORAGE] Error loading auth:', error);
    return null;
  }
}

export function clearAuth() {
  logger.debug('[AUTH-STORAGE] Clearing auth from localStorage');
  localStorage.removeItem(KEY);

  // Verify it was cleared
  const check = localStorage.getItem(KEY);
  if (check) {
    logger.error('[AUTH-STORAGE] Failed to clear auth!');
  } else {
    logger.debug('[AUTH-STORAGE] Auth cleared successfully');
  }
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
  console.debug('[AUTH-STORAGE] Auth header returning:', header);
  return header;
}