import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as userService from '../services/userService';
import { logger } from '../utils/logger';
import { useToast } from '../components/ToastProvider';
import RolePermissionManager from '../components/RolePermissionManager';
import UserImpersonateButton from '../components/admin/UserImpersonateButton';
import { generatePassword, calculatePasswordStrength, DEFAULT_PASSWORD_OPTIONS } from '../utils/passwordGenerator';
import { getCurrentUser } from '../services/rbac';
import PermissionGate from '../components/common/PermissionGate';
import {
  KeyIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  EyeIcon,
  EyeSlashIcon,
  UserIcon,
  ExclamationTriangleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

/**
 * User Management Page
 * Refined with a slim, professional, and modern UI.
 * Fixed: Action buttons visibility and layout.
 */
const UserManagement = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  // Tab state
  const activeTab = searchParams.get('tab') || 'users';
  const subtabParam = searchParams.get('subtab') || 'roles';

  // State management
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);

  // Pagination & Filter state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const limit = 20;

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedUser, setSelectedUser] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'VIEWER',
    is_active: true,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordGenerator, setShowPasswordGenerator] = useState(false);
  const [passwordOptions, setPasswordOptions] = useState(DEFAULT_PASSWORD_OPTIONS);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
      loadRoles();
    }
  }, [activeTab, currentPage, searchQuery, roleFilter]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await userService.getUsers({
        page: currentPage,
        limit: limit,
        search: searchQuery || undefined,
        role: roleFilter || undefined,
      });

      const usersList = response.data?.users || response.users || [];
      const pagination = response.data?.pagination || response.pagination || {};
      setUsers(usersList);
      setTotalPages(pagination.total_pages || 1);
      setTotalUsers(pagination.total || 0);
    } catch (err) {
      logger.error('Failed to load users:', err);
      toast.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const response = await userService.getRoles();
      const rolesData = response.data?.roles || response.roles || [];
      setRoles(Array.isArray(rolesData) ? rolesData : []);
    } catch (err) {
      logger.error('Failed to load roles:', err);
    }
  };

  const clearPWACache = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) await registration.unregister();
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        toast.success('Assets refreshed. Reloading...');
        setTimeout(() => window.location.reload(true), 1000);
      } else {
        window.location.reload(true);
      }
    } catch (err) {
      window.location.reload(true);
    }
  };

  const handleCreateUser = () => {
    setModalMode('create');
    setSelectedUser(null);
    setFormData({ username: '', email: '', password: '', full_name: '', role: 'VIEWER', is_active: true });
    setShowModal(true);
  };

  const handleEditUser = (user) => {
    setModalMode('edit');
    setSelectedUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      full_name: user.full_name || user.name,
      role: user.role,
      is_active: user.is_active,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (modalMode === 'create') {
        await userService.createUser(formData);
        toast.success('User created');
      } else {
        const { password, ...updateData } = formData;
        const payload = password ? formData : updateData;
        delete payload.username;
        await userService.updateUser(selectedUser.id, payload);
        toast.success('User updated');
      }
      setShowModal(false);
      loadUsers();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Delete user "${username}"?`)) return;
    try {
      await userService.deleteUser(userId);
      toast.success('User deleted');
      loadUsers();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleUserStatus = async (userId, currentStatus, username) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} user "${username}"?`)) return;
    try {
      if (currentStatus) await userService.deactivateUser(userId);
      else await userService.activateUser(userId);
      toast.success(`User ${action}d`);
      loadUsers();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleGeneratePassword = () => {
    const newPassword = generatePassword(passwordOptions);
    setFormData({ ...formData, password: newPassword });
    setShowPasswordGenerator(true);
    setCopiedPassword(false);
  };

  const handleCopyPassword = async () => {
    if (formData.password) {
      await navigator.clipboard.writeText(formData.password);
      setCopiedPassword(true);
      toast.success('Password copied to clipboard');
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  };

  const handleResetPassword = async () => {
    const email = selectedUser?.email;
    if (!email) {
      toast.error('No email address found for this user. Cannot send reset instructions.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to send password reset instructions to?\n\n` +
      `Email: ${email}\n\n` +
      `The user will receive an email with instructions to create a new password.`
    );

    if (!confirmed) return;

    setResetPasswordLoading(true);
    try {
      await userService.requestPasswordReset(email);
      toast.success(`Password reset instructions sent to ${email}`);
      setShowModal(false);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      toast.error(`Failed to send reset email: ${msg}`);
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const canManageUsers = () => {
    const currentUser = getCurrentUser();
    const role = (currentUser?.role || '').toLowerCase();
    return role === 'superadmin' || role === 'developer';
  };

  const getRoleBadgeColor = (role) => {
    const r = (role || '').toLowerCase();
    if (r === 'superadmin') return 'bg-rose-50 text-rose-600 border-rose-100';
    if (r === 'developer') return 'bg-indigo-50 text-indigo-600 border-indigo-100';
    if (r === 'tenant_admin') return 'bg-violet-50 text-violet-600 border-violet-100';
    if (r.includes('admin')) return 'bg-rose-50 text-rose-600 border-rose-100';
    if (r.includes('dev')) return 'bg-indigo-50 text-indigo-600 border-indigo-100';
    if (r.includes('radiologist')) return 'bg-sky-50 text-sky-600 border-sky-100';
    if (r.includes('nurse') || r.includes('tech')) return 'bg-amber-50 text-amber-600 border-amber-100';
    return 'bg-slate-50 text-slate-600 border-slate-100';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">System Access</h1>
          <p className="text-sm text-gray-500 mt-1">Manage users, roles and security permissions</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={clearPWACache}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            REFRESH ASSETS
          </button>
          
          <PermissionGate perm="user.manage">
            <button
              onClick={handleCreateUser}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              NEW USER
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 mb-6 gap-8">
        <button
          onClick={() => setSearchParams({ tab: 'users' })}
          className={`pb-4 text-sm font-bold tracking-widest transition-all border-b-2 ${activeTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          USERS DIRECTORY
        </button>
        <button
          onClick={() => setSearchParams({ tab: 'rbac' })}
          className={`pb-4 text-sm font-bold tracking-widest transition-all border-b-2 ${activeTab === 'rbac' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          ROLES & PERMISSIONS
        </button>
      </div>

      {activeTab === 'users' && (
        <>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="relative md:col-span-2">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="h-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                className="block w-full pl-11 pr-4 py-3 border border-gray-100 rounded-2xl bg-white text-sm focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all shadow-sm"
                placeholder="Search name, email or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="block w-full px-4 py-3 border border-gray-100 rounded-2xl bg-white text-sm focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all shadow-sm appearance-none"
            >
              <option value="">All Account Roles</option>
              {roles.map((role) => (
                <option key={role.id || role.name} value={role.name}>{role.name}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/30 border-b border-gray-50">
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Identification</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Contact</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Privileges</th>
                    <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</th>
                    <th className="px-6 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading && users.length === 0 ? (
                    <tr><td colSpan="5" className="py-20 text-center"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan="5" className="py-20 text-center text-gray-400 font-medium italic text-sm">No accounts found matching current filters</td></tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className="hover:bg-blue-50/20 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-black text-sm shadow-md group-hover:scale-110 transition-transform">
                              {(user.full_name || user.name || user.username)?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-black text-gray-900 leading-tight">{user.full_name || user.name || 'N/A'}</div>
                              <div className="text-[11px] text-gray-400 mt-0.5 font-bold uppercase tracking-wider">@{user.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-600">{user.email}</div>
                          <div className="text-[10px] text-gray-300 mt-0.5">Last login: {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getRoleBadgeColor(user.role)}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${user.is_active ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
                            <span className={`w-1 h-1 rounded-full ${user.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                            {user.is_active ? 'Active' : 'Locked'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <PermissionGate perm="system.admin">
                              <UserImpersonateButton user={user} />
                            </PermissionGate>
                            <button onClick={() => handleEditUser(user)} className="p-2 text-indigo-500 hover:bg-indigo-100 rounded-xl transition-all" title="Modify Account">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => handleToggleUserStatus(user.id, user.is_active, user.username)} className={`p-2 rounded-xl transition-all ${user.is_active ? 'text-amber-500 hover:bg-amber-100' : 'text-emerald-500 hover:bg-emerald-100'}`} title={user.is_active ? 'Lock Account' : 'Unlock Account'}>
                              {user.is_active ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                            </button>
                            <button onClick={() => handleDeleteUser(user.id, user.username)} className="p-2 text-rose-500 hover:bg-rose-100 rounded-xl transition-all" title="Purge Account">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-50 flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Page {currentPage} of {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-[10px] font-black border border-gray-200 rounded-lg hover:bg-white disabled:opacity-30 transition-all">PREV</button>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-[10px] font-black border border-gray-200 rounded-lg hover:bg-white disabled:opacity-30 transition-all">NEXT</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'rbac' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-6">
          <RolePermissionManager initialTab={subtabParam} />
        </div>
      )}

      {/* Modern Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20">
            <div className="px-8 pt-8 pb-6 border-b border-gray-50">
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">{modalMode} account</h3>
              <p className="text-sm text-gray-400 mt-1">Fill in the security details for this system user</p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Username</label>
                  <input type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} disabled={modalMode === 'edit'} required className="w-full px-4 py-3 rounded-2xl bg-gray-50 border-none focus:ring-4 focus:ring-blue-50 text-sm font-bold transition-all disabled:opacity-50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required className="w-full px-4 py-3 rounded-2xl bg-gray-50 border-none focus:ring-4 focus:ring-blue-50 text-sm font-bold transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input type="text" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full px-4 py-3 rounded-2xl bg-gray-50 border-none focus:ring-4 focus:ring-blue-50 text-sm font-bold transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">System Role</label>
                  <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-4 py-3 rounded-2xl bg-gray-50 border-none focus:ring-4 focus:ring-blue-50 text-sm font-bold transition-all appearance-none">
                    {roles.map(r => <option key={r.id || r.name} value={r.name}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              
<div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Password {modalMode === 'edit' && '(Leave blank to keep current)'}</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required={modalMode === 'create'} className="w-full px-4 py-3 rounded-2xl bg-gray-50 border-none focus:ring-4 focus:ring-blue-50 text-sm font-bold transition-all pr-12" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPassword ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.28 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                  </button>
                </div>
                
                {/* Generate Password Button */}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors"
                  >
                    <KeyIcon className="w-4 h-4" />
                    Generate Password
                  </button>
                  
                  {formData.password && (
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                        copiedPassword
                          ? 'bg-green-50 text-green-600'
                          : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {copiedPassword ? (
                        <>
                          <ClipboardDocumentCheckIcon className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <ClipboardDocumentIcon className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Reset Password via Email (Edit Mode + Superadmin) */}
              {modalMode === 'edit' && canManageUsers() && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Reset Password via Email</label>
                  
                  {!selectedUser?.email ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm text-amber-800 flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4" />
                        No email address registered for this user.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                        <UserIcon className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{selectedUser.email}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        disabled={resetPasswordLoading}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-amber-50 text-amber-700 rounded-xl text-sm font-bold border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50"
                      >
                        {resetPasswordLoading ? (
                          <>
                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <ArrowPathIcon className="w-4 h-4" />
                            Send Reset Instructions
                          </>
                        )}
                      </button>
                      <p className="text-xs text-gray-400 text-center">
                        User will receive an email with password reset link.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">Discard changes</button>
                <button type="submit" disabled={loading} className="px-8 py-3.5 bg-gray-900 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-gray-800 transition-all shadow-xl shadow-gray-200 active:scale-95 disabled:opacity-50">
                  {loading ? 'Processing...' : 'Securely Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
