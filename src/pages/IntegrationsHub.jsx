import React, { useState, useEffect } from 'react';
import { 
  LayoutGrid, 
  Settings, 
  CheckCircle2, 
  Plus, 
  ArrowRight, 
  ExternalLink,
  Shield,
  Search,
  Filter,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/ToastProvider';

// Mock Registry Data (Global)
const GLOBAL_REGISTRY = [
  {
    id: 'khanza',
    name: 'SIMRS Khanza',
    description: 'Sistem Informasi Manajemen Rumah Sakit Open Source',
    icon: '🏥',
    provider: 'Khanza Foundation',
    category: 'SIMRS',
    version: '1.0.0'
  },
  {
    id: 'accurate',
    name: 'Accurate Online',
    description: 'Cloud Accounting Software untuk efisiensi bisnis',
    icon: '💹',
    provider: 'CPSSoft',
    category: 'Finance',
    version: '2.4.1'
  },
  {
    id: 'satusehat',
    name: 'SatuSehat (Kemenkes)',
    description: 'Integrasi platform SatuSehat Kemenkes RI',
    icon: '🇮🇩',
    provider: 'Kemenkes RI',
    category: 'Government',
    version: 'v2.0'
  },
  {
    id: 'bpjs',
    name: 'VClaim BPJS',
    description: 'Integrasi klaim dan rujukan BPJS Kesehatan',
    icon: '💳',
    provider: 'BPJS Kesehatan',
    category: 'Insurance',
    version: '2.0.0'
  }
];

export default function IntegrationsHub() {
  const { currentUser } = useAuth();
  const { notify } = useToast();
  
  // User Roles
  const isSuperAdmin = currentUser?.role === 'superadmin' || currentUser?.role === 'developer';
  const isTenantAdmin = currentUser?.role === 'TENANT_ADMIN' || isSuperAdmin;

  // State
  const [activeTab, setActiveTab] = useState('registry');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // Installed Integrations (Mock state for Tenant)
  const [installedIntegrations, setInstalledIntegrations] = useState(['satusehat']);
  const [configurations, setConfigurations] = useState({
    satusehat: {
      base_url: 'https://api-satusehat.kemkes.go.id',
      cons_id: '12345678',
      secret_key: '********'
    }
  });

  // Form State
  const [formData, setFormData] = useState({
    base_url: '',
    cons_id: '',
    secret_key: '',
    db_host: '',
    db_port: '3306',
    db_name: '',
    db_user: '',
    db_password: ''
  });

  const handleInstall = (integration) => {
    setSelectedIntegration(integration);
    setFormData({
      base_url: '',
      cons_id: '',
      secret_key: '',
      db_host: '',
      db_port: '3306',
      db_name: '',
      db_user: '',
      db_password: ''
    });
    setIsConfiguring(true);
  };

  const handleConfigure = (integration) => {
    setSelectedIntegration(integration);
    const defaultFields = integration.id === 'khanza' 
      ? { base_url: '', db_host: '', db_port: '3306', db_name: '', db_user: '', db_password: '' }
      : { base_url: '', cons_id: '', secret_key: '' };
      
    const existingConfig = configurations[integration.id] || defaultFields;
    setFormData({
      ...defaultFields,
      ...existingConfig
    });
    setIsConfiguring(true);
  };

  
  const handleTestConnection = async () => {
    if (!formData.base_url) {
      notify({ type: 'error', message: 'Input required', detail: 'Base URL is required to test' });
      return;
    }

    setIsTesting(true);
    try {
      // In multi-tenant setup, this uses current tenant context from token
      const response = await apiClient.post('/api/khanza/test-connection', formData);
      if (response.status === 'success') {
        notify({
          type: 'success',
          message: 'Connection Success',
          detail: response.message
        });
      } else {
        notify({
          type: 'error',
          message: 'Connection Failed',
          detail: response.message
        });
      }
    } catch (error) {
      notify({
        type: 'error',
        message: 'Request Error',
        detail: error.message || 'Could not reach the test endpoint'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = (e) => {
    e.preventDefault();
    
    // Validation based on integration type
    let isValid = false;
    if (selectedIntegration.id === 'khanza') {
      isValid = formData.base_url && formData.db_host && formData.db_port && formData.db_name && formData.db_user && formData.db_password;
    } else {
      isValid = formData.base_url && formData.cons_id && formData.secret_key;
    }

    if (!isValid) {
      notify({
        type: 'error',
        message: 'Validation Error',
        detail: 'All fields are required'
      });
      return;
    }

    setConfigurations(prev => ({
      ...prev,
      [selectedIntegration.id]: { ...formData }
    }));

    if (!installedIntegrations.includes(selectedIntegration.id)) {
      setInstalledIntegrations(prev => [...prev, selectedIntegration.id]);
    }

    setIsConfiguring(false);
    setSelectedIntegration(null);
    
    notify({
      type: 'success',
      message: 'Configuration Saved',
      detail: `${selectedIntegration.name} has been successfully configured.`
    });
  };

  const filteredRegistry = GLOBAL_REGISTRY.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Integrations Hub</h1>
          <p className="text-gray-500 mt-1">
            {isSuperAdmin 
              ? 'Kelola Registry Global dan pantau instalasi tenant.' 
              : 'Hubungkan aplikasi Anda dengan sistem eksternal.'}
          </p>
        </div>
        
        {isSuperAdmin && (
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm">
            <Plus size={18} />
            Add to Registry
          </button>
        )}
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-gray-200">
        <div className="flex gap-8">
          <button 
            onClick={() => setActiveTab('registry')}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === 'registry' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Global Registry
            {activeTab === 'registry' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
          </button>
          <button 
            onClick={() => setActiveTab('installed')}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === 'installed' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Installed
            {installedIntegrations.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">
                {installedIntegrations.length}
              </span>
            )}
            {activeTab === 'installed' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
          </button>
        </div>

        <div className="relative w-full sm:w-64 mb-2">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search integrations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Content Area */}
      {isConfiguring ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-2xl">
                {selectedIntegration.icon}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Configure {selectedIntegration.name}</h3>
                <p className="text-sm text-gray-500">Provide connection details to enable integration.</p>
              </div>
            </div>
            <button 
              onClick={() => setIsConfiguring(false)}
              className="text-gray-400 hover:text-gray-600 transition"
            >
              <Plus size={24} className="rotate-45" />
            </button>
          </div>
          
          <form onSubmit={handleSaveConfig} className="p-6 space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {selectedIntegration.id === 'khanza' ? 'Bridge Base URL (khanza-api)' : 'API Base URL'}
                </label>
                <div className="relative">
                  <input 
                    type="url"
                    required
                    placeholder={selectedIntegration.id === 'khanza' ? 'http://localhost:3000' : 'https://api.provider.com/v1'}
                    value={formData.base_url}
                    onChange={(e) => setFormData({...formData, base_url: e.target.value})}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-500 italic">
                  {selectedIntegration.id === 'khanza' 
                    ? 'URL untuk service bridge khanza-api.' 
                    : 'Endpoint API utama untuk integrasi ini.'}
                </p>
              </div>

              {selectedIntegration.id === 'khanza' ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Database Host</label>
                      <input 
                        type="text"
                        required
                        placeholder="localhost or IP address"
                        value={formData.db_host}
                        onChange={(e) => setFormData({...formData, db_host: e.target.value})}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Database Port</label>
                      <input 
                        type="text"
                        required
                        placeholder="3306"
                        value={formData.db_port}
                        onChange={(e) => setFormData({...formData, db_port: e.target.value})}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Database Name</label>
                      <input 
                        type="text"
                        required
                        placeholder="sik"
                        value={formData.db_name}
                        onChange={(e) => setFormData({...formData, db_name: e.target.value})}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Database User</label>
                      <input 
                        type="text"
                        required
                        placeholder="root"
                        value={formData.db_user}
                        onChange={(e) => setFormData({...formData, db_user: e.target.value})}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Database Password</label>
                      <input 
                        type="password"
                        required
                        placeholder="••••••••••••••••"
                        value={formData.db_password}
                        onChange={(e) => setFormData({...formData, db_password: e.target.value})}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Consumer ID (cons_id)</label>
                    <input 
                      type="text"
                      required
                      placeholder="Masukkan Consumer ID"
                      value={formData.cons_id}
                      onChange={(e) => setFormData({...formData, cons_id: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Secret Key</label>
                    <input 
                      type="password"
                      required
                      placeholder="••••••••••••••••"
                      value={formData.secret_key}
                      onChange={(e) => setFormData({...formData, secret_key: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
              <Shield className="text-amber-600 flex-shrink-0" size={20} />
              <div className="text-sm text-amber-800">
                Data kredensial akan dienkripsi dan disimpan secara aman di level tenant. Pastikan URL dapat diakses dari server utama.
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button 
                type="button"
                onClick={() => setIsConfiguring(false)}
                className="px-6 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium"
              >
                Cancel
              </button>
              
                <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isTesting ? (
                      <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <Zap size={18} className="text-amber-500" />
                        Test Connection
                      </>
                    )}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all shadow-md shadow-blue-600/20"
                  >
                    Save Configuration
                  </button>
                </div>

            </div>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(activeTab === 'registry' ? filteredRegistry : filteredRegistry.filter(i => installedIntegrations.includes(i.id))).map((item) => {
            const isInstalled = installedIntegrations.includes(item.id);
            
            return (
              <div 
                key={item.id}
                className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-300 overflow-hidden flex flex-col"
              >
                <div className="p-6 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform duration-300">
                      {item.icon}
                    </div>
                    {isInstalled && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100 uppercase tracking-wider">
                        <CheckCircle2 size={12} />
                        Installed
                      </span>
                    )}
                  </div>
                  
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{item.name}</h3>
                  <div className="text-xs text-blue-600 font-medium mb-3 flex items-center gap-2">
                    {item.category} • {item.provider}
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {item.description}
                  </p>
                </div>
                
                <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                  <div className="text-xs text-gray-400">
                    Version {item.version}
                  </div>
                  
                  {isTenantAdmin && (
                    <button 
                      onClick={() => isInstalled ? handleConfigure(item) : handleInstall(item)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        isInstalled 
                          ? 'text-gray-700 hover:bg-white border border-gray-200 shadow-sm' 
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/10'
                      }`}
                    >
                      {isInstalled ? (
                        <>
                          <Settings size={16} />
                          Configure
                        </>
                      ) : (
                        <>
                          <Plus size={16} />
                          Install
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          
          {activeTab === 'installed' && installedIntegrations.length === 0 && (
            <div className="col-span-full py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                <RefreshCw size={32} className="text-gray-300" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Belum Ada Integrasi</h3>
              <p className="text-gray-500 mt-1 max-w-xs">
                Anda belum menginstal integrasi apapun. Cari di Registry Global untuk memulai.
              </p>
              <button 
                onClick={() => setActiveTab('registry')}
                className="mt-6 px-6 py-2 bg-white border border-gray-200 text-blue-600 font-bold rounded-lg hover:border-blue-300 transition"
              >
                Go to Registry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Superadmin specific section */}
      {isSuperAdmin && !isConfiguring && (
        <div className="mt-12 p-6 bg-slate-900 rounded-2xl text-white">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm uppercase tracking-widest mb-2">
                <AlertCircle size={16} />
                Developer Console
              </div>
              <h2 className="text-xl font-bold mb-2">Monitoring Registry Global</h2>
              <p className="text-slate-400 text-sm max-w-2xl">
                Sebagai superadmin, Anda memiliki kontrol penuh atas daftar integrasi yang tersedia untuk semua tenant. 
                Setiap integrasi baru yang ditambahkan di sini akan segera muncul di dashboard masing-masing tenant.
              </p>
            </div>
            <button className="px-6 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold transition whitespace-nowrap">
              Manage API Schema
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
              <div className="text-slate-400 text-xs font-bold uppercase mb-1">Total Registry</div>
              <div className="text-2xl font-bold">{GLOBAL_REGISTRY.length} Systems</div>
            </div>
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
              <div className="text-slate-400 text-xs font-bold uppercase mb-1">Active Installations</div>
              <div className="text-2xl font-bold">1,248 Tenant</div>
            </div>
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
              <div className="text-slate-400 text-xs font-bold uppercase mb-1">Sync Success Rate</div>
              <div className="text-2xl font-bold text-emerald-400">99.9%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
