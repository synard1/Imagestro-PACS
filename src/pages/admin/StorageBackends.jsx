import React, { useState, useEffect } from 'react';
import { 
  Database, HardDrive, Cloud, Settings, Plus, Trash2, CheckCircle2, 
  AlertCircle, BarChart3, Server, Activity, ArrowRightLeft, 
  DollarSign, TrendingUp, Info, ChevronDown, ChevronUp, Users, Search,
  Filter, ArrowUpDown, Network, Key, Globe, Building2, AlertTriangle
} from 'lucide-react';
import { storageConfigService } from '../../services/storageConfigService';
import { tenantService } from '../../services/tenantService';
import { useToast } from '../../components/ToastProvider';

const StorageBackends = () => {
  const [backends, setBackends] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBackend, setEditingBackend] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const { addToast } = useToast();

  // Connection types
  const CONNECTION_TYPES = [
    { value: 'cloud', label: 'Cloud Storage (S3/R2)', icon: Cloud },
    { value: 'local', label: 'Local Filesystem', icon: HardDrive },
    { value: 'remote', label: 'Remote/On-Premise', icon: Network },
  ];

  const [formData, setFormData] = useState({
    name: '',
    type: 'local',
    tenant_id: '',
    is_active: false,
    connection_type: 'cloud',
    access_endpoint: '',
    access_credential: {},
    config: { 
      base_path: '/var/lib/pacs/storage', 
      bucket_name: '', 
      access_key: '', 
      secret_key: '', 
      region: 'auto', 
      endpoint_url: '' 
    }
  });

  useEffect(() => { fetchData(); }, []);

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

  const handleOpenModal = (backend = null) => {
    if (backend) {
      setEditingBackend(backend);
      setFormData({
        name: backend.name,
        type: backend.type,
        tenant_id: backend.tenant_id || '',
        is_active: backend.is_active,
        connection_type: backend.connection_type || 'cloud',
        access_endpoint: backend.access_endpoint || '',
        access_credential: backend.access_credential || {},
        config: { ...formData.config, ...backend.config }
      });
    } else {
      setEditingBackend(null);
      setFormData({
        name: '',
        type: 'local',
        tenant_id: '',
        is_active: false,
        connection_type: 'cloud',
        access_endpoint: '',
        access_credential: {},
        config: { 
          base_path: '/var/lib/pacs/storage', 
          bucket_name: '', 
          access_key: '', 
          secret_key: '', 
          region: 'auto', 
          endpoint_url: '' 
        }
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingBackend) {
        await storageConfigService.updateBackend(editingBackend.id, formData);
        addToast('Backend updated successfully', 'success');
      } else {
        await storageConfigService.createBackend(formData);
        addToast('Backend created successfully', 'success');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      addToast(error.message || 'Operation failed', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this storage backend?')) return;
    try {
      await storageConfigService.deleteBackend(id);
      addToast('Backend deleted', 'success');
      fetchData();
    } catch (error) {
      addToast(error.message || 'Delete failed', 'error');
    }
  };

  const handleToggleActive = async (backend) => {
    try {
      await storageConfigService.updateBackend(backend.id, { is_active: !backend.is_active });
      addToast(`Backend ${backend.is_active ? 'deactivated' : 'activated'}`, 'success');
      fetchData();
    } catch (error) {
      addToast(error.message || 'Failed to toggle status', 'error');
    }
  };

  const handleTestConnection = async (backend) => {
    setTestingId(backend.id);
    setTestResult(null);
    try {
      const config = {
        type: backend.type,
        config: backend.config
      };
      const result = await storageConfigService.testConnection(config);
      setTestResult({ 
        success: result.success, 
        message: result.message 
      });
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: error.message 
      });
    } finally {
      setTestingId(null);
    }
  };

  const getConnectionTypeIcon = (type) => {
    const ct = CONNECTION_TYPES.find(c => c.value === type);
    return ct ? <ct.icon size={16} /> : <Globe size={16} />;
  };

  const getConnectionTypeLabel = (type) => {
    const ct = CONNECTION_TYPES.find(c => c.value === type);
    return ct ? ct.label : type;
  };

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
            <Database className="text-blue-600" /> Storage Backends
          </h1>
          <p className="text-gray-500 mt-1">Configure storage backends including local/on-premise</p>
        </div>
        <button 
          onClick={() => handleOpenModal()} 
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
        >
          <Plus size={18} /> Add Backend
        </button>
      </div>

      {/* Backend List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {backends.length === 0 ? (
          <div className="col-span-2 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
            <Server className="text-gray-300 mx-auto mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-600 mb-2">No Storage Backends</h3>
            <p className="text-gray-500 mb-4">Add a storage backend to get started</p>
            <button 
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add First Backend
            </button>
          </div>
        ) : backends.map(backend => {
          const tenant = tenants.find(t => t.id === backend.tenant_id);
          
          return (
            <div key={backend.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    backend.is_active ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    {backend.is_active ? (
                      <CheckCircle2 className="text-green-600" size={24} />
                    ) : (
                      <HardDrive className="text-gray-400" size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{backend.name}</h3>
                    <p className="text-sm text-gray-500">{backend.type} - {getConnectionTypeLabel(backend.connection_type)}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTestConnection(backend)}
                    disabled={testingId === backend.id}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Test Connection"
                  >
                    {testingId === backend.id ? (
                      <Activity className="animate-spin" size={18} />
                    ) : (
                      <BarChart3 size={18} />
                    )}
                  </button>
                  <button
                    onClick={() => handleOpenModal(backend)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Edit"
                  >
                    <Settings size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(backend.id)}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {/* Test Result */}
              {testResult && testingId === null && (
                <div className={`mb-4 p-3 rounded-lg ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="text-green-600" size={16} />
                    ) : (
                      <AlertTriangle className="text-red-600" size={16} />
                    )}
                    <span className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                      {testResult.message}
                    </span>
                  </div>
                </div>
              )}

              {/* Backend Details */}
              <div className="space-y-3">
                {backend.tenant_id && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 size={14} className="text-gray-400" />
                    <span className="text-gray-600">Tenant:</span>
                    <span className="text-gray-900">{tenant?.name || backend.tenant_id}</span>
                  </div>
                )}
                
                {backend.connection_type === 'remote' && backend.access_endpoint && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe size={14} className="text-gray-400" />
                    <span className="text-gray-600">Endpoint:</span>
                    <span className="text-gray-900 font-mono">{backend.access_endpoint}</span>
                  </div>
                )}

                {backend.type === 'local' && backend.config?.base_path && (
                  <div className="flex items-center gap-2 text-sm">
                    <HardDrive size={14} className="text-gray-400" />
                    <span className="text-gray-600">Path:</span>
                    <span className="text-gray-900 font-mono">{backend.config.base_path}</span>
                  </div>
                )}

                {backend.type === 's3' && backend.config?.bucket_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <Cloud size={14} className="text-gray-400" />
                    <span className="text-gray-600">Bucket:</span>
                    <span className="text-gray-900 font-mono">{backend.config.bucket_name}</span>
                  </div>
                )}
              </div>

              {/* Toggle Active */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={backend.is_active}
                    onChange={() => handleToggleActive(backend)}
                    className="sr-only"
                  />
                  <div className={`w-10 h-6 rounded-full transition-colors ${
                    backend.is_active ? 'bg-green-500' : 'bg-gray-300'
                  }`}>
                    <div className={`w-4 h-4 bg-white rounded-full mt-1 transition-transform ${
                      backend.is_active ? 'translate-x-5' : 'translate-x-1'
                    }`} />
                  </div>
                  <span className="text-sm text-gray-600">
                    {backend.is_active ? 'Active' : 'Inactive'}
                  </span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">
                {editingBackend ? 'Edit Backend' : 'Add Storage Backend'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="My Storage Backend"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Storage Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="local">Local Filesystem</option>
                    <option value="s3">S3 (AWS/Cloudflare R2)</option>
                    <option value="minio">MinIO</option>
                    <option value="contabo">Contabo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Connection Type</label>
                  <select
                    value={formData.connection_type}
                    onChange={(e) => setFormData({...formData, connection_type: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {CONNECTION_TYPES.map(ct => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant (Optional)</label>
                <select
                  value={formData.tenant_id}
                  onChange={(e) => setFormData({...formData, tenant_id: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">System Default (No Tenant)</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Type-specific config */}
              {formData.type === 'local' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base Path</label>
                  <input
                    type="text"
                    value={formData.config.base_path}
                    onChange={(e) => setFormData({
                      ...formData, 
                      config: {...formData.config, base_path: e.target.value}
                    })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="/var/lib/pacs/storage"
                  />
                </div>
              )}

              {formData.type !== 'local' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bucket Name</label>
                    <input
                      type="text"
                      value={formData.config.bucket_name}
                      onChange={(e) => setFormData({
                        ...formData, 
                        config: {...formData.config, bucket_name: e.target.value}
                      })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                    <input
                      type="text"
                      value={formData.config.region}
                      onChange={(e) => setFormData({
                        ...formData, 
                        config: {...formData.config, region: e.target.value}
                      })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="auto"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
                    <input
                      type="text"
                      value={formData.config.endpoint_url}
                      onChange={(e) => setFormData({
                        ...formData, 
                        config: {...formData.config, endpoint_url: e.target.value}
                      })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Access Key</label>
                      <input
                        type="text"
                        value={formData.config.access_key}
                        onChange={(e) => setFormData({
                          ...formData, 
                          config: {...formData.config, access_key: e.target.value}
                        })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
                      <input
                        type="password"
                        value={formData.config.secret_key}
                        onChange={(e) => setFormData({
                          ...formData, 
                          config: {...formData.config, secret_key: e.target.value}
                        })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Remote/local connection type */}
              {formData.connection_type === 'remote' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Access Endpoint (IP/Domain)</label>
                  <input
                    type="text"
                    value={formData.access_endpoint}
                    onChange={(e) => setFormData({...formData, access_endpoint: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="192.168.1.100 atau storage.example.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter IP address or domain for remote/on-premise storage access
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  className="rounded"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  Set as active backend
                </label>
              </div>

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
                  {editingBackend ? 'Update' : 'Create'} Backend
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorageBackends;