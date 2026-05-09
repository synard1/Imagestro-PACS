import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PhotoIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ArrowPathIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import {
  REPORT_TYPES,
  getReportSettings,
  getAllReportSettings,
  saveReportSettings,
  saveAllReportSettings,
  resetReportSettings,
  getCompanyProfile,
  exportSettings,
  importSettings
} from '../../services/reportSettingsService';

export default function ReportSettings() {
  const navigate = useNavigate();
  const [activeReportType, setActiveReportType] = useState(REPORT_TYPES.MEDICAL);
  const [allSettings, setAllSettings] = useState(null);
  const [settings, setSettings] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadAllSettings();
    loadCompanyProfile();
  }, []);

  useEffect(() => {
    if (allSettings) {
      setSettings(allSettings[activeReportType]);
    }
  }, [activeReportType, allSettings]);

  const loadAllSettings = () => {
    const loaded = getAllReportSettings();
    setAllSettings(loaded);
    setSettings(loaded[activeReportType]);
  };

  const loadCompanyProfile = () => {
    const profile = getCompanyProfile();
    setCompanyProfile(profile);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Update current type settings
      const updatedAllSettings = {
        ...allSettings,
        [activeReportType]: settings
      };
      
      const result = saveAllReportSettings(updatedAllSettings);
      if (result.success) {
        setAllSettings(updatedAllSettings);
        setMessage({ type: 'success', text: `${getReportTypeName(activeReportType)} settings saved successfully!` });
      } else {
        setMessage({ type: 'error', text: 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const getReportTypeName = (type) => {
    const names = {
      [REPORT_TYPES.MEDICAL]: 'Medical Report',
      [REPORT_TYPES.STATISTICAL]: 'Statistical Report',
      [REPORT_TYPES.ADMINISTRATIVE]: 'Administrative Report',
      [REPORT_TYPES.CUSTOM]: 'Custom Report'
    };
    return names[type] || 'Report';
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset to default settings?')) {
      resetReportSettings();
      loadSettings();
      setMessage({ type: 'success', text: 'Settings reset to default' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Logo and company info managed in main Settings page

  const handleExport = () => {
    exportSettings();
    setMessage({ type: 'success', text: 'Settings exported!' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const imported = await importSettings(file);
      setSettings(imported);
      setMessage({ type: 'success', text: 'Settings imported successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Report Settings</h1>
                <p className="text-sm text-gray-600">Configure report header and footer</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Export */}
              <button
                onClick={handleExport}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                title="Export Settings"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
                Export
              </button>

              {/* Import */}
              <label className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 cursor-pointer">
                <ArrowUpTrayIcon className="h-5 w-5" />
                Import
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>

              {/* Reset */}
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                title="Reset to Default"
              >
                <ArrowPathIcon className="h-5 w-5" />
                Reset
              </button>

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <CheckIcon className="h-5 w-5" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Report Type Tabs */}
          <div className="mt-6 flex space-x-2 border-b border-gray-200">
            {Object.values(REPORT_TYPES).map((type) => (
              <button
                key={type}
                onClick={() => setActiveReportType(type)}
                className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                  activeReportType === type
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {getReportTypeName(type)}
              </button>
            ))}
          </div>

          {/* Message */}
          {message && (
            <div className={`mt-4 p-3 rounded-lg ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {message.text}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Header Settings */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Header Settings</h2>

            {/* Company Info Display */}
            {companyProfile && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <span className="text-2xl">ℹ️</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-blue-900 mb-2">
                      Company Information
                    </h3>
                    <div className="text-xs text-blue-800 space-y-1">
                      <div><strong>Name:</strong> {companyProfile.name || 'Not set'}</div>
                      <div><strong>Address:</strong> {companyProfile.address || 'Not set'}</div>
                      <div><strong>Phone:</strong> {companyProfile.phone || 'Not set'}</div>
                      <div><strong>Email:</strong> {companyProfile.email || 'Not set'}</div>
                      {companyProfile.logoUrl && (
                        <div><strong>Logo:</strong> Configured ✓</div>
                      )}
                    </div>
                    <div className="mt-3">
                      <button
                        onClick={() => navigate('/settings')}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        Edit in Main Settings →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Enable Header */}
            <div className="mb-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.header.enabled}
                  onChange={(e) => setSettings({
                    ...settings,
                    header: { ...settings.header, enabled: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Enable Header</span>
              </label>
            </div>

            {settings.header.enabled && (
              <>
                {/* Show Logo */}
                <div className="mb-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.header.showLogo}
                      onChange={(e) => setSettings({
                        ...settings,
                        header: { ...settings.header, showLogo: e.target.checked }
                      })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Show Company Logo</span>
                  </label>
                </div>

                {/* Show Company Info */}
                <div className="mb-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.header.showCompanyInfo}
                      onChange={(e) => setSettings({
                        ...settings,
                        header: { ...settings.header, showCompanyInfo: e.target.checked }
                      })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Show Company Information</span>
                  </label>
                </div>

                {/* Logo Position */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Logo Position
                  </label>
                  <select
                    value={settings.header.logoPosition}
                    onChange={(e) => setSettings({
                      ...settings,
                      header: { ...settings.header, logoPosition: e.target.value }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>

                {/* Background Color */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Background Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={settings.header.backgroundColor}
                      onChange={(e) => setSettings({
                        ...settings,
                        header: { ...settings.header, backgroundColor: e.target.value }
                      })}
                      className="h-10 w-20 rounded border border-gray-300"
                    />
                    <input
                      type="text"
                      value={settings.header.backgroundColor}
                      onChange={(e) => setSettings({
                        ...settings,
                        header: { ...settings.header, backgroundColor: e.target.value }
                      })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Text Color */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Text Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={settings.header.textColor}
                      onChange={(e) => setSettings({
                        ...settings,
                        header: { ...settings.header, textColor: e.target.value }
                      })}
                      className="h-10 w-20 rounded border border-gray-300"
                    />
                    <input
                      type="text"
                      value={settings.header.textColor}
                      onChange={(e) => setSettings({
                        ...settings,
                        header: { ...settings.header, textColor: e.target.value }
                      })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Font Sizes */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Font Sizes
                  </label>
                  
                  <div className="grid grid-cols-3 gap-3">
                    {/* Company Name Font Size */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        Company Name
                      </label>
                      <input
                        type="number"
                        min="8"
                        max="16"
                        value={settings.header.companyNameFontSize || 10}
                        onChange={(e) => setSettings({
                          ...settings,
                          header: { ...settings.header, companyNameFontSize: parseInt(e.target.value) }
                        })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    {/* Company Details Font Size */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        Company Details
                      </label>
                      <input
                        type="number"
                        min="6"
                        max="12"
                        value={settings.header.companyDetailsFontSize || 7}
                        onChange={(e) => setSettings({
                          ...settings,
                          header: { ...settings.header, companyDetailsFontSize: parseInt(e.target.value) }
                        })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    {/* Title Font Size */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        Report Title
                      </label>
                      <input
                        type="number"
                        min="14"
                        max="24"
                        value={settings.header.titleFontSize || 18}
                        onChange={(e) => setSettings({
                          ...settings,
                          header: { ...settings.header, titleFontSize: parseInt(e.target.value) }
                        })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer Settings */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Footer Settings</h2>

            {/* Enable Footer */}
            <div className="mb-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.footer.enabled}
                  onChange={(e) => setSettings({
                    ...settings,
                    footer: { ...settings.footer, enabled: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Enable Footer</span>
              </label>
            </div>

            {settings.footer.enabled && (
              <>
                {/* Left Text */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Left Text
                  </label>
                  <input
                    type="text"
                    value={settings.footer.leftText}
                    onChange={(e) => setSettings({
                      ...settings,
                      footer: { ...settings.footer, leftText: e.target.value }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Center Text */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Center Text
                  </label>
                  <input
                    type="text"
                    value={settings.footer.centerText}
                    onChange={(e) => setSettings({
                      ...settings,
                      footer: { ...settings.footer, centerText: e.target.value }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Right Text */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Right Text
                    <span className="text-xs text-gray-500 ml-2">
                      Use {'{page}'} and {'{total}'} for page numbers
                    </span>
                  </label>
                  <input
                    type="text"
                    value={settings.footer.rightText}
                    onChange={(e) => setSettings({
                      ...settings,
                      footer: { ...settings.footer, rightText: e.target.value }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Show Timestamp */}
                <div className="mb-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.footer.showTimestamp}
                      onChange={(e) => setSettings({
                        ...settings,
                        footer: { ...settings.footer, showTimestamp: e.target.checked }
                      })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Show Timestamp</span>
                  </label>
                </div>

                {/* Show Page Numbers */}
                <div className="mb-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.footer.showPageNumbers}
                      onChange={(e) => setSettings({
                        ...settings,
                        footer: { ...settings.footer, showPageNumbers: e.target.checked }
                      })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Show Page Numbers</span>
                  </label>
                </div>

                {/* Font Size */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Font Size
                  </label>
                  <input
                    type="number"
                    min="6"
                    max="12"
                    value={settings.footer.fontSize}
                    onChange={(e) => setSettings({
                      ...settings,
                      footer: { ...settings.footer, fontSize: parseInt(e.target.value) }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Text Color */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Text Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={settings.footer.textColor}
                      onChange={(e) => setSettings({
                        ...settings,
                        footer: { ...settings.footer, textColor: e.target.value }
                      })}
                      className="h-10 w-20 rounded border border-gray-300"
                    />
                    <input
                      type="text"
                      value={settings.footer.textColor}
                      onChange={(e) => setSettings({
                        ...settings,
                        footer: { ...settings.footer, textColor: e.target.value }
                      })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Report Settings */}
          <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Settings</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Report Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Report Title
                </label>
                <input
                  type="text"
                  value={settings.report.title}
                  onChange={(e) => setSettings({
                    ...settings,
                    report: { ...settings.report, title: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Title Font Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title Font Size
                </label>
                <input
                  type="number"
                  min="14"
                  max="28"
                  value={settings.report.titleFontSize}
                  onChange={(e) => setSettings({
                    ...settings,
                    report: { ...settings.report, titleFontSize: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Section Font Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Section Font Size
                </label>
                <input
                  type="number"
                  min="10"
                  max="16"
                  value={settings.report.sectionFontSize}
                  onChange={(e) => setSettings({
                    ...settings,
                    report: { ...settings.report, sectionFontSize: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Content Font Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Content Font Size
                </label>
                <input
                  type="number"
                  min="8"
                  max="14"
                  value={settings.report.contentFontSize}
                  onChange={(e) => setSettings({
                    ...settings,
                    report: { ...settings.report, contentFontSize: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Margins */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Page Margins (mm)
              </label>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Top</label>
                  <input
                    type="number"
                    min="10"
                    max="30"
                    value={settings.report.margins.top}
                    onChange={(e) => setSettings({
                      ...settings,
                      report: {
                        ...settings.report,
                        margins: { ...settings.report.margins, top: parseInt(e.target.value) }
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Right</label>
                  <input
                    type="number"
                    min="10"
                    max="30"
                    value={settings.report.margins.right}
                    onChange={(e) => setSettings({
                      ...settings,
                      report: {
                        ...settings.report,
                        margins: { ...settings.report.margins, right: parseInt(e.target.value) }
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Bottom</label>
                  <input
                    type="number"
                    min="10"
                    max="30"
                    value={settings.report.margins.bottom}
                    onChange={(e) => setSettings({
                      ...settings,
                      report: {
                        ...settings.report,
                        margins: { ...settings.report.margins, bottom: parseInt(e.target.value) }
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Left</label>
                  <input
                    type="number"
                    min="10"
                    max="30"
                    value={settings.report.margins.left}
                    onChange={(e) => setSettings({
                      ...settings,
                      report: {
                        ...settings.report,
                        margins: { ...settings.report.margins, left: parseInt(e.target.value) }
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
