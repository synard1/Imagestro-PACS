import React from 'react';
import RolePermissionManager from '../components/RolePermissionManager';

/**
 * Dedicated page for Roles Management
 * Shows only the Roles tab from RolePermissionManager
 */
const RolesManagement = () => {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-slate-800">Roles Management</h1>
        <p className="text-sm text-slate-600 mt-1">
          Manage system roles and assign permissions to roles
        </p>
      </div>

      <RolePermissionManager initialTab="roles" />
    </div>
  );
};

export default RolesManagement;
