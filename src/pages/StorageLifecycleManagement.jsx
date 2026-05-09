import React, { useState, useEffect } from 'react';
import { Server, HardDrive, CheckCircle, AlertCircle, Settings, Database, Cloud, RefreshCw, Save, Trash2, Download, Power } from 'lucide-react';
import storageConfigService from '../services/storageConfigService';
import { useToast } from '../components/ToastProvider';

const StorageLifecycleManagement = () => {
    const [currentConfig, setCurrentConfig] = useState(null);
    const [providers, setProviders] = useState([]);
    const [stats, setStats] = useState(null);
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const toast = useToast();

    // Form state
    const [selectedProvider, setSelectedProvider] = useState('local');
    const [config, setConfig] = useState({});

    // Saved configurations state
    const [savedConfigs, setSavedConfigs] = useState([]);
    const [activeConfig, setActiveConfig] = useState(null);
    const [configName, setConfigName] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [setAsActive, setSetAsActive] = useState(false);

    const hasLoaded = React.useRef(false);

    useEffect(() => {
        if (!hasLoaded.current) {
            hasLoaded.current = true;
            loadData();
        }
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [configData, providersData, statsData, healthData, savedConfigsData] = await Promise.all([
                storageConfigService.getCurrentConfig(),
                storageConfigService.listProviders(),
                storageConfigService.getStats(),
                storageConfigService.checkHealth(),
                storageConfigService.getStorageConfigs()
            ]);

            setCurrentConfig(configData);
            setProviders(providersData);
            setStats(statsData);
            setHealth(healthData);

            // savedConfigsData is { configs: [...] }
            const configs = savedConfigsData.configs || [];
            setSavedConfigs(configs);

            // Find active config
            const active = configs.find(c => c.active === true);
            setActiveConfig(active || null);

            // Set initial form values from current config
            if (configData) {
                setSelectedProvider(configData.adapter_type);
                setConfig(configData.config || {});
            }
        } catch (err) {
            console.error('Failed to load storage data:', err);
            toast.notify({ type: 'error', message: 'Failed to load storage data: ' + err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveConfiguration = async () => {
        if (!configName.trim()) {
            alert('Please enter a configuration name');
            return;
        }

        try {
            setLoading(true);
            await storageConfigService.addStorageConfig(
                configName,
                selectedProvider,
                config,
                setAsActive
            );

            // Reload saved configs
            const savedConfigsData = await storageConfigService.getStorageConfigs();
            const configs = savedConfigsData.configs || [];
            setSavedConfigs(configs);

            // Update active config
            const active = configs.find(c => c.active === true);
            setActiveConfig(active || null);

            setShowSaveDialog(false);
            setConfigName('');
            setSetAsActive(false);
            alert('Configuration saved successfully!');
        } catch (err) {
            console.error('Failed to save configuration:', err);
            alert('Failed to save configuration: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLoadConfiguration = (savedConfig) => {
        setSelectedProvider(savedConfig.adapter_type);
        setConfig(savedConfig.config || {});
        setTestResult(null);
    };

    const handleDeleteConfiguration = async (id) => {
        if (!confirm('Are you sure you want to delete this configuration?')) {
            return;
        }

        try {
            setLoading(true);
            await storageConfigService.deleteStorageConfig(id);

            // Reload saved configs
            const savedConfigsData = await storageConfigService.getStorageConfigs();
            const configs = savedConfigsData.configs || [];
            setSavedConfigs(configs);

            // Update active config
            const active = configs.find(c => c.active === true);
            setActiveConfig(active || null);

            alert('Configuration deleted successfully!');
        } catch (err) {
            console.error('Failed to delete configuration:', err);
            alert('Failed to delete configuration: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSetActiveConfiguration = async (id) => {
        try {
            setLoading(true);
            await storageConfigService.setActiveStorageConfig(id);

            // Reload saved configs
            const savedConfigsData = await storageConfigService.getStorageConfigs();
            const configs = savedConfigsData.configs || [];
            setSavedConfigs(configs);

            // Update active config
            const active = configs.find(c => c.active === true);
            setActiveConfig(active || null);

            alert('Active configuration updated successfully!');
        } catch (err) {
            console.error('Failed to set active configuration:', err);
            alert('Failed to set active configuration: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async () => {
        try {
            setTestResult(null);
            setLoading(true);
            const result = await storageConfigService.testConnection(selectedProvider, config);
            setTestResult(result);
        } catch (err) {
            setTestResult({
                success: false,
                message: 'Test failed: ' + err.message,
                error: err.message
            });
        } finally {
            setLoading(false);
        }
    };

    const getProviderIcon = (type) => {
        if (type === 'local') return <HardDrive className="w-5 h-5" />;
        return <Cloud className="w-5 h-5" />;
    };

    const selectedProviderDetails = providers.find(p => p.type === selectedProvider);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Storage Lifecycle Management</h1>
                    <p className="text-sm text-gray-500">Manage storage adapters and configuration</p>
                </div>
                <button
                    onClick={loadData}
                    className="btn btn-secondary flex items-center gap-2"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Current Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex items-center gap-2 mb-2">
                        <Server className="w-5 h-5 text-blue-600" />
                        <h3 className="font-semibold">Current Adapter</h3>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                        {activeConfig?.adapter_type?.toUpperCase() || currentConfig?.adapter_type?.toUpperCase() || 'LOCAL'}
                    </div>
                    {activeConfig && currentConfig && activeConfig.adapter_type !== currentConfig.adapter_type && (
                        <div className="text-xs text-orange-600 mt-1">
                            Running: {currentConfig.adapter_type?.toUpperCase()}
                        </div>
                    )}
                </div>

                <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex items-center gap-2 mb-2">
                        <Database className="w-5 h-5 text-green-600" />
                        <h3 className="font-semibold">Total Files</h3>
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                        {stats?.file_count?.toLocaleString() || '0'}
                    </div>
                </div>

                <div className="bg-white p-4 rounded-lg shadow">
                    <div className="flex items-center gap-2 mb-2">
                        <HardDrive className="w-5 h-5 text-purple-600" />
                        <h3 className="font-semibold">Total Size</h3>
                    </div>
                    <div className="text-2xl font-bold text-purple-600">
                        {stats?.total_size_gb?.toFixed(2) || '0'} GB
                    </div>
                </div>
            </div>

            {/* Health Status */}
            {health && (
                <div className={`p-4 rounded-lg ${health.healthy ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex items-center gap-2">
                        {health.healthy ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-red-600" />
                        )}
                        <span className={`font-semibold ${health.healthy ? 'text-green-900' : 'text-red-900'}`}>
                            Storage Health: {health.healthy ? 'Healthy' : 'Unhealthy'}
                        </span>
                    </div>
                    {health.error && (
                        <p className="mt-2 text-sm text-red-700">{health.error}</p>
                    )}
                </div>
            )}

            {/* Provider Selection */}
            <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex items-center gap-2 mb-4">
                    <Settings className="w-5 h-5 text-gray-600" />
                    <h2 className="text-lg font-semibold">Storage Provider Configuration</h2>
                </div>

                {/* Provider Selector */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Storage Provider
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {providers.map((provider) => (
                            <div
                                key={provider.type}
                                onClick={() => {
                                    setSelectedProvider(provider.type);
                                    setConfig({});
                                    setTestResult(null);
                                }}
                                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedProvider === provider.type
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    {getProviderIcon(provider.type)}
                                    <span className="font-semibold">{provider.name}</span>
                                </div>
                                <p className="text-sm text-gray-600">{provider.description}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Configuration Fields */}
                {selectedProviderDetails && (
                    <div className="space-y-4">
                        <h3 className="font-medium text-gray-900">Configuration</h3>

                        {selectedProvider === 'local' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Base Path
                                </label>
                                <input
                                    type="text"
                                    value={config.base_path || '/var/lib/pacs/storage'}
                                    onChange={(e) => setConfig({ ...config, base_path: e.target.value })}
                                    className="input w-full"
                                    placeholder="/var/lib/pacs/storage"
                                />
                            </div>
                        )}

                        {['s3', 'minio', 'contabo', 'wasabi', 's3-compatible'].includes(selectedProvider) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Bucket Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={config.bucket_name || ''}
                                        onChange={(e) => setConfig({ ...config, bucket_name: e.target.value })}
                                        className="input w-full"
                                        placeholder="my-dicom-bucket"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Region
                                    </label>
                                    <input
                                        type="text"
                                        value={config.region || 'us-east-1'}
                                        onChange={(e) => setConfig({ ...config, region: e.target.value })}
                                        className="input w-full"
                                        placeholder="us-east-1"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Access Key *
                                    </label>
                                    <input
                                        type="text"
                                        value={config.access_key || ''}
                                        onChange={(e) => setConfig({ ...config, access_key: e.target.value })}
                                        className="input w-full"
                                        placeholder="Your access key"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Secret Key *
                                    </label>
                                    <input
                                        type="password"
                                        value={config.secret_key || ''}
                                        onChange={(e) => setConfig({ ...config, secret_key: e.target.value })}
                                        className="input w-full"
                                        placeholder="Your secret key"
                                    />
                                </div>

                                {selectedProvider !== 's3' && (
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Endpoint URL
                                        </label>
                                        <input
                                            type="text"
                                            value={config.endpoint_url || ''}
                                            onChange={(e) => setConfig({ ...config, endpoint_url: e.target.value })}
                                            className="input w-full"
                                            placeholder={
                                                selectedProvider === 'contabo' ? 'https://eu2.contabostorage.com' :
                                                    selectedProvider === 'minio' ? 'http://localhost:9000' :
                                                        selectedProvider === 'wasabi' ? 'https://s3.wasabisys.com' :
                                                            'Custom endpoint URL'
                                            }
                                        />
                                    </div>
                                )}

                                <div className="col-span-2">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={config.use_ssl !== false}
                                            onChange={(e) => setConfig({ ...config, use_ssl: e.target.checked })}
                                            className="checkbox"
                                        />
                                        <span className="text-sm font-medium text-gray-700">Use SSL/TLS</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* Test Connection and Save Buttons */}
                        <div className="flex gap-2 mt-6">
                            <button
                                onClick={handleTestConnection}
                                disabled={loading}
                                className="btn btn-primary flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        Testing...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-4 h-4" />
                                        Test Connection
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => setShowSaveDialog(true)}
                                disabled={loading}
                                className="btn btn-secondary flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                Save Configuration
                            </button>
                        </div>

                        {/* Test Result */}
                        {testResult && (
                            <div className={`p-4 rounded-lg mt-4 ${testResult.success && !testResult.stats?.error
                                ? 'bg-green-50 border border-green-200'
                                : testResult.success && testResult.stats?.error
                                    ? 'bg-yellow-50 border border-yellow-200'
                                    : 'bg-red-50 border border-red-200'
                                }`}>
                                <div className="flex items-center gap-2 mb-2">
                                    {testResult.success && !testResult.stats?.error ? (
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                    ) : testResult.success && testResult.stats?.error ? (
                                        <AlertCircle className="w-5 h-5 text-yellow-600" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-red-600" />
                                    )}
                                    <span className={`font-semibold ${testResult.success && !testResult.stats?.error
                                        ? 'text-green-900'
                                        : testResult.success && testResult.stats?.error
                                            ? 'text-yellow-900'
                                            : 'text-red-900'
                                        }`}>
                                        {testResult.message}
                                    </span>
                                </div>
                                {testResult.stats && (
                                    <div className="text-sm text-gray-700 mt-2">
                                        <div>Provider: {testResult.stats.provider || testResult.stats.adapter_type}</div>
                                        <div>Files: {testResult.stats.file_count?.toLocaleString()}</div>
                                        <div>Size: {testResult.stats.total_size_gb?.toFixed(2)} GB</div>
                                        {testResult.stats.error && (
                                            <div className="mt-2 p-2 bg-yellow-100 text-yellow-800 rounded border border-yellow-200 font-mono text-xs break-all">
                                                <strong>Warning:</strong> {testResult.stats.error}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {testResult.error && (
                                    <p className="text-sm text-red-700 mt-2">{testResult.error}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Note */}
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900">
                        <strong>Note:</strong> Configuration changes require updating environment variables and restarting the PACS service.
                        Use the test connection feature to verify settings before deployment.
                    </p>
                </div>
            </div>

            {/* Saved Configurations Section */}
            {savedConfigs.length > 0 && (
                <div className="bg-white p-6 rounded-lg shadow">
                    <div className="flex items-center gap-2 mb-4">
                        <Database className="w-5 h-5 text-gray-600" />
                        <h2 className="text-lg font-semibold">Saved Configurations</h2>
                        {activeConfig && (
                            <span className="text-sm text-gray-500">
                                (Active: {activeConfig.name})
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {savedConfigs.map((savedConfig) => (
                            <div
                                key={savedConfig.id}
                                className={`p-4 border-2 rounded-lg transition-all ${savedConfig.active
                                    ? 'border-green-500 bg-green-50'
                                    : 'border-gray-200 hover:border-blue-300'
                                    }`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {getProviderIcon(savedConfig.adapter_type)}
                                        <h3 className="font-semibold">{savedConfig.name}</h3>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {savedConfig.active && (
                                            <span className="px-2 py-1 bg-green-600 text-white text-xs rounded-full font-semibold">
                                                ACTIVE
                                            </span>
                                        )}
                                        <button
                                            onClick={() => handleDeleteConfiguration(savedConfig.id)}
                                            className="text-red-600 hover:text-red-800 ml-2"
                                            title="Delete configuration"
                                            disabled={savedConfig.active}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-600 mb-2">
                                    Type: {savedConfig.adapter_type?.toUpperCase()}
                                </p>
                                <p className="text-xs text-gray-500 mb-3">
                                    Saved: {new Date(savedConfig.saved_at || savedConfig.created_at).toLocaleString()}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleLoadConfiguration(savedConfig)}
                                        className="btn btn-sm btn-secondary flex items-center gap-2 flex-1"
                                    >
                                        <Download className="w-3 h-3" />
                                        Load
                                    </button>
                                    {!savedConfig.active && (
                                        <button
                                            onClick={() => handleSetActiveConfiguration(savedConfig.id)}
                                            className="btn btn-sm btn-primary flex items-center gap-2 flex-1"
                                            disabled={loading}
                                        >
                                            <Power className="w-3 h-3" />
                                            Set Active
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Save Configuration Dialog */}
            {showSaveDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold mb-4">Save Storage Configuration</h3>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Configuration Name
                            </label>
                            <input
                                type="text"
                                value={configName}
                                onChange={(e) => setConfigName(e.target.value)}
                                className="input w-full"
                                placeholder="e.g., Production S3, Development Local"
                                autoFocus
                            />
                        </div>
                        <div className="mb-4">
                            <p className="text-sm text-gray-600">
                                Provider: <strong>{selectedProvider.toUpperCase()}</strong>
                            </p>
                        </div>
                        <div className="mb-4">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={setAsActive}
                                    onChange={(e) => setSetAsActive(e.target.checked)}
                                    className="checkbox"
                                />
                                <span className="text-sm font-medium text-gray-700">
                                    Set as Active Configuration
                                </span>
                            </label>
                            <p className="text-xs text-gray-500 mt-1 ml-6">
                                Active configuration will be used for writing/saving new data
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleSaveConfiguration}
                                disabled={loading || !configName.trim()}
                                className="btn btn-primary flex-1"
                            >
                                {loading ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowSaveDialog(false);
                                    setConfigName('');
                                    setSetAsActive(false);
                                }}
                                className="btn btn-secondary flex-1"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StorageLifecycleManagement;
