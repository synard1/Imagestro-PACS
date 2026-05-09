import React, { useState, useEffect, useMemo } from 'react';
import { subscriptionService } from '../services/subscriptionService';
import { tenantService } from '../services/tenantService';
import { useToast } from '../components/ToastProvider';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  CheckCircleIcon,
  XMarkIcon,
  CreditCardIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  ChartBarIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

import UsageProgress from '../components/Subscriptions/UsageProgress';

const Subscriptions = () => {
  const toast = useToast();

  const [subscriptions, setSubscriptions] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedSubscription, setSelectedSubscription] = useState(null);

  const [formData, setFormData] = useState({
    tenant_id: '',
    product_id: '',
    started_at: new Date().toISOString().slice(0, 16),
    expires_at: '',
    billing_email: '',
    auto_renew: true,
    trial_ends_at: '',
    is_trial: false,
  });

  useEffect(() => {
    loadData();
  }, [currentPage, statusFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [subsRes, tenantsRes, productsRes] = await Promise.all([
        subscriptionService.listSubscriptions(null, statusFilter || undefined, true),
        tenantService.listTenants({ is_active: true, limit: 100 }),
        subscriptionService.listProducts(true),
      ]);
      
      setSubscriptions(subsRes?.items || subsRes || []);
      setTenants(tenantsRes?.items || []);
      setProducts(productsRes?.items || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error('Failed to load subscriptions');
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const all = subscriptions;
    const active = all.filter(s => s.status === 'active').length;
    const expired = all.filter(s => s.status === 'expired').length;
    const trial = all.filter(s => s.is_trial).length;
    return { total: all.length, active, expired, trial };
  }, [subscriptions]);

  const filteredSubscriptions = useMemo(() => {
    if (!searchQuery) return subscriptions;
    const q = searchQuery.toLowerCase();
    return subscriptions.filter(sub => 
      (sub.tenant_name || sub.tenant?.name || '')?.toLowerCase().includes(q) ||
      (sub.product_name || sub.product?.name || '')?.toLowerCase().includes(q) ||
      (sub.admin_email || sub.tenant?.contact_email || '')?.toLowerCase().includes(q) ||
      sub.status?.toLowerCase().includes(q)
    );
  }, [subscriptions, searchQuery]);

  const paginatedSubscriptions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredSubscriptions.slice(start, start + itemsPerPage);
  }, [filteredSubscriptions, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredSubscriptions.length / itemsPerPage);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        started_at: new Date(formData.started_at).toISOString(),
        expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : null,
        trial_ends_at: formData.is_trial && formData.trial_ends_at 
          ? new Date(formData.trial_ends_at).toISOString() 
          : null,
      };
      
      if (modalMode === 'create') {
        await subscriptionService.createSubscription(payload);
        toast.success('Subscription created successfully');
      } else {
        await subscriptionService.updateSubscription(selectedSubscription.id, payload);
        toast.success('Subscription updated successfully');
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      console.error('Failed to save subscription:', err);
      toast.error(err.response?.data?.detail || 'Failed to save subscription');
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('Are you sure you want to cancel this subscription?')) return;
    try {
      await subscriptionService.cancelSubscription(id);
      toast.success('Subscription cancelled successfully');
      loadData();
    } catch (err) {
      console.error('Failed to cancel subscription:', err);
      toast.error('Failed to cancel subscription');
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedSubscription(null);
    setFormData({
      tenant_id: '',
      product_id: '',
      started_at: new Date().toISOString().slice(0, 16),
      expires_at: '',
      billing_email: '',
      auto_renew: true,
      trial_ends_at: '',
      is_trial: false,
    });
    setShowModal(true);
  };

  const openEditModal = (sub) => {
    setModalMode('edit');
    setSelectedSubscription(sub);
    setFormData({
      tenant_id: sub.tenant_id || sub.hospital_id || '',
      product_id: sub.product_id || '',
      started_at: sub.started_at?.slice(0, 16) || '',
      expires_at: sub.expires_at?.slice(0, 16) || '',
      billing_email: sub.billing_email || '',
      auto_renew: sub.auto_renew ?? true,
      trial_ends_at: sub.trial_ends_at?.slice(0, 16) || '',
      is_trial: sub.is_trial || false,
    });
    setShowModal(true);
  };

  const getStatusBadge = (status, isTrial) => {
    if (isTrial) return 'bg-amber-100 text-amber-700 border border-amber-200';
    const styles = {
      active: 'bg-green-100 text-green-700 border border-green-200',
      expired: 'bg-red-100 text-red-700 border border-red-200',
      cancelled: 'bg-slate-100 text-slate-700 border border-slate-200',
      suspended: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
      trialing: 'bg-amber-100 text-amber-700 border border-amber-200',
    };
    return styles[status] || styles.cancelled;
  };

  const getTierBadge = (tier) => {
    const styles = {
      free: 'bg-slate-500',
      basic: 'bg-blue-500',
      professional: 'bg-purple-500',
      enterprise: 'bg-amber-500',
    };
    return styles[tier] || styles.free;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount, currencyCode = 'IDR') => {
    return new Intl.NumberFormat('id-ID', { 
      style: 'currency', 
      currency: currencyCode || 'IDR', 
      maximumFractionDigits: 0 
    }).format(amount || 0);
  };

  const getTenantName = (tenantId) => {
    const tenant = tenants.find(t => t.id === tenantId);
    return tenant?.name || tenantId;
  };

  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product?.name || product?.tier || '-';
  };

  const getProductPrice = (productId) => {
    const product = products.find(p => p.id === productId);
    return product?.price || 0;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Subscription Management</h1>
            <p className="text-slate-600 mt-1">Manage client subscriptions and billing</p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
          >
            <PlusIcon className="h-5 w-5" />
            New Subscription
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Subscriptions</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <CreditCardIcon className="h-6 w-6 text-blue-600" />
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
              <CheckCircleIcon className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Expired</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{stats.expired}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <XCircleIcon className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Trial Period</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{stats.trial}</p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <ChartBarIcon className="h-6 w-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search subscriptions..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
              <option value="suspended">Suspended</option>
            </select>
            <button
              onClick={loadData}
              className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-slate-300 bg-white"
              title="Refresh Data"
            >
              <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="text-sm text-slate-500">
            Showing {paginatedSubscriptions.length} of {filteredSubscriptions.length} subscriptions
          </div>
        </div>

        {/* Global Usage Summary */}
        <div className="px-6 py-6 bg-slate-50/30 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-8">
          <UsageProgress 
            label="Total Storage" 
            current={subscriptions.reduce((sum, s) => sum + (s.storage_used_gb || 0), 0)} 
            max={subscriptions.reduce((sum, s) => sum + (s.max_storage_gb || 1000), 0)} 
            unit="GB"
            color="200 80% 50%"
          />
          <UsageProgress 
            label="Active Users" 
            current={subscriptions.reduce((sum, s) => sum + (s.user_count || 0), 0)} 
            max={subscriptions.reduce((sum, s) => sum + (s.max_users || 500), 0)} 
            unit="Users"
            color="259 80% 50%"
          />
          <UsageProgress 
            label="API Traffic" 
            current={450000} 
            max={1000000} 
            unit="Req"
            color="160 80% 40%"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Tenant</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Billing</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Period</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-500 mt-2">Loading subscriptions...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedSubscriptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <CreditCardIcon className="h-12 w-12 text-slate-300" />
                      <p className="text-slate-500 mt-3 font-medium">No subscriptions found</p>
                      <p className="text-slate-400 text-sm">Create your first subscription to get started</p>
                      <button
                        onClick={openCreateModal}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Create Subscription
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedSubscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <BuildingOfficeIcon className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{sub.tenant_name || sub.tenant?.name || getTenantName(sub.tenant_id || sub.hospital_id)}</p>
                          <p className="text-xs text-slate-500">{sub.admin_email || sub.tenant?.contact_email || 'No admin email'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs text-white ${getTierBadge(sub.product_tier || sub.product?.tier)}`}>
                          {sub.product_name || sub.product?.name || sub.product_tier || sub.product?.tier || 'Unknown'}
                        </span>
                        <span className="text-sm text-slate-600">
                          {formatCurrency(sub.price || sub.product?.price || getProductPrice(sub.product_id), sub.currency || sub.product?.currency)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(sub.status, sub.is_trial)}`}>
                        {sub.is_trial ? 'Trial' : sub.status}
                      </span>
                      {sub.auto_renew && (
                        <span className="ml-2 text-xs text-slate-400">Auto-renew</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-600">{sub.billing_email || '-'}</p>
                      <p className="text-xs text-slate-400 capitalize">{sub.billing_cycle || 'monthly'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-600">{formatDate(sub.started_at)}</p>
                      <p className="text-xs text-slate-400">to {formatDate(sub.expires_at)}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditModal(sub)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <PencilSquareIcon className="h-5 w-5" />
                        </button>
                        {sub.status !== 'cancelled' && sub.status !== 'expired' && (
                          <button
                            onClick={() => handleCancel(sub.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Cancel"
                          >
                            <XMarkIcon className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">
                {modalMode === 'create' ? 'Create New Subscription' : 'Edit Subscription'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircleIcon className="h-7 w-7" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Tenant <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.tenant_id}
                    onChange={(e) => setFormData({ ...formData, tenant_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    required
                  >
                    <option value="">Select Tenant</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Product <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.product_id}
                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    required
                  >
                    <option value="">Select Product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} - {formatCurrency(p.price)}/{p.billing_cycle}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <input
                      type="checkbox"
                      id="is_trial"
                      checked={formData.is_trial}
                      onChange={(e) => setFormData({ ...formData, is_trial: e.target.checked })}
                      className="h-4 w-4 text-amber-600 rounded"
                    />
                    <label htmlFor="is_trial" className="text-sm font-medium text-amber-800">
                      This is a trial subscription
                    </label>
                  </div>
                </div>

                {formData.is_trial && (
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Trial End Date</label>
                    <input
                      type="datetime-local"
                      value={formData.trial_ends_at}
                      onChange={(e) => setFormData({ ...formData, trial_ends_at: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Start Date <span className="text-red-500">*</span></label>
                  <input
                    type="datetime-local"
                    value={formData.started_at}
                    onChange={(e) => setFormData({ ...formData, started_at: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Expiry Date</label>
                  <input
                    type="datetime-local"
                    value={formData.expires_at}
                    onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Billing Email</label>
                  <input
                    type="email"
                    value={formData.billing_email}
                    onChange={(e) => setFormData({ ...formData, billing_email: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="billing@company.com"
                  />
                </div>

                <div className="col-span-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="auto_renew"
                      checked={formData.auto_renew}
                      onChange={(e) => setFormData({ ...formData, auto_renew: e.target.checked })}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <label htmlFor="auto_renew" className="text-sm font-medium text-slate-700">
                      Enable auto-renewal
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t">
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
                  {modalMode === 'create' ? 'Create Subscription' : 'Update Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscriptions;
