import React, { useState, useEffect } from 'react';
import { 
  XCircleIcon, 
  ServerStackIcon, 
  CheckCircleIcon, 
  XMarkIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { tenantService } from '../../services/tenantService';
import { useToast } from '../ToastProvider';

const ExternalSystemConfig = ({ tenant, onClose, onSaveSuccess }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [config, setConfig] = useState({
    host: '',
    port: '3306',
    database: '',
    username: '',
    password: '',
    base_url: ''
  });

  useEffect(() => {
    if (tenant?.settings?.simrs_config) {
      const { host, port, database, username, base_url } = tenant.settings.simrs_config;
      setConfig({
        host: host || '',
        port: port || '3306',
        database: database || '',
        username: username || '',
        password: '', // Don't pre-fill password for security
        base_url: base_url || ''
      });
    }
  }, [tenant]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleTestConnection = async () => {
    if (!config.host || !config.database || !config.username) {
      toast.error('Please fill in required fields (Host, Database, Username)');
      return;
    }

    try {
      setTesting(true);
      const res = await tenantService.testSimrsConnection(config);
      if (res.status === 'success' || res.success) {
        toast.success(res.message || 'Connection test successful!');
      } else {
        toast.error(res.message || 'Connection test failed');
      }
    } catch (err) {
      console.error('Connection test error:', err);
      toast.error(err.response?.data?.detail || 'Connection test failed: Could not connect to the server');
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await tenantService.updateExternalSystem(tenant.id, {
        simrs_config: config
      });
      toast.success('SIMRS configuration saved successfully');
      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('Save config error:', err);
      toast.error(err.response?.data?.detail || 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <ServerStackIcon className="h-6 w-6" />
            <h2 className="text-xl font-bold">SIMRS Khanza Configuration</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl mb-2 text-xs text-blue-800">
            Configure the connection details for <strong>{tenant.name}</strong> to integrate with the local SIMRS Khanza database.
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Host / IP Address</label>
              <input
                type="text"
                name="host"
                value={config.host}
                onChange={handleChange}
                placeholder="e.g. 192.168.1.100"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                required
              />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Port</label>
              <input
                type="text"
                name="port"
                value={config.port}
                onChange={handleChange}
                placeholder="3306"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Database Name</label>
            <input
              type="text"
              name="database"
              value={config.database}
              onChange={handleChange}
              placeholder="e.g. sik"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Username</label>
              <input
                type="text"
                name="username"
                value={config.username}
                onChange={handleChange}
                placeholder="db_user"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={config.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">API / Base URL (Optional)</label>
            <input
              type="url"
              name="base_url"
              value={config.base_url}
              onChange={handleChange}
              placeholder="https://api.hospital.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
            />
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              {testing ? (
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircleIcon className="h-5 w-5" />
              )}
              {testing ? 'Testing Connection...' : 'Test Connection'}
            </button>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-slate-600 font-medium hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || testing}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExternalSystemConfig;
