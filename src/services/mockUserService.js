/**
 * Mock User Service for Local Development
 * Uses local JSON data when backend is not available
 */

import usersData from '../data/users.json';

// Transform users.json data to match expected format
const transformUserData = (user) => {
  // Generate username from name (lowercase, replace spaces with dots) if not provided
  const generatedUsername = user.name.toLowerCase().replace(/\s+/g, '.');
  const username = user.username || generatedUsername;

  // Generate email from username if not provided
  const generatedEmail = `${generatedUsername}@hospital.com`;
  const email = user.email || generatedEmail;

  return {
    id: user.id,
    username: username,
    email: email,
    full_name: user.name || user.full_name,
    role: user.role.toUpperCase(), // Convert to uppercase to match role names
    is_active: true,
    last_login: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    permissions: user.permissions || [],
  };
};

// In-memory storage for mock data - transform users.json data
let mockUsers = usersData.map(transformUserData);
let mockRoles = [
  { id: 'r-1', name: 'ADMIN', description: 'Administrator with full access', is_active: true },
  { id: 'r-2', name: 'TECHNOLOGIST', description: 'Radiology technologist', is_active: true },
  { id: 'r-3', name: 'CLERK', description: 'Front desk clerk', is_active: true },
  { id: 'r-4', name: 'VIEWER', description: 'Read-only viewer', is_active: true },
  { id: 'r-5', name: 'TENANT_ADMIN', description: 'Tenant administrator with local access', is_active: true },
];

let mockPermissions = [
  { id: 'p-1', name: 'worklist.view', description: 'View worklist', category: 'worklist' },
  { id: 'p-2', name: 'order.view', description: 'View orders', category: 'order' },
  { id: 'p-3', name: 'patient.view', description: 'View patients', category: 'patient' },
  { id: 'p-4', name: 'modality.view', description: 'View modalities', category: 'modality' },
  { id: 'p-5', name: 'node.view', description: 'View DICOM nodes', category: 'node' },
  { id: 'p-6', name: 'audit.view', description: 'View audit logs', category: 'audit' },
  { id: 'p-7', name: 'user.manage', description: 'Manage users', category: 'user' },
  { id: 'p-8', name: '*', description: 'All permissions', category: 'system' },
];

let mockUserRoles = [
  { user_id: 'u-100', role_id: 'r-2' },
  { user_id: 'u-101', role_id: 'r-1' },
  { user_id: 'u-102', role_id: 'r-3' },
];

let mockRolePermissions = [
  { role_id: 'r-1', permission_id: 'p-8' }, // Admin has all
  { role_id: 'r-2', permission_id: 'p-1' },
  { role_id: 'r-2', permission_id: 'p-2' },
  { role_id: 'r-2', permission_id: 'p-3' },
  { role_id: 'r-2', permission_id: 'p-4' },
  { role_id: 'r-3', permission_id: 'p-1' },
  { role_id: 'r-3', permission_id: 'p-2' },
  { role_id: 'r-3', permission_id: 'p-3' },
];

// Simulate API delay
const delay = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));

// Generate unique ID
const generateId = (prefix = 'u') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Mock API Response Format
 */
const mockResponse = (data, status = 'success') => ({
  status,
  ...data,
});

// ============================================
// User Management
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
  await delay();
  const { page = 1, limit = 20, search = '', role = '' } = params;

  // Debug logging
  console.log('[mockUserService] getUsers called with params:', params);
  console.log('[mockUserService] Total mockUsers:', mockUsers.length);

  let filtered = [...mockUsers];

  // Search filter
  if (search) {
    const query = search.toLowerCase();
    filtered = filtered.filter(u =>
      u.full_name?.toLowerCase().includes(query) ||
      u.username?.toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query)
    );
  }

  // Role filter
  if (role) {
    const userIdsWithRole = mockUserRoles
      .filter(ur => {
        const r = mockRoles.find(r => r.id === ur.role_id);
        return r?.name === role;
      })
      .map(ur => ur.user_id);
    filtered = filtered.filter(u => userIdsWithRole.includes(u.id));
  }

  // Pagination
  const start = (page - 1) * limit;
  const end = start + limit;
  const paginated = filtered.slice(start, end);

  const response = mockResponse({
    users: paginated,
    pagination: {
      page,
      limit,
      total: filtered.length,
      total_pages: Math.ceil(filtered.length / limit),
    },
  });

  console.log('[mockUserService] Returning response:', {
    status: response.status,
    userCount: response.users.length,
    total: response.pagination.total,
  });

  return response;
};

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User data
 */
export const getUserById = async (userId) => {
  await delay();
  const user = mockUsers.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  // Add roles and permissions
  const userRoles = mockUserRoles
    .filter(ur => ur.user_id === userId)
    .map(ur => mockRoles.find(r => r.id === ur.role_id))
    .filter(Boolean);

  return mockResponse({ user: { ...user, roles: userRoles } });
};

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user data
 */
export const createUser = async (userData) => {
  await delay();
  const newUser = {
    id: generateId('u'),
    ...userData,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_login: null,
  };
  mockUsers.push(newUser);

  // Assign role if provided
  if (userData.role) {
    const role = mockRoles.find(r => r.name === userData.role);
    if (role) {
      mockUserRoles.push({ user_id: newUser.id, role_id: role.id });
    }
  }

  return mockResponse({ user: newUser });
};

/**
 * Update user information
 * @param {string} userId - User ID
 * @param {Object} userData - Updated user data
 * @returns {Promise<Object>} Updated user data
 */
export const updateUser = async (userId, userData) => {
  await delay();
  const index = mockUsers.findIndex(u => u.id === userId);
  if (index === -1) throw new Error('User not found');

  mockUsers[index] = {
    ...mockUsers[index],
    ...userData,
    id: userId, // Preserve ID
    updated_at: new Date().toISOString(),
  };

  return mockResponse({ user: mockUsers[index] });
};

/**
 * Delete user (soft delete)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteUser = async (userId) => {
  await delay();
  const index = mockUsers.findIndex(u => u.id === userId);
  if (index === -1) throw new Error('User not found');

  mockUsers.splice(index, 1);
  // Remove associated roles
  mockUserRoles = mockUserRoles.filter(ur => ur.user_id !== userId);

  return mockResponse({ message: 'User deleted successfully' });
};

/**
 * Activate user account
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Activation result
 */
export const activateUser = async (userId) => {
  await delay();
  const user = mockUsers.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  user.is_active = true;
  return mockResponse({ user });
};

/**
 * Deactivate user account
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Deactivation result
 */
export const deactivateUser = async (userId) => {
  await delay();
  const user = mockUsers.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  user.is_active = false;
  return mockResponse({ user });
};

// ============================================
// Role Management
// ============================================

/**
 * Get all roles
 * @returns {Promise<Object>} Roles list
 */
export const getRoles = async () => {
  await delay();
  return mockResponse({ roles: mockRoles });
};

/**
 * Get role by ID
 * @param {string} roleId - Role ID
 * @returns {Promise<Object>} Role data
 */
export const getRole = async (roleId) => {
  await delay();
  const role = mockRoles.find(r => r.id === roleId);
  if (!role) throw new Error('Role not found');
  return mockResponse({ role });
};

/**
 * Create a new role
 * @param {Object} roleData - Role data
 * @returns {Promise<Object>} Created role data
 */
export const createRole = async (roleData) => {
  await delay();
  const newRole = {
    id: generateId('r'),
    ...roleData,
    created_at: new Date().toISOString(),
  };
  mockRoles.push(newRole);
  return mockResponse({ role: newRole });
};

/**
 * Update role information
 * @param {string} roleId - Role ID
 * @param {Object} roleData - Updated role data
 * @returns {Promise<Object>} Updated role data
 */
export const updateRole = async (roleId, roleData) => {
  await delay();
  const index = mockRoles.findIndex(r => r.id === roleId);
  if (index === -1) throw new Error('Role not found');

  mockRoles[index] = { ...mockRoles[index], ...roleData, id: roleId };
  return mockResponse({ role: mockRoles[index] });
};

/**
 * Delete role
 * @param {string} roleId - Role ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteRole = async (roleId) => {
  await delay();
  const index = mockRoles.findIndex(r => r.id === roleId);
  if (index === -1) throw new Error('Role not found');

  mockRoles.splice(index, 1);
  mockUserRoles = mockUserRoles.filter(ur => ur.role_id !== roleId);
  mockRolePermissions = mockRolePermissions.filter(rp => rp.role_id !== roleId);

  return mockResponse({ message: 'Role deleted successfully' });
};

/**
 * Get permissions assigned to a role
 * @param {string} roleId - Role ID
 * @returns {Promise<Object>} Role permissions
 */
export const getRolePermissions = async (roleId) => {
  await delay();
  const permissionIds = mockRolePermissions
    .filter(rp => rp.role_id === roleId)
    .map(rp => rp.permission_id);

  const permissions = mockPermissions.filter(p => permissionIds.includes(p.id));
  return mockResponse({ permissions });
};

/**
 * Assign permission to role
 * @param {string} roleId - Role ID
 * @param {string} permissionId - Permission ID
 * @returns {Promise<Object>} Assignment result
 */
export const assignPermissionToRole = async (roleId, permissionId) => {
  await delay();
  const exists = mockRolePermissions.find(
    rp => rp.role_id === roleId && rp.permission_id === permissionId
  );
  if (exists) throw new Error('Permission already assigned to role');

  mockRolePermissions.push({ role_id: roleId, permission_id: permissionId });
  return mockResponse({ message: 'Permission assigned to role successfully' });
};

/**
 * Remove permission from role
 * @param {string} roleId - Role ID
 * @param {string} permissionId - Permission ID
 * @returns {Promise<Object>} Removal result
 */
export const removePermissionFromRole = async (roleId, permissionId) => {
  await delay();
  const index = mockRolePermissions.findIndex(
    rp => rp.role_id === roleId && rp.permission_id === permissionId
  );
  if (index === -1) throw new Error('Permission not assigned to role');

  mockRolePermissions.splice(index, 1);
  return mockResponse({ message: 'Permission removed from role successfully' });
};

// ============================================
// Permission Management
// ============================================

/**
 * Get all permissions
 * @returns {Promise<Object>} Permissions list
 */
export const getPermissions = async () => {
  await delay();
  // Mock the format that backend returns with 'all' array
  return mockResponse({
    permissions: {
      all: mockPermissions,
      by_category: mockPermissions.reduce((acc, perm) => {
        const cat = perm.category || 'other';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(perm);
        return acc;
      }, {}),
    },
  });
};

/**
 * Get permission by ID
 * @param {string} permissionId - Permission ID
 * @returns {Promise<Object>} Permission data
 */
export const getPermission = async (permissionId) => {
  await delay();
  const permission = mockPermissions.find(p => p.id === permissionId);
  if (!permission) throw new Error('Permission not found');
  return mockResponse({ permission });
};

/**
 * Create a new permission
 * @param {Object} permissionData - Permission data
 * @returns {Promise<Object>} Created permission data
 */
export const createPermission = async (permissionData) => {
  await delay();
  const newPermission = {
    id: generateId('p'),
    ...permissionData,
    created_at: new Date().toISOString(),
  };
  mockPermissions.push(newPermission);
  return mockResponse({ permission: newPermission });
};

/**
 * Update permission information
 * @param {string} permissionId - Permission ID
 * @param {Object} permissionData - Updated permission data
 * @returns {Promise<Object>} Updated permission data
 */
export const updatePermission = async (permissionId, permissionData) => {
  await delay();
  const index = mockPermissions.findIndex(p => p.id === permissionId);
  if (index === -1) throw new Error('Permission not found');

  mockPermissions[index] = { ...mockPermissions[index], ...permissionData, id: permissionId };
  return mockResponse({ permission: mockPermissions[index] });
};

/**
 * Delete permission
 * @param {string} permissionId - Permission ID
 * @returns {Promise<Object>} Deletion result
 */
export const deletePermission = async (permissionId) => {
  await delay();
  const index = mockPermissions.findIndex(p => p.id === permissionId);
  if (index === -1) throw new Error('Permission not found');

  mockPermissions.splice(index, 1);
  mockRolePermissions = mockRolePermissions.filter(rp => rp.permission_id !== permissionId);

  return mockResponse({ message: 'Permission deleted successfully' });
};

/**
 * Check if current user has a specific permission
 * @param {string} permission - Permission name to check
 * @returns {Promise<Object>} Permission check result
 */
export const checkPermission = async (permission) => {
  await delay();
  // Mock: always return true for demo
  return mockResponse({ has_permission: true });
};

// ============================================
// User-Role Assignment
// ============================================

/**
 * Get roles assigned to a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User roles
 */
export const getUserRoles = async (userId) => {
  await delay();
  const roleIds = mockUserRoles
    .filter(ur => ur.user_id === userId)
    .map(ur => ur.role_id);

  const roles = mockRoles.filter(r => roleIds.includes(r.id));
  return mockResponse({ roles });
};

/**
 * Assign role to user
 * @param {string} userId - User ID
 * @param {string|null} roleId - Role ID (optional if roleName provided)
 * @param {string|null} roleName - Role name (optional if roleId provided)
 * @returns {Promise<Object>} Assignment result
 */
export const assignRoleToUser = async (userId, roleId = null, roleName = null) => {
  await delay();
  const role = roleId
    ? mockRoles.find(r => r.id === roleId)
    : mockRoles.find(r => r.name === roleName);

  if (!role) throw new Error('Role not found');

  const exists = mockUserRoles.find(ur => ur.user_id === userId && ur.role_id === role.id);
  if (exists) throw new Error('Role already assigned to user');

  mockUserRoles.push({ user_id: userId, role_id: role.id });
  return mockResponse({ message: 'Role assigned to user successfully' });
};

/**
 * Remove role from user
 * @param {string} userId - User ID
 * @param {string} roleId - Role ID
 * @returns {Promise<Object>} Removal result
 */
export const removeRoleFromUser = async (userId, roleId) => {
  await delay();
  const index = mockUserRoles.findIndex(ur => ur.user_id === userId && ur.role_id === roleId);
  if (index === -1) throw new Error('Role not assigned to user');

  mockUserRoles.splice(index, 1);
  return mockResponse({ message: 'Role removed from user successfully' });
};

// ============================================
// Cache Management (No-op for mock)
// ============================================

/**
 * Clear RBAC cache
 * @returns {Promise<Object>} Cache clear result
 */
export const clearCache = async () => {
  await delay(50);
  return mockResponse({ message: 'Cache cleared (mock)' });
};

/**
 * Get RBAC cache statistics
 * @returns {Promise<Object>} Cache stats
 */
export const getCacheStats = async () => {
  await delay(50);
  return mockResponse({
    stats: {
      size: 0,
      hits: 0,
      misses: 0,
    },
  });
};

export default {
  // User Management
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  activateUser,
  deactivateUser,

  // Role Management
  getRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
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

  // Cache Management
  clearCache,
  getCacheStats,
};