/**
 * User Management Service
 * Handles all API calls related to user management, roles, and permissions
 * Supports both backend API and local mock data based on api-registry config
 */

import { apiClient } from './http';
import { loadRegistry } from './api-registry';
import * as mockUserService from './mockUserService';
import { logger } from '../utils/logger';

// Check if backend is enabled
const isBackendEnabled = () => {
  try {
    const registry = loadRegistry();
    const config = registry?.users;
    
    // Debug logging
    logger.debug('[userService] Registry users config:', config);
    
    // If users module exists but enabled is undefined, default to true for backwards compatibility
    if (config && config.enabled === undefined) {
      logger.debug('[userService] users enabled defaulting to true (no explicit setting)');
      return true;
    }
    
    const enabled = config?.enabled === true;
    logger.debug('[userService] Backend enabled:', enabled);
    return enabled;
  } catch (err) {
    logger.error('[userService] isBackendEnabled error:', err.message);
    return true; // Default to backend on error
  }
};

// ============================================
// User Management Endpoints (Admin)
// ============================================

/**
 * Get list of users with pagination and filtering
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (default: 1)
 * @param {number} params.limit - Items per page (default: 20)
 * @param {string} params.search - Search term
 * @param {string} params.role - Filter by role
 * @returns {Promise<Object>} Users list with pagination info
 */
export const getUsers = async (params = {}) => {
  const backendEnabled = isBackendEnabled();
  logger.debug('[userService] getUsers - Backend enabled:', backendEnabled);

  if (!backendEnabled) {
    logger.debug('[userService] Using mockUserService');
    return mockUserService.getUsers(params);
  }

  logger.debug('[userService] Using backend API');
  const queryParams = new URLSearchParams({
    page: params.page || 1,
    limit: params.limit || 20,
    ...(params.search && { search: params.search }),
    ...(params.role && { role: params.role }),
  });

  const client = apiClient('users');
  return client.get(`/auth/users?${queryParams}`);
};

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User data
 */
export const getUserById = async (userId) => {
  if (!isBackendEnabled()) return mockUserService.getUserById(userId);
  const client = apiClient('users');
  return client.get(`/auth/users/${userId}`);
};

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user data
 */
export const createUser = async (userData) => {
  if (!isBackendEnabled()) return mockUserService.createUser(userData);
  const client = apiClient('users');
  return client.post(`/auth/users`, userData);
};

/**
 * Update user information
 * @param {string} userId - User ID
 * @param {Object} userData - Updated user data
 * @returns {Promise<Object>} Updated user data
 */
export const updateUser = async (userId, userData) => {
  if (!isBackendEnabled()) return mockUserService.updateUser(userId, userData);
  const client = apiClient('users');
  return client.put(`/auth/users/${userId}`, userData);
};

/**
 * Delete user (soft delete)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteUser = async (userId) => {
  if (!isBackendEnabled()) return mockUserService.deleteUser(userId);
  const client = apiClient('users');
  return client.delete(`/auth/users/${userId}`);
};

/**
 * Change user password
 * @param {string} userId - User ID
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} Password change result
 */
export const changeUserPassword = async (userId, newPassword) => {
  if (!isBackendEnabled()) return mockUserService.updateUser(userId, { password: newPassword });
  const client = apiClient('users');
  return client.post(`/auth/users/${userId}/change-password`, { new_password: newPassword });
};

/**
 * Request password reset email for a user
 * @param {string} email - User email
 * @returns {Promise<Object>} Reset request result
 */
export const requestPasswordReset = async (email) => {
  const client = apiClient('users');
  return client.post(`/auth/forgot-password`, { email });
};

/**
 * Generate a strong random password
 * @param {number} length - Password length (default: 16)
 * @returns {string} Generated password
 */
export const generateStrongPassword = (length = 16) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[randomValues[i] % charset.length];
  }
  return password;
};

/**
 * Activate user account
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Activation result
 */
export const activateUser = async (userId) => {
  if (!isBackendEnabled()) return mockUserService.activateUser(userId);
  const client = apiClient('users');
  return client.post(`/auth/users/${userId}/activate`);
};

/**
 * Deactivate user account
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Deactivation result
 */
export const deactivateUser = async (userId) => {
  if (!isBackendEnabled()) return mockUserService.deactivateUser(userId);
  const client = apiClient('users');
  return client.post(`/auth/users/${userId}/deactivate`);
};

// ============================================
// Role Management Endpoints
// ============================================

/**
 * Get all roles
 * @returns {Promise<Object>} Roles list
 */
export const getRoles = async () => {
  if (!isBackendEnabled()) return mockUserService.getRoles();
  const client = apiClient('users');
  return client.get(`/auth/roles`);
};

/**
 * Get role by ID
 * @param {string} roleId - Role ID
 * @returns {Promise<Object>} Role data
 */
export const getRole = async (roleId) => {
  if (!isBackendEnabled()) return mockUserService.getRole(roleId);
  const client = apiClient('users');
  return client.get(`/auth/roles/${roleId}`);
};

/**
 * Get role by name
 * @param {string} roleName - Role name
 * @returns {Promise<Object>} Role data
 */
export const getRoleByName = async (roleName) => {
  if (!isBackendEnabled()) return mockUserService.getRoles().then(res => ({
    status: 'success',
    role: res.roles.find(r => r.name === roleName)
  }));
  const client = apiClient('users');
  return client.get(`/auth/roles/${roleName}`);
};

/**
 * Create a new role
 * @param {Object} roleData - Role data
 * @returns {Promise<Object>} Created role data
 */
export const createRole = async (roleData) => {
  if (!isBackendEnabled()) return mockUserService.createRole(roleData);
  const client = apiClient('users');
  return client.post(`/auth/roles`, roleData);
};

/**
 * Update role information
 * @param {string} roleId - Role ID
 * @param {Object} roleData - Updated role data
 * @returns {Promise<Object>} Updated role data
 */
export const updateRole = async (roleId, roleData) => {
  if (!isBackendEnabled()) return mockUserService.updateRole(roleId, roleData);
  const client = apiClient('users');
  return client.put(`/auth/roles/${roleId}`, roleData);
};

/**
 * Delete role
 * @param {string} roleId - Role ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteRole = async (roleId) => {
  if (!isBackendEnabled()) return mockUserService.deleteRole(roleId);
  const client = apiClient('users');
  return client.delete(`/auth/roles/${roleId}`);
};

/**
 * Get users assigned to a specific role
 * @param {string} roleName - Role name
 * @returns {Promise<Object>} Users in role
 */
export const getUsersInRole = async (roleName) => {
  if (!isBackendEnabled()) return { status: 'success', users: [] };
  const client = apiClient('users');
  return client.get(`/auth/roles/${roleName}/users`);
};

/**
 * Get permissions assigned to a role
 * @param {string} roleId - Role ID
 * @returns {Promise<Object>} Role permissions
 */
export const getRolePermissions = async (roleId) => {
  if (!isBackendEnabled()) return mockUserService.getRolePermissions(roleId);
  const client = apiClient('users');
  return client.get(`/auth/roles/${roleId}/permissions`);
};

/**
 * Assign permission to role
 * @param {string} roleId - Role ID
 * @param {string} permissionId - Permission ID
 * @returns {Promise<Object>} Assignment result
 */
export const assignPermissionToRole = async (roleId, permissionId) => {
  if (!isBackendEnabled()) return mockUserService.assignPermissionToRole(roleId, permissionId);
  const client = apiClient('users');
  return client.post(`/auth/roles/${roleId}/permissions`, { permission_id: permissionId });
};

/**
 * Remove permission from role
 * @param {string} roleId - Role ID
 * @param {string} permissionId - Permission ID
 * @returns {Promise<Object>} Removal result
 */
export const removePermissionFromRole = async (roleId, permissionId) => {
  if (!isBackendEnabled()) return mockUserService.removePermissionFromRole(roleId, permissionId);
  const client = apiClient('users');
  return client.delete(`/auth/roles/${roleId}/permissions/${permissionId}`);
};

// ============================================
// Permission Management Endpoints
// ============================================

/**
 * Get all permissions
 * @returns {Promise<Object>} Permissions list
 */
export const getPermissions = async () => {
  if (!isBackendEnabled()) return mockUserService.getPermissions();
  const client = apiClient('users');
  return client.get(`/auth/permissions`);
};

/**
 * Get permission by ID
 * @param {string} permissionId - Permission ID
 * @returns {Promise<Object>} Permission data
 */
export const getPermission = async (permissionId) => {
  if (!isBackendEnabled()) return mockUserService.getPermission(permissionId);
  const client = apiClient('users');
  return client.get(`/auth/permissions/${permissionId}`);
};

/**
 * Create a new permission
 * @param {Object} permissionData - Permission data
 * @param {string} permissionData.name - Permission name (e.g., "user:read")
 * @param {string} permissionData.description - Permission description
 * @param {string} permissionData.category - Permission category (e.g., "user", "order")
 * @param {boolean} permissionData.protected - If true, only SUPERADMIN/DEVELOPER can modify
 * @param {boolean} permissionData.hidden_from_tenant_admin - If true, hidden from regular tenant admins
 * @returns {Promise<Object>} Created permission data
 */
export const createPermission = async (permissionData) => {
  if (!isBackendEnabled()) return mockUserService.createPermission(permissionData);
  const client = apiClient('users');
  return client.post(`/auth/permissions`, permissionData);
};

/**
 * Update permission information
 * @param {string} permissionId - Permission ID
 * @param {Object} permissionData - Updated permission data
 * @param {string} permissionData.name - Permission name (e.g., "user:read")
 * @param {string} permissionData.description - Permission description
 * @param {string} permissionData.category - Permission category (e.g., "user", "order")
 * @param {boolean} permissionData.protected - If true, only SUPERADMIN/DEVELOPER can modify
 * @param {boolean} permissionData.hidden_from_tenant_admin - If true, hidden from regular tenant admins
 * @returns {Promise<Object>} Updated permission data
 */
export const updatePermission = async (permissionId, permissionData) => {
  if (!isBackendEnabled()) return mockUserService.updatePermission(permissionId, permissionData);
  const client = apiClient('users');
  return client.put(`/auth/permissions/${permissionId}`, permissionData);
};

/**
 * Delete permission
 * @param {string} permissionId - Permission ID
 * @returns {Promise<Object>} Deletion result
 */
export const deletePermission = async (permissionId) => {
  if (!isBackendEnabled()) return mockUserService.deletePermission(permissionId);
  const client = apiClient('users');
  return client.delete(`/auth/permissions/${permissionId}`);
};

/**
 * Check if current user has a specific permission
 * @param {string} permission - Permission name to check
 * @returns {Promise<Object>} Permission check result
 */
export const checkPermission = async (permission) => {
  if (!isBackendEnabled()) return mockUserService.checkPermission(permission);
  const client = apiClient('users');
  return client.post(`/auth/permissions/check`, { permission });
};

// ============================================
// User-Role Assignment Endpoints
// ============================================

/**
 * Get roles assigned to a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User roles
 */
export const getUserRoles = async (userId) => {
  if (!isBackendEnabled()) return mockUserService.getUserRoles(userId);
  const client = apiClient('users');
  return client.get(`/auth/users/${userId}/roles`);
};

/**
 * Assign role to user
 * @param {string} userId - User ID
 * @param {string|null} roleId - Role ID (optional if roleName provided)
 * @param {string|null} roleName - Role name (optional if roleId provided)
 * @returns {Promise<Object>} Assignment result
 */
export const assignRoleToUser = async (userId, roleId = null, roleName = null) => {
  if (!isBackendEnabled()) return mockUserService.assignRoleToUser(userId, roleId, roleName);
  const body = roleId ? { role_id: roleId } : { role_name: roleName };
  const client = apiClient('users');
  return client.post(`/auth/users/${userId}/roles`, body);
};

/**
 * Remove role from user
 * @param {string} userId - User ID
 * @param {string} roleId - Role ID
 * @returns {Promise<Object>} Removal result
 */
export const removeRoleFromUser = async (userId, roleId) => {
  if (!isBackendEnabled()) return mockUserService.removeRoleFromUser(userId, roleId);
  const client = apiClient('users');
  return client.delete(`/auth/users/${userId}/roles/${roleId}`);
};

// ============================================
// User-Permission Assignment Endpoints
// ============================================

/**
 * Get permissions assigned directly to a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User permissions
 */
export const getUserPermissions = async (userId) => {
  if (!isBackendEnabled()) return { status: 'success', permissions: [] };
  const client = apiClient('users');
  return client.get(`/auth/users/${userId}/permissions`);
};

/**
 * Assign permission directly to user
 * @param {string} userId - User ID
 * @param {string} permissionId - Permission ID
 * @returns {Promise<Object>} Assignment result
 */
export const assignPermissionToUser = async (userId, permissionId) => {
  if (!isBackendEnabled()) return { status: 'success', message: 'Permission assigned (mock)' };
  const client = apiClient('users');
  return client.post(`/auth/users/${userId}/permissions`, { permission_id: permissionId });
};

/**
 * Remove permission from user
 * @param {string} userId - User ID
 * @param {string} permissionId - Permission ID
 * @returns {Promise<Object>} Removal result
 */
export const removePermissionFromUser = async (userId, permissionId) => {
  if (!isBackendEnabled()) return { status: 'success', message: 'Permission removed (mock)' };
  const client = apiClient('users');
  return client.delete(`/auth/users/${userId}/permissions/${permissionId}`);
};

// ============================================
// Cache Management Endpoints
// ============================================

/**
 * Clear RBAC cache
 * @returns {Promise<Object>} Cache clear result
 */
export const clearCache = async () => {
  if (!isBackendEnabled()) return mockUserService.clearCache();
  const client = apiClient('users');
  return client.post(`/auth/cache/clear`);
};

/**
 * Get RBAC cache statistics
 * @returns {Promise<Object>} Cache stats
 */
export const getCacheStats = async () => {
  if (!isBackendEnabled()) return mockUserService.getCacheStats();
  const client = apiClient('users');
  return client.get(`/auth/cache/stats`);
};

// Export all functions as default
export default {
  // User Management
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword,
  activateUser,
  deactivateUser,

  // Role Management
  getRoles,
  getRole,
  getRoleByName,
  createRole,
  updateRole,
  deleteRole,
  getUsersInRole,
  getRolePermissions,
  assignPermissionToRole,
  removePermissionFromRole,

  // Permission Management
  getPermissions,
  getPermission,
  createPermission,
  updatePermission,
  deletePermission,
  checkPermission,

  // User-Role Assignment
  getUserRoles,
  assignRoleToUser,
  removeRoleFromUser,

  // User-Permission Assignment
  getUserPermissions,
  assignPermissionToUser,
  removePermissionFromUser,

  // Cache Management
  clearCache,
  getCacheStats,
};