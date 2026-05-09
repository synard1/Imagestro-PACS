import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Database, HardDrive, Cloud, Settings, Plus, Trash2, CheckCircle2, 
  AlertCircle, BarChart3, Server, Activity, ArrowRightLeft, 
  DollarSign, TrendingUp, Info, ChevronDown, ChevronUp, Users, Search,
  Filter, ArrowUpDown, Network, Key, Globe, Building2, AlertTriangle,
  RefreshCw, Zap, Clock, Eye, EyeOff, Power, Star, StarOff, Shield,
  ArrowRight, ExternalLink, LineChart, Archive, Download
} from 'lucide-react';
import { storageConfigService } from '../../services/storageConfigService';
import { tenantService } from '../../services/tenantService';
import { useToast } from '../../components/ToastProvider';
import DataTable from '../../components/common/DataTable';

const StorageProvidersPage = () => {
  const [activeTab, setActiveTab] = useState('nodes'); // 'nodes' or 'tenants'
  const [backends, setBackends] = useState([]);
  const [stats, setStats] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [healthSummary, setHealthSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [editingBackend, setEditingBackend] = useState(null);
  const [selectedTenantForAssign, setSelectedTenantForAssign] = useState(null);
  const [selectedTenantAnalytics, setSelectedTenantAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [tenantAnalyticsData, setTenantAnalyticsData] = useState(null);
  const [tenantDlmData, setTenantDlmData] = useState(null);
  const [expandedBackends, setExpandedBackends] = useState({});
  const [checkingHealthId, setCheckingHealthId] = useState(null);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  const toast = useToast();
  const notify = useCallback((type, msg, det = '') => {
    try {
      if (toast && typeof toast[type] === 'function') {
        toast[type](msg, det);
      } else if (toast && toast.notify) {
        toast.notify({ type, message: msg, detail: det });
      }
    } catch (e) {
      console.warn(`[Toast Fallback] ${type}: ${msg}`);
    }
  }, [toast]);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });

  const [formData, setFormData] = useState({
    name: '',
    type: 'local',
    tenant_id: '',
    is_active: true,
    is_default: false,
    connection_type: 'local',
    access_endpoint: '',
    base_path: '/var/lib/pacs/storage',   // for local
    bucket_name: '',
    access_key: '',
    secret_key: '',
    region: 'us-east-1',
    endpoint_url: '',
    use_ssl: true,
    auto_create_bucket: false
  });

  // Update connection_type when type changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      connection_type: prev.type === 'local' ? 'local' : 'cloud'
    }));
  }, [formData.type]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [b, s, t_res, h] = await Promise.all([
        storageConfigService.listBackends(),
        storageConfigService.getUsageStats(),
        tenantService.listTenants({ limit: 500 }),
        storageConfigService.getHealthSummary()
      ]);
      setBackends(b || []);
      setStats(s || []);
      setTenants(t_res?.items || []);
      
      const hMap = {};
      if (Array.isArray(h)) {
        h.forEach(x => { if (x.backend_id) hMap[x.backend_id.toString().toLowerCase()] = x; });
      }
      setHealthSummary(hMap);
    } catch (err) {
      notify('error', 'Sync Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleOpenModal = (backend = null) => {
    if (backend) {
      setEditingBackend(backend);
      const config = backend.config || {};
      setFormData({
        name: backend.name || '',
        type: backend.type || 'local',
        tenant_id: backend.tenant_id || '',
        is_active: backend.is_active || false,
        is_default: backend.is_default || false,
        connection_type: backend.connection_type || (backend.type === 'local' ? 'local' : 'cloud'),
        access_endpoint: backend.access_endpoint || '',
        base_path: config.base_path || '/var/lib/pacs/storage',
        bucket_name: config.bucket_name || '',
        access_key: config.access_key || '',
        secret_key: config.secret_key || '',
        region: config.region || 'us-east-1',
        endpoint_url: config.endpoint_url || '',
        use_ssl: config.use_ssl !== undefined ? config.use_ssl : true,
        auto_create_bucket: !!config.auto_create_bucket
      });
    } else {
      setEditingBackend(null);
      setFormData({
        name: '', type: 'local', tenant_id: '', is_active: true, is_default: false,
        connection_type: 'local', access_endpoint: '',
        base_path: '/var/lib/pacs/storage',
        bucket_name: '', access_key: '', secret_key: '',
        region: 'us-east-1', endpoint_url: '', use_ssl: true, auto_create_bucket: false
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenAssignModal = (tenant) => {
    setSelectedTenantForAssign(tenant);
    setIsAssignModalOpen(true);
  };

  const handleOpenAnalyticsModal = async (tenant) => {
    setSelectedTenantAnalytics(tenant);
    setIsAnalyticsModalOpen(true);
    setAnalyticsLoading(true);
    try {
      const analyticsData = await tenantService.getTenantAnalytics(tenant.id);
      setTenantAnalyticsData(analyticsData);
      
      try {
         const dlmData = await tenantService.getTenantDlmInsights(tenant.id);
         setTenantDlmData(dlmData);
      } catch (dlmErr) {
         console.warn("DLM Insights not available yet:", dlmErr);
         setTenantDlmData(null);
      }
    } catch (err) {
      notify('error', 'Analytics Failed', err.message);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const toggleActive = async (backend) => {
    try {
      const newStatus = !backend.is_active;
      await storageConfigService.updateBackend(backend.id, { is_active: newStatus });
      notify('success', `Status Updated`, `${backend.name} is now ${newStatus ? 'ACTIVE' : 'INACTIVE'}`);
      fetchData();
    } catch (err) {
      notify('error', 'Update Failed', err.message);
    }
  };

  const setAsDefault = async (backend) => {
    if (backend.tenant_id) {
       notify('warning', 'Action Prohibited', 'Override nodes cannot be set as system default.');
       return;
    }
    try {
      await storageConfigService.updateBackend(backend.id, { is_default: true, is_active: true });
      notify('success', 'Default Authority Updated', `${backend.name} is now the primary storage.`);
      fetchData();
    } catch (err) {
      notify('error', 'Update Failed', err.message);
    }
  };

  const handleTriggerHealthCheck = async (backendId) => {
    if (!backendId) return;
    const bid = backendId.toString().toLowerCase();
    setCheckingHealthId(backendId);
    try {
      const res = await storageConfigService.triggerHealthCheck(backendId);
      setHealthSummary(prev => ({
        ...prev,
        [bid]: {
          current_status: res.status,
          latency_ms: res.latency_ms,
          last_check: res.last_check,
          success_rate_24h: 100
        }
      }));
      notify(res.status === 'healthy' ? 'success' : 'warning', `Ping Response`, `Latency: ${res.latency_ms}ms`);
    } catch (err) {
      notify('error', 'Check Failed', err.message);
    } finally {
      setCheckingHealthId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Terminate this node? Data access will be lost if not migrated.')) return;
    try {
      await storageConfigService.deleteBackend(id);
      notify('success', 'Provider Terminated');
      fetchData();
    } catch (err) {
      notify('error', 'Action Failed', err.message);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    try {
      // Build payload for API: flatten for local, nest S3 fields under config
      const payload = {
        ...formData,
        // Remove flattened S3/local fields that don't belong at top level
        bucket_name: undefined,
        access_key: undefined,
        secret_key: undefined,
        region: undefined,
        endpoint_url: undefined,
        use_ssl: undefined,
        auto_create_bucket: undefined,
        base_path: undefined
      };
      // Add config object based on type
      if (formData.type === 'local') {
        payload.config = { base_path: formData.base_path };
      } else {
        // s3, minio, contabo, wasabi all use same S3-compatible config shape
        payload.config = {
          bucket_name: formData.bucket_name,
          access_key: formData.access_key,
          secret_key: formData.secret_key,
          region: formData.region,
          endpoint_url: formData.endpoint_url,
          use_ssl: formData.use_ssl,
          auto_create_bucket: formData.auto_create_bucket
        };
      }
      // Remove connection_type from payload? The backend may expect it; keep it as is.
      if (editingBackend) {
        await storageConfigService.updateBackend(editingBackend.id, payload);
        notify('success', 'Config Refined');
      } else {
        await storageConfigService.createBackend(payload);
        notify('success', 'Node Provisioned');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      notify('error', 'Commit Failed', err.message);
    }
  };

  const handleAssignStorage = async (backendId, tenantId) => {
    try {
      // If backendId is 'default', it means remove override
      if (backendId === 'default') {
        const overrides = backends.filter(b => b.tenant_id?.toString().toLowerCase() === tenantId?.toString().toLowerCase());
        await Promise.all(overrides.map(b => storageConfigService.deleteBackend(b.id)));
        notify('success', 'Storage Reverted', 'Tenant is now using System Default storage.');
      } else {
        const sourceBackend = backends.find(b => b.id === backendId);
        if (!sourceBackend) throw new Error('Source backend not found');
        
        // Deactivate existing overrides first
        const existingOverrides = backends.filter(b => b.tenant_id?.toString().toLowerCase() === tenantId?.toString().toLowerCase());
        await Promise.all(existingOverrides.map(b => storageConfigService.updateBackend(b.id, { is_active: false })));

        // Create new override based on source backend
        const newBackendData = {
          name: `${sourceBackend.name} (${tenantId})`,
          type: sourceBackend.type,
          tenant_id: tenantId,
          is_active: true,
          is_default: false,
          connection_type: sourceBackend.connection_type,
          access_endpoint: sourceBackend.access_endpoint,
          config: { ...sourceBackend.config }
        };
        await storageConfigService.createBackend(newBackendData);
        notify('success', 'Storage Assigned', `Tenant is now using ${sourceBackend.name}.`);
      }
      setIsAssignModalOpen(false);
      fetchData();
    } catch (err) {
      notify('error', 'Assignment Failed', err.message);
    }
  };

  const processedBackends = useMemo(() => {
    const activeByTenant = backends.reduce((acc, b) => {
      if (b.is_active && b.tenant_id) acc[b.tenant_id.toString().toLowerCase()] = b;
      return acc;
    }, {});
    const sysDefault = backends.find(b => b.is_default && !b.tenant_id);

    return backends.map(b => {
      const bid = b.id?.toString().toLowerCase();
      const relevantStats = stats.filter(s => {
        const tid = s.tenant_id?.toString().toLowerCase();
        const mapped = activeByTenant[tid] || sysDefault;
        return mapped && mapped.id?.toString().toLowerCase() === bid;
      });
      const agg = relevantStats.reduce((acc, c) => {
        acc.total_gb += parseFloat(c.total_gb || 0);
        acc.study_count += parseInt(c.study_count || 0);
        acc.est_cost += parseFloat(c.estimated_cost_usd || 0);
        return acc;
      }, { total_gb: 0, study_count: 0, est_cost: 0 });
      return { ...b, agg };
    });
  }, [backends, stats]);

  const filteredAndSorted = useMemo(() => {
    return processedBackends
      .filter(b => {
        const match = (b.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                      (b.type || '').toLowerCase().includes(searchTerm.toLowerCase());
        if (!match) return false;
        if (activeFilter === 'active') return b.is_active;
        if (activeFilter === 'default') return b.is_default;
        return true;
      })
      .sort((a, b) => {
        let vA = (a.name || '').toLowerCase(), vB = (b.name || '').toLowerCase();
        if (sortConfig.key === 'usage') { vA = a.agg.total_gb; vB = b.agg.total_gb; }
        if (vA < vB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (vA > vB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
  }, [processedBackends, searchTerm, activeFilter, sortConfig]);

  const tenantColumns = [
    {
      key: 'name',
      label: 'Tenant',
      sortable: true,
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold text-xs">
            {val?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-black text-gray-900 text-xs">{val}</div>
            <div className="text-[10px] text-gray-400 font-mono uppercase">{row.code}</div>
          </div>
        </div>
      )
    },
    {
      key: 'storage',
      label: 'Active Storage',
      render: (_, row) => {
        const tid = row.id?.toString().toLowerCase();
        const override = backends.find(b => b.tenant_id?.toString().toLowerCase() === tid && b.is_active);
        const sysDefault = backends.find(b => b.is_default && !b.tenant_id);
        const active = override || sysDefault;

        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                override ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-blue-50 text-blue-700 border-blue-100'
              }`}>
                {override ? 'Override' : 'System Default'}
              </span>
              <span className="text-[10px] font-bold text-gray-700">{active?.name || 'None'}</span>
            </div>
            {active && (
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                {active.type === 'local' ? <HardDrive size={12} /> : <Cloud size={12} />}
                <span>{active.type === 'local' ? active.config?.base_path : 'S3 Bucket'}</span>
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'usage_gb',
      label: 'Data Volume',
      sortable: true,
      render: (_, row) => {
        const tid = row.id?.toString().toLowerCase();
        const tenantStats = stats.find(s => s.tenant_id?.toString().toLowerCase() === tid);
        const usedGb = tenantStats?.total_gb || 0;
        const limitGb = tenantStats?.storage_limit_gb || 100; // Default logic or fetched value
        const percent = Math.min(100, Math.max(0, (usedGb / limitGb) * 100));
        let colorClass = 'bg-green-500';
        if (percent > 85) colorClass = 'bg-red-500';
        else if (percent > 70) colorClass = 'bg-amber-500';

        return (
          <div className="flex flex-col gap-1 w-full max-w-[150px]">
            <div className="flex justify-between items-center">
              <span className="font-black text-gray-900 text-[11px]">{usedGb.toFixed(2)} GB</span>
              <span className="text-[9px] text-gray-400 font-bold uppercase">{tenantStats?.study_count || 0} Studies</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${colorClass} transition-all duration-500`} style={{ width: `${percent}%` }}></div>
            </div>
            <span className="text-[8px] font-black text-gray-400 uppercase text-right leading-none">{percent.toFixed(1)}% of {limitGb}GB</span>
          </div>
        );
      }
    },
    {
      key: 'status',
      label: 'Status',
      render: (val, row) => (
        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${
          row.is_active ? 'bg-green-100 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-400'
        }`}>
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleOpenAssignModal(row)}
            className="flex items-center gap-1.5 bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 transition-all font-black text-[9px] uppercase tracking-wider shadow-sm active:scale-95"
          >
            <ArrowRightLeft size={12} /> Assign
          </button>
          <button 
            onClick={() => handleOpenAnalyticsModal(row)}
            className="flex items-center gap-1.5 bg-white text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-all font-black text-[9px] uppercase tracking-wider shadow-sm active:scale-95"
          >
            <BarChart3 size={12} /> Analytics
          </button>
        </div>
      )
    }
  ];

  if (loading) return (
    <div className="p-8 flex flex-col justify-center items-center h-full">
      <RefreshCw className="animate-spin text-blue-600 mb-4" size={48} />
      <p className="text-gray-500 font-black text-[10px] uppercase tracking-[0.4em] animate-pulse">Synchronizing Data Fabric...</p>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tighter">
            <Database className="text-blue-600" size={32} /> STORAGE MANAGEMENT
          </h1>
          <p className="text-gray-500 mt-1 font-bold text-xs uppercase tracking-wider">Multi-Active Nodes & Tenant Isolation Control.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="p-2.5 text-gray-400 hover:text-blue-600 bg-white border border-gray-200 rounded-xl transition-all shadow-sm active:scale-95">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => handleOpenModal()} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 font-black text-xs uppercase tracking-widest active:scale-95">
            <Plus size={20} /> Add Node
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 mb-8 bg-gray-100 p-1.5 rounded-[1.25rem] w-fit border border-gray-200">
        <button 
          onClick={() => setActiveTab('nodes')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
            activeTab === 'nodes' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Database size={16} /> Storage Nodes
        </button>
        <button 
          onClick={() => setActiveTab('tenants')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
            activeTab === 'tenants' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Users size={16} /> Tenant Assignments
        </button>
      </div>

      {activeTab === 'nodes' ? (
        <>
          {/* Toolbar */}
          <div className="mb-8 p-4 bg-white border border-gray-200 rounded-2xl flex flex-col lg:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl border border-gray-200">
                {['all', 'active', 'default'].map(f => (
                  <button 
                    key={f} onClick={() => setActiveFilter(f)} 
                    className={`px-5 py-1.5 text-[10px] font-black rounded-lg transition-all uppercase tracking-tighter ${activeFilter === f ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" placeholder="Search cluster..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                />
              </div>
            </div>
            <button onClick={() => setSortConfig({ key: 'name', direction: sortConfig.direction === 'ascending' ? 'descending' : 'ascending'})} className="flex items-center gap-1.5 font-black text-[10px] uppercase text-gray-500 hover:text-blue-600">
              Sort by Name {sortConfig.key === 'name' ? (sortConfig.direction === 'ascending' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ArrowUpDown size={14} />}
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {filteredAndSorted.map((b) => {
              const bid = b.id?.toString().toLowerCase();
              const h = healthSummary[bid];
              const expanded = expandedBackends[bid];
              
              return (
                <div key={bid} className={`group bg-white rounded-[2rem] border-2 transition-all duration-500 flex flex-col overflow-hidden ${b.is_default ? 'border-blue-500 shadow-2xl shadow-blue-100' : 'border-gray-100 shadow-sm hover:shadow-xl'}`}>
                  <div className="p-6 border-b border-gray-100 flex items-start justify-between bg-white relative">
                    {b.is_default && (
                      <div className="absolute left-1/2 -translate-x-1/2 -top-1 px-4 py-1 bg-blue-600 text-white text-[9px] font-black uppercase tracking-[0.2em] rounded-b-xl shadow-lg z-10">
                        System Default
                      </div>
                    )}

                    <div className="flex items-center gap-5">
                      <div className={`p-4 rounded-[1.5rem] transition-all duration-500 ${b.is_active ? (b.is_default ? 'bg-blue-600 text-white' : 'bg-green-50 text-green-600') : 'bg-gray-100 text-gray-400'}`}>
                        {b.type === 'local' ? <HardDrive size={28} /> : <Cloud size={28} />}
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-gray-900 leading-none mb-2">{b.name}</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black uppercase bg-gray-100 px-2 py-0.5 rounded-md text-gray-500 tracking-wider border border-gray-200">{b.type}</span>
                          {b.tenant_id ? (
                            <span className="text-[9px] font-black uppercase bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md tracking-wider border border-amber-100 flex items-center gap-1">
                              <Shield size={10} /> Override Node
                            </span>
                          ) : (
                            <span className="text-[9px] font-black uppercase bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md tracking-wider border border-blue-100">System Node</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!b.tenant_id && (
                        <button 
                          onClick={() => setAsDefault(b)} 
                          className={`p-2.5 rounded-xl transition-all active:scale-90 ${b.is_default ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'}`}
                          title="Set as System Default"
                        >
                          <Star size={20} fill={b.is_default ? 'currentColor' : 'none'} />
                        </button>
                      )}
                      <button onClick={() => handleOpenModal(b)} className="p-2.5 text-gray-400 hover:text-blue-600 bg-gray-50 rounded-xl transition-all"><Settings size={20} /></button>
                    </div>
                  </div>

                  {/* Health Bar */}
                  <div className={`px-6 py-3 border-b border-gray-50 flex items-center justify-between bg-gray-50/40`}>
                    <div className="flex items-center gap-4">
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border shadow-sm flex items-center gap-2 ${
                        h?.current_status === 'healthy' ? 'bg-green-100 border-green-200 text-green-700' : 'bg-red-100 border-red-200 text-red-700'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${h?.current_status === 'healthy' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        {h?.current_status || 'Checking...'}
                      </div>
                      {h?.latency_ms !== undefined && h?.latency_ms !== null && (
                        <div className="flex items-center gap-1.5 text-xs font-black text-gray-500">
                          <Activity size={14} className="text-blue-500" /> {h.latency_ms}ms
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleTriggerHealthCheck(b.id)} disabled={checkingHealthId === b.id} className="text-[10px] font-black uppercase text-gray-400 hover:text-green-600 flex items-center gap-1.5 transition-colors">
                      {checkingHealthId === b.id ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />} Force Ping
                    </button>
                  </div>

                  {/* HIGH PRECISION USAGE DISPLAY */}
                  <div className="p-6 grid grid-cols-3 gap-6 bg-white">
                    <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 group-hover:bg-blue-50/20 transition-colors">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Capacity Used</p>
                      <p className="text-2xl font-black text-blue-600 tabular-nums">
                        {(b.agg?.total_gb || 0).toFixed(2)}<span className="text-[10px] ml-0.5 opacity-60">GB</span>
                      </p>
                    </div>
                    <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Study Index</p>
                      <p className="text-2xl font-black text-gray-800 tabular-nums">{b.agg?.study_count || 0}</p>
                    </div>
                    <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">M-Cost (Est)</p>
                      <p className="text-2xl font-black text-amber-600 tabular-nums">${(b.agg?.est_cost || 0).toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="px-6 py-5 mt-auto border-t border-gray-100 flex items-center justify-between bg-gray-50/30">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleActive(b)} className={`w-12 h-7 rounded-full transition-all duration-300 relative ${b.is_active ? 'bg-green-500 shadow-lg shadow-green-200' : 'bg-gray-300'}`}>
                            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all duration-300 ${b.is_active ? 'left-6' : 'left-1'} flex items-center justify-center`}>
                              <Power size={10} className={b.is_active ? 'text-green-600' : 'text-gray-400'} />
                            </div>
                        </button>
                        <span className="text-[10px] font-black uppercase text-gray-700">Active Node</span>
                      </div>
                      <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
                        <Building2 size={16} className="text-gray-400" />
                        <span className="text-[10px] font-black text-gray-600 truncate max-w-[120px]">
                          {b.tenant_id ? (tenants.find(t => t.id?.toString().toLowerCase() === b.tenant_id?.toString().toLowerCase())?.name || 'Loading...') : 'System Shared'}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setExpandedBackends(prev => ({ ...prev, [bid]: !prev[bid] }))} className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-800 flex items-center gap-1.5 px-4 py-2 bg-white rounded-xl border border-gray-200 shadow-sm active:scale-95 transition-all">
                      {expanded ? 'Hide JSON' : 'Inspect Payload'}
                    </button>
                  </div>

                  {expanded && (
                    <div className="px-6 pb-6 animate-in slide-in-from-top-3 duration-300">
                      <div className="p-5 bg-gray-900 rounded-[1.5rem] shadow-inner border border-gray-800 relative">
                        <button onClick={() => handleDelete(b.id)} className="absolute right-4 top-4 text-red-500 hover:text-red-400 transition-colors p-2 bg-red-500/10 rounded-lg"><Trash2 size={16} /></button>
                        <pre className="text-[11px] text-blue-400 font-mono overflow-auto max-h-48 leading-relaxed custom-scrollbar">
                          {JSON.stringify(b.config, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="bg-white border border-gray-200 rounded-[2rem] overflow-hidden shadow-sm">
          <div className="p-8 border-b border-gray-100 bg-gray-50/30 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Tenant Storage Assignments</h2>
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1">Configure isolation levels and storage nodes per tenant.</p>
            </div>
          </div>
          <div className="p-4">
            <DataTable 
              columns={tenantColumns}
              fetchData={async (params) => {
                const res = await tenantService.listTenants(params);
                // Inject usage_gb for local sorting capability and data prep
                const items = res.items.map(t => {
                   const tenantStats = stats.find(s => s.tenant_id?.toString().toLowerCase() === t.id?.toString().toLowerCase());
                   return { ...t, usage_gb: tenantStats?.total_gb || 0 };
                });
                return { ...res, items };
              }}
              searchPlaceholder="Filter tenants..."
              className="border-none"
            />
          </div>
        </div>
      )}

      {/* Analytics Modal */}
      {isAnalyticsModalOpen && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-400 border border-white/20">
            <div className="p-8 border-b border-gray-100 flex items-start justify-between bg-gray-50/50">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                    <BarChart3 size={24} />
                  </div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Storage Analytics</h2>
                </div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">
                  Tenant: <span className="text-blue-600">{selectedTenantAnalytics?.name}</span> ({selectedTenantAnalytics?.code})
                </p>
              </div>
              <button onClick={() => setIsAnalyticsModalOpen(false)} className="p-3 text-gray-400 hover:text-red-600 bg-white rounded-2xl active:scale-90 border border-gray-100 shadow-sm"><Plus size={24} className="rotate-45" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 bg-gray-50/30">
              {analyticsLoading ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <RefreshCw size={32} className="animate-spin text-blue-600 mb-4" />
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em] animate-pulse">Compiling Analytics Data...</p>
                </div>
              ) : tenantAnalyticsData ? (
                <div className="space-y-8">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Peak Storage (30d)</p>
                      <p className="text-2xl font-black text-gray-900 tabular-nums">
                        {(tenantAnalyticsData.peak_storage_bytes / (1024 ** 3)).toFixed(2)}<span className="text-[10px] ml-1 text-gray-400">GB</span>
                      </p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Total API Calls</p>
                      <p className="text-2xl font-black text-gray-900 tabular-nums">{tenantAnalyticsData.total_api_calls.toLocaleString()}</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Avg Active Users</p>
                      <p className="text-2xl font-black text-gray-900 tabular-nums">{tenantAnalyticsData.avg_active_users}</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">PoP Change</p>
                      <p className={`text-2xl font-black tabular-nums flex items-center gap-1 ${tenantAnalyticsData.period_over_period_change > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                        {tenantAnalyticsData.period_over_period_change > 0 ? '+' : ''}{tenantAnalyticsData.period_over_period_change}%
                        <TrendingUp size={16} className={tenantAnalyticsData.period_over_period_change > 0 ? '' : 'rotate-180'} />
                      </p>
                    </div>
                  </div>

                  {/* DLM Tier Visualization */}
                  {tenantDlmData && (
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                           <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                              <Archive size={16} className="text-purple-600" /> Data Lifecycle Tiers
                           </h3>
                           <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Based on {tenantDlmData.total_studies} total indexed studies</p>
                        </div>
                      </div>
                      <div className="h-4 w-full flex rounded-full overflow-hidden mb-6 bg-gray-100">
                         <div className="bg-red-500 transition-all" style={{width: `${tenantDlmData.hot_percent}%`}}></div>
                         <div className="bg-amber-400 transition-all" style={{width: `${tenantDlmData.warm_percent}%`}}></div>
                         <div className="bg-blue-400 transition-all" style={{width: `${tenantDlmData.cold_percent}%`}}></div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                         <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
                            <div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"></div>
                            <div>
                               <p className="text-[10px] font-black text-red-900 uppercase">Hot Data (&lt;30d)</p>
                               <p className="text-lg font-black text-red-700">{tenantDlmData.hot_percent}%</p>
                            </div>
                         </div>
                         <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                            <div className="w-3 h-3 bg-amber-400 rounded-full flex-shrink-0"></div>
                            <div>
                               <p className="text-[10px] font-black text-amber-900 uppercase">Warm Data (1-6m)</p>
                               <p className="text-lg font-black text-amber-700">{tenantDlmData.warm_percent}%</p>
                            </div>
                         </div>
                         <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                            <div className="w-3 h-3 bg-blue-400 rounded-full flex-shrink-0"></div>
                            <div>
                               <p className="text-[10px] font-black text-blue-900 uppercase">Cold Data (&gt;6m)</p>
                               <p className="text-lg font-black text-blue-700">{tenantDlmData.cold_percent}%</p>
                            </div>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* Recommendation Engine */}
                  <div className="bg-gradient-to-br from-blue-900 to-gray-900 p-6 rounded-3xl shadow-xl text-white relative overflow-hidden flex flex-col md:flex-row gap-6 items-center justify-between">
                     <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none"><Database size={120} /></div>
                     <div className="relative z-10 flex-1">
                       <h3 className="text-xs font-black uppercase tracking-widest text-blue-300 mb-4 flex items-center gap-2">
                         <Zap size={16} /> DLM Insight & Recommendation
                       </h3>
                       <p className="text-sm font-medium leading-relaxed text-gray-200">
                         {tenantDlmData?.recommendation || "Storage growth is stable and within predictable thresholds."}
                       </p>
                     </div>
                     {tenantDlmData && tenantDlmData.cold_count > 0 && (
                        <button className="relative z-10 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg active:scale-95 whitespace-nowrap flex items-center gap-2">
                           <Download size={14} /> Archive {tenantDlmData.stale_gb} GB
                        </button>
                     )}
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 font-bold">Failed to load analytics data.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Node Add/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-400 border border-white/20">
            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">{editingBackend ? 'Refine Config' : 'Deploy Backend'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-3 text-gray-400 hover:text-red-600 bg-white rounded-2xl active:scale-90"><Plus size={32} className="rotate-45" /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                 <div className={`p-5 rounded-[1.5rem] border-2 transition-all ${formData.is_active ? 'bg-green-50/50 border-green-100' : 'bg-gray-50 border-gray-100'} flex items-center justify-between`}>
                    <span className="text-xs font-black uppercase text-gray-900">Active</span>
                    <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="w-6 h-6 accent-green-500 cursor-pointer" />
                 </div>
                 {!formData.tenant_id && (
                   <div className={`p-5 rounded-[1.5rem] border-2 transition-all ${formData.is_default ? 'bg-blue-50/50 border-blue-100' : 'bg-gray-50 border-gray-100'} flex items-center justify-between`}>
                      <span className="text-xs font-black uppercase text-gray-900">System Default</span>
                      <input type="checkbox" checked={formData.is_default} onChange={e => setFormData({...formData, is_default: e.target.checked})} className="w-6 h-6 accent-blue-500 cursor-pointer" />
                   </div>
                 )}
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest pl-2">Node Alias</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required className="w-full px-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-gray-800 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest pl-2">Storage Type</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-gray-800 outline-none appearance-none cursor-pointer">
                    <option value="local">Local Filesystem</option>
                    <option value="s3">S3 / R2 Cloud</option>
                    <option value="minio">MinIO</option>
                    <option value="contabo">Contabo Object Storage</option>
                    <option value="wasabi">Wasabi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest pl-2">Tenancy</label>
                  <select value={formData.tenant_id} onChange={e => setFormData({...formData, tenant_id: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-gray-800 outline-none appearance-none cursor-pointer">
                    <option value="">System Default Authority</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>
              {formData.type === 's3' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest pl-2">Bucket Name</label>
                    <input
                      type="text"
                      value={formData.bucket_name}
                      onChange={e => setFormData({...formData, bucket_name: e.target.value})}
                      placeholder="e.g., my-dicom-bucket"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-gray-800 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest pl-2">Access Key</label>
                      <input
                        type="text"
                        value={formData.access_key}
                        onChange={e => setFormData({...formData, access_key: e.target.value})}
                        placeholder="AWS_ACCESS_KEY_ID or minio admin user"
                        className="w-full px-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-gray-800 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest pl-2">Secret Key</label>
                      <div className="relative">
                        <input
                          type={showSecretKey ? 'text' : 'password'}
                          value={formData.secret_key}
                          onChange={e => setFormData({...formData, secret_key: e.target.value})}
                          placeholder="••••••••"
                          className="w-full px-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-gray-800 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner"
                        />
                        <button
                          onClick={() => setShowSecretKey(!showSecretKey)}
                          className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 ${showSecretKey ? 'text-blue-500' : 'text-gray-400'} hover:text-blue-600`}
                          size={16}
                        >
                          {showSecretKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest pl-2">Region</label>
                      <select
                        value={formData.region}
                        onChange={e => setFormData({...formData, region: e.target.value})}
                        className="w-full px-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-gray-800 outline-none appearance-none cursor-pointer"
                      >
                        <option value="us-east-1">US East (N. Virginia)</option>
                        <option value="us-east-2">US East (Ohio)</option>
                        <option value="us-west-1">US West (N. California)</option>
                        <option value="us-west-2">US West (Oregon)</option>
                        <option value="eu-west-1">Europe (Ireland)</option>
                        <option value="eu-central-1">Europe (Frankfurt)</option>
                        <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                        <option value="ap-southeast-2">Asia Pacific (Sydney)</option>
                        <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                        <option value="sa-east-1">South America (São Paulo)</option>
                        <option value="custom">Custom / Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest pl-2">Endpoint URL</label>
                      <input
                        type="text"
                        value={formData.endpoint_url}
                        onChange={e => setFormData({...formData, endpoint_url: e.target.value})}
                        placeholder="Leave empty for AWS S3, or https://minio.example.com:9000"
                        className="w-full px-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-gray-800 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest pl-2">Use SSL</label>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.use_ssl}
                          onChange={e => setFormData({...formData, use_ssl: e.target.checked})}
                          className="w-6 h-6 accent-blue-500 cursor-pointer"
                        />
                        <span className="ml-2 text-[10px] font-black text-gray-700">Enable HTTPS/TLS</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest pl-2">Auto-Create Bucket</label>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.auto_create_bucket}
                          onChange={e => setFormData({...formData, auto_create_bucket: e.target.checked})}
                          className="w-6 h-6 accent-blue-500 cursor-pointer"
                        />
                        <span className="ml-2 text-[10px] font-black text-gray-700">Create bucket if missing on first upload</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={async () => {
                        setTestingConnection(true);
                        try {
                          const testPayload = {
                            name: formData.name || 'test-connection',
                            type: 's3',
                            tenant_id: formData.tenant_id || '',
                            is_active: false,
                            is_default: false,
                            connection_type: 'cloud',
                            access_endpoint: '',
                            config: {
                              bucket_name: formData.bucket_name,
                              access_key: formData.access_key,
                              secret_key: formData.secret_key,
                              region: formData.region,
                              endpoint_url: formData.endpoint_url,
                              use_ssl: formData.use_ssl,
                              auto_create_bucket: formData.auto_create_bucket
                            }
                          };
                          await storageConfigService.createBackend(testPayload);
                          // Immediately delete the test backend
                          // (we need its ID; listBackends is simplest)
                          const backends = await storageConfigService.listBackends();
                          const testBackend = backends.find(b => b.name === testPayload.name && b.tenant_id === (formData.tenant_id || ''));
                          if (testBackend) {
                            await storageConfigService.deleteBackend(testBackend.id);
                          }
                          notify('success', 'Connection Test', 'Successfully connected to S3-compatible storage');
                        } catch (err) {
                          notify('error', 'Connection Test Failed', err.message);
                        } finally {
                          setTestingConnection(false);
                        }
                      }}
                      disabled={testingConnection}
                      className={`flex-1 py-3 px-6 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${
                        testingConnection
                          ? 'bg-gray-500 text-gray-400 cursor-not-allowed animate-pulse'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {testingConnection ? <RefreshCw size={18} className="animate-spin" /> : 'Test Connection'}
                    </button>
                  </div>
                </div>
              )}
              {formData.type === 'local' && (
                <div className="p-6 bg-gray-900 rounded-[2.5rem] shadow-2xl">
                  <p className="text-[10px] font-black text-gray-500 uppercase mb-4 tracking-[0.2em] border-b border-gray-800 pb-3">Local Filesystem Path</p>
                  <input
                    type="text"
                    value={formData.base_path}
                    onChange={e => setFormData({...formData, base_path: e.target.value})}
                    placeholder="/var/lib/pacs/storage"
                    className="w-full px-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-gray-800 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner"
                  />
                </div>
              )}
            </form>
            <div className="p-8 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-4">
              <button onClick={() => setIsModalOpen(false)} className="px-8 py-4 text-gray-400 font-black uppercase text-[10px] tracking-widest hover:text-gray-900 transition-colors">Discard</button>
              <button onClick={handleSubmit} className="px-12 py-4 bg-blue-600 text-white rounded-[1.25rem] font-black uppercase text-[10px] tracking-widest shadow-2xl shadow-blue-500/30 hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all">Execute Commit</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Assign Storage to Tenant */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-400 border border-white/20">
            <div className="p-8 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Change Storage Authority</h2>
                <button onClick={() => setIsAssignModalOpen(false)} className="p-3 text-gray-400 hover:text-red-600 bg-white rounded-2xl active:scale-90"><Plus size={32} className="rotate-45" /></button>
              </div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Target Tenant: <span className="text-blue-600">{selectedTenantForAssign?.name}</span></p>
            </div>
            
            <div className="p-8 space-y-6 overflow-y-auto max-h-[60vh]">
              <div className="p-5 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-4">
                <Info className="text-blue-600 flex-shrink-0 mt-1" size={20} />
                <p className="text-xs text-blue-800 leading-relaxed font-bold">
                  Selecting a storage provider will create a dedicated override node for this tenant. 
                  Existing studies will remain in their original location until migrated.
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Available Providers</label>
                
                {/* System Default Option */}
                <button 
                  onClick={() => handleAssignStorage('default', selectedTenantForAssign.id)}
                  className="w-full p-5 bg-white border-2 border-gray-100 hover:border-blue-500 rounded-2xl transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gray-100 text-gray-500 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <Zap size={20} />
                    </div>
                    <div className="text-left">
                      <p className="font-black text-gray-900 text-sm">Use System Default</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Dynamic shared infrastructure</p>
                    </div>
                  </div>
                  <CheckCircle2 className="text-gray-200 group-hover:text-blue-500" size={24} />
                </button>

                {/* List System Nodes */}
                {backends.filter(b => !b.tenant_id).map(b => (
                  <button 
                    key={b.id}
                    onClick={() => handleAssignStorage(b.id, selectedTenantForAssign.id)}
                    className="w-full p-5 bg-white border-2 border-gray-100 hover:border-blue-500 rounded-2xl transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-gray-100 text-gray-500 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                        {b.type === 'local' ? <HardDrive size={20} /> : <Cloud size={20} />}
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <p className="font-black text-gray-900 text-sm">{b.name}</p>
                          {b.is_default && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black">Default</span>}
                        </div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">{b.type} • {b.config?.base_path || 'Cloud Storage'}</p>
                      </div>
                    </div>
                    <ArrowRight className="text-gray-200 group-hover:text-blue-500 -translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all" size={24} />
                  </button>
                ))}
              </div>
            </div>

            <div className="p-8 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <button 
                onClick={() => {
                  setIsAssignModalOpen(false);
                  handleOpenModal({ tenant_id: selectedTenantForAssign.id });
                }}
                className="text-xs font-black text-blue-600 hover:text-blue-800 flex items-center gap-2 uppercase tracking-wider"
              >
                <Plus size={16} /> Custom Configuration
              </button>
              <button onClick={() => setIsAssignModalOpen(false)} className="px-8 py-3 bg-gray-200 text-gray-600 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-300 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorageProvidersPage;
