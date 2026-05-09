import React, { useState, useEffect } from 'react';
import { 
  Database, HardDrive, Cloud, Settings, Plus, Trash2, CheckCircle2, 
  AlertCircle, BarChart3, Server, Activity, ArrowRightLeft, 
  DollarSign, TrendingUp, Info, ChevronDown, ChevronUp, Users, Search,
  Filter, ArrowUpDown
} from 'lucide-react';
import { storageConfigService } from '../../services/storageConfigService';
import { tenantService } from '../../services/tenantService';
import { useToast } from '../../components/ToastProvider';

const StorageManagement = () => {
  const [backends, setBackends] = useState([]);
  const [stats, setStats] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBackend, setEditingBackend] = useState(null);
  const [expandedBackends, setExpandedBackends] = useState({});
  const { addToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });

  const [formData, setFormData] = useState({
    name: '', type: 'local', tenant_id: '', is_active: false,
    config: { base_path: '/var/lib/pacs/storage', bucket_name: '', access_key: '', secret_key: '', region: 'auto', endpoint_url: '' }
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [backendsRes, statsRes, tenantsRes] = await Promise.all([
        storageConfigService.listBackends(),
        storageConfigService.getUsageStats(),
        tenantService.listTenants({ limit: 500 })
      ]);
      setBackends(backendsRes || []);
      setStats(statsRes || []);
      setTenants(tenantsRes?.items || []);
    } catch (error) {
      addToast(error.message || 'Failed to fetch storage data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (backend = null) => {
    if (backend) {
      setEditingBackend(backend);
      setFormData({
        name: backend.name, type: backend.type, tenant_id: backend.tenant_id || '',
        is_active: backend.is_active, config: { ...formData.config, ...backend.config }
      });
    } else {
      setEditingBackend(null);
      setFormData({
        name: '', type: 'local', tenant_id: '', is_active: false,
        config: { base_path: '/var/lib/pacs/storage', bucket_name: '', access_key: '', secret_key: '', region: 'auto', endpoint_url: '' }
      });
    }
    setIsModalOpen(true);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingBackend) {
        await storageConfigService.updateBackend(editingBackend.id, formData);
        addToast('Storage provider updated successfully', 'success');
      } else {
        await storageConfigService.createBackend(formData);
        addToast('Storage provider created successfully', 'success');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      addToast(error.message || 'Operation failed', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this storage provider?')) return;
    try {
      await storageConfigService.deleteBackend(id);
      addToast('Storage provider deleted', 'success');
      fetchData();
    } catch (error) {
      addToast(error.message || 'Delete failed', 'error');
    }
  };

  const toggleActive = async (backend) => {
    try {
      await storageConfigService.updateBackend(backend.id, { is_active: !backend.is_active });
      addToast(`Storage provider ${backend.is_active ? 'deactivated' : 'activated'}`, 'success');
      fetchData();
    } catch (error) {
      addToast('Failed to toggle status', 'error');
    }
  };
  
  const toggleExpand = (id) => setExpandedBackends(prev => ({ ...prev, [id]: !prev[id] }));

  const processedBackends = React.useMemo(() => {
    const activeBackendsByTenant = backends.reduce((acc, b) => {
      if (b.is_active && b.tenant_id) acc[b.tenant_id] = b;
      return acc;
    }, {});
    const systemDefaultBackend = backends.find(b => b.is_active && !b.tenant_id);

    return backends.map(backend => {
      const usingTenantsStats = stats.filter(stat => {
        const mappedBackend = activeBackendsByTenant[stat.tenant_id] || systemDefaultBackend;
        return mappedBackend && mappedBackend.id === backend.id;
      });

      const aggregated = usingTenantsStats.reduce((acc, curr) => {
        acc.total_gb += parseFloat(curr.total_gb || 0);
        acc.study_count += parseInt(curr.study_count || 0);
        acc.class_a_ops += parseInt(curr.class_a_ops || 0);
        acc.class_b_ops += parseInt(curr.class_b_ops || 0);
        acc.estimated_cost_usd += parseFloat(curr.estimated_cost_usd || 0);
        return acc;
      }, { total_gb: 0, study_count: 0, class_a_ops: 0, class_b_ops: 0, estimated_cost_usd: 0 });
      
      return { ...backend, usingTenantsStats, aggregated };
    });
  }, [backends, stats]);

  const filteredAndSortedBackends = React.useMemo(() => {
    return processedBackends
      .filter(b => {
        if (activeFilter === 'active') return b.is_active;
        if (activeFilter === 'inactive') return !b.is_active;
        return true;
      })
      .sort((a, b) => {
        let valA, valB;
        switch (sortConfig.key) {
          case 'cost':
            valA = a.aggregated.estimated_cost_usd;
            valB = b.aggregated.estimated_cost_usd;
            break;
          case 'usage':
            valA = a.aggregated.total_gb;
            valB = b.aggregated.total_gb;
            break;
          case 'name':
          default:
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
            break;
        }
        if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
  }, [processedBackends, activeFilter, sortConfig]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={14} className="ml-2 text-gray-300" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-2 text-blue-500" /> : <ChevronDown size={14} className="ml-2 text-blue-500" />;
  };

  if (loading) return <div className="p-8 flex justify-center items-center h-full"><Activity className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Database className="text-blue-600" /> Storage Providers
          </h1>
          <p className="text-gray-500 mt-1">Monitor usage, costs, and tenant assignments for your storage backends.</p>
        </div>
        <button onClick={() => handleOpenModal()} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium">
          <Plus size={18} /> Add Provider
        </button>
      </div>

      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-500" />
          <div className="flex items-center gap-1 p-1 bg-gray-200 rounded-lg">
            {['all', 'active', 'inactive'].map(filter => (
              <button key={filter} onClick={() => setActiveFilter(filter)} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${activeFilter === filter ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="font-semibold">Sort by:</span>
            <button onClick={() => requestSort('name')} className="flex items-center font-medium hover:text-blue-600">{getSortIcon('name')} Name</button>
            <button onClick={() => requestSort('usage')} className="flex items-center font-medium hover:text-blue-600">{getSortIcon('usage')} Usage</button>
            <button onClick={() => requestSort('cost')} className="flex items-center font-medium hover:text-blue-600">{getSortIcon('cost')} Cost</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {filteredAndSortedBackends.length > 0 ? filteredAndSortedBackends.map((backend) => (
          <div key={backend.id} className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden transform hover:shadow-lg transition-shadow duration-300">
            {/* ... (UI SAMA SEPERTI SEBELUMNYA) ... */}
          </div>
        )) : (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center xl:col-span-2 flex flex-col items-center justify-center min-h-[300px]">
             <Server className="text-gray-300 mb-4" size={56} />
             <h4 className="text-lg font-bold text-gray-600 mb-2">No Storage Providers Found</h4>
             <p className="text-gray-500 text-sm max-w-md mb-6">Your filters did not match any storage providers. Try adjusting your filter or add a new provider.</p>
             <button onClick={() => handleOpenModal()} className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium">
              <Plus size={18} /> Add Provider
            </button>
          </div>
        )}
      </div>

      {/* ... (Modal sama seperti sebelumnya) ... */}
    </div>
  );
};

export default StorageManagement;
