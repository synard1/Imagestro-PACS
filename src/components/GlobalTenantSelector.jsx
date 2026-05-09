import React, { useState, useEffect } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { tenantService } from '../services/tenantService';

export const GlobalTenantSelector = () => {
  const { selectedTenantId, setSelectedTenantId, isSuperAdmin } = useTenant();
  const [tenants, setTenants] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      loadTenants();
    }
  }, [isSuperAdmin]);

  const loadTenants = async () => {
    try {
      const response = await tenantService.listTenants({ is_active: true, limit: 100 });
      setTenants(response?.items || []);
    } catch (err) {
      console.error('Failed to load tenants for selector:', err);
    }
  };

  if (!isSuperAdmin) return null;

  const currentTenant = tenants.find(t => t.id === selectedTenantId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-all text-sm font-medium text-slate-700"
      >
        <Building2 size={16} className="text-slate-500" />
        <span className="max-w-[150px] truncate">
          {currentTenant ? currentTenant.name : 'Select Tenant'}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-20" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-2 border-b border-slate-50 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Switch Tenant Context
            </div>
            <div className="max-h-[300px] overflow-y-auto py-1">
              <button
                onClick={() => {
                  setSelectedTenantId('');
                  setIsOpen(false);
                  window.location.reload(); // Force reload to clear all states
                }}
                className={`w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-blue-50 transition-colors ${!selectedTenantId ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-600'}`}
              >
                All Tenants (Default)
                {!selectedTenantId && <Check size={14} />}
              </button>
              {tenants.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTenantId(t.id);
                    setIsOpen(false);
                    window.location.reload(); // Force reload to apply new tenant filter
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2 text-sm text-left hover:bg-blue-50 transition-colors ${selectedTenantId === t.id ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-600'}`}
                >
                  {t.name}
                  {selectedTenantId === t.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
