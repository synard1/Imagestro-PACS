import React, { useState, useEffect } from 'react';
import { 
  XMarkIcon, 
} from '@heroicons/react/24/outline';
import { 
  Activity, 
  Database, 
  Users, 
  Info, 
  AlertTriangle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { tenantService } from '../../services/tenantService';

const TenantStatsModal = ({ tenant, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    if (tenant) {
      loadStats();
    }
  }, [tenant]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const res = await tenantService.getTenantUsage(tenant.id);
      setUsage(res);
    } catch (err) {
      console.error('Failed to load tenant stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => new Intl.NumberFormat('id-ID').format(num || 0);

  if (!tenant) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white leading-tight">{tenant.name}</h2>
              <p className="text-blue-100 text-xs font-medium uppercase tracking-wider">{tenant.code} • Analytics</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <XMarkIcon className="h-8 w-8" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 font-medium animate-pulse">Gathering usage data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-blue-50/50 rounded-2xl border border-blue-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Activity className="w-5 h-5 text-blue-600" />
                    <span className="text-[10px] font-bold text-blue-600 bg-white px-2 py-0.5 rounded-full border border-blue-100">API</span>
                  </div>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Daily Requests</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-bold text-slate-900">{formatNumber(usage?.api_calls_today)}</span>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span className="text-slate-400">Utilization</span>
                      <span className="text-slate-700">{usage?.api_percent || 0}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(usage?.api_percent || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50/50 rounded-2xl border border-purple-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Database className="w-5 h-5 text-purple-600" />
                    <span className="text-[10px] font-bold text-purple-600 bg-white px-2 py-0.5 rounded-full border border-purple-100">DATA</span>
                  </div>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Storage Used</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-bold text-slate-900">{usage?.storage_gb?.toFixed(2) || '0.00'}</span>
                    <span className="text-slate-400 text-xs font-bold">GB</span>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span className="text-slate-400">Capacity</span>
                      <span className="text-slate-700">{usage?.storage_percent || 0}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(usage?.storage_percent || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50/50 rounded-2xl border border-emerald-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Users className="w-5 h-5 text-emerald-600" />
                    <span className="text-[10px] font-bold text-emerald-600 bg-white px-2 py-0.5 rounded-full border border-emerald-100">USERS</span>
                  </div>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Registered</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-bold text-slate-900">{tenant.user_count || 0}</span>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span className="text-slate-400">Active Peak Today</span>
                      <span className="text-emerald-700">{usage?.active_users || 0}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(usage?.user_percent || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Info */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Info className="w-4 h-4 text-slate-400" />
                  Subscription Details
                </h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="text-xs text-slate-500 font-medium">Service Tier</span>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">{usage?.tier_name || 'Professional'}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="text-xs text-slate-500 font-medium">Account Status</span>
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {usage?.status?.toUpperCase() || 'ACTIVE'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="text-xs text-slate-500 font-medium">Daily API Limit</span>
                    <span className="text-xs font-bold text-slate-700">{formatNumber(usage?.api_limit) || 'No Limit'}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="text-xs text-slate-500 font-medium">Storage Quota</span>
                    <span className="text-xs font-bold text-slate-700">{usage?.storage_limit_gb || 0} GB</span>
                  </div>
                </div>
              </div>

              {usage?.is_over_limit && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex gap-3 items-start">
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-rose-900">Resource Quota Exceeded</h4>
                    <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                      This tenant has exceeded its assigned resource limits. Overage billing may apply, or some features may be restricted until the subscription is upgraded.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors text-sm"
                >
                  Close View
                </button>
                <button
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all text-sm"
                >
                  Upgrade Tier
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TenantStatsModal;
