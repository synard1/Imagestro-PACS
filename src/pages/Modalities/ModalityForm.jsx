import React, { useState, useEffect } from 'react';

/**
 * ModalityForm Component
 * Form for creating and editing DICOM modalities
 */
const MODALITY_TYPES = [
  'CT', 'MR', 'US', 'CR', 'DR', 'DX', 'XA', 'MG', 'NM', 'PT', 'RF', 'OT'
];

export default function ModalityForm({
  modality = null,
  onSubmit = () => {},
  onCancel = () => {},
  loading = false,
}) {
  const isEdit = !!modality;

  const [formData, setFormData] = useState({
    ae_title: '',
    name: '',
    description: '',
    host: '',
    port: 104,
    modality: '',
    manufacturer: '',
    model: '',
    supports_c_store: true,
    supports_c_find: true,
    supports_c_move: true,
    supports_c_echo: true,
    require_authentication: false,
    username: '',
    password: '',
    is_active: true,
  });

  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  // Load modality data if editing
  useEffect(() => {
    if (modality) {
      setFormData({
        ae_title: modality.ae_title || '',
        name: modality.name || '',
        description: modality.description || '',
        host: modality.host || '',
        port: modality.port || 104,
        modality: modality.modality || '',
        manufacturer: modality.manufacturer || '',
        model: modality.model || '',
        supports_c_store: modality.supports_c_store !== false,
        supports_c_find: modality.supports_c_find !== false,
        supports_c_move: modality.supports_c_move !== false,
        supports_c_echo: modality.supports_c_echo !== false,
        require_authentication: modality.require_authentication || false,
        username: modality.username || '',
        password: '', // Never populate password
        is_active: modality.is_active !== false,
      });
    }
  }, [modality]);

  const validateForm = () => {
    const newErrors = {};

    // AE Title
    if (!formData.ae_title?.trim()) {
      newErrors.ae_title = 'AE Title is required';
    } else if (formData.ae_title.length > 16) {
      newErrors.ae_title = 'AE Title must be 16 characters or less';
    } else if (!/^[A-Z0-9_-]+$/.test(formData.ae_title)) {
      newErrors.ae_title = 'AE Title can only contain uppercase letters, numbers, underscores, and hyphens';
    }

    // Name
    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required';
    }

    // Host
    if (!formData.host?.trim()) {
      newErrors.host = 'Host is required';
    } else if (!/^[a-zA-Z0-9._-]+$/.test(formData.host)) {
      newErrors.host = 'Invalid hostname or IP address';
    }

    // Port
    if (!formData.port) {
      newErrors.port = 'Port is required';
    } else if (formData.port < 1 || formData.port > 65535) {
      newErrors.port = 'Port must be between 1 and 65535';
    }

    // Modality Type
    if (!formData.modality) {
      newErrors.modality = 'Modality type is required';
    }

    // Authentication fields (conditional)
    if (formData.require_authentication) {
      if (!formData.username?.trim()) {
        newErrors.username = 'Username is required when authentication is enabled';
      }
      if (!formData.password?.trim()) {
        newErrors.password = 'Password is required when authentication is enabled';
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
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      // Prepare payload - exclude empty password to avoid overwriting
      const payload = { ...formData };
      if (!payload.password) {
        delete payload.password;
      }
      onSubmit(payload);
    }
  };

  const inputClass = (field) => `
    w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500
    ${errors[field] ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}
  `;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-4">
          {/* AE Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              AE Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.ae_title}
              onChange={(e) => handleChange('ae_title', e.target.value.toUpperCase())}
              placeholder="e.g., CT_ROOM1"
              className={inputClass('ae_title')}
              disabled={isEdit} // AE title should not be changed after creation
              maxLength={16}
            />
            {errors.ae_title && (
              <p className="mt-1 text-sm text-red-600">{errors.ae_title}</p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., CT Scanner 1"
              className={inputClass('name')}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Host */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Host <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.host}
              onChange={(e) => handleChange('host', e.target.value)}
              placeholder="e.g., 10.10.10.21 or modality.hospital.local"
              className={inputClass('host')}
            />
            {errors.host && (
              <p className="mt-1 text-sm text-red-600">{errors.host}</p>
            )}
          </div>

          {/* Port */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Port <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={formData.port}
              onChange={(e) => handleChange('port', parseInt(e.target.value, 10) || 104)}
              min={1}
              max={65535}
              placeholder="104"
              className={inputClass('port')}
            />
            {errors.port && (
              <p className="mt-1 text-sm text-red-600">{errors.port}</p>
            )}
          </div>

          {/* Modality Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Modality Type <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.modality}
              onChange={(e) => handleChange('modality', e.target.value)}
              className={inputClass('modality')}
            >
              <option value="">Select modality type...</option>
              {MODALITY_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            {errors.modality && (
              <p className="mt-1 text-sm text-red-600">{errors.modality}</p>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Manufacturer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Manufacturer
            </label>
            <input
              type="text"
              value={formData.manufacturer}
              onChange={(e) => handleChange('manufacturer', e.target.value)}
              placeholder="e.g., Siemens, GE, Philips"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model
            </label>
            <input
              type="text"
              value={formData.model}
              onChange={(e) => handleChange('model', e.target.value)}
              placeholder="e.g., Somatom Force"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Supported Operations */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Supported DICOM Operations
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'supports_c_store', label: 'C-STORE' },
                { key: 'supports_c_find', label: 'C-FIND' },
                { key: 'supports_c_move', label: 'C-MOVE' },
                { key: 'supports_c_echo', label: 'C-ECHO' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData[key]}
                    onChange={(e) => handleChange(key, e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Authentication Toggle */}
          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.require_authentication}
                onChange={(e) => handleChange('require_authentication', e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Require Authentication
              </span>
            </label>
          </div>

          {/* Authentication Fields (conditional) */}
          {formData.require_authentication && (
            <div className="space-y-4 ml-6 border-l-2 border-blue-100 pl-4">
              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleChange('username', e.target.value)}
                  placeholder="DICOM username"
                  className={inputClass('username')}
                />
                {errors.username && (
                  <p className="mt-1 text-sm text-red-600">{errors.username}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {!isEdit && <span className="text-red-500">*</span>}
                  {isEdit && <span className="text-gray-500 text-xs ml-1">(leave blank to keep current)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    placeholder={isEdit ? 'Enter new password to change' : 'DICOM password'}
                    className={inputClass('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm"
                    tabIndex={-1}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                )}
              </div>
            </div>
          )}

          {/* Active Status */}
          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => handleChange('is_active', e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Active
              </span>
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Inactive modalities will not be available for scheduling or DICOM operations
            </p>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 font-medium"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : isEdit ? 'Update Modality' : 'Create Modality'}
        </button>
      </div>
    </form>
  );
}
