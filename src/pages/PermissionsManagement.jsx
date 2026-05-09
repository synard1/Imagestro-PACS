import React from 'react';
import RolePermissionManager from '../components/RolePermissionManager';

/**
 * Dedicated page for Permissions Management
 * Shows only the Permissions tab from RolePermissionManager
 */
const PermissionsManagement = () => {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-slate-800">Permissions Management</h1>
        <p className="text-sm text-slate-600 mt-1">
          Manage system permissions and control access to features
        </p>
      </div>

      <RolePermissionManager initialTab="permissions" />
    </div>
  );
};

export default PermissionsManagement;
