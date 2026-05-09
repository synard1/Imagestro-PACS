import React, { useState, useEffect } from 'react';
import { 
  Database, HardDrive, Cloud, Settings, Plus, Trash2, CheckCircle2, 
  AlertCircle, BarChart3, Server, Activity, ArrowRightLeft, 
  DollarSign, TrendingUp, Info, ChevronDown, ChevronUp, Users, Search,
  Filter, ArrowUpDown, Play, Pause, Clock, AlertTriangle, X, RefreshCw
} from 'lucide-react';
import { storageConfigService } from '../../services/storageConfigService';
import { tenantService } from '../../services/tenantService';
import { useToast } from '../../components/ToastProvider';

const StorageMigration = () => {
  const [backends, setBackends] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [migrations, setMigrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  // Migration form
  const [formData, setFormData] = useState({
    tenant_id: '',
    from_storage_id: '',
    to_storage_id: '',
    scope: 'tenant', // tenant, patient, study, date_range
    scope_filter: {}
  });

  // Filter states
  const [statusFilter, setStatusFilter] = useState('all');
  const [tenantFilter, setTenantFilter] = useState('all');

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (!loading) fetchMigrations(); }, [statusFilter, tenantFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [backendsRes, tenantsRes] = await Promise.all([
        storageConfigService.listBackends(),
        tenantService.listTenants({ limit: 500 })
      ]);
      setBackends(backendsRes || []);
      setTenants(tenantsRes?.items || []);
    } catch (error) {
      addToast(error.message || 'Failed to fetch data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchMigrations = async () => {
    try {
      const params = [];
      if (tenantFilter !== 'all') params.push(`tenant_id=${tenantFilter}`);
      if (statusFilter !== 'all') params.push(`status=${statusFilter}`);
      
      const url = `/api/storage-migrations${params.length ? '?' + params.join('&') : ''}`;
      const data = await storageConfigService.listMigrations();
      setMigrations(data || []);
    } catch (error) {
      console.error('Failed to fetch migrations:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await storageConfigService.createMigration(formData);
      addToast('Migration job created successfully', 'success');
      setIsModalOpen(false);
      setFormData({
        tenant_id: '',
        from_storage_id: '',
        to_storage_id: '',
        scope: 'tenant',
        scope_filter: {}
      });
      fetchMigrations();
    } catch (error) {
      addToast(error.message || 'Failed to create migration', 'error');
    }
  };

  const handleCancel = async (migrationId) => {
    if (!window.confirm('Are you sure you want to cancel this migration?')) return;
    try {
      await storageConfigService.cancelMigration(migrationId);
      addToast('Migration cancelled', 'success');
      fetchMigrations();
    } catch (error) {
      addToast(error.message || 'Failed to cancel migration', 'error');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getScopeLabel = (scope) => {
    switch (scope) {
      case 'tenant': return 'Full Tenant';
      case 'patient': return 'Per Patient';
      case 'study': return 'Per Study';
      case 'date_range': return 'By Date Range';
      default: return scope;
    }
  };

  const filteredMigrations = migrations.filter(m => {
    if (tenantFilter !== 'all' && m.tenant_id !== tenantFilter) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    return true;
  });

  if (loading) return (
    <div className="p-8 flex justify-center items-center h-full">
      <Activity className="animate-spin text-blue-600" size={32} />
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <ArrowRightLeft className="text-blue-600" /> Storage Migration
          </h1>
          <p className="text-gray-500 mt-1">Manage data migration between storage backends</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)} 
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
        >
          <Plus size={18} /> New Migration
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filters:</span>
        </div>
        
        <select 
          value={tenantFilter} 
          onChange={(e) => setTenantFilter(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm"
        >
          <option value="all">All Tenants</option>
          {tenants.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border rounded-lg text-sm"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <button 
          onClick={fetchMigrations}
          className="ml-auto p-2 hover:bg-gray-200 rounded-lg"
        >
          <RefreshCw size={18} className="text-gray-600" />
        </button>
      </div>

      {/* Migration List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tenant</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Scope</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">From → To</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Progress</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredMigrations.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                  No migrations found. Click "New Migration" to create one.
                </td>
              </tr>
            ) : filteredMigrations.map(m => {
              const fromBackend = backends.find(b => b.id === m.from_storage_id);
              const toBackend = backends.find(b => b.id === m.to_storage_id);
              const tenant = tenants.find(t => t.id === m.tenant_id);
              const progress = m.items_total > 0 ? Math.round((m.items_completed / m.items_total) * 100) : 0;
              
              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {tenant?.name || m.tenant_id}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                      {getScopeLabel(m.scope)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {fromBackend?.name || 'Unknown'} → {toBackend?.name || 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{progress}%</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {m.items_completed} / {m.items_total} items
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(m.status)}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.status === 'pending' || m.status === 'running' ? (
                      <button
                        onClick={() => handleCancel(m.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create Migration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">Create Storage Migration</h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
                <select
                  value={formData.tenant_id}
                  onChange={(e) => setFormData({...formData, tenant_id: e.target.value})}
                  required
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Select Tenant</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Storage</label>
                  <select
                    value={formData.from_storage_id}
                    onChange={(e) => setFormData({...formData, from_storage_id: e.target.value})}
                    required
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select Source</option>
                    {backends.map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Storage</label>
                  <select
                    value={formData.to_storage_id}
                    onChange={(e) => setFormData({...formData, to_storage_id: e.target.value})}
                    required
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select Target</option>
                    {backends.filter(b => b.id !== formData.from_storage_id).map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.type})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Migration Scope</label>
                <select
                  value={formData.scope}
                  onChange={(e) => setFormData({...formData, scope: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="tenant">Full Tenant (All Data)</option>
                  <option value="patient">Per Patient</option>
                  <option value="study">Per Study</option>
                  <option value="date_range">By Date Range</option>
                </select>
              </div>

              {formData.scope === 'date_range' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                    <input
                      type="date"
                      onChange={(e) => setFormData({
                        ...formData, 
                        scope_filter: {...formData.scope_filter, date_from: e.target.value}
                      })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                    <input
                      type="date"
                      onChange={(e) => setFormData({
                        ...formData, 
                        scope_filter: {...formData.scope_filter, date_to: e.target.value}
                      })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
              )}

              {formData.scope === 'patient' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Patient ID</label>
                  <input
                    type="text"
                    placeholder="Enter patient UUID"
                    onChange={(e) => setFormData({
                      ...formData, 
                      scope_filter: {...formData.scope_filter, patient_id: e.target.value}
                    })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              )}

              {formData.scope === 'study' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Study Instance UID</label>
                  <input
                    type="text"
                    placeholder="Enter study UID"
                    onChange={(e) => setFormData({
                      ...formData, 
                      scope_filter: {...formData.scope_filter, study_instance_uid: e.target.value}
                    })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Migration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorageMigration;