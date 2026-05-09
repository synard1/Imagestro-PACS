import React, { useState, useEffect, useMemo } from 'react';
import { tenantService } from '../services/tenantService';
import { subscriptionService } from '../services/subscriptionService';
import { useToast } from '../components/ToastProvider';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  BuildingOfficeIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  GlobeAltIcon,
  KeyIcon,
  EyeIcon,
  EyeSlashIcon,
  ChartBarIcon,
  ServerStackIcon
} from '@heroicons/react/24/outline';

import TenantCard from '../components/Tenants/TenantCard';
import TenantStatsModal from '../components/Tenants/TenantStatsModal';
import ExternalSystemConfig from '../components/Tenants/ExternalSystemConfig';
import Select2 from '../components/Select2';

/**
 * Helper to generate a secure random password
 */
const generateStrongPassword = (length = 12) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
};

const SIMRSStatus = ({ tenant }) => {
  const [status, setStatus] = useState({ status: 'loading', latency: 0 });

  useEffect(() => {
    if (tenant.settings?.simrs_config?.adapter_url) {
      fetch(`/api/tenants/${tenant.id}/simrs-health`)
        .then(r => r.json())
        .then(setStatus)
        .catch(() => setStatus({ status: 'offline', latency: 0 }));
    } else {
      setStatus({ status: 'disabled', latency: 0 });
    }
  }, [tenant]);

  if (status.status === 'disabled') return <span className="text-slate-400 text-xs italic">Disabled</span>;
  if (status.status === 'loading') return <span className="text-xs text-slate-400 animate-pulse">Checking...</span>;
  
  const colors = status.status === 'online' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  return (
    <div className={`px-2 py-1 rounded text-xs font-medium ${colors}`}>
      {status.status.toUpperCase()} ({status.latency}ms)
    </div>
  );
};

const Tenants = () => {
  const toast = useToast();

  const [tenants, setTenants] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedTenant, setSelectedTenant] = useState(null);

  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsTenant, setStatsTenant] = useState(null);

  const [showExternalConfig, setShowExternalConfig] = useState(false);
  const [configTenant, setConfigTenant] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'hospital',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    country: 'Indonesia',
    phone: '',
    email: '',
    website: '',
    contact_person: '',
    contact_email: '',
    contact_phone: '',
    tax_id: '',
    satusehat_org_id: '',
    irc_id: '',
    notes: '',
    settings: {
      simrs_adapter_type: '',
      simrs_adapter_url: '',
      simrs_api_key: '',
      simrs_jwt: ''
    }
  });

  useEffect(() => {
    loadData();
  }, [currentPage, typeFilter, statusFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tenantsRes, subsRes] = await Promise.all([
        tenantService.listTenants({
          search: searchQuery,
          type: typeFilter || undefined,
          is_active: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
          limit: 100,
        }),
        subscriptionService.listSubscriptions(null, 'active'),
      ]);
      setTenants(tenantsRes?.items || []);
      setSubscriptions(subsRes?.items || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error('Failed to load tenants');
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery || typeFilter || statusFilter) {
        loadData();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, typeFilter, statusFilter]);

  const stats = useMemo(() => {
    const all = tenants;
    const active = all.filter(t => t.is_active).length;
    const verified = all.filter(t => t.is_verified).length;
    const pending = active - verified;
    return { total: all.length, active, verified, pending };
  }, [tenants]);

  const getTenantSubscription = (tenantId) => {
    return subscriptions.find(s => s.tenant_id === tenantId);
  };

  const filteredTenants = useMemo(() => {
    if (!searchQuery) return tenants;
    const q = searchQuery.toLowerCase();
    return tenants.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.code?.toLowerCase().includes(q) ||
      t.city?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.contact_person?.toLowerCase().includes(q)
    );
  }, [tenants, searchQuery]);

  const paginatedTenants = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTenants.slice(start, start + itemsPerPage);
  }, [filteredTenants, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredTenants.length / itemsPerPage);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (modalMode === 'create') {
        await tenantService.createTenant(formData);
        toast.success('Tenant created successfully');
      } else {
        await tenantService.updateTenant(selectedTenant.id, formData);
        toast.success('Tenant updated successfully');
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      console.error('Failed to save tenant:', err);
      toast.error(err.response?.data?.detail || 'Failed to save tenant');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to deactivate this tenant?')) return;
    try {
      await tenantService.deleteTenant(id);
      toast.success('Tenant deactivated successfully');
      loadData();
    } catch (err) {
      console.error('Failed to delete tenant:', err);
      toast.error('Failed to deactivate tenant');
    }
  };

  const handleVerify = async (id) => {
    try {
      await tenantService.verifyTenant(id);
      toast.success('Tenant verified successfully');
      loadData();
    } catch (err) {
      console.error('Failed to verify tenant:', err);
      toast.error('Failed to verify tenant');
    }
  };

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminProvisionMode, setAdminProvisionMode] = useState('new'); // 'new' or 'existing'
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedExistingUser, setSelectedExistingUser] = useState(null);
  const [adminFormData, setAdminFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'TENANT_ADMIN'
  });

  const openAdminModal = async (tenant) => {
    setSelectedTenant(tenant);
    setAdminProvisionMode('new');
    setSelectedExistingUser(null);
    
    // Suggest username based on tenant code
    const suggestedUsername = `admin.${(tenant.code || 'tenant').toLowerCase()}`;
    
    setAdminFormData({
      username: suggestedUsername,
      email: tenant.contact_email || '',
      password: '',
      full_name: tenant.contact_person || '',
      role: 'TENANT_ADMIN'
    });
    setShowAdminPassword(false);
    setShowAdminModal(true);

    // Fetch users for 'existing' mode
    try {
      const userService = await import('../services/userService');
      const res = await userService.getUsers({ limit: 100 });
      
      console.log('[Tenants] Users API Response:', res);

      let usersData = [];
      
      // Handle various response structures
      if (res) {
        if (Array.isArray(res.data?.users)) {
          usersData = res.data.users;
        } else if (Array.isArray(res.users)) {
          usersData = res.users;
        } else if (Array.isArray(res.data)) {
          usersData = res.data;
        } else if (Array.isArray(res)) {
          usersData = res;
        }
      }
      
      console.log('[Tenants] Extracted usersData:', usersData);
      setAvailableUsers(Array.isArray(usersData) ? usersData : []);
    } catch (err) {
      console.warn('Failed to fetch users for dropdown:', err);
      setAvailableUsers([]);
    }
  };

  const openStatsModal = (tenant) => {
    setStatsTenant(tenant);
    setShowStatsModal(true);
  };

  const fetchInitialUsers = async () => {
    return availableUsers.slice(0, 10).map(u => ({
      value: u.id,
      label: `${u.username} (${u.full_name || u.email})`,
      meta: (u.tenant_id || u.hospital_id) ? 'ALREADY LINKED' : 'Available'
    }));
  };

  const searchUsers = async (query) => {
    const q = query.toLowerCase();
    return availableUsers
      .filter(u => 
        u.username?.toLowerCase().includes(q) || 
        (u.full_name && u.full_name.toLowerCase().includes(q)) || 
        (u.email && u.email.toLowerCase().includes(q))
      )
      .slice(0, 20)
      .map(u => ({
        value: u.id,
        label: `${u.username} (${u.full_name || u.email})`,
        meta: (u.tenant_id || u.hospital_id) ? 'ALREADY LINKED' : 'Available'
      }));
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    try {
      const { createUser, updateUser, assignRoleToUser } = await import('../services/userService');
      
      let user;
      if (adminProvisionMode === 'new') {
        const userPayload = {
          ...adminFormData,
          hospital_id: selectedTenant.id,
          tenant_id: selectedTenant.id,
          is_active: true
        };
        user = await createUser(userPayload);
        toast.success(`Admin account for ${selectedTenant.name} created successfully`);
      } else {
        if (!selectedExistingUser) {
          toast.error('Please select an existing user');
          return;
        }
        
        // Update existing user with tenant_id
        await updateUser(selectedExistingUser.id, {
          tenant_id: selectedTenant.id,
          hospital_id: selectedTenant.id,
          role: 'TENANT_ADMIN'
        });
        user = selectedExistingUser;
        toast.success(`User ${user.username} is now an admin for ${selectedTenant.name}`);
      }
      
      // Ensure role is assigned
      try {
        await assignRoleToUser(user.id, null, 'TENANT_ADMIN');
      } catch (err) {
        console.warn('Role assignment already handled or failed:', err);
      }

      setShowAdminModal(false);
      loadData(); // Refresh list to update user counts
    } catch (err) {
      console.error('Failed to provision admin:', err);
      toast.error(err.response?.data?.detail || 'Failed to provision admin account');
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedTenant(null);
    setFormData({
      name: '',
      code: '',
      type: 'hospital',
      address: '',
      city: '',
      province: '',
      postal_code: '',
      country: 'Indonesia',
      phone: '',
      email: '',
      website: '',
      contact_person: '',
      contact_email: '',
      contact_phone: '',
      tax_id: '',
      satusehat_org_id: '',
      irc_id: '',
      notes: '',
      settings: {
        simrs_adapter_type: '',
        simrs_adapter_url: '',
        simrs_api_key: '',
        simrs_jwt: ''
      }
    });
    setShowModal(true);
  };

  const openEditModal = (tenant) => {
    setModalMode('edit');
    setSelectedTenant(tenant);
    setFormData({
      name: tenant.name || '',
      code: tenant.code || '',
      type: tenant.type || 'hospital',
      address: tenant.address || '',
      city: tenant.city || '',
      province: tenant.province || '',
      postal_code: tenant.postal_code || '',
      country: tenant.country || 'Indonesia',
      phone: tenant.phone || '',
      email: tenant.email || '',
      website: tenant.website || '',
      contact_person: tenant.contact_person || '',
      contact_email: tenant.contact_email || '',
      contact_phone: tenant.contact_phone || '',
      tax_id: tenant.tax_id || '',
      satusehat_org_id: tenant.satusehat_org_id || '',
      irc_id: tenant.irc_id || '',
      notes: tenant.notes || '',
      settings: {
        simrs_adapter_type: tenant.settings?.simrs_adapter_type || '',
        simrs_adapter_url: tenant.settings?.simrs_adapter_url || '',
        simrs_api_key: tenant.settings?.simrs_api_key || '',
        simrs_jwt: tenant.settings?.simrs_jwt || ''
      }
    });
    setShowModal(true);
  };

  const getStatusBadge = (isActive, isVerified) => {
    if (!isActive) {
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-200',
        label: 'Inactive'
      };
    }
    if (!isVerified) {
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        border: 'border-amber-200',
        label: 'Pending'
      };
    }
    return {
      bg: 'bg-green-100',
      text: 'text-green-700',
      border: 'border-green-200',
      label: 'Active'
    };
  };

  const getTypeBadge = (type) => {
    const styles = {
      hospital: 'bg-red-100 text-red-700',
      clinic: 'bg-blue-100 text-blue-700',
      lab: 'bg-purple-100 text-purple-700',
      network: 'bg-teal-100 text-teal-700',
    };
    return styles[type] || 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Tenant Management</h1>
            <p className="text-slate-600 mt-1">Manage hospitals, clinics, and healthcare facilities</p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
          >
            <PlusIcon className="h-5 w-5" />
            Add Tenant
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Tenants</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <BuildingOfficeIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Active</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckBadgeIcon className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Verified</p>
              <p className="text-2xl font-bold text-teal-600 mt-1">{stats.verified}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
              <UserGroupIcon className="h-6 w-6 text-teal-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Pending</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{stats.pending}</p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <ExclamationTriangleIcon className="h-6 w-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex items-center gap-3 flex-1 w-full">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search tenants..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">All Types</option>
              <option value="hospital">Hospital</option>
              <option value="clinic">Clinic</option>
              <option value="lab">Laboratory</option>
              <option value="network">Network</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Grid
              </button>
              <button 
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Table
              </button>
            </div>
            <div className="text-sm text-slate-500 whitespace-nowrap">
              Showing {paginatedTenants.length} of {filteredTenants.length} tenants
            </div>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              Array(6).fill(0).map((_, i) => (
                <div key={i} className="h-64 bg-slate-50 animate-pulse rounded-2xl border border-slate-200" />
              ))
            ) : paginatedTenants.length === 0 ? (
              <div className="col-span-full py-12 text-center">
                <BuildingOfficeIcon className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-2 text-slate-500 font-medium">No tenants found</p>
              </div>
            ) : (
              paginatedTenants.map(tenant => (
                <TenantCard 
                  key={tenant.id} 
                  tenant={tenant} 
                  subscription={getTenantSubscription(tenant.id)}
                  onEdit={(t) => openEditModal(t)}
                  onAddAdmin={(t) => openAdminModal(t)}
                  onViewDetails={(t) => openStatsModal(t)}
                  onConfigSIMRS={(t) => {
                    setConfigTenant(t);
                    setShowExternalConfig(true);
                  }}
                />
              ))
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Tenant</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">SIMRS</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Subscription</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-500 mt-2">Loading tenants...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedTenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <BuildingOfficeIcon className="h-12 w-12 text-slate-300" />
                      <p className="text-slate-500 mt-3 font-medium">No tenants found</p>
                      <p className="text-slate-400 text-sm">Add your first tenant to get started</p>
                      <button
                        onClick={openCreateModal}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Add Tenant
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTenants.map((tenant) => {
                  const sub = getTenantSubscription(tenant.id);
                  const statusStyle = getStatusBadge(tenant.is_active, tenant.is_verified);
                  return (
                    <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm">
                            {tenant.name?.charAt(0)?.toUpperCase() || 'T'}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{tenant.name}</p>
                            <p className="text-xs text-slate-500 font-mono">{tenant.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getTypeBadge(tenant.type)}`}>
                          {tenant.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          <MapPinIcon className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm text-slate-600">{tenant.city || '-'}</p>
                            <p className="text-xs text-slate-400">{tenant.province}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-sm text-slate-600 flex items-center gap-1.5">
                            <UserGroupIcon className="h-3.5 w-3.5 text-slate-400" />
                            {tenant.contact_person || '-'}
                          </p>
                          <p className="text-xs text-slate-400 flex items-center gap-1.5">
                            <EnvelopeIcon className="h-3.5 w-3.5 text-slate-400" />
                            {tenant.contact_email || '-'}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                          {statusStyle.label}
                        </span>
                        {tenant.satusehat_org_id && (
                          <div className="mt-1 flex items-center gap-1">
                            <GlobeAltIcon className="h-3 w-3 text-teal-500" />
                            <span className="text-xs text-teal-600">SatuSehat</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <SIMRSStatus tenant={tenant} />
                      </td>
                      <td className="px-6 py-4">
                        {sub ? (
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                              {sub.product_name || sub.product?.name || 'Active'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">No subscription</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button 
                            onClick={() => {
                              setConfigTenant(tenant);
                              setShowExternalConfig(true);
                            }}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Config SIMRS"
                          >
                            <ServerStackIcon className="h-5 w-5" />
                          </button>
                          <button 
                            onClick={() => openStatsModal(tenant)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Stats"
                          >
                            <ChartBarIcon className="h-5 w-5" />
                          </button>
                          <button 
                            onClick={() => openAdminModal(tenant)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Add Tenant Admin"
                          >
                            <UserGroupIcon className="h-5 w-5" />
                          </button>
                          <button 
                            onClick={() => openEditModal(tenant)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Tenant"
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                          {!tenant.is_verified && tenant.is_active && (
                            <button
                              onClick={() => handleVerify(tenant.id)}
                              className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              title="Verify"
                            >
                              <CheckBadgeIcon className="h-5 w-5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(tenant.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Deactivate"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = currentPage - 2 + i;
                }
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 text-sm rounded-lg ${
                      currentPage === page
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">
                {modalMode === 'create' ? 'Add New Tenant' : `Edit: ${selectedTenant?.name}`}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircleIcon className="h-7 w-7" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="overflow-y-auto p-6">
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-3">Basic Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        Tenant Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        required
                        placeholder="e.g., Rumah Sakit Umum Pusat"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Code <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono uppercase"
                        required
                        disabled={modalMode === 'edit'}
                        placeholder="RSUP-JKT"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Type</label>
                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="hospital">Hospital</option>
                        <option value="clinic">Clinic</option>
                        <option value="lab">Laboratory</option>
                        <option value="network">Network</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Location</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Address</label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Jl. Raya No. 1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">City</label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Jakarta"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Province</label>
                      <input
                        type="text"
                        value={formData.province}
                        onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="DKI Jakarta"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Postal Code</label>
                      <input
                        type="text"
                        value={formData.postal_code}
                        onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="12345"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Country</label>
                      <input
                        type="text"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Contact Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Phone</label>
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="+62 21 1234567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="info@hospital.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Contact Person</label>
                      <input
                        type="text"
                        value={formData.contact_person}
                        onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Dr. John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Contact Email</label>
                      <input
                        type="email"
                        value={formData.contact_email}
                        onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="contact@hospital.com"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Website</label>
                      <input
                        type="url"
                        value={formData.website}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="https://hospital.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-teal-50 border border-teal-100 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-teal-900 mb-3">Healthcare Integration</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tax ID (NPWP)</label>
                      <input
                        type="text"
                        value={formData.tax_id}
                        onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                        placeholder="01.234.567.8-901.000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">SatuSehat Org ID</label>
                      <input
                        type="text"
                        value={formData.satusehat_org_id}
                        onChange={(e) => setFormData({ ...formData, satusehat_org_id: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                        placeholder="Organization ID"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">IRC / IHS ID</label>
                      <input
                        type="text"
                        value={formData.irc_id}
                        onChange={(e) => setFormData({ ...formData, irc_id: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                        placeholder="IRC or IHS identifier"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-indigo-900 mb-3">SIMRS Integration Bridge</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Adapter Type</label>
                      <select
                        value={formData.settings?.simrs_adapter_type || ''}
                        onChange={(e) => setFormData({ ...formData, settings: { ...formData.settings, simrs_adapter_type: e.target.value }})}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      >
                        <option value="">None (Disabled)</option>
                        <option value="khanza">Khanza SIMRS</option>
                        <option value="other">Other/Universal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Adapter URL</label>
                      <input
                        type="url"
                        value={formData.settings?.simrs_adapter_url || ''}
                        onChange={(e) => setFormData({ ...formData, settings: { ...formData.settings, simrs_adapter_url: e.target.value }})}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono"
                        placeholder="e.g. http://khanza-api:3000"
                        disabled={!formData.settings?.simrs_adapter_type}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">API Key / JWT Token</label>
                      <input
                        type="password"
                        value={formData.settings?.simrs_api_key || formData.settings?.simrs_jwt || ''}
                        onChange={(e) => setFormData({ ...formData, settings: { ...formData.settings, simrs_api_key: e.target.value, simrs_jwt: e.target.value }})}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono"
                        placeholder="Secret key for bridging authentication"
                        disabled={!formData.settings?.simrs_adapter_type}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none h-20"
                    placeholder="Additional notes about this tenant..."
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-200 transition-colors"
                >
                  {modalMode === 'create' ? 'Create Tenant' : 'Update Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Admin Creation Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <UserGroupIcon className="h-6 w-6" />
                Add Tenant Admin
              </h2>
              <button onClick={() => setShowAdminModal(false)} className="text-white/80 hover:text-white transition-colors">
                <XCircleIcon className="h-7 w-7" />
              </button>
            </div>
            
            <form onSubmit={handleCreateAdmin} className="p-6 space-y-4">
              {/* Mode Selection */}
              <div className="flex p-1 bg-slate-100 rounded-xl mb-4">
                <button
                  type="button"
                  onClick={() => setAdminProvisionMode('new')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${adminProvisionMode === 'new' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Create New User
                </button>
                <button
                  type="button"
                  onClick={() => setAdminProvisionMode('existing')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${adminProvisionMode === 'existing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Pick from List
                </button>
              </div>

              {adminProvisionMode === 'existing' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Select User</label>
                    <Select2
                      value={selectedExistingUser?.id || ''}
                      onSelect={(opt) => {
                        const user = availableUsers.find(u => u.id === opt.value);
                        setSelectedExistingUser(user);
                      }}
                      fetchInitial={fetchInitialUsers}
                      fetchOptions={searchUsers}
                      placeholder="Search username, name or email..."
                      minChars={1}
                      className="w-full"
                    />
                  </div>

                  {selectedExistingUser && (
                    <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 space-y-2">
                      <div className="flex items-center gap-2 text-amber-800 font-bold text-xs uppercase">
                        <ExclamationTriangleIcon className="h-4 w-4" />
                        Warning: Tenant Association
                      </div>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        User <strong>{selectedExistingUser.username}</strong> 
                        {selectedExistingUser.tenant_id ? (
                          <> is currently associated with another tenant (ID: {selectedExistingUser.tenant_id.substring(0,8)}...). </>
                        ) : (
                          <> has no current tenant association. </>
                        )}
                        By proceeding, this user will be <strong>moved</strong> to <strong>{selectedTenant?.name}</strong> and assigned the <strong>Tenant Admin</strong> role.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl mb-2">
                    <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                      Creating a <strong>Tenant Admin</strong> for <strong>{selectedTenant?.name}</strong>. 
                      This user will have full access to manage data within this organization.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      required
                      value={adminFormData.full_name}
                      onChange={(e) => setAdminFormData({ ...adminFormData, full_name: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="e.g. John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Username</label>
                    <input
                      type="text"
                      required
                      value={adminFormData.username}
                      onChange={(e) => setAdminFormData({ ...adminFormData, username: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono"
                      placeholder="admin_hospital_code"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
                    <input
                      type="email"
                      required
                      value={adminFormData.email}
                      onChange={(e) => setAdminFormData({ ...adminFormData, email: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="admin@hospital.com"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-sm font-semibold text-slate-700">Password</label>
                      <button 
                        type="button"
                        onClick={() => setAdminFormData({ ...adminFormData, password: generateStrongPassword() })}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 uppercase tracking-wider"
                      >
                        <KeyIcon className="h-3 w-3" />
                        Generate
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showAdminPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={adminFormData.password}
                        onChange={(e) => setAdminFormData({ ...adminFormData, password: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono pr-10"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword(!showAdminPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showAdminPassword ? (
                          <EyeSlashIcon className="h-5 w-5" />
                        ) : (
                          <EyeIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Minimum 8 characters</p>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="px-5 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-lg shadow-indigo-200 transition-colors"
                >
                  {adminProvisionMode === 'new' ? 'Create Account' : 'Assign as Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showStatsModal && (
        <TenantStatsModal 
          tenant={statsTenant} 
          onClose={() => setShowStatsModal(false)} 
        />
      )}
      {showExternalConfig && (
        <ExternalSystemConfig
          tenant={configTenant}
          onClose={() => setShowExternalConfig(false)}
          onSaveSuccess={loadData}
        />
      )}
    </div>
  );
};

export default Tenants;
