import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, LineChart, Line, Legend 
} from 'recharts';
import { 
  Activity, Database, Users, TrendingUp, TrendingDown, 
  Info, AlertTriangle, Calendar, Building2, ChevronDown
} from 'lucide-react';
import { apiClient } from '../services/http';
import { tenantService } from '../services/tenantService';

const UsageDashboard = () => {
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [usage, setUsage] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('30');

  useEffect(() => {
    loadTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      loadUsage();
      loadAnalytics();
    }
  }, [selectedTenant, period]);

  const loadTenants = async () => {
    try {
      const response = await tenantService.listTenants({ is_active: true, limit: 100 });
      const items = response?.items || [];
      setTenants(items);
      if (items.length > 0 && !selectedTenant) {
        setSelectedTenant(items[0].id);
      }
    } catch (err) {
      console.error('Failed to load tenants:', err);
    }
  };

  const loadUsage = async () => {
    try {
      setLoading(true);
      const client = apiClient('satusehatMonitor');
      const res = await client.get(`/api/usage/tenant/${selectedTenant}/summary`);
      setUsage(res.data);
    } catch (err) {
      console.error('Failed to load usage:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const client = apiClient('satusehatMonitor');
      const res = await client.get(`/api/usage/tenant/${selectedTenant}/analytics?period_start=${period}`);
      setAnalytics(res.data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatNumber = (num) => new Intl.NumberFormat('id-ID').format(num || 0);

  const getStatusColor = (percent) => {
    if (percent >= 90) return 'text-red-600 bg-red-50 border-red-200';
    if (percent >= 70) return 'text-amber-600 bg-yellow-50 border-yellow-200';
    return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  };

  const selectedTenantData = useMemo(() => 
    tenants.find(t => t.id === selectedTenant), 
  [tenants, selectedTenant]);

  const chartData = useMemo(() => {
    if (!analytics?.api_trend) return [];
    return analytics.api_trend.map(item => ({
      ...item,
      shortDate: new Date(item.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
      storageGB: parseFloat((item.storage_bytes / (1024**3)).toFixed(3))
    }));
  }, [analytics]);

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-4 md:p-8">
      {/* Header Section */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Usage Analytics</h1>
            <p className="text-slate-500 mt-1 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Real-time monitoring for multi-tenant infrastructure
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative group">
              <select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                className="appearance-none pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-slate-700 min-w-[240px]"
              >
                <option value="">Choose a Hospital...</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
            </div>

            <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
              {['7', '30', '90'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    period === p 
                    ? 'bg-slate-900 text-white shadow-md' 
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {p}D
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!selectedTenant ? (
        <div className="max-w-7xl mx-auto bg-white border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
          <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-10 h-10 text-slate-300" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">No Tenant Selected</h2>
          <p className="text-slate-500 mt-2">Select a tenant from the dropdown to view their usage metrics.</p>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* API Calls Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 transition-hover hover:shadow-md">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <Activity className="w-6 h-6" />
                </div>
                {analytics?.period_over_period_change !== undefined && (
                  <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
                    analytics.period_over_period_change >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-red-50'
                  }`}>
                    {analytics.period_over_period_change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(analytics.period_over_period_change)}%
                  </div>
                )}
              </div>
              <h3 className="text-slate-500 text-sm font-medium">API Requests (Today)</h3>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-slate-900">{formatNumber(usage?.api_calls_today)}</span>
                <span className="text-slate-400 text-sm font-medium">/ {usage?.api_limit ? formatNumber(usage.api_limit) : '∞'}</span>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-400 uppercase tracking-wider">Utilization</span>
                  <span className={usage?.api_percent > 90 ? 'text-rose-600' : 'text-slate-700'}>{usage?.api_percent || 0}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ease-out rounded-full ${
                      usage?.api_percent >= 90 ? 'bg-rose-500' : usage?.api_percent >= 75 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(usage?.api_percent || 0, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Storage Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 transition-hover hover:shadow-md">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                  <Database className="w-6 h-6" />
                </div>
                <div className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold uppercase tracking-tighter">
                  Storage
                </div>
              </div>
              <h3 className="text-slate-500 text-sm font-medium">Storage Volume</h3>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-slate-900">{usage?.storage_gb?.toFixed(2) || '0.00'}</span>
                <span className="text-slate-900 text-lg font-bold">GB</span>
                <span className="text-slate-400 text-sm font-medium ml-auto">of {usage?.storage_limit_gb || '∞'} GB</span>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-400 uppercase tracking-wider">Capacity</span>
                  <span className="text-slate-700">{usage?.storage_percent || 0}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 transition-all duration-1000 ease-out rounded-full"
                    style={{ width: `${Math.min(usage?.storage_percent || 0, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Users Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 transition-hover hover:shadow-md">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Users className="w-6 h-6" />
                </div>
                <div className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(usage?.user_percent)}`}>
                  {usage?.status || 'Active'}
                </div>
              </div>
              <h3 className="text-slate-500 text-sm font-medium">Concurrent Users</h3>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-bold text-slate-900">{formatNumber(usage?.active_users)}</span>
                <span className="text-slate-400 text-sm font-medium">/ {usage?.user_limit || '∞'} peak</span>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-400 uppercase tracking-wider">License usage</span>
                  <span className="text-slate-700">{usage?.user_percent || 0}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-1000 ease-out rounded-full"
                    style={{ width: `${Math.min(usage?.user_percent || 0, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Main Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Requests Trend */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Request Traffic</h3>
                  <p className="text-sm text-slate-500">API throughput volume over time</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-blue-600">{formatNumber(analytics?.total_api_calls)}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Calls</div>
                </div>
              </div>
              
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorApi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="shortDate" 
                      axisLine={false}
                      tickLine={false}
                      tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 500}}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 500}}
                    />
                    <Tooltip 
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                      cursor={{stroke: '#3b82f6', strokeWidth: 2}}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="api_calls" 
                      name="API Calls"
                      stroke="#3b82f6" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorApi)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Storage Trend */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Data Growth</h3>
                  <p className="text-sm text-slate-500">Storage footprint accumulation</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-purple-600">{analytics?.peak_storage_bytes ? formatBytes(analytics.peak_storage_bytes) : '0 GB'}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Peak Storage</div>
                </div>
              </div>

              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="shortDate" 
                      axisLine={false}
                      tickLine={false}
                      tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 500}}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 500}}
                    />
                    <Tooltip 
                      cursor={{fill: '#f8fafc'}}
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                    <Bar 
                      dataKey="storageGB" 
                      name="Storage (GB)"
                      fill="#a855f7" 
                      radius={[4, 4, 0, 0]}
                      barSize={20}
                      animationDuration={1500}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Details & Alerts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  Recent Daily Breakdown
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4 text-right">API Calls</th>
                      <th className="px-6 py-4 text-right">Storage</th>
                      <th className="px-6 py-4 text-right">Users</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {chartData.slice(-5).reverse().map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-700">{row.date}</td>
                        <td className="px-6 py-4 text-right font-mono text-blue-600">{formatNumber(row.api_calls)}</td>
                        <td className="px-6 py-4 text-right font-mono text-purple-600">{formatBytes(row.storage_bytes)}</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-600">{row.active_users}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl shadow-xl p-8 text-white">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-white/10 rounded-lg">
                  <Info className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold">Subscription Info</h3>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="text-slate-400 text-xs font-bold uppercase tracking-widest block mb-1">Current Tier</label>
                  <div className="text-2xl font-bold text-blue-400 uppercase tracking-tight">{usage?.tier_name || 'Enterprise'}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="text-slate-400 text-[10px] font-bold uppercase mb-1">Status</div>
                    <div className="font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      {usage?.status || 'Active'}
                    </div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="text-slate-400 text-[10px] font-bold uppercase mb-1">Auto-Scaling</div>
                    <div className="font-bold text-emerald-400 uppercase">Enabled</div>
                  </div>
                </div>

                {usage?.is_over_limit && (
                  <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                    <div>
                      <div className="text-rose-200 font-bold text-sm">Quota Exceeded</div>
                      <p className="text-rose-100/60 text-xs mt-0.5 leading-relaxed">
                        Limits reached for current tier. Overage charges may apply.
                      </p>
                    </div>
                  </div>
                )}

                <button className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20 text-sm">
                  Upgrade Subscription
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-slate-50/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-600 font-bold animate-pulse">Calculating Metrics...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsageDashboard;
