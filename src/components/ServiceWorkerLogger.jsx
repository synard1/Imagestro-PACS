/**
 * Service Worker Logger Dashboard Component
 * 
 * Displays service worker logs, metrics, and maintenance page analytics
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import React, { useState, useEffect } from 'react';
import serviceWorkerLogger from '../utils/serviceWorkerLogger';

const ServiceWorkerLogger = () => {
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [maintenanceEvents, setMaintenanceEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('metrics');
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!serviceWorkerLogger.isLoggerSupported()) {
        setError('Service worker logging is not supported or not active');
        return;
      }

      const [metricsData, logsData] = await Promise.all([
        serviceWorkerLogger.getRealTimeMetrics(),
        serviceWorkerLogger.getLogs(50)
      ]);

      const maintenanceData = serviceWorkerLogger.getMaintenanceEvents();

      setMetrics(metricsData);
      setLogs(logsData?.logs || []);
      setMaintenanceEvents(maintenanceData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportLogs = async () => {
    try {
      const success = await serviceWorkerLogger.exportLogsAsFile(
        `sw-logs-${new Date().toISOString().split('T')[0]}.json`
      );
      if (!success) {
        setError('Failed to export logs');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const clearMaintenanceEvents = () => {
    serviceWorkerLogger.clearMaintenanceEvents();
    setMaintenanceEvents([]);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2">Loading service worker data...</span>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Service Worker Logger Error</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg">
      {/* Header */}
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Service Worker Logger
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Monitor service worker performance, caching, and maintenance page analytics
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-gray-600">Auto-refresh</span>
            </label>
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={exportLogs}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Export Logs
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 px-4" aria-label="Tabs">
          {[
            { id: 'metrics', name: 'Metrics', count: null },
            { id: 'logs', name: 'Logs', count: logs.length },
            { id: 'maintenance', name: 'Maintenance', count: maintenanceEvents.length }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
            >
              {tab.name}
              {tab.count !== null && (
                <span className={`${
                  activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-900'
                } ml-2 py-0.5 px-2.5 rounded-full text-xs font-medium`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'metrics' && (
          <MetricsTab metrics={metrics} formatDuration={formatDuration} />
        )}
        {activeTab === 'logs' && (
          <LogsTab logs={logs} formatDuration={formatDuration} />
        )}
        {activeTab === 'maintenance' && (
          <MaintenanceTab 
            events={maintenanceEvents} 
            onClear={clearMaintenanceEvents}
            formatDuration={formatDuration}
          />
        )}
      </div>
    </div>
  );
};

const MetricsTab = ({ metrics, formatDuration }) => {
  if (!metrics) return <div>No metrics available</div>;

  return (
    <div className="space-y-6">
      {/* Cache Metrics */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-4">Cache Performance</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {metrics.cache.hitRatio.toFixed(1)}%
            </div>
            <div className="text-sm text-blue-800">Cache Hit Ratio</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {metrics.cache.totalRequests}
            </div>
            <div className="text-sm text-green-800">Total Requests</div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {metrics.cache.cachedRequests}
            </div>
            <div className="text-sm text-yellow-800">Cached Requests</div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {metrics.cache.failedRequests}
            </div>
            <div className="text-sm text-red-800">Failed Requests</div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-4">Performance</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {formatDuration(metrics.performance.averageResponseTime)}
            </div>
            <div className="text-sm text-purple-800">Average Response Time</div>
          </div>
          <div className="bg-indigo-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-indigo-600">
              {metrics.maintenance.activeMaintenanceSessions}
            </div>
            <div className="text-sm text-indigo-800">Active Maintenance Sessions</div>
          </div>
        </div>
      </div>

      {/* Error Metrics */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-4">Errors</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-red-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {metrics.errors.total}
            </div>
            <div className="text-sm text-red-800">Total Errors</div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {metrics.errors.network}
            </div>
            <div className="text-sm text-orange-800">Network Errors</div>
          </div>
          <div className="bg-pink-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-pink-600">
              {metrics.errors.cache}
            </div>
            <div className="text-sm text-pink-800">Cache Errors</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LogsTab = ({ logs, formatDuration }) => {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filteredLogs = logs.filter(log => {
    const matchesFilter = filter === 'all' || log.level === filter;
    const matchesSearch = search === '' || 
      log.message.toLowerCase().includes(search.toLowerCase()) ||
      log.url.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getLevelColor = (level) => {
    switch (level) {
      case 'error': return 'text-red-600 bg-red-50';
      case 'warn': return 'text-yellow-600 bg-yellow-50';
      case 'info': return 'text-blue-600 bg-blue-50';
      case 'debug': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="all">All Levels</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
        </div>
      </div>

      {/* Logs */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredLogs.map((log, index) => (
          <div key={index} className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getLevelColor(log.level)}`}>
                    {log.level.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-gray-900 mb-1">{log.message}</div>
                {log.context && Object.keys(log.context).length > 0 && (
                  <div className="text-xs text-gray-600">
                    <strong>URL:</strong> {log.context.url || log.url}
                    {log.context.duration && (
                      <span className="ml-4">
                        <strong>Duration:</strong> {formatDuration(log.context.duration)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No logs found matching your criteria
          </div>
        )}
      </div>
    </div>
  );
};

const MaintenanceTab = ({ events, onClear, formatDuration }) => {
  const [filter, setFilter] = useState('all');

  const filteredEvents = events.filter(event => 
    filter === 'all' || event.eventType === filter
  );

  const eventTypes = [...new Set(events.map(e => e.eventType))];

  const getEventColor = (eventType) => {
    switch (eventType) {
      case 'page_view': return 'text-blue-600 bg-blue-50';
      case 'retry_attempt': return 'text-yellow-600 bg-yellow-50';
      case 'server_recovery': return 'text-green-600 bg-green-50';
      case 'retry_failure': return 'text-red-600 bg-red-50';
      case 'user_interaction': return 'text-purple-600 bg-purple-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="all">All Events</option>
            {eventTypes.map(type => (
              <option key={type} value={type}>{type.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <button
          onClick={onClear}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Clear Events
        </button>
      </div>

      {/* Events */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredEvents.map((event, index) => (
          <div key={index} className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEventColor(event.eventType)}`}>
                    {event.eventType.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(event.data.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-gray-900 mb-1">
                  URL: {event.data.url}
                </div>
                {event.data.sessionId && (
                  <div className="text-xs text-gray-600 mb-1">
                    Session: {event.data.sessionId}
                  </div>
                )}
                {event.data.duration && (
                  <div className="text-xs text-gray-600">
                    Duration: {formatDuration(event.data.duration)}
                  </div>
                )}
                {event.data.retryCount && (
                  <div className="text-xs text-gray-600">
                    Retry Count: {event.data.retryCount}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {filteredEvents.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No maintenance events found
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceWorkerLogger;