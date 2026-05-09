/**
 * External Systems Detail Component
 * 
 * Displays and allows editing of external system details including:
 * - Basic information (code, name, type, provider, vendor, version)
 * - Facility information (facility_code, facility_name)
 * - Connection settings (URL, auth type, credentials)
 * - Connection testing
 * 
 * Requirements: 1.5, 2.1, 2.3, 3.1, 3.2, 17.1
 */

import { useState, useEffect, useMemo } from 'react';
import { logger } from '../../utils/logger';
import { useServiceMode } from '../../hooks/useServiceMode';
import * as mockExternalSystemsService from '../../services/mock/mockExternalSystemsService';
import {
  getExternalSystem as getRealExternalSystem,
  createExternalSystem as createRealExternalSystem,
  updateExternalSystem as updateRealExternalSystem,
  deleteExternalSystem as deleteRealExternalSystem,
} from '../../services/externalSystemsService';
import { testConnection as testRealConnection, testConnectionDirect } from '../../services/connectionTestService';
import { MappingsTab, OrderBrowserTab, ImportHistoryTab, AuditLogTab } from './tabs';
import { useToast } from '../../components/ToastProvider';

// Provider capabilities definitions
const PROVIDER_CAPABILITIES = {
  khanza: {
    name: 'Khanza SIMRS',
    description: 'Open source SIMRS used by 1000+ hospitals in Indonesia',
    hasOrderBrowser: true,
    hasPatientLookup: true,
    hasProcedureSearch: true,
    hasDoctorLookup: true,
    supportsImport: true,
  },
  gos: {
    name: 'GOS Healthcare',
    description: 'Commercial healthcare information system',
    hasOrderBrowser: true,
    hasPatientLookup: true,
    hasProcedureSearch: false,
    hasDoctorLookup: true,
    supportsImport: true,
  },
  generic: {
    name: 'Generic Adapter',
    description: 'Configurable adapter for custom integrations',
    hasOrderBrowser: true,
    hasPatientLookup: true,
    hasProcedureSearch: true,
    hasDoctorLookup: false,
    supportsImport: true,
  },
};

const SYSTEM_TYPES = ['SIMRS', 'HIS', 'RIS', 'PACS', 'LIS', 'EMR'];

const AUTH_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'api_key', label: 'API Key' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'jwt', label: 'JWT' },
  { value: 'bpjs', label: 'BPJS Auth' },
];

const TABS = {
  CONNECTION: 'connection',
  MAPPINGS: 'mappings',
  ORDER_BROWSER: 'orderBrowser',
  IMPORT_HISTORY: 'importHistory',
  AUDIT_LOG: 'auditLog',
};

const getInitialFormData = () => ({
  code: '',
  name: '',
  type: 'SIMRS',
  provider: 'generic',
  vendor: '',
  version: '',
  facility_code: '',
  facility_name: '',
  is_active: true,
  connection: {
    baseUrl: '',
    authType: 'none',
    apiKey: '',
    username: '',
    password: '',
    token: '',
    consId: '',
    secretKey: '',
    timeoutMs: 30000,
    healthPath: '/health',
  },
  capabilities: PROVIDER_CAPABILITIES.generic,
});

const validateForm = (formData) => {
  const errors = {};

  if (!formData.code?.trim()) {
    errors.code = 'System code is required';
  } else if (!/^[A-Z0-9_-]+$/i.test(formData.code)) {
    errors.code = 'Code must contain only letters, numbers, underscores, and hyphens';
  }

  if (!formData.name?.trim()) {
    errors.name = 'System name is required';
  }

  if (!formData.type) {
    errors.type = 'System type is required';
  }

  if (!formData.provider) {
    errors.provider = 'Provider is required';
  }

  if (!formData.connection?.baseUrl?.trim()) {
    errors.baseUrl = 'Base URL is required';
  } else {
    try {
      new URL(formData.connection.baseUrl);
    } catch {
      errors.baseUrl = 'Invalid URL format';
    }
  }

  const authType = formData.connection?.authType;
  if (authType === 'api_key' && !formData.connection?.apiKey?.trim()) {
    errors.apiKey = 'API Key is required';
  }
  if (authType === 'basic') {
    if (!formData.connection?.username?.trim()) {
      errors.username = 'Username is required';
    }
    if (!formData.connection?.password?.trim()) {
      errors.password = 'Password is required';
    }
  }
  if ((authType === 'bearer' || authType === 'jwt') && !formData.connection?.token?.trim()) {
    errors.token = 'Token is required';
  }
  if (authType === 'bpjs') {
    if (!formData.connection?.consId?.trim()) {
      errors.consId = 'Consumer ID is required';
    }
    if (!formData.connection?.secretKey?.trim()) {
      errors.secretKey = 'Secret Key is required';
    }
  }

  return errors;
};


export default function ExternalSystemsDetail({
  systemId = null,
  onSave = () => { },
  onBack = () => { },
}) {
  const { isMockMode, isUsingFallback } = useServiceMode();
  const { notify } = useToast();

  const [formData, setFormData] = useState(getInitialFormData);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!!systemId);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [activeTab, setActiveTab] = useState(TABS.CONNECTION);
  const [validationErrors, setValidationErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [hasSecretKey, setHasSecretKey] = useState(false);

  const externalSystemsService = useMemo(() => {
    if (isMockMode) {
      return {
        getExternalSystem: mockExternalSystemsService.getExternalSystem,
        createExternalSystem: mockExternalSystemsService.createExternalSystem,
        updateExternalSystem: mockExternalSystemsService.updateExternalSystem,
        deleteExternalSystem: mockExternalSystemsService.deleteExternalSystem,
        testConnection: mockExternalSystemsService.testConnection,
      };
    }
    return {
      getExternalSystem: getRealExternalSystem,
      createExternalSystem: createRealExternalSystem,
      updateExternalSystem: updateRealExternalSystem,
      deleteExternalSystem: deleteRealExternalSystem,
      testConnection: testRealConnection,
    };
  }, [isMockMode]);

  const showProviderTabs = useMemo(() => {
    const capabilities = formData.capabilities || PROVIDER_CAPABILITIES[formData.provider] || {};
    return capabilities.supportsImport === true;
  }, [formData.provider, formData.capabilities]);

  useEffect(() => {
    if (systemId) {
      loadSystemData();
    }
  }, [systemId]);

  const loadSystemData = async () => {
    setInitialLoading(true);
    try {
      const system = await externalSystemsService.getExternalSystem(systemId);
      if (!system) throw new Error('System not found');

      setFormData({
        code: system.code || '',
        name: system.name || '',
        type: system.type || 'SIMRS',
        provider: system.provider || 'generic',
        vendor: system.vendor || '',
        version: system.version || '',
        facility_code: system.facility_code || '',
        facility_name: system.facility_name || '',
        is_active: system.is_active !== false,
        connection: {
          baseUrl: system.connection?.baseUrl || '',
          authType: system.connection?.authType || 'none',
          apiKey: system.connection?.apiKey || '',
          username: system.connection?.username || '',
          password: system.connection?.password || '',
          token: system.connection?.token || '',
          timeoutMs: system.connection?.timeoutMs || 30000,
          healthPath: system.connection?.healthPath || '/health',
        },
        capabilities: system.capabilities || PROVIDER_CAPABILITIES[system.provider] || PROVIDER_CAPABILITIES.generic,
      });

      // Track if credentials exist for placeholders
      setHasApiKey(system.has_api_key || !!system.connection?.apiKey);
      setHasPassword(system.has_password || !!system.connection?.password);
      setHasSecretKey(system.has_secret_key || !!system.connection?.secretKey);
    } catch (err) {
      notify({ type: 'error', message: 'Failed to load system data', detail: err.message });
    } finally {
      setInitialLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (validationErrors[field]) setValidationErrors(prev => ({ ...prev, [field]: null }));
  };

  const handleConnectionChange = (field, value) => {
    setFormData(prev => ({ ...prev, connection: { ...prev.connection, [field]: value } }));
    if (validationErrors[field]) setValidationErrors(prev => ({ ...prev, [field]: null }));
  };

  const handleAuthTypeChange = (authType) => {
    setFormData(prev => ({
      ...prev,
      connection: {
        ...prev.connection,
        authType,
        apiKey: '',
        username: '',
        password: '',
        token: '',
        consId: '',
        secretKey: '',
      },
    }));
    setValidationErrors(prev => ({ ...prev, apiKey: null, username: null, password: null, token: null, consId: null, secretKey: null }));
  };

  const handleProviderChange = (provider) => {
    const capabilities = PROVIDER_CAPABILITIES[provider] || PROVIDER_CAPABILITIES.generic;
    setFormData(prev => ({ ...prev, provider, capabilities }));
  };

  const handleSave = async () => {
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      notify({ type: 'error', message: 'Validation Failed', detail: 'Please check the form for errors.' });
      return;
    }

    setLoading(true);
    setValidationErrors({});

    try {
      const payload = {
        code: formData.code,
        name: formData.name,
        type: formData.type,
        provider: formData.provider,
        vendor: formData.vendor,
        version: formData.version,
        facility_code: formData.facility_code,
        facility_name: formData.facility_name,
        is_active: formData.is_active,
        connection: formData.connection,
        capabilities: formData.capabilities,
      };

      if (systemId) {
        await externalSystemsService.updateExternalSystem(systemId, payload);
        notify({ type: 'success', message: 'System Updated', detail: 'External system configuration updated successfully.' });
      } else {
        await externalSystemsService.createExternalSystem(payload);
        notify({ type: 'success', message: 'System Created', detail: 'New external system added successfully.' });
      }
      onSave();
    } catch (err) {
      notify({ type: 'error', message: 'Save Failed', detail: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this external system? This will also delete all associated mappings.')) return;

    setLoading(true);
    try {
      await externalSystemsService.deleteExternalSystem(systemId);
      notify({ type: 'success', message: 'System Deleted', detail: 'External system removed successfully.' });
      onBack();
    } catch (err) {
      notify({ type: 'error', message: 'Delete Failed', detail: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (useDirect = false) => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      if (!formData.connection.baseUrl) throw new Error('Base URL is required');

      let result;
      if (useDirect || isUsingFallback) {
        // Direct browser-to-server connection test
        result = await testConnectionDirect(formData.connection);
      } else if (isMockMode) {
        result = await externalSystemsService.testConnection(systemId || 'new', formData.connection);
      } else {
        result = await testRealConnection(systemId || 'new', formData.connection);
      }

      setTestResult(result);
      if (result.success) {
        notify({ type: 'success', message: 'Connection Successful', detail: result.message });
      } else {
        notify({ type: 'error', message: 'Connection Failed', detail: result.error });
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: err.message || 'Connection test failed',
        suggestion: 'Check if the server is running and the URL is correct',
      });
      notify({ type: 'error', message: 'Connection Error', detail: err.message });
    } finally {
      setTestingConnection(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const currentCapabilities = formData.capabilities || PROVIDER_CAPABILITIES[formData.provider] || {};

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
              title="Back to List"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h2 className="text-2xl font-bold text-gray-900">
              {systemId ? 'Edit External System' : 'New External System'}
            </h2>
          </div>

          <div className="flex items-center gap-2 pl-9">
            {isMockMode && (
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">
                Mock Mode
              </span>
            )}
            {formData.code && (
              <span className="text-sm text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded">
                {formData.code}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 font-medium transition-colors"
          >
            Cancel
          </button>

          {systemId && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 font-medium transition-colors"
            >
              Delete
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm shadow-blue-600/20 font-medium transition-all flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                Saving...
              </>
            ) : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-6 rounded-t-xl shadow-sm">
        <div className="flex gap-6 overflow-x-auto">
          <TabButton
            active={activeTab === TABS.CONNECTION}
            onClick={() => setActiveTab(TABS.CONNECTION)}
            label="Connection"
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          {systemId && showProviderTabs && (
            <>
              <TabButton
                active={activeTab === TABS.MAPPINGS}
                onClick={() => setActiveTab(TABS.MAPPINGS)}
                label="Mappings"
              />
              <TabButton
                active={activeTab === TABS.ORDER_BROWSER}
                onClick={() => setActiveTab(TABS.ORDER_BROWSER)}
                label="Order Browser"
              />
              <TabButton
                active={activeTab === TABS.IMPORT_HISTORY}
                onClick={() => setActiveTab(TABS.IMPORT_HISTORY)}
                label="Import History"
              />
              <TabButton
                active={activeTab === TABS.AUDIT_LOG}
                onClick={() => setActiveTab(TABS.AUDIT_LOG)}
                label="Audit Log"
              />
            </>
          )}
        </div>
      </div>

      {/* Connection Tab Content */}
      {activeTab === TABS.CONNECTION && (
        <div className="space-y-6">

          {/* Main Info Card */}
          <div className="bg-white rounded-b-xl rounded-t-sm shadow-sm border border-gray-200 border-t-0 p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* Left Column: Core Info */}
              <div className="lg:col-span-2 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Core Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FormField label="System Code" required error={validationErrors.code} hint="Unique identifier, e.g. KHANZA_MAIN">
                      <input
                        type="text"
                        value={formData.code}
                        onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                        className="form-input"
                        disabled={!!systemId}
                        placeholder="e.g. KHANZA_01"
                      />
                    </FormField>

                    <FormField label="System Name" required error={validationErrors.name}>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="form-input"
                        placeholder="e.g. Main Hospital SIMRS"
                      />
                    </FormField>

                    <FormField label="System Type" required error={validationErrors.type}>
                      <select
                        value={formData.type}
                        onChange={(e) => handleInputChange('type', e.target.value)}
                        className="form-select"
                      >
                        {SYSTEM_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </FormField>

                    <FormField label="Provider" required error={validationErrors.provider} hint="Determines adapter capabilities">
                      <select
                        value={formData.provider}
                        onChange={(e) => handleProviderChange(e.target.value)}
                        className="form-select"
                      >
                        {Object.entries(PROVIDER_CAPABILITIES).map(([key, cap]) => (
                          <option key={key} value={key}>{cap.name}</option>
                        ))}
                      </select>
                    </FormField>

                    <FormField label="Vendor">
                      <input
                        type="text"
                        value={formData.vendor}
                        onChange={(e) => handleInputChange('vendor', e.target.value)}
                        className="form-input"
                        placeholder="e.g. Vendor Name"
                      />
                    </FormField>

                    <FormField label="Version">
                      <input
                        type="text"
                        value={formData.version}
                        onChange={(e) => handleInputChange('version', e.target.value)}
                        className="form-input"
                        placeholder="e.g. 1.0.0"
                      />
                    </FormField>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Connection Settings</h3>
                  <div className="space-y-4">
                    <FormField label="Base URL" required error={validationErrors.baseUrl}>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        </span>
                        <input
                          type="url"
                          value={formData.connection.baseUrl}
                          onChange={(e) => handleConnectionChange('baseUrl', e.target.value)}
                          className="form-input !pl-10"
                          placeholder="https://api.hospital.com"
                        />
                      </div>
                    </FormField>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <FormField label="Authentication Type" required>
                        <select
                          value={formData.connection.authType}
                          onChange={(e) => handleAuthTypeChange(e.target.value)}
                          className="form-select"
                        >
                          {AUTH_TYPES.map(auth => (
                            <option key={auth.value} value={auth.value}>{auth.label}</option>
                          ))}
                        </select>
                      </FormField>

                      <FormField label="Timeout (ms)">
                        <input
                          type="number"
                          value={formData.connection.timeoutMs}
                          onChange={(e) => handleConnectionChange('timeoutMs', parseInt(e.target.value) || 30000)}
                          className="form-input"
                        />
                      </FormField>
                    </div>

                    {/* Auth Specific Fields */}
                    <div className="bg-gray-50 p-5 rounded-lg border border-gray-100">
                      {formData.connection.authType === 'none' && (
                        <p className="text-sm text-gray-500 italic">No authentication credentials required.</p>
                      )}

                      {formData.connection.authType === 'api_key' && (
                        <FormField label="API Key" required={!hasApiKey} error={validationErrors.apiKey}>
                          <input
                            type="password"
                            value={formData.connection.apiKey}
                            onChange={(e) => handleConnectionChange('apiKey', e.target.value)}
                            className="form-input"
                            placeholder={hasApiKey ? "Leave empty to keep existing API Key" : "Enter API Key"}
                          />
                          {hasApiKey && !formData.connection.apiKey && (
                            <p className="text-green-600 text-xs mt-1">✓ API Key is already configured</p>
                          )}
                        </FormField>
                      )}

                      {formData.connection.authType === 'basic' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField label="Username" required error={validationErrors.username}>
                            <input
                              type="text"
                              value={formData.connection.username}
                              onChange={(e) => handleConnectionChange('username', e.target.value)}
                              className="form-input"
                            />
                          </FormField>
                          <FormField label="Password" required={!hasPassword} error={validationErrors.password}>
                            <div className="relative">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                value={formData.connection.password}
                                onChange={(e) => handleConnectionChange('password', e.target.value)}
                                className="form-input"
                                placeholder={hasPassword ? "Leave empty to keep existing password" : "Enter password"}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                              >
                                {showPassword ? '🙈' : '👁️'}
                              </button>
                            </div>
                            {hasPassword && !formData.connection.password && (
                              <p className="text-green-600 text-xs mt-1">✓ Password is already configured</p>
                            )}
                          </FormField>
                        </div>
                      )}

                      {(formData.connection.authType === 'bearer' || formData.connection.authType === 'jwt') && (
                        <FormField label="Token" required error={validationErrors.token}>
                          <textarea
                            value={formData.connection.token}
                            onChange={(e) => handleConnectionChange('token', e.target.value)}
                            className="form-input"
                            rows="3"
                            placeholder="Paste token here"
                          />
                        </FormField>
                      )}

                      {formData.connection.authType === 'bpjs' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField label="Consumer ID" required error={validationErrors.consId}>
                            <input
                              type="text"
                              value={formData.connection.consId}
                              onChange={(e) => handleConnectionChange('consId', e.target.value)}
                              className="form-input"
                              placeholder="Enter Consumer ID"
                            />
                          </FormField>
                          <FormField label="Secret Key" required={!hasSecretKey} error={validationErrors.secretKey}>
                            <div className="relative">
                              <input
                                type={showSecretKey ? 'text' : 'password'}
                                value={formData.connection.secretKey}
                                onChange={(e) => handleConnectionChange('secretKey', e.target.value)}
                                className="form-input"
                                placeholder={hasSecretKey ? "Leave empty to keep existing secret key" : "Enter secret key"}
                              />
                              <button
                                type="button"
                                onClick={() => setShowSecretKey(!showSecretKey)}
                                className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                              >
                                {showSecretKey ? '🙈' : '👁️'}
                              </button>
                            </div>
                            {hasSecretKey && !formData.connection.secretKey && (
                              <p className="text-green-600 text-xs mt-1">✓ Secret Key is already configured</p>
                            )}
                          </FormField>
                        </div>
                      )}
                    </div>

                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Connection Test</h4>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => handleTestConnection(false)}
                          disabled={testingConnection || !formData.connection.baseUrl}
                          className="btn-secondary flex items-center gap-2"
                        >
                          {testingConnection ? (<span className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full"></span>) : (<span>⚡</span>)}
                          Test Backend Connection
                        </button>

                        <button
                          onClick={() => handleTestConnection(true)}
                          disabled={testingConnection || !formData.connection.baseUrl}
                          className="btn-secondary flex items-center gap-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700 border-indigo-200"
                          title="Test directly from browser (bypasses backend)"
                        >
                          {testingConnection ? (<span className="animate-spin h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full"></span>) : (<span>🔗</span>)}
                          Direct Browser Test
                        </button>
                      </div>

                      {testResult && (
                        <div className={`mt-4 p-4 rounded-lg border flex items-start gap-3 ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                          }`}>
                          <div className={`mt-0.5 ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                            {testResult.success
                              ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            }
                          </div>
                          <div>
                            <p className={`font-medium ${testResult.success ? 'text-green-900' : 'text-red-900'}`}>
                              {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                            </p>
                            {testResult.message && <p className="text-sm mt-1 opacity-90">{testResult.message}</p>}
                            {testResult.responseTime && <p className="text-xs mt-1 opacity-75">Latency: {Math.round(testResult.responseTime)}ms</p>}
                            {testResult.error && <p className="text-sm mt-1 text-red-700">{testResult.error}</p>}
                            {testResult.suggestion && <p className="text-sm mt-2 text-gray-600 bg-white/50 p-2 rounded">💡 {testResult.suggestion}</p>}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              </div>

              {/* Right Column: Additional Info & Status */}
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">Status</h3>
                  <div className="space-y-3">
                    <label className="flex items-center p-3 bg-white rounded border border-gray-200 cursor-pointer hover:border-blue-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => handleInputChange('is_active', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div className="ml-3">
                        <span className="block text-sm font-medium text-gray-900">System Active</span>
                        <span className="block text-xs text-gray-500">Enable or disable this integration</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-5 border border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">Facility & Context</h3>
                  <div className="space-y-4">
                    <FormField label="Facility Code">
                      <input
                        type="text"
                        value={formData.facility_code}
                        onChange={(e) => handleInputChange('facility_code', e.target.value)}
                        className="form-input bg-white"
                        placeholder="e.g. MAIN"
                      />
                    </FormField>
                    <FormField label="Facility Name">
                      <input
                        type="text"
                        value={formData.facility_name}
                        onChange={(e) => handleInputChange('facility_name', e.target.value)}
                        className="form-input bg-white"
                        placeholder="e.g. Main Hospital"
                      />
                    </FormField>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-5 border border-blue-100">
                  <h3 className="text-sm font-semibold text-blue-900 mb-3 uppercase tracking-wider">Provider Capabilities</h3>
                  <p className="text-xs text-blue-700 mb-4 leading-relaxed">{PROVIDER_CAPABILITIES[formData.provider]?.description}</p>
                  <div className="space-y-2">
                    <CapabilityRow label="Order Browser" enabled={currentCapabilities.hasOrderBrowser} />
                    <CapabilityRow label="Patient Lookup" enabled={currentCapabilities.hasPatientLookup} />
                    <CapabilityRow label="Procedure Search" enabled={currentCapabilities.hasProcedureSearch} />
                    <CapabilityRow label="Doctor Lookup" enabled={currentCapabilities.hasDoctorLookup} />
                    <CapabilityRow label="Data Import" enabled={currentCapabilities.supportsImport} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other Tabs */}
      {activeTab === TABS.MAPPINGS && systemId && (
        <MappingsTab systemId={systemId} disabled={loading} />
      )}

      {activeTab === TABS.ORDER_BROWSER && systemId && (
        currentCapabilities.hasOrderBrowser ? (
          <OrderBrowserTab systemId={systemId} disabled={loading} />
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900">Not Supported</h3>
            <p className="text-gray-500 mt-2">The selected provider ({PROVIDER_CAPABILITIES[formData.provider]?.name}) does not support order browsing.</p>
          </div>
        )
      )}

      {activeTab === TABS.IMPORT_HISTORY && systemId && (
        <ImportHistoryTab systemId={systemId} disabled={loading} />
      )}

      {activeTab === TABS.AUDIT_LOG && systemId && (
        <AuditLogTab systemId={systemId} disabled={loading} />
      )}


      {/* CSS Utility for Form Fields (Scope-local styles) */}
      <style>{`
        .form-input, .form-select, .form-textarea {
           width: 100%;
           padding: 0.5rem 0.75rem;
           background-color: #fff;
           border: 1px solid #d1d5db;
           border-radius: 0.5rem;
           font-size: 0.875rem;
           line-height: 1.25rem;
           color: #111827;
           transition: all 0.15s ease-in-out;
        }
        .form-input:focus, .form-select:focus {
           outline: none;
           ring: 2px;
           ring-color: #3b82f6;
           border-color: #3b82f6;
        }
        .form-input:disabled {
           background-color: #f3f4f6;
           color: #6b7280;
           cursor: not-allowed;
        }
        .btn-secondary {
           padding: 0.5rem 1rem;
           background-color: white;
           border: 1px solid #d1d5db;
           color: #374151;
           font-size: 0.875rem;
           font-weight: 500;
           border-radius: 0.5rem;
           transition: all 0.15s;
        }
        .btn-secondary:hover:not(:disabled) {
           background-color: #f9fafb;
           border-color: #9ca3af;
        }
        .btn-secondary:disabled {
           opacity: 0.5;
           cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

// Components

function TabButton({ active, onClick, label, icon }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-4 font-medium text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${active
        ? 'text-blue-600'
        : 'text-gray-500 hover:text-gray-800'
        }`}
    >
      {icon}
      {label}
      {active && (
        <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></span>
      )}
    </button>
  );
}

function FormField({ label, required, error, hint, children }) {
  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500 font-medium">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function CapabilityRow({ label, enabled }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-blue-800">{label}</span>
      {enabled
        ? <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">Supported</span>
        : <span className="text-xs font-medium text-gray-400">Not Supported</span>
      }
    </div>
  );
}
