import React, { useState, useEffect } from 'react';
import * as userService from '../services/userService';
import { logger } from '../utils/logger';
import { useToast } from './ToastProvider';
import {
  getCurrentUser,
  isHighPrivUser,
  getRoleProtectionInfo,
  getPermissionProtectionInfo,
  filterRolesForUser,
  filterPermissionsForUser,
} from '../services/rbac';

const RolePermissionManager = ({ initialTab = 'roles' }) => {
  const toast = useToast();
  // Get current user for permission checks
  const currentUser = getCurrentUser();
  const isHighPriv = isHighPrivUser(currentUser);
  // Tab state - use initialTab from props
  const [activeTab, setActiveTab] = useState(initialTab); // 'roles' | 'permissions'

  // Roles state
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState([]);

  // Permissions state
  const [permissions, setPermissions] = useState([]);
  const [selectedPermission, setSelectedPermission] = useState(null);

  // Search state
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [permissionSearchQuery, setPermissionSearchQuery] = useState('');
  const [assignModalSearchQuery, setAssignModalSearchQuery] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Modal state
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'

  // Form state
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    is_active: true,
    protected: false,
    hidden_from_tenant_admin: false
  });
  const [permissionForm, setPermissionForm] = useState({
    name: '',
    description: '',
    category: '',
    protected: false,
    hidden_from_tenant_admin: false,
  });

  // Load data on mount
  useEffect(() => {
    loadRoles();
    loadPermissions();
  }, []);

  // Load role permissions when role selected
  useEffect(() => {
    if (selectedRole) {
      loadRolePermissions(selectedRole.id);
    }
  }, [selectedRole]);

  /**
   * Load all roles
   */
  const loadRoles = async () => {
    try {
      setLoading(true);
      const response = await userService.getRoles();

      // Handle both backend (response.data.roles) and mock (response.roles) formats
      const rolesData = response.data?.roles || response.roles || [];

      // Ensure roles is always an array
      const rolesArray = Array.isArray(rolesData) ? rolesData : [];
      setRoles(rolesArray);
      setLoading(false);
    } catch (err) {
      logger.error('Failed to load roles:', err);
      setError(`Failed to load roles: ${err.message}`);
      setRoles([]); // Set empty array on error
      setLoading(false);
    }
  };

  /**
   * Load all permissions
   */
  const loadPermissions = async () => {
    try {
      setLoading(true);
      const response = await userService.getPermissions();

      let permissionsArray = [];

      // Handle different response formats from backend and mock
      if (response.data?.permissions) {
        // Backend format: { data: { permissions: { all: [...], by_category: {...} } } }
        if (Array.isArray(response.data.permissions.all)) {
          permissionsArray = response.data.permissions.all;
        } else if (Array.isArray(response.data.permissions)) {
          permissionsArray = response.data.permissions;
        }
      } else if (response.permissions) {
        // Mock format: { permissions: { all: [...], by_category: {...} } }
        if (response.permissions.all && Array.isArray(response.permissions.all)) {
          permissionsArray = response.permissions.all;
        } else if (Array.isArray(response.permissions)) {
          permissionsArray = response.permissions;
        }
      }

      // Filter hidden permissions for non-high-priv users
      if (!isHighPriv) {
        permissionsArray = permissionsArray.filter(perm =>
          perm.hidden_from_tenant_admin !== true
        );
      }

      setPermissions(permissionsArray);
      setLoading(false);
    } catch (err) {
      logger.error('Failed to load permissions:', err);
      setError(`Failed to load permissions: ${err.message}`);
      setPermissions([]); // Set empty array on error
      setLoading(false);
    }
  };

  /**
   * Load permissions for a role
   */
  const loadRolePermissions = async (roleId) => {
    try {
      const response = await userService.getRolePermissions(roleId);

      // Handle both backend (response.data.permissions) and mock (response.permissions) formats
      const permissionsData = response.data?.permissions || response.permissions || [];

      // Ensure rolePermissions is always an array
      setRolePermissions(Array.isArray(permissionsData) ? permissionsData : []);
    } catch (err) {
      logger.error('Failed to load role permissions:', err);
      setError(`Failed to load role permissions: ${err.message}`);
      setRolePermissions([]); // Set empty array on error
    }
  };

  /**
   * Handle create role
   */
  const handleCreateRole = () => {
    setModalMode('create');
    setRoleForm({
      name: '',
      description: '',
      is_active: true,
      protected: false,
      hidden_from_tenant_admin: false
    });
    setShowRoleModal(true);
  };

  /**
   * Handle edit role
   */
  const handleEditRole = (role) => {
    setModalMode('edit');
    setSelectedRole(role);
    setRoleForm({
      name: role.name,
      description: role.description || '',
      is_active: role.is_active !== false,
      protected: role.protected || false,
      hidden_from_tenant_admin: role.hidden_from_tenant_admin || false,
    });
    setShowRoleModal(true);
  };

  /**
   * Handle submit role form
   */
  const handleSubmitRole = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      setLoading(true);

      if (modalMode === 'create') {
        await userService.createRole(roleForm);
        toast.success('Role created successfully');
      } else {
        await userService.updateRole(selectedRole.id, roleForm);
        toast.success('Role updated successfully');
      }

      setShowRoleModal(false);
      loadRoles();
      setLoading(false);
    } catch (err) {
      logger.error('Failed to save role:', err);
      setError(`Failed to save role: ${err.message}`);
      setLoading(false);
    }
  };

  /**
   * Handle delete role
   */
  const handleDeleteRole = async (roleId, roleName) => {
    if (!window.confirm(`Are you sure you want to delete role "${roleName}"?`)) {
      return;
    }

    try {
      setLoading(true);
      await userService.deleteRole(roleId);
      toast.success('Role deleted successfully');

      // Clear selection if deleted role was selected
      if (selectedRole?.id === roleId) {
        setSelectedRole(null);
        setRolePermissions([]);
      }

      loadRoles();
      setLoading(false);
    } catch (err) {
      logger.error('Failed to delete role:', err);
      setError(`Failed to delete role: ${err.message}`);
      setLoading(false);
    }
  };

  /**
   * Handle create permission
   */
  const handleCreatePermission = () => {
    setModalMode('create');
    setPermissionForm({
      name: '',
      description: '',
      category: '',
      protected: false,
      hidden_from_tenant_admin: false,
    });
    setShowPermissionModal(true);
  };

  /**
   * Handle edit permission
   */
  const handleEditPermission = (permission) => {
    setModalMode('edit');
    setSelectedPermission(permission);
    setPermissionForm({
      name: permission.name,
      description: permission.description || '',
      category: permission.category || '',
      protected: permission.protected || false,
      hidden_from_tenant_admin: permission.hidden_from_tenant_admin || false,
    });
    setShowPermissionModal(true);
  };

  /**
   * Handle submit permission form
   */
  const handleSubmitPermission = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      setLoading(true);

      if (modalMode === 'create') {
        await userService.createPermission(permissionForm);
        toast.success('Permission created successfully');
      } else {
        await userService.updatePermission(selectedPermission.id, permissionForm);
        toast.success('Permission updated successfully');
      }

      setShowPermissionModal(false);
      loadPermissions();
      setLoading(false);
    } catch (err) {
      logger.error('Failed to save permission:', err);
      setError(`Failed to save permission: ${err.message}`);
      setLoading(false);
    }
  };

  /**
   * Handle delete permission
   */
  const handleDeletePermission = async (permissionId, permissionName) => {
    if (!window.confirm(`Are you sure you want to delete permission "${permissionName}"?`)) {
      return;
    }

    try {
      setLoading(true);
      await userService.deletePermission(permissionId);
      toast.success('Permission deleted successfully');
      loadPermissions();

      // Reload role permissions if a role is selected
      if (selectedRole) {
        loadRolePermissions(selectedRole.id);
      }

      setLoading(false);
    } catch (err) {
      logger.error('Failed to delete permission:', err);
      setError(`Failed to delete permission: ${err.message}`);
      setLoading(false);
    }
  };

  /**
   * Handle assign permission to role
   */
  const handleAssignPermission = async (permissionId) => {
    if (!selectedRole) return;

    try {
      setLoading(true);
      await userService.assignPermissionToRole(selectedRole.id, permissionId);
      toast.success('Permission assigned to role successfully');
      loadRolePermissions(selectedRole.id);

      // Clear cache to apply changes
      await userService.clearCache();

      setLoading(false);
    } catch (err) {
      logger.error('Failed to assign permission:', err);
      setError(`Failed to assign permission: ${err.message}`);
      setLoading(false);
    }
  };

  /**
   * Handle remove permission from role
   */
  const handleRemovePermission = async (permissionId, permissionName) => {
    if (!selectedRole) return;

    if (!window.confirm(`Remove permission "${permissionName}" from role "${selectedRole.name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      await userService.removePermissionFromRole(selectedRole.id, permissionId);
      toast.success('Permission removed from role successfully');
      loadRolePermissions(selectedRole.id);

      // Clear cache to apply changes
      await userService.clearCache();

      setLoading(false);
    } catch (err) {
      logger.error('Failed to remove permission:', err);
      setError(`Failed to remove permission: ${err.message}`);
      setLoading(false);
    }
  };

  /**
   * Get unassigned permissions for selected role
   */
  const getUnassignedPermissions = () => {
    if (!selectedRole) return [];
    if (!Array.isArray(rolePermissions) || !Array.isArray(permissions)) return [];

    const assignedIds = rolePermissions.map(p => p.id);
    return permissions.filter(p => !assignedIds.includes(p.id));
  };

  /**
   * Filter unassigned permissions based on search query
   */
  const getFilteredUnassignedPermissions = () => {
    const unassigned = getUnassignedPermissions();
    if (!assignModalSearchQuery.trim()) return unassigned;

    const query = assignModalSearchQuery.toLowerCase();
    return unassigned.filter(permission =>
      permission.name?.toLowerCase().includes(query) ||
      permission.description?.toLowerCase().includes(query) ||
      permission.category?.toLowerCase().includes(query)
    );
  };

  /**
   * Filter roles based on search query
   */
  const getFilteredRoles = () => {
    if (!Array.isArray(roles)) return [];
    if (!roleSearchQuery.trim()) return roles;

    const query = roleSearchQuery.toLowerCase();
    return roles.filter(role =>
      role.name?.toLowerCase().includes(query) ||
      role.description?.toLowerCase().includes(query)
    );
  };

  /**
   * Filter permissions based on search query
   */
  const getFilteredPermissions = () => {
    if (!Array.isArray(permissions)) return [];
    if (!permissionSearchQuery.trim()) return permissions;

    const query = permissionSearchQuery.toLowerCase();
    return permissions.filter(permission =>
      permission.name?.toLowerCase().includes(query) ||
      permission.description?.toLowerCase().includes(query) ||
      permission.category?.toLowerCase().includes(query)
    );
  };

  /**
   * Clear messages after 5 seconds
   */
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4">Role & Permission Management</h2>

      {/* Success/Error Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('roles')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'roles'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Roles ({roleSearchQuery ? `${getFilteredRoles().length} / ${roles.length}` : (Array.isArray(roles) ? roles.length : 0)})
          </button>
          <button
            onClick={() => setActiveTab('permissions')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'permissions'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Permissions ({permissionSearchQuery ? `${getFilteredPermissions().length} / ${permissions.length}` : (Array.isArray(permissions) ? permissions.length : 0)})
          </button>
        </nav>
      </div>

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Roles List */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Roles</h3>
              <button
                onClick={handleCreateRole}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
              >
                + Create Role
              </button>
            </div>

            {/* Search Input for Roles */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search roles by name or description..."
                value={roleSearchQuery}
                onChange={(e) => setRoleSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {Array.isArray(roles) && roles.length > 0 ? (
                getFilteredRoles().map((role) => {
                  const roleProtection = getRoleProtectionInfo(role, currentUser);
                  return (
                    <div
                      key={role.id}
                      className={`p-4 border rounded cursor-pointer hover:bg-gray-50 ${selectedRole?.id === role.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        } ${roleProtection.isProtected ? 'border-l-4 border-l-amber-400' : ''}`}
                      onClick={() => setSelectedRole(role)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-gray-900">{role.name}</h4>
                            {roleProtection.isProtected && (
                              <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-800 rounded" title={roleProtection.reason}>
                                🔒 Protected
                              </span>
                            )}
                            {role.hidden_from_tenant_admin && (
                              <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-700 rounded" title="Hidden from tenant admins">
                                👁️
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{role.description || 'No description'}</p>
                          <span
                            className={`inline-block mt-2 px-2 py-1 text-xs rounded ${role.is_active !== false
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                              }`}
                          >
                            {role.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {/* Edit Role Button - only show if user can edit */}
                          {roleProtection.canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditRole(role);
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit Role"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}

                          {/* Delete Role Button - only show if user can delete */}
                          {roleProtection.canDelete && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRole(role.id, role.name);
                              }}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete Role"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-8">
                  {roleSearchQuery ? `No roles matching "${roleSearchQuery}"` : 'No roles found. Create your first role.'}
                </p>
              )}
            </div>
          </div>

          {/* Role Permissions */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                Permissions {selectedRole && `for "${selectedRole.name}"`}
              </h3>
              {selectedRole && (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  + Assign Permission
                </button>
              )}
            </div>

            {selectedRole ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {Array.isArray(rolePermissions) && rolePermissions.length > 0 ? (
                  rolePermissions.map((permission) => (
                    <div
                      key={permission.id}
                      className="p-3 border border-gray-200 rounded hover:bg-gray-50"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <code className="text-sm font-semibold text-blue-600">{permission.name}</code>
                          <p className="text-xs text-gray-600 mt-1">{permission.description}</p>
                          {permission.category && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                              {permission.category}
                            </span>
                          )}
                        </div>
                        {/* Remove Permission Button */}
                        <button
                          onClick={() => handleRemovePermission(permission.id, permission.name)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors ml-2"
                          title="Remove Permission from Role"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No permissions assigned to this role yet.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Select a role to view its permissions</p>
            )}
          </div>
        </div>
      )}

      {/* Permissions Tab */}
      {activeTab === 'permissions' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">All Permissions</h3>
            <button
              onClick={handleCreatePermission}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              + Create Permission
            </button>
          </div>

          {/* Search Input for Permissions */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search permissions by name, description, or category..."
              value={permissionSearchQuery}
              onChange={(e) => setPermissionSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.isArray(permissions) && permissions.length > 0 ? (
              getFilteredPermissions().map((permission) => {
                // Use backend data for protected and hidden status
                const isProtected = permission.protected === true;
                const isHidden = permission.hidden_from_tenant_admin === true;
                const permProtection = getPermissionProtectionInfo(permission, currentUser);

                return (
                  <div key={permission.id} className={`p-4 border rounded hover:bg-gray-50 ${isProtected ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
                    }`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-semibold text-blue-600">{permission.name}</code>
                        {isProtected && (
                          <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-800 rounded" title="Protected - Only SUPERADMIN/DEVELOPER can modify">
                            🔒
                          </span>
                        )}
                        {isHidden && (
                          <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-700 rounded" title="Hidden from tenant admins">
                            👁️
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {/* Edit Permission Button - only show if user can edit */}
                        {permProtection.canEdit && (
                          <button
                            onClick={() => handleEditPermission(permission)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit Permission"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}

                        {/* Delete Permission Button - only show if user can delete */}
                        {permProtection.canDelete && (
                          <button
                            onClick={() => handleDeletePermission(permission.id, permission.name)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete Permission"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mb-2">{permission.description || 'No description'}</p>
                    {permission.category && (
                      <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                        {permission.category}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="col-span-full">
                <p className="text-gray-500 text-center py-8">
                  {permissionSearchQuery ? `No permissions matching "${permissionSearchQuery}"` : 'No permissions found. Create your first permission.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">
                {modalMode === 'create' ? 'Create New Role' : 'Edit Role'}
              </h3>
              <button
                onClick={() => setShowRoleModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitRole}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    placeholder="e.g., FINANCE_STAFF"
                    required
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    placeholder="Role description"
                    rows="3"
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="border-t pt-4">
                  <div className="space-y-3">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="role_is_active"
                        checked={roleForm.is_active}
                        onChange={(e) => setRoleForm({ ...roleForm, is_active: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                      />
                      <div className="ml-3">
                        <label htmlFor="role_is_active" className="block text-sm font-medium text-gray-900">
                          Active Role
                        </label>
                        <p className="text-xs text-gray-600 mt-1">
                          Inactive roles cannot be assigned to users.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="role_protected"
                        checked={roleForm.protected}
                        onChange={(e) => setRoleForm({ ...roleForm, protected: e.target.checked })}
                        className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded mt-1"
                      />
                      <div className="ml-3">
                        <label htmlFor="role_protected" className="block text-sm font-medium text-gray-900">
                          🔒 Protected Role
                        </label>
                        <p className="text-xs text-gray-600 mt-1">
                          Only SUPERADMIN/DEVELOPER can modify this role.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="role_hidden"
                        checked={roleForm.hidden_from_tenant_admin}
                        onChange={(e) => setRoleForm({ ...roleForm, hidden_from_tenant_admin: e.target.checked })}
                        className="h-4 w-4 text-gray-600 focus:ring-gray-500 border-gray-300 rounded mt-1"
                      />
                      <div className="ml-3">
                        <label htmlFor="role_hidden" className="block text-sm font-medium text-gray-900">
                          👁️ Hidden from Tenant Admin
                        </label>
                        <p className="text-xs text-gray-600 mt-1">
                          This role will not be visible to regular tenant admins.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : modalMode === 'create' ? 'Create Role' : 'Update Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permission Modal */}
      {showPermissionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">
                {modalMode === 'create' ? 'Create New Permission' : 'Edit Permission'}
              </h3>
              <button
                onClick={() => setShowPermissionModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitPermission}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={permissionForm.name}
                    onChange={(e) => setPermissionForm({ ...permissionForm, name: e.target.value })}
                    placeholder="e.g., billing:read"
                    required
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Format: category:action (e.g., user:read, order:create)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={permissionForm.description}
                    onChange={(e) => setPermissionForm({ ...permissionForm, description: e.target.value })}
                    placeholder="Permission description"
                    rows="2"
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={permissionForm.category}
                    onChange={(e) => setPermissionForm({ ...permissionForm, category: e.target.value })}
                    placeholder="e.g., billing, user, order"
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Protected Permission Checkbox */}
                <div className="border-t pt-4">
                  <div className="space-y-3">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="permission_protected"
                        checked={permissionForm.protected}
                        onChange={(e) => setPermissionForm({ ...permissionForm, protected: e.target.checked })}
                        className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded mt-1"
                      />
                      <div className="ml-3">
                        <label htmlFor="permission_protected" className="block text-sm font-medium text-gray-900">
                          🔒 Protected Permission
                        </label>
                        <p className="text-xs text-gray-600 mt-1">
                          Only SUPERADMIN/DEVELOPER can modify this permission. Regular admins cannot edit or delete it.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="permission_hidden"
                        checked={permissionForm.hidden_from_tenant_admin}
                        onChange={(e) => setPermissionForm({ ...permissionForm, hidden_from_tenant_admin: e.target.checked })}
                        className="h-4 w-4 text-gray-600 focus:ring-gray-500 border-gray-300 rounded mt-1"
                      />
                      <div className="ml-3">
                        <label htmlFor="permission_hidden" className="block text-sm font-medium text-gray-900">
                          👁️ Hidden from Tenant Admin
                        </label>
                        <p className="text-xs text-gray-600 mt-1">
                          This permission will not be visible to regular tenant admins. Only SUPERADMIN/DEVELOPER can see it.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowPermissionModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : modalMode === 'create' ? 'Create Permission' : 'Update Permission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Permission Modal */}
      {showAssignModal && selectedRole && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Assign Permissions to "{selectedRole.name}"</h3>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setAssignModalSearchQuery('');
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Search Input for Assign Modal */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search permissions by name, description, or category..."
                value={assignModalSearchQuery}
                onChange={(e) => setAssignModalSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {getUnassignedPermissions().length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Showing {getFilteredUnassignedPermissions().length} of {getUnassignedPermissions().length} available permissions
                </p>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {getUnassignedPermissions().length > 0 ? (
                getFilteredUnassignedPermissions().length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {getFilteredUnassignedPermissions().map((permission) => (
                      <div
                        key={permission.id}
                        className="p-3 border border-gray-200 rounded hover:bg-gray-50 flex justify-between items-center"
                      >
                        <div className="flex-1">
                          <code className="text-sm font-semibold text-blue-600">{permission.name}</code>
                          <p className="text-xs text-gray-600">{permission.description}</p>
                          {permission.category && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                              {permission.category}
                            </span>
                          )}
                        </div>
                        {/* Assign Permission Button */}
                        <button
                          onClick={() => {
                            handleAssignPermission(permission.id);
                            setShowAssignModal(false);
                            setAssignModalSearchQuery('');
                          }}
                          className="ml-4 p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          title="Assign Permission"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No permissions matching "{assignModalSearchQuery}"
                  </p>
                )
              ) : (
                <p className="text-gray-500 text-center py-8">
                  All permissions are already assigned to this role.
                </p>
              )}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setAssignModalSearchQuery('');
                }}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolePermissionManager;