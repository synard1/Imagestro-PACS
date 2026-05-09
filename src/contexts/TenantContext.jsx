import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

const TenantContext = createContext();

export const TenantProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState(() => {
    return localStorage.getItem('superadmin_selected_tenant') || '';
  });

  const isSuperAdmin = currentUser?.role === 'SUPERADMIN' || currentUser?.role === 'DEVELOPER';

  // If not superadmin, always use user's own tenant_id
  const effectiveTenantId = isSuperAdmin ? selectedTenantId : currentUser?.tenant_id;

  useEffect(() => {
    if (isSuperAdmin && selectedTenantId) {
      localStorage.setItem('superadmin_selected_tenant', selectedTenantId);
    }
  }, [selectedTenantId, isSuperAdmin]);

  return (
    <TenantContext.Provider value={{ 
      selectedTenantId, 
      setSelectedTenantId, 
      effectiveTenantId,
      isSuperAdmin 
    }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
