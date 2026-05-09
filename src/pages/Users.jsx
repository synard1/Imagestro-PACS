import React, { useEffect, useState } from 'react';
import * as userService from '../services/userService';
import { can, getCurrentUser } from '../services/rbac';
import * as mappingService from '../services/khanzaMappingService';
import OperatorMappingModal from '../components/khanza/OperatorMappingModal';
import { logger } from '../utils/logger';
import { useToast } from '../components/ToastProvider';
import {
  PencilSquareIcon,
  KeyIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  UserIcon
} from '@heroicons/react/24/outline';

/**
 * Generate a strong random password
 */
const generateStrongPassword = (length = 16) => {
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
 * Users Page
 * Refined UI/UX for a slim, professional, and modern user management experience.
 */
export default function Users() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [khanzaEnabled, setKhanzaEnabled] = useState(false);
  const [operatorMappings, setOperatorMappings] = useState({});
  const [selectedUserForMapping, setSelectedUserForMapping] = useState(null);
  const [showMappingModal, setShowMappingModal] = useState(false);

  // User edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const term = searchTerm.toLowerCase();
    const filtered = users.filter(user => 
      (user.name || '').toLowerCase().includes(term) ||
      (user.username || '').toLowerCase().includes(term) ||
      (user.role || '').toLowerCase().includes(term)
    );
    setFilteredUsers(filtered);
  }, [searchTerm, users]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadUsers(),
        checkKhanzaStatus()
      ]);
    } catch (err) {
      logger.error('[Users]', 'Failed to load initial data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkKhanzaStatus = async () => {
    try {
      const isEnabled = mappingService.isKhanzaEnabled();
      setKhanzaEnabled(isEnabled);
      if (isEnabled) {
        await loadOperatorMappings();
      }
    } catch (err) {
      logger.error('[Users]', 'Failed to check Khanza status:', err.message);
    }
  };

  const loadOperatorMappings = async () => {
    try {
      const result = await mappingService.listOperatorMappings({ pageSize: 1000 });
      const mappingsMap = {};
      if (result.items && Array.isArray(result.items)) {
        result.items.forEach(mapping => {
          mappingsMap[mapping.pacs_user_id] = mapping;
        });
      }
      setOperatorMappings(mappingsMap);
    } catch (err) {
      logger.error('[Users]', 'Failed to load operator mappings:', err.message);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await userService.getUsers();
      let usersList = response.data?.users || response.users || [];

      const currentUser = getCurrentUser();
      const currentUserRole = (currentUser?.role || '').toLowerCase();
      const canSeeAllUsers = currentUserRole === 'superadmin' || currentUserRole === 'developer';

      if (!canSeeAllUsers) {
        usersList = usersList.filter(user => {
          const role = (user.role || '').toLowerCase();
          return role !== 'superadmin' && role !== 'developer';
        });
      }
      setUsers(usersList);
      setFilteredUsers(usersList);
    } catch (err) {
      setError(`Failed to load users: ${err.message}`);
    }
  };

  const handleOpenMappingModal = (user) => {
    setSelectedUserForMapping(user);
    setShowMappingModal(true);
  };

  const handleMappingSuccess = async () => {
    await loadOperatorMappings();
    toast.success('User mapping updated successfully');
  };

  const refreshUsersFromBackend = async () => {
    try {
      setLoading(true);
      await loadUsers();
      await checkKhanzaStatus();
      toast.success('User data refreshed from server');
    } catch (err) {
      toast.error('Failed to refresh user data');
    } finally {
      setLoading(false);
    }
  };

  const openEditUserModal = (user) => {
    setEditingUser(user);
    setGeneratedPassword('');
    setShowPassword(false);
    setCopiedPassword(false);
    setShowEditModal(true);
  };

  const handleGeneratePassword = () => {
    const pw = generateStrongPassword(16);
    setGeneratedPassword(pw);
    setShowPassword(true);
    setCopiedPassword(false);
  };

  const copyPassword = async () => {
    if (generatedPassword) {
      await navigator.clipboard.writeText(generatedPassword);
      setCopiedPassword(true);
      toast.success('Password copied to clipboard');
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  };

  const handleSavePassword = async () => {
    if (!generatedPassword) {
      toast.error('Please generate a password first');
      return;
    }
    try {
      await userService.changeUserPassword(editingUser.id, generatedPassword);
      toast.success(`Password updated for ${editingUser.username}`);
      setShowEditModal(false);
      setGeneratedPassword('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update password');
    }
  };

  const handleResetPassword = async () => {
    const email = editingUser?.email;
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
      setShowEditModal(false);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      toast.error(`Failed to send reset email: ${msg}`);
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const clearPWACache = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
        
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        
        toast.success('Cache cleared. Reloading page...');
        setTimeout(() => window.location.reload(true), 1500);
      } else {
        window.location.reload(true);
      }
    } catch (err) {
      toast.error('Failed to clear cache');
      window.location.reload(true);
    }
  };

  const canManageUsers = can('user:manage') || can('user:*') || can('*');
  const canSeeUISettings = () => {
    const currentUser = getCurrentUser();
    const role = (currentUser?.role || '').toLowerCase();
    return role === 'superadmin' || role === 'developer';
  };

  const getRoleBadgeColor = (role) => {
    const r = (role || '').toLowerCase();
    const colors = {
      superadmin: 'bg-rose-50 text-rose-600 border-rose-100',
      developer: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      admin: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      tenant_admin: 'bg-violet-50 text-violet-600 border-violet-100',
      radiologist: 'bg-sky-50 text-sky-600 border-sky-100',
      technician: 'bg-amber-50 text-amber-600 border-amber-100'
    };
    return colors[r] || 'bg-slate-50 text-slate-600 border-slate-100';
  };

  const getInitials = (user) => {
    const name = user.name || user.full_name || user.username || 'U';
    return name.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">Loading Users</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Users & Roles</h1>
          <p className="text-sm text-gray-500 mt-1">Manage system access and permissions</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={refreshUsersFromBackend}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh user data from backend"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Users
          </button>
          
          <button
            onClick={clearPWACache}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            title="Clear PWA cache and reload"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Cache
          </button>
          
          {canManageUsers && canSeeUISettings() && (
            <button
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-blue-200 transition-all active:scale-[0.98]"
              onClick={() => alert('Navigate to User Management')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add User
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-6">
        <div className="relative max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 sm:text-sm transition-all"
            placeholder="Search by name, username or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Slim Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">User Profile</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">System Role</th>
                {canSeeUISettings() && (
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Permissions</th>
                )}
                {khanzaEnabled && (
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">SIMRS Integration</th>
                )}
                <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredUsers.map((user) => {
                const mapping = operatorMappings[user.id];
                return (
                  <tr key={user.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm border border-blue-100 group-hover:scale-110 transition-transform">
                          {getInitials(user)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900 leading-tight">{user.name || user.full_name || 'N/A'}</div>
                          <div className="text-xs text-gray-400 mt-0.5 font-medium">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${getRoleBadgeColor(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    {canSeeUISettings() && (
                      <td className="px-6 py-4">
                        {user.permissions && user.permissions.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {user.permissions.slice(0, 2).map((perm, idx) => (
                              <span key={idx} className="inline-flex px-2 py-0.5 bg-gray-50 text-gray-500 text-[10px] font-semibold rounded-md border border-gray-100">
                                {perm.name || perm}
                              </span>
                            ))}
                            {user.permissions.length > 2 && (
                              <span className="inline-flex px-2 py-0.5 bg-blue-50 text-blue-500 text-[10px] font-bold rounded-md">
                                +{user.permissions.length - 2} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-300 font-medium italic">Standard Access</span>
                        )}
                      </td>
                    )}
                    {khanzaEnabled && (
                      <td className="px-6 py-4">
                        {mapping ? (
                          <div className="flex items-center gap-3">
                            <span className="inline-flex items-center px-2.5 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-emerald-100">
                              <span className="w-1 h-1 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                              Connected
                            </span>
                            <button
                              onClick={() => handleOpenMappingModal(user)}
                              className="text-blue-500 hover:text-blue-700 text-[10px] font-bold uppercase tracking-wider transition-colors"
                            >
                              Edit
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenMappingModal(user)}
                            className="inline-flex items-center px-3 py-1.5 bg-gray-50 hover:bg-blue-50 text-gray-400 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-gray-100 hover:border-blue-100 transition-all"
                          >
                            Map Operator
                          </button>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {canSeeUISettings() && (
                          <button
                            onClick={() => openEditUserModal(user)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit User / Password"
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 bg-gray-50/30">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 border border-gray-100">
              <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-400">No users match your criteria</span>
            <button 
              onClick={() => setSearchTerm('')}
              className="mt-2 text-xs text-blue-500 font-bold uppercase tracking-wider hover:underline"
            >
              Clear Search
            </button>
          </div>
        )}
      </div>

      {khanzaEnabled && (
        <OperatorMappingModal
          isOpen={showMappingModal}
          onClose={() => {
            setShowMappingModal(false);
            setSelectedUserForMapping(null);
          }}
          user={selectedUserForMapping}
          onMappingSuccess={handleMappingSuccess}
        />
      )}

      {/* User Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <PencilSquareIcon className="h-6 w-6" />
                Edit User
              </h2>
              <button onClick={() => setShowEditModal(false)} className="text-white/80 hover:text-white transition-colors">
                <XCircleIcon className="h-7 w-7" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* User Info */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                  {getInitials(editingUser)}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{editingUser?.name || editingUser?.full_name || 'N/A'}</p>
                  <p className="text-sm text-slate-500">@{editingUser?.username}</p>
                </div>
              </div>

              {/* Generate Password Section */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700">Set Password</label>

                {generatedPassword ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={generatedPassword}
                        readOnly
                        className="w-full px-4 py-3 pr-12 border border-slate-300 rounded-lg font-mono text-sm bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                      </button>
                    </div>
                    <button
                      onClick={copyPassword}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        copiedPassword
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                          Copy Password
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleGeneratePassword}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium transition-colors"
                  >
                    <KeyIcon className="w-4 h-4" />
                    Generate Strong Password
                  </button>
                )}

                <button
                  onClick={handleGeneratePassword}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Regenerate
                </button>
              </div>

              {/* Save Button */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePassword}
                  disabled={!generatedPassword}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Password
                </button>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-slate-500">OR</span>
                </div>
              </div>

              {/* Reset Password via Email */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700">Reset via Email</label>

                {!editingUser?.email ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800 flex items-center gap-2">
                      <ExclamationTriangleIcon className="w-4 h-4" />
                      No email address registered for this user.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                      <UserIcon className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">{editingUser.email}</span>
                    </div>
                    <button
                      onClick={handleResetPassword}
                      disabled={resetPasswordLoading}
                      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 text-sm font-medium border border-amber-200 transition-colors disabled:opacity-50"
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
                    <p className="text-xs text-slate-500 text-center">
                      User will receive an email with password reset link.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
