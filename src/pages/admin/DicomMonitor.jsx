import React, { useState, useEffect } from 'react';
import { Activity, Database, HardDrive, Cpu, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';

const DicomMonitor = () => {
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Mock data
  const mockHealth = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime_seconds: 3600,
    components: {
      database: {
        status: 'healthy',
        connected: true,
        tables: { dicom_files: 150, dicom_nodes: 3 },
        response_time_ms: 5
      },
      disk: {
        status: 'healthy',
        path: '/var/lib/pacs/dicom-storage',
        total_gb: 500,
        used_gb: 125,
        free_gb: 375,
        percent_used: 25
      },
      memory: {
        status: 'healthy',
        total_gb: 16,
        used_gb: 4,
        available_gb: 12,
        percent_used: 25
      },
      dicom_scp: {
        status: 'healthy',
        running: true,
        port: 11112,
        method: 'port_detection'
      },
      errors: {
        status: 'healthy',
        count_24h: 0,
        count_1h: 0
      }
    }
  };

  const mockMetrics = {
    total_studies: 45,
    total_series: 180,
    total_instances: 5400,
    total_size_gb: 125,
    operations_today: 23,
    operations_this_hour: 5,
    avg_response_time_ms: 150,
    error_rate_percent: 0.1
  };

  const mockActivity = [
    {
      id: 1,
      timestamp: new Date().toISOString(),
      type: 'C-STORE',
      source: 'CT_SCANNER',
      patient_id: '12345',
      status: 'success',
      duration_ms: 2500
    },
    {
      id: 2,
      timestamp: new Date(Date.now() - 300000).toISOString(),
      type: 'C-ECHO',
      source: 'MR_SCANNER',
      patient_id: null,
      status: 'success',
      duration_ms: 45
    },
    {
      id: 3,
      timestamp: new Date(Date.now() - 600000).toISOString(),
      type: 'C-STORE',
      source: 'CR_ROOM1',
      patient_id: '67890',
      status: 'success',
      duration_ms: 1200
    }
  ];

  useEffect(() => {
    loadData();
    
    if (autoRefresh) {
      const interval = setInterval(loadData, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadData = async () => {
    try {
      // TODO: Replace with actual API calls
      // const healthRes = await fetch('/api/monitoring/health/detailed');
      // const metricsRes = await fetch('/api/monitoring/metrics');
      // const activityRes = await fetch('/api/monitoring/activity/recent');
      
      setTimeout(() => {
        setHealth(mockHealth);
        setMetrics(mockMetrics);
        setActivity(mockActivity);
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error('Failed to load monitoring data:', error);
      setHealth(mockHealth);
      setMetrics(mockMetrics);
      setActivity(mockActivity);
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      healthy: 'text-green-600',
      warning: 'text-yellow-600',
      critical: 'text-red-600'
    };
    return colors[status] || 'text-gray-600';
  };

  const getStatusIcon = (status) => {
    if (status === 'healthy') return <CheckCircle className="w-5 h-5" />;
    return <AlertCircle className="w-5 h-5" />;
  };

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DICOM Monitor</h1>
          <p className="text-gray-600 mt-1">Real-time system monitoring and health status</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (5s)
          </label>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="w-5 h-5" />
            Refresh
          </button>
        </div>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Database */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              <span className="font-medium">Database</span>
            </div>
            <div className={getStatusColor(health.components.database.status)}>
              {getStatusIcon(health.components.database.status)}
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {health.components.database.tables.dicom_files}
          </div>
          <div className="text-sm text-gray-600">DICOM files</div>
          <div className="text-xs text-gray-500 mt-1">
            Response: {health.components.database.response_time_ms}ms
          </div>
        </div>

        {/* Storage */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-purple-600" />
              <span className="font-medium">Storage</span>
            </div>
            <div className={getStatusColor(health.components.disk.status)}>
              {getStatusIcon(health.components.disk.status)}
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {health.components.disk.percent_used}%
          </div>
          <div className="text-sm text-gray-600">
            {health.components.disk.used_gb}GB / {health.components.disk.total_gb}GB
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div
              className="bg-purple-600 h-2 rounded-full"
              style={{ width: `${health.components.disk.percent_used}%` }}
            />
          </div>
        </div>

        {/* Memory */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-green-600" />
              <span className="font-medium">Memory</span>
            </div>
            <div className={getStatusColor(health.components.memory.status)}>
              {getStatusIcon(health.components.memory.status)}
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {health.components.memory.percent_used}%
          </div>
          <div className="text-sm text-gray-600">
            {health.components.memory.used_gb}GB / {health.components.memory.total_gb}GB
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div
              className="bg-green-600 h-2 rounded-full"
              style={{ width: `${health.components.memory.percent_used}%` }}
            />
          </div>
        </div>

        {/* DICOM SCP */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-orange-600" />
              <span className="font-medium">DICOM SCP</span>
            </div>
            <div className={getStatusColor(health.components.dicom_scp.status)}>
              {getStatusIcon(health.components.dicom_scp.status)}
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {health.components.dicom_scp.running ? 'Running' : 'Stopped'}
          </div>
          <div className="text-sm text-gray-600">
            Port {health.components.dicom_scp.port}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Uptime: {formatUptime(health.uptime_seconds)}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">System Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <div className="text-3xl font-bold text-blue-600">{metrics.total_studies}</div>
            <div className="text-sm text-gray-600">Total Studies</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-purple-600">{metrics.total_instances}</div>
            <div className="text-sm text-gray-600">Total Images</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-green-600">{metrics.operations_today}</div>
            <div className="text-sm text-gray-600">Operations Today</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-orange-600">{metrics.avg_response_time_ms}ms</div>
            <div className="text-sm text-gray-600">Avg Response Time</div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Recent Activity</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {activity.map((item) => (
            <div key={item.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                    {item.type}
                  </span>
                  <span className="text-sm text-gray-900">from {item.source}</span>
                  {item.patient_id && (
                    <span className="text-sm text-gray-600">Patient: {item.patient_id}</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">{item.duration_ms}ms</span>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    item.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {item.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DicomMonitor;
