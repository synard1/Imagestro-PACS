/**
 * Notification Settings Component
 * Manage Telegram & WhatsApp notification configuration
 */

import React, { useState, useEffect } from 'react';
import { notify } from '../../services/notifications';
import {
  getNotificationConfig,
  getNotificationStatus,
  setupTelegram,
  setupWhatsApp,
  testNotificationChannel,
  disableNotificationChannel,
  enableNotificationChannel,
  toggleNotificationChannel,
  getNotificationAuditLogs,
  getNotificationAuditStats
} from '../../services/notificationBackendService';

export default function NotificationSettings() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('telegram');
  const [testingChannel, setTestingChannel] = useState(null);
  const [togglingChannel, setTogglingChannel] = useState(null);

  // Telegram form
  const [telegramForm, setTelegramForm] = useState({
    botToken: '',
    chatId: ''
  });

  // WhatsApp form
  const [whatsappForm, setWhatsappForm] = useState({
    apiKey: '',
    instanceName: '',
    targetNumber: '',
    baseUrl: ''
  });

  // Audit Logs Pagination & Filters
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterNotificationType, setFilterNotificationType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  // Load audit logs when filters or pagination changes
  useEffect(() => {
    if (activeTab === 'logs') {
      loadAuditLogs();
    }
  }, [currentPage, pageSize, filterStatus, filterChannel, filterNotificationType, dateFrom, dateTo, searchQuery, activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load status, stats, AND config (including disabled)
      const [statusData, statsData, configData] = await Promise.all([
        getNotificationStatus(),
        getNotificationAuditStats(365), // 1 year stats
        getNotificationConfig(true) // Load ALL config values including disabled
      ]);

      setStatus(statusData);
      setStats(statsData);

      // Populate form fields from config (including disabled ones)
      if (configData && Array.isArray(configData)) {
        const configMap = {};
        configData.forEach(config => {
          configMap[config.config_key] = config.config_value;
        });

        // Populate Telegram form - always show saved values
        setTelegramForm({
          botToken: configMap.telegram_bot_token || '',
          chatId: configMap.telegram_chat_id || ''
        });

        // Populate WhatsApp form - always show saved values
        setWhatsappForm({
          apiKey: configMap.whatsapp_api_key || '',
          instanceName: configMap.whatsapp_instance_name || '',
          targetNumber: configMap.whatsapp_target_number || '',
          baseUrl: configMap.whatsapp_base_url || ''
        });
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error);
      notify({
        type: 'error',
        message: 'Failed to load notification settings: ' + (error?.message || error)
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setAuditLogsLoading(true);

      // Build filter params
      const filters = {
        limit: pageSize,
        offset: (currentPage - 1) * pageSize
      };

      if (filterStatus) filters.status = filterStatus;
      if (filterChannel) filters.channel = filterChannel;
      if (filterNotificationType) filters.notification_type = filterNotificationType;
      if (dateFrom) filters.date_from = dateFrom;
      if (dateTo) filters.date_to = dateTo;
      if (searchQuery) filters.search = searchQuery;

      const logsData = await getNotificationAuditLogs(filters);

      let records = [];
      let total = 0;

      // Handle response - backend now returns: { total, data, page, page_size, total_pages }
      if (Array.isArray(logsData)) {
        // Backward compatibility: if backend returns array
        records = logsData;
        total = logsData.length;
      } else if (logsData.data && Array.isArray(logsData.data)) {
        // New format: { total, data, page, page_size, total_pages }
        records = logsData.data;
        total = logsData.total || logsData.data.length;
      } else if (logsData.items && Array.isArray(logsData.items)) {
        // Alternative format: { total, items, page, page_size }
        records = logsData.items;
        total = logsData.total || logsData.items.length;
      }

      // Calculate total pages
      const totalPages = Math.ceil(total / pageSize);

      // Auto-reset to page 1 if current page exceeds total pages
      if (currentPage > totalPages && totalPages > 0) {
        console.log(`[Pagination] Current page (${currentPage}) exceeds total pages (${totalPages}), resetting to page 1`);
        setCurrentPage(1);
        return; // Will trigger useEffect to reload with page 1
      }

      // If no data and not on page 1, reset to page 1
      if (records.length === 0 && total === 0 && currentPage > 1) {
        console.log(`[Pagination] No data found on page ${currentPage}, resetting to page 1`);
        setCurrentPage(1);
        return; // Will trigger useEffect to reload with page 1
      }

      setAuditLogs(records);
      setTotalRecords(total);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      notify({
        type: 'error',
        message: 'Failed to load audit logs'
      });
      setAuditLogs([]);
      setTotalRecords(0);
    } finally {
      setAuditLogsLoading(false);
    }
  };

  const handleSetupTelegram = async (e) => {
    e.preventDefault();

    if (!telegramForm.botToken || !telegramForm.chatId) {
      notify({
        type: 'warning',
        message: 'Please fill in all Telegram fields'
      });
      return;
    }

    try {
      setLoading(true);
      await setupTelegram(telegramForm.botToken, telegramForm.chatId);

      notify({
        type: 'success',
        message: 'Telegram configuration saved'
      });

      await loadData();
      setTelegramForm({ botToken: '', chatId: '' });
    } catch (error) {
      console.error('Failed to setup Telegram:', error);
      notify({
        type: 'error',
        message: 'Failed to setup Telegram'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetupWhatsApp = async (e) => {
    e.preventDefault();

    if (!whatsappForm.apiKey || !whatsappForm.instanceName ||
      !whatsappForm.targetNumber || !whatsappForm.baseUrl) {
      notify({
        type: 'warning',
        message: 'Please fill in all WhatsApp fields'
      });
      return;
    }

    try {
      setLoading(true);
      await setupWhatsApp(
        whatsappForm.apiKey,
        whatsappForm.instanceName,
        whatsappForm.targetNumber,
        whatsappForm.baseUrl
      );

      notify({
        type: 'success',
        message: 'WhatsApp configuration saved'
      });

      await loadData();
      setWhatsappForm({
        apiKey: '',
        instanceName: '',
        targetNumber: '',
        baseUrl: ''
      });
    } catch (error) {
      console.error('Failed to setup WhatsApp:', error);
      notify({
        type: 'error',
        message: 'Failed to setup WhatsApp'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestChannel = async (channel) => {
    try {
      setTestingChannel(channel);
      const result = await testNotificationChannel(channel);

      if (result.success) {
        notify({
          type: 'success',
          message: `${channel} test notification sent successfully`
        });
      } else {
        notify({
          type: 'error',
          message: `Failed to send ${channel} test: ${result.message}`
        });
      }

      await loadData();
    } catch (error) {
      console.error(`Failed to test ${channel}:`, error);
      notify({
        type: 'error',
        message: `Failed to test ${channel}`
      });
    } finally {
      setTestingChannel(null);
    }
  };

  const handleDisableChannel = async (channel) => {
    if (!confirm(`Are you sure you want to disable ${channel} notifications?`)) {
      return;
    }

    try {
      setLoading(true);
      await disableNotificationChannel(channel);

      notify({
        type: 'success',
        message: `${channel} notifications disabled`
      });

      await loadData();
    } catch (error) {
      console.error(`Failed to disable ${channel}:`, error);
      notify({
        type: 'error',
        message: `Failed to disable ${channel}`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleChannel = async (channel, currentEnabled) => {
    const newEnabled = !currentEnabled;
    const action = newEnabled ? 'enable' : 'disable';

    if (!newEnabled && !confirm(`Are you sure you want to disable ${channel} notifications?`)) {
      return;
    }

    try {
      setTogglingChannel(channel);
      await toggleNotificationChannel(channel, newEnabled);

      notify({
        type: 'success',
        message: `${channel} notifications ${newEnabled ? 'enabled' : 'disabled'}`
      });

      await loadData();
    } catch (error) {
      console.error(`Failed to ${action} ${channel}:`, error);
      notify({
        type: 'error',
        message: `Failed to ${action} ${channel}: ${error?.message || error}`
      });
    } finally {
      setTogglingChannel(null);
    }
  };

  // Audit Logs Helper Functions
  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterStatus('');
    setFilterChannel('');
    setFilterNotificationType('');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading notification settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      {status && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Telegram Status</h3>
              {/* Toggle Switch - Only disable if truly not configured (no saved data) */}
              <button
                onClick={() => handleToggleChannel('telegram', status.telegram_enabled)}
                disabled={togglingChannel === 'telegram' || (!status.telegram_bot_token_configured && !telegramForm.botToken)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${status.telegram_enabled ? 'bg-green-500' : 'bg-gray-300'
                  } ${((!status.telegram_bot_token_configured && !telegramForm.botToken) || togglingChannel === 'telegram') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                title={(!status.telegram_bot_token_configured && !telegramForm.botToken) ? 'Configure Telegram first' : (status.telegram_enabled ? 'Click to disable' : 'Click to enable')}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${status.telegram_enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Bot Token:</span>
                <span className={status.telegram_bot_token_configured ? 'text-green-600' : 'text-red-600'}>
                  {status.telegram_bot_token_configured ? '✓ Configured' : '✗ Not configured'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Chat ID:</span>
                <span className={status.telegram_chat_id_configured ? 'text-green-600' : 'text-red-600'}>
                  {status.telegram_chat_id_configured ? '✓ Configured' : '✗ Not configured'}
                </span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span>Status:</span>
                <span className={status.telegram_enabled ? 'text-green-600' : 'text-gray-600'}>
                  {status.telegram_enabled ? '🟢 Enabled' : '⚪ Disabled'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">WhatsApp Status</h3>
              {/* Toggle Switch - Only disable if truly not configured (no saved data) */}
              <button
                onClick={() => handleToggleChannel('whatsapp', status.whatsapp_enabled)}
                disabled={togglingChannel === 'whatsapp' || (!status.whatsapp_api_key_configured && !whatsappForm.apiKey)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${status.whatsapp_enabled ? 'bg-green-500' : 'bg-gray-300'
                  } ${((!status.whatsapp_api_key_configured && !whatsappForm.apiKey) || togglingChannel === 'whatsapp') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                title={(!status.whatsapp_api_key_configured && !whatsappForm.apiKey) ? 'Configure WhatsApp first' : (status.whatsapp_enabled ? 'Click to disable' : 'Click to enable')}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${status.whatsapp_enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>API Key:</span>
                <span className={status.whatsapp_api_key_configured ? 'text-green-600' : 'text-red-600'}>
                  {status.whatsapp_api_key_configured ? '✓ Configured' : '✗ Not configured'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Instance:</span>
                <span className={status.whatsapp_instance_name_configured ? 'text-green-600' : 'text-red-600'}>
                  {status.whatsapp_instance_name_configured ? '✓ Configured' : '✗ Not configured'}
                </span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span>Status:</span>
                <span className={status.whatsapp_enabled ? 'text-green-600' : 'text-gray-600'}>
                  {status.whatsapp_enabled ? '🟢 Enabled' : '⚪ Disabled'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('telegram')}
            className={`flex-1 py-3 px-4 text-center font-medium ${activeTab === 'telegram'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            Telegram
          </button>
          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`flex-1 py-3 px-4 text-center font-medium ${activeTab === 'whatsapp'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            WhatsApp
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex-1 py-3 px-4 text-center font-medium ${activeTab === 'logs'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            Audit Logs
          </button>
        </div>

        <div className="p-6">
          {/* Telegram Tab */}
          {activeTab === 'telegram' && (
            <div className="space-y-4">
              {/* Disabled Notice */}
              {status?.telegram_bot_token_configured && !status?.telegram_enabled && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h4 className="font-semibold text-yellow-900">Telegram is Currently Disabled</h4>
                    <p className="text-sm text-yellow-800 mt-1">Your configuration is saved. Click the toggle switch above to enable it again.</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSetupTelegram} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Bot Token</label>
                  <input
                    type="password"
                    value={telegramForm.botToken}
                    onChange={(e) => setTelegramForm({ ...telegramForm, botToken: e.target.value })}
                    placeholder="Enter Telegram Bot Token"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Get from @BotFather on Telegram</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Chat ID</label>
                  <input
                    type="text"
                    value={telegramForm.chatId}
                    onChange={(e) => setTelegramForm({ ...telegramForm, chatId: e.target.value })}
                    placeholder="Enter Telegram Chat ID"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Group or private chat ID for notifications</p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Configuration'}
                  </button>

                  {(status?.telegram_bot_token_configured || telegramForm.botToken) && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTestChannel('telegram')}
                        disabled={testingChannel === 'telegram' || !status?.telegram_enabled}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        title={!status?.telegram_enabled ? 'Enable Telegram first to test' : 'Send test notification'}
                      >
                        {testingChannel === 'telegram' ? 'Testing...' : 'Test'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleChannel('telegram', status?.telegram_enabled)}
                        disabled={togglingChannel === 'telegram'}
                        className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${status?.telegram_enabled
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                      >
                        {togglingChannel === 'telegram' ? 'Processing...' : (status?.telegram_enabled ? 'Disable' : 'Enable')}
                      </button>
                    </>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* WhatsApp Tab */}
          {activeTab === 'whatsapp' && (
            <div className="space-y-4">
              {/* Disabled Notice */}
              {status?.whatsapp_api_key_configured && !status?.whatsapp_enabled && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h4 className="font-semibold text-yellow-900">WhatsApp is Currently Disabled</h4>
                    <p className="text-sm text-yellow-800 mt-1">Your configuration is saved. Click the toggle switch above to enable it again.</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSetupWhatsApp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">API Key</label>
                  <input
                    type="password"
                    value={whatsappForm.apiKey}
                    onChange={(e) => setWhatsappForm({ ...whatsappForm, apiKey: e.target.value })}
                    placeholder="Enter WhatsApp API Key"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Evolution API Key</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Instance Name</label>
                  <input
                    type="text"
                    value={whatsappForm.instanceName}
                    onChange={(e) => setWhatsappForm({ ...whatsappForm, instanceName: e.target.value })}
                    placeholder="e.g., INSTANCE_NAME"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Target Number</label>
                  <input
                    type="text"
                    value={whatsappForm.targetNumber}
                    onChange={(e) => setWhatsappForm({ ...whatsappForm, targetNumber: e.target.value })}
                    placeholder="e.g., 62812345678"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">WhatsApp number in international format</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Base URL</label>
                  <input
                    type="text"
                    value={whatsappForm.baseUrl}
                    onChange={(e) => setWhatsappForm({ ...whatsappForm, baseUrl: e.target.value })}
                    placeholder="e.g., http://103.42.117.18:9282"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Configuration'}
                  </button>

                  {(status?.whatsapp_api_key_configured || whatsappForm.apiKey) && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTestChannel('whatsapp')}
                        disabled={testingChannel === 'whatsapp' || !status?.whatsapp_enabled}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        title={!status?.whatsapp_enabled ? 'Enable WhatsApp first to test' : 'Send test notification'}
                      >
                        {testingChannel === 'whatsapp' ? 'Testing...' : 'Test'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleChannel('whatsapp', status?.whatsapp_enabled)}
                        disabled={togglingChannel === 'whatsapp'}
                        className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${status?.whatsapp_enabled
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                      >
                        {togglingChannel === 'whatsapp' ? 'Processing...' : (status?.whatsapp_enabled ? 'Disable' : 'Enable')}
                      </button>
                    </>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Audit Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <p className="text-xs text-gray-600 mb-1">Total (1 Year)</p>
                    <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                    <p className="text-xs text-gray-600 mb-1">Success</p>
                    <p className="text-2xl font-bold text-green-600">{stats.success}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                    <p className="text-xs text-gray-600 mb-1">Failed</p>
                    <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                    <p className="text-xs text-gray-600 mb-1">Success Rate</p>
                    <p className="text-2xl font-bold text-yellow-600">{stats.success_rate?.toFixed(1) || 0}%</p>
                  </div>
                </div>
              )}

              {/* Filters Section */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-700">Filters & Search</h3>
                  <button
                    onClick={handleResetFilters}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Reset All
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by order number, patient name..."
                    className="w-full px-4 py-2 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                {/* Filter Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* Status Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">All Status</option>
                      <option value="success">Success</option>
                      <option value="failed">Failed</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>

                  {/* Channel Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Channel</label>
                    <select
                      value={filterChannel}
                      onChange={(e) => setFilterChannel(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">All Channels</option>
                      <option value="telegram">Telegram</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </div>

                  {/* Notification Type Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={filterNotificationType}
                      onChange={(e) => setFilterNotificationType(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">All Types</option>
                      <option value="STAGNANT_ORDER">Stagnant Order</option>
                      <option value="NEW_ORDER">New Order</option>
                      <option value="CANCELLED_ORDER">Cancelled Order</option>
                    </select>
                  </div>

                  {/* Date From */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      max={dateTo || new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  {/* Date To */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      min={dateFrom}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Table Section */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {/* Table Header with Record Count */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-700">Audit Logs</h3>
                    <span className="text-sm text-gray-500">
                      ({totalRecords} record{totalRecords !== 1 ? 's' : ''})
                    </span>
                  </div>

                  {/* Page Size Selector */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Show:</label>
                    <select
                      value={pageSize}
                      onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                      className="px-3 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="10">10</option>
                      <option value="20">20</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                    <span className="text-sm text-gray-600">per page</span>
                  </div>
                </div>

                {/* Loading State */}
                {auditLogsLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3"></div>
                      <p className="text-sm text-gray-500">Loading audit logs...</p>
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {!auditLogsLoading && auditLogs.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <svg className="h-16 w-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-500 font-medium mb-1">No audit logs found</p>
                    <p className="text-sm text-gray-400">Try adjusting your filters or search query</p>
                  </div>
                )}

                {/* Table */}
                {!auditLogsLoading && auditLogs.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-700">Order Number</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-700">Channel</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-700">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-gray-700">{log.notification_type}</td>
                            <td className="px-4 py-3 font-medium text-blue-600">
                              {log.metadata_json?.order_number || '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className="capitalize text-gray-700">{log.channel}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${log.status === 'success' ? 'bg-green-100 text-green-800' :
                                log.status === 'failed' ? 'bg-red-100 text-red-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {new Date(log.created_at).toLocaleString('id-ID', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {!auditLogsLoading && auditLogs.length > 0 && (
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} results
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Previous Button */}
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        Previous
                      </button>

                      {/* Page Numbers */}
                      <div className="flex items-center gap-1">
                        {(() => {
                          const totalPages = Math.ceil(totalRecords / pageSize);
                          const pages = [];
                          const maxVisible = 5;

                          let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                          let endPage = Math.min(totalPages, startPage + maxVisible - 1);

                          if (endPage - startPage < maxVisible - 1) {
                            startPage = Math.max(1, endPage - maxVisible + 1);
                          }

                          for (let i = startPage; i <= endPage; i++) {
                            pages.push(
                              <button
                                key={i}
                                onClick={() => handlePageChange(i)}
                                className={`px-3 py-1 border rounded text-sm font-medium ${currentPage === i
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'hover:bg-gray-100'
                                  }`}
                              >
                                {i}
                              </button>
                            );
                          }

                          return pages;
                        })()}
                      </div>

                      {/* Next Button */}
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= Math.ceil(totalRecords / pageSize)}
                        className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
