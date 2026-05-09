import { logger } from "../utils/logger";
import { 
  isHighPrivUser as checkHighPrivUser,
  isReservedRole,
  isReservedPermission,
  canManageRole,
  canManagePermission,
  filterRolesForUser,
  filterPermissionsForUser,
  getRoleProtectionInfo,
  getPermissionProtectionInfo,
} from "./rbacConstants";

const KEY = "app.currentUser";

/**
 * Load user from storage
 * Migrates from localStorage to sessionStorage if needed
 * Returns null if no user data exists or if data is invalid
 */
function load() {
  try {
    // Try sessionStorage first (secure)
    let raw = sessionStorage.getItem(KEY);
    
    // Fallback and migration from localStorage (insecure)
    if (!raw) {
      raw = localStorage.getItem(KEY);
      if (raw) {
        logger.info("[RBAC] Migrating user session from localStorage to sessionStorage");
        sessionStorage.setItem(KEY, raw);
        localStorage.removeItem(KEY);
      }
    }

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // Validate user data structure
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    // Basic validation - user must have at least an id
    if (!parsed.id) {
      logger.warn("Invalid user data in storage: missing id");
      return null;
    }

    // Ensure required fields have defaults, preserve all profile fields from backend
    return {
      ...parsed, // Preserve all profile fields (telegram, whatsapp, phone_number, full_name, etc.)
      id: parsed.id,
      name: parsed.name || parsed.username || "User",
      username: parsed.username || null,
      email: parsed.email || null,
      role: parsed.role || "user",
      permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
    };
  } catch (e) {
    logger.error("Error loading user from storage:", e);
    return null;
  }
}

// Initialize currentUser - will be null if not authenticated
export let currentUser = load();

// Auth change listeners
const listeners = new Set();

/**
 * Register a callback to be notified when auth state changes
 * @param {Function} callback - Called with current user data
 * @returns {Function} Unsubscribe function
 */
export function onAuthChanged(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Notify all listeners of auth state change
 */
function notifyAuthChanged() {
  listeners.forEach((cb) => {
    try {
      cb(currentUser);
    } catch (error) {
      logger.error("Error in auth change listener:", error);
    }
  });
}

/**
 * Set current user and persist to storage
 * @param {Object} user - User object with id, name, role, permissions
 */
export function setCurrentUser(user) {
  if (!user || !user.id) {
    logger.error("[RBAC] Invalid user object: must have id", user);
    return;
  }

  // Normalize and validate user data
  const normalizedUser = {
    ...user, // keep additional profile fields (whatsapp, telegram, etc.)
    id: user.id,
    name: user.name || user.username || "User",
    username: user.username || null,
    email: user.email || null,
    role: user.role || "user",
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };

  logger.info("[RBAC] Setting current user:", {
    id: normalizedUser.id,
    name: normalizedUser.name,
    role: normalizedUser.role,
    permissions_count: normalizedUser.permissions.length,
  });

  currentUser = normalizedUser;
  
  // Always use sessionStorage for PHI protection
  sessionStorage.setItem(KEY, JSON.stringify(normalizedUser));
  
  // Explicitly remove from localStorage if it exists
  localStorage.removeItem(KEY);

  // Verify it was saved
  const saved = sessionStorage.getItem(KEY);
  if (!saved) {
    logger.error("[RBAC] Failed to save user to sessionStorage!");
  } else {
    logger.debug("[RBAC] User saved to sessionStorage successfully");
  }

  notifyAuthChanged();
}

/**
 * Clear current user and remove from storage
 */
export function clearCurrentUser() {
  logger.debug("[RBAC] Clearing current user");
  currentUser = null;
  sessionStorage.removeItem(KEY);
  localStorage.removeItem(KEY);

  // Verify it was cleared
  const check = sessionStorage.getItem(KEY);
  if (check) {
    logger.error("[RBAC] Failed to clear user from sessionStorage!");
  } else {
    logger.debug("[RBAC] User cleared from storage successfully");
  }

  notifyAuthChanged();
}

/**
 * Get current user
 * @returns {Object|null} Current user object or null if not authenticated
 */
export function getCurrentUser() {
  return currentUser;
}

/* ========== RBAC helpers (wildcard aware) ========== */

/**
 * Normalize permission string by converting `:` separator to `.`
 * This ensures compatibility between backend (uses `:`) and frontend (uses `.`)
 * @param {string} perm - Permission string
 * @returns {string} Normalized permission string
 */
function normalizePerm(perm) {
  if (!perm || typeof perm !== 'string') return '';
  return perm.replace(/:/g, '.');
}

/**
 * Convert user permissions to a Set for efficient lookup
 * Normalizes all permissions to use `.` separator
 * @param {Object} user - User object
 * @returns {Set} Set of normalized permission strings
 */
function toPermSet(user) {
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  return new Set(perms.map(p => normalizePerm(p)));
}

/**
 * Check if user has a permission, considering wildcards
 * Supports:
 * - Exact match (with separator normalization)
 * - Global wildcard (*)
 * - Category wildcards (e.g., "patient.*" or "patient:*")
 * - Required wildcards (e.g., checking for "patient.*")
 * @param {Set} userPerms - Set of user permissions (already normalized)
 * @param {string} need - Required permission
 * @returns {boolean} True if user has the permission
 */
function matchWildcard(userPerms, need) {
  // Normalize the required permission
  const normalizedNeed = normalizePerm(need);
  
  // Exact match
  if (userPerms.has(normalizedNeed)) return true;
  
  // Global bypass - user has all permissions
  if (userPerms.has("*")) return true;
  
  // Check for user wildcards (e.g., user has "patient.*")
  for (const p of userPerms) {
    if (p.endsWith(".*")) {
      const prefix = p.slice(0, -1); // Remove the "*"
      if (normalizedNeed.startsWith(prefix)) return true;
    }
  }
  
  // Check for required wildcards (e.g., checking if user has any "patient.*" permission)
  if (normalizedNeed.endsWith(".*")) {
    const base = normalizedNeed.slice(0, -1); // Remove the "*"
    for (const p of userPerms) {
      if (p.startsWith(base)) return true;
    }
  }
  
  return false;
}

/**
 * Check if user is an administrator
 * Admin users have special privileges:
 * - Role is "admin" or "superadmin" (case-insensitive)
 * - Has "*" permission (global wildcard)
 * - Has "admin.*" permission
 * @param {Object} user - User object
 * @returns {boolean} True if user is admin
 */
function isAdmin(user) {
  const r = (user?.role || "").toLowerCase();
  const perms = toPermSet(user);
  return (
    r === "admin" ||
    r === "superadmin" ||
    r === "tenant_admin" ||
    perms.has("*") ||
    perms.has("admin.*")
  );
}

/**
 * Check if user has a specific permission
 * If user is not provided, uses current user from storage
 * Supports wildcard matching as per RBAC documentation
 * @param {string} need - Required permission
 * @param {Object} [user] - User object (optional, uses current user if not provided)
 * @returns {boolean} True if user has the permission
 */
export function can(need, user = getCurrentUser()) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  
  // Allow matching against user's role (case-insensitive)
  const userRole = (user.role || "").toUpperCase();
  if (need.toUpperCase() === userRole) return true;
  
  return matchWildcard(toPermSet(user), need);
}

/**
 * Check if user has any of the specified permissions
 * Returns true if at least one permission is satisfied
 * @param {string[]} needs - Array of required permissions
 * @param {Object} [user] - User object (optional, uses current user if not provided)
 * @returns {boolean} True if user has any of the permissions
 */
export function canAny(needs = [], user = getCurrentUser()) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  
  const perms = toPermSet(user);
  const userRole = (user.role || "").toUpperCase();
  
  return (needs || []).some((n) => 
    matchWildcard(perms, n) || n.toUpperCase() === userRole
  );
}

/**
 * Check if user has all of the specified permissions
 * Returns true only if all permissions are satisfied
 * @param {string[]} needs - Array of required permissions
 * @param {Object} [user] - User object (optional, uses current user if not provided)
 * @returns {boolean} True if user has all of the permissions
 */
export function canAll(needs = [], user = getCurrentUser()) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  
  const perms = toPermSet(user);
  const userRole = (user.role || "").toUpperCase();
  
  return (needs || []).every((n) => 
    matchWildcard(perms, n) || n.toUpperCase() === userRole
  );
}

/**
 * Check if current user is a high-privilege user (SUPERADMIN/DEVELOPER)
 * These users can manage protected roles and permissions
 * @param {Object} [user] - User object (optional, uses current user if not provided)
 * @returns {boolean} True if user is high-privilege
 */
export function isHighPrivUser(user = getCurrentUser()) {
  return checkHighPrivUser(user);
}

/**
 * Check if current user is SUPERADMIN specifically
 * @param {Object} [user] - User object (optional, uses current user if not provided)
 * @returns {boolean} True if user is SUPERADMIN
 */
export function isSuperAdmin(user = getCurrentUser()) {
  if (!user) return false;
  const role = (user.role || '').toUpperCase();
  return role === 'SUPERADMIN';
}

/**
 * Check if current user is DEVELOPER
 * @param {Object} [user] - User object (optional, uses current user if not provided)
 * @returns {boolean} True if user is DEVELOPER
 */
export function isDeveloper(user = getCurrentUser()) {
  if (!user) return false;
  const role = (user.role || '').toUpperCase();
  return role === 'DEVELOPER';
}

// Re-export RBAC protection utilities
export {
  isReservedRole,
  isReservedPermission,
  canManageRole,
  canManagePermission,
  filterRolesForUser,
  filterPermissionsForUser,
  getRoleProtectionInfo,
  getPermissionProtectionInfo,
};
