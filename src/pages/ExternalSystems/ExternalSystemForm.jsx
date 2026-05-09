/**
 * External Systems Form Component
 * Reusable form for creating and editing external systems
 */

import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';

const SYSTEM_TYPES = ['SIMRS', 'HIS', 'RIS', 'PACS', 'LIS', 'EMR'];
const PROVIDERS = ['khanza', 'gos', 'generic'];
const AUTH_TYPES = ['none', 'api_key', 'basic', 'bearer', 'jwt', 'bpjs'];

export default function ExternalSystemForm({
  system = null,
  onSubmit = () => {},
  onCancel = () => {},
  loading = false,
}) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'SIMRS',
    provider: 'generic',
    vendor: '',
    version: '',
    base_url: '',
    auth_type: 'none',
    api_key: '',
    username: '',
    password: '',
    cons_id: '',
    secret_key: '',
    timeout_ms: 30000,
    health_path: '/health',
    facility_code: '',
    facility_name: '',
    is_active: true,
  });

  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  // Track if credentials are set (for showing placeholder)
  const [hasExistingApiKey, setHasExistingApiKey] = useState(false);
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [hasExistingSecretKey, setHasExistingSecretKey] = useState(false);

  // Load system data if editing
  useEffect(() => {
    if (system) {
      setFormData({
        code: system.code || '',
        name: system.name || '',
        type: system.type || 'SIMRS',
        provider: system.provider || 'generic',
        vendor: system.vendor || '',
        version: system.version || '',
        base_url: system.base_url || '',
        auth_type: system.auth_type || 'none',
        api_key: '', // Don't populate - will be re-entered if changing
        username: system.username || '',
        password: '', // Don't populate - will be re-entered if changing
        cons_id: system.cons_id || '',
        secret_key: '', // Don't populate - will be re-entered if changing
        timeout_ms: system.timeout_ms || 30000,
        health_path: system.health_path || '/health',
        facility_code: system.facility_code || '',
        facility_name: system.facility_name || '',
        is_active: system.is_active !== false,
      });
      // Track if credentials exist
      setHasExistingApiKey(system.has_api_key || false);
      setHasExistingPassword(system.has_password || false);
      setHasExistingSecretKey(system.has_secret_key || false);
    }
  }, [system]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.code?.trim()) {
      newErrors.code = 'Code is required';
    } else if (!/^[A-Z0-9_-]+$/i.test(formData.code)) {
      newErrors.code = 'Code must contain only letters, numbers, underscores, and hyphens';
    }

    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.type) {
      newErrors.type = 'Type is required';
    }

    if (!formData.provider) {
      newErrors.provider = 'Provider is required';
    }

    if (!formData.base_url?.trim()) {
      newErrors.base_url = 'Base URL is required';
    } else {
      try {
        new URL(formData.base_url);
      } catch {
        newErrors.base_url = 'Invalid URL format';
      }
    }

    // Only require credentials if creating new or no existing credentials
    if (formData.auth_type === 'api_key' && !formData.api_key?.trim() && !hasExistingApiKey) {
      newErrors.api_key = 'API Key is required';
    }

    if (formData.auth_type === 'basic') {
      if (!formData.username?.trim()) {
        newErrors.username = 'Username is required';
      }
      if (!formData.password?.trim() && !hasExistingPassword) {
        newErrors.password = 'Password is required';
      }
    }

    if (formData.auth_type === 'bpjs') {
      if (!formData.cons_id?.trim()) {
        newErrors.cons_id = 'Consumer ID is required';
      }
      if (!formData.secret_key?.trim() && !hasExistingSecretKey) {
        newErrors.secret_key = 'Secret Key is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      // Only include credentials if they were entered
      const submitData = { ...formData };
      
      // Remove empty credentials to avoid overwriting existing ones
      if (!submitData.api_key) {
        delete submitData.api_key;
      }
      if (!submitData.password) {
        delete submitData.password;
      }
      if (!submitData.secret_key) {
        delete submitData.secret_key;
      }
      
      console.log('[ExternalSystemForm] Submitting form data:', submitData);
      onSubmit(submitData);
    }
  };


  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              System Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
              placeholder="e.g., KHANZA_01"
              disabled={!!system}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.code ? 'border-red-500' : 'border-gray-300'
              } ${system ? 'bg-gray-100' : ''}`}
            />
            {errors.code && <p className="text-red-500 text-sm mt-1">{errors.code}</p>}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              System Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., Khanza SIMRS - Main Hospital"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              System Type <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SYSTEM_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            {errors.type && <p className="text-red-500 text-sm mt-1">{errors.type}</p>}
          </div>

          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Provider <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.provider}
              onChange={(e) => handleChange('provider', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PROVIDERS.map(provider => (
                <option key={provider} value={provider}>{provider}</option>
              ))}
            </select>
            {errors.provider && <p className="text-red-500 text-sm mt-1">{errors.provider}</p>}
          </div>

          {/* Vendor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
            <input
              type="text"
              value={formData.vendor}
              onChange={(e) => handleChange('vendor', e.target.value)}
              placeholder="e.g., PT Khanza Indonesia"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Version */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
            <input
              type="text"
              value={formData.version}
              onChange={(e) => handleChange('version', e.target.value)}
              placeholder="e.g., 2.5.0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Active Status */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => handleChange('is_active', e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="ml-2 text-sm text-gray-700">Active</span>
          </label>
        </div>
      </div>

      {/* Facility Information */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Facility Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Facility Code</label>
            <input
              type="text"
              value={formData.facility_code}
              onChange={(e) => handleChange('facility_code', e.target.value)}
              placeholder="e.g., MAIN"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Facility Name</label>
            <input
              type="text"
              value={formData.facility_name}
              onChange={(e) => handleChange('facility_name', e.target.value)}
              placeholder="e.g., Main Hospital"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Connection Settings */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Connection Settings</h3>

        {/* Base URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Base URL <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            value={formData.base_url}
            onChange={(e) => handleChange('base_url', e.target.value)}
            placeholder="https://simrs.example.com/api"
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.base_url ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.base_url && <p className="text-red-500 text-sm mt-1">{errors.base_url}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Auth Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Authentication Type</label>
            <select
              value={formData.auth_type}
              onChange={(e) => handleChange('auth_type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {AUTH_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Timeout */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timeout (ms)</label>
            <input
              type="number"
              value={formData.timeout_ms}
              onChange={(e) => handleChange('timeout_ms', parseInt(e.target.value) || 30000)}
              min="1000"
              max="120000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Auth Type Specific Fields */}
        {formData.auth_type === 'api_key' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              API Key {!hasExistingApiKey && <span className="text-red-500">*</span>}
            </label>
            <input
              type="password"
              value={formData.api_key}
              onChange={(e) => handleChange('api_key', e.target.value)}
              placeholder={hasExistingApiKey ? "Leave empty to keep existing API Key" : "Enter API Key"}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.api_key ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {hasExistingApiKey && !formData.api_key && (
              <p className="text-green-600 text-sm mt-1">✓ API Key is already configured</p>
            )}
            {errors.api_key && <p className="text-red-500 text-sm mt-1">{errors.api_key}</p>}
          </div>
        )}

        {formData.auth_type === 'basic' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => handleChange('username', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.username ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.username && <p className="text-red-500 text-sm mt-1">{errors.username}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password {!hasExistingPassword && <span className="text-red-500">*</span>}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder={hasExistingPassword ? "Leave empty to keep existing password" : "Enter password"}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.password ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {hasExistingPassword && !formData.password && (
                <p className="text-green-600 text-sm mt-1">✓ Password is already configured</p>
              )}
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
            </div>
          </div>
        )}

        {formData.auth_type === 'bpjs' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Consumer ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.cons_id}
                onChange={(e) => handleChange('cons_id', e.target.value)}
                placeholder="Enter Consumer ID"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.cons_id ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.cons_id && <p className="text-red-500 text-sm mt-1">{errors.cons_id}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Secret Key {!hasExistingSecretKey && <span className="text-red-500">*</span>}
              </label>
              <div className="relative">
                <input
                  type={showSecretKey ? 'text' : 'password'}
                  value={formData.secret_key}
                  onChange={(e) => handleChange('secret_key', e.target.value)}
                  placeholder={hasExistingSecretKey ? "Leave empty to keep existing secret key" : "Enter secret key"}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.secret_key ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                >
                  {showSecretKey ? '🙈' : '👁️'}
                </button>
              </div>
              {hasExistingSecretKey && !formData.secret_key && (
                <p className="text-green-600 text-sm mt-1">✓ Secret Key is already configured</p>
              )}
              {errors.secret_key && <p className="text-red-500 text-sm mt-1">{errors.secret_key}</p>}
            </div>
          </div>
        )}

        {/* Health Path */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Health Check Path</label>
          <input
            type="text"
            value={formData.health_path}
            onChange={(e) => handleChange('health_path', e.target.value)}
            placeholder="/health"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
              Saving...
            </>
          ) : (
            system ? 'Update System' : 'Create System'
          )}
        </button>
      </div>
    </form>
  );
}
