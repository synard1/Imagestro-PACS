import React from 'react';
import { 
  BuildingOfficeIcon, 
  MapPinIcon, 
  UserGroupIcon, 
  ArrowTopRightOnSquareIcon,
  EllipsisVerticalIcon,
  CircleStackIcon,
  PencilSquareIcon,
  ChartBarIcon,
  ServerStackIcon
} from '@heroicons/react/24/outline';

/**
 * TenantCard for overview list
 */
const TenantCard = ({ tenant, subscription, onEdit, onViewDetails, onAddAdmin, onConfigSIMRS }) => {
  const getStatusStyle = (isActive) => {
    return isActive 
      ? 'bg-green-100 text-green-700 border-green-200' 
      : 'bg-slate-100 text-slate-500 border-slate-200';
  };

  const getTierBadge = (sub) => {
    if (!sub) return 'bg-slate-100 text-slate-500';
    const tier = (sub.product_name || 'Basic').toLowerCase();
    if (tier.includes('pro')) return 'bg-purple-100 text-purple-700 border-purple-200';
    if (tier.includes('enterprise')) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all duration-300 group overflow-hidden">
      {/* Card Header */}
      <div className="p-5 flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <BuildingOfficeIcon className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 leading-tight truncate">{tenant.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              {subscription ? (
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase ${getTierBadge(subscription)}`}>
                  {subscription.product_name}
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-slate-50 text-slate-400 border-slate-200 uppercase">
                  No Sub
                </span>
              )}
              <span className="text-[10px] text-slate-400 font-mono">{tenant.code}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusStyle(tenant.is_active)}`}>
            {tenant.is_active ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </div>
      </div>

      {/* Card Stats */}
      <div className="px-5 py-4 bg-slate-50/50 grid grid-cols-2 gap-4 border-y border-slate-100">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Usage</span>
          <div className="flex items-center gap-2 mt-1">
            <CircleStackIcon className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-bold text-slate-700">{tenant.storage_used_gb || 0} GB</span>
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Users</span>
          <div className="flex items-center gap-2 mt-1">
            <UserGroupIcon className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-bold text-slate-700">{tenant.user_count || 0}</span>
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className="p-4 flex gap-2">
        <button 
          onClick={() => onViewDetails(tenant)}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 hover:text-blue-600 hover:border-blue-100 transition-colors group/stats"
          title="View Analytics"
        >
          <ChartBarIcon className="h-4 w-4 text-slate-400 group-hover/stats:text-blue-600 transition-colors" />
          Stats
        </button>
        <button 
          onClick={() => onAddAdmin(tenant)}
          className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors"
          title="Add Tenant Admin"
        >
          <UserGroupIcon className="h-5 w-5" />
        </button>
        <button 
          onClick={() => onConfigSIMRS(tenant)}
          className="px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors"
          title="Config SIMRS"
        >
          <ServerStackIcon className="h-5 w-5" />
        </button>
        <button 
          onClick={() => onEdit(tenant)}
          className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-lg shadow-blue-100 transition-colors"
          title="Edit Tenant Settings"
        >
          <PencilSquareIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default TenantCard;

