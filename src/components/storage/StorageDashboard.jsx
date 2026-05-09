/**
 * Storage Dashboard Component
 * Real-time storage monitoring with alerts and historical trends
 * Requirements: 1.1, 1.2, 1.4
 */

import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Legend
} from 'recharts'
import LoadingScreen from '../LoadingScreen'
import { fetchJson } from '../../services/http'

// Alert severity colors
const ALERT_COLORS = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200'
}

// Modality colors for pie chart
const MODALITY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
]

// Format bytes to human readable
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function StorageDashboard({ refreshInterval = 60000 }) {
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [modalityData, setModalityData] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch storage stats
  const fetchStats = useCallback(async () => {
    try {
      const data = await fetchJson('/api/storage-monitor/stats')
      setStats(data)
    } catch (err) {
      console.error('Error fetching storage stats:', err)
      setError(err.message)
    }
  }, [])

  // Fetch storage history
  const fetchHistory = useCallback(async () => {
    try {
      const data = await fetchJson('/api/storage-monitor/history?days=30')

      // If no history data, generate sample data
      if (!data.history || data.history.length === 0) {
        console.log('No history data found, generating sample data...')
        try {
          await fetchJson('/api/storage-monitor/generate-history?days=30', {
            method: 'POST'
          })
          // Fetch again after generating
          const retryData = await fetchJson('/api/storage-monitor/history?days=30')
          const chartData = (retryData.history || []).map(item => ({
            date: formatDate(item.recorded_at),
            usage: item.usage_percentage,
            used_gb: item.used_bytes / (1024 * 1024 * 1024)
          })).reverse()
          setHistory(chartData)
          return
        } catch (genErr) {
          console.error('Error generating history:', genErr)
        }
      }

      // Transform for chart
      const chartData = (data.history || []).map(item => ({
        date: formatDate(item.recorded_at),
        usage: item.usage_percentage,
        used_gb: item.used_bytes / (1024 * 1024 * 1024)
      })).reverse()
      setHistory(chartData)
    } catch (err) {
      console.error('Error fetching storage history:', err)
    }
  }, [])

  // Fetch storage by modality
  const fetchModalityData = useCallback(async () => {
    try {
      const data = await fetchJson('/api/storage-monitor/by-modality')
      // Transform for pie chart
      const chartData = (data.modalities || []).map(item => ({
        name: item.modality,
        value: item.total_size_bytes,
        studies: item.study_count
      }))
      setModalityData(chartData)
    } catch (err) {
      console.error('Error fetching modality data:', err)
    }
  }, [])

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const data = await fetchJson('/api/storage-monitor/alerts')
      setAlerts(data.alerts || [])
    } catch (err) {
      console.error('Error fetching alerts:', err)
    }
  }, [])

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      await Promise.all([
        fetchStats(),
        fetchHistory(),
        fetchModalityData(),
        fetchAlerts()
      ])
      setLoading(false)
    }
    loadAll()
  }, [fetchStats, fetchHistory, fetchModalityData, fetchAlerts])

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return
    const interval = setInterval(() => {
      fetchStats()
      fetchAlerts()
    }, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval, fetchStats, fetchAlerts])

  // Acknowledge alert
  const acknowledgeAlert = async (alertId) => {
    try {
      await fetchJson(
        `/api/storage-monitor/alerts/${alertId}/acknowledge?acknowledged_by=admin`,
        { method: 'POST' }
      )
      fetchAlerts()
    } catch (err) {
      console.error('Error acknowledging alert:', err)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading storage data..." />
  }

  if (error && !stats) {
    return (
      <div className="p-4 border border-red-200 bg-red-50 text-sm text-red-600 rounded-lg">
        Failed to load storage data: {error}
      </div>
    )
  }

  const usagePercentage = stats?.usage_percentage || 0
  const usageColor = usagePercentage >= 90 ? 'bg-red-500' : usagePercentage >= 80 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Storage Monitor</h2>
          <p className="text-sm text-slate-500">
            Last updated: {stats?.last_updated ? new Date(stats.last_updated).toLocaleString() : 'N/A'}
          </p>
        </div>
        <button
          onClick={() => {
            fetchStats()
            fetchHistory()
            fetchModalityData()
            fetchAlerts()
          }}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`p-4 rounded-lg border flex items-center justify-between ${ALERT_COLORS[alert.alert_type] || ALERT_COLORS.info}`}
            >
              <div>
                <span className="font-semibold uppercase text-xs mr-2">
                  {alert.alert_type}
                </span>
                <span>{alert.message}</span>
              </div>
              {!alert.acknowledged_at && (
                <button
                  onClick={() => acknowledgeAlert(alert.id)}
                  className="px-3 py-1 bg-white/50 rounded text-sm hover:bg-white/80"
                >
                  Acknowledge
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Total Storage"
          value={formatBytes(stats?.total_bytes)}
          hint="Total capacity"
        />
        <KpiCard
          label="Used Storage"
          value={formatBytes(stats?.used_bytes)}
          hint={`${usagePercentage.toFixed(1)}% used`}
        />
        <KpiCard
          label="Available"
          value={formatBytes(stats?.available_bytes)}
          hint="Free space"
        />
        <KpiCard
          label="Total Studies"
          value={stats?.total_studies?.toLocaleString() || '0'}
          hint={`${stats?.total_series?.toLocaleString() || '0'} series, ${stats?.total_instances?.toLocaleString() || '0'} instances`}
        />
      </div>

      {/* Usage Progress Bar */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Storage Usage</span>
          <span className="text-sm font-semibold">{usagePercentage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-4">
          <div
            className={`h-4 rounded-full transition-all duration-500 ${usageColor}`}
            style={{ width: `${Math.min(100, usagePercentage)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span>0%</span>
          <span className="text-amber-600">80% Warning</span>
          <span className="text-red-600">90% Critical</span>
          <span>100%</span>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Historical Trend */}
        <div className="card">
          <SectionHeader title="Storage Trend" subtitle="Usage over last 30 days" />
          <div className="h-64">
            {history.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    formatter={(value, name) => [
                      name === 'usage' ? `${value.toFixed(1)}%` : `${value.toFixed(2)} GB`,
                      name === 'usage' ? 'Usage' : 'Used'
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="usage"
                    stroke="#3b82f6"
                    fill="url(#usageGradient)"
                    name="Usage %"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                No historical data available
              </div>
            )}
          </div>
        </div>

        {/* Storage by Modality */}
        <div className="card">
          <SectionHeader title="Storage by Modality" subtitle="Distribution by imaging type" />
          <div className="h-64">
            {modalityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={modalityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {modalityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={MODALITY_COLORS[index % MODALITY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatBytes(value)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                No modality data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modality Details Table */}
      {modalityData.length > 0 && (
        <div className="card">
          <SectionHeader title="Modality Details" subtitle="Storage breakdown by modality" />
          <div className="overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Modality</th>
                  <th>Studies</th>
                  <th>Storage Used</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {modalityData.map((item, idx) => {
                  const totalSize = modalityData.reduce((sum, m) => sum + m.value, 0)
                  const percentage = totalSize > 0 ? ((item.value / totalSize) * 100).toFixed(1) : 0
                  return (
                    <tr key={item.name}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: MODALITY_COLORS[idx % MODALITY_COLORS.length] }}
                          />
                          {item.name}
                        </div>
                      </td>
                      <td>{item.studies?.toLocaleString() || 0}</td>
                      <td>{formatBytes(item.value)}</td>
                      <td>{percentage}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <div className="text-base font-semibold">{title}</div>
      {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
    </div>
  )
}
