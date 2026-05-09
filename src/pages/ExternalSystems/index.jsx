/**
 * External Systems Consolidation Page
 * 
 * Unified page for managing all external systems (SIMRS, HIS, RIS, PACS, LIS, EMR)
 * with special support for SIMRS Khanza integration including order browser,
 * import history, and mapping management.
 * 
 * Requirements: 1.1, 2.1, 3.1
 */

import React, { useState, useEffect } from 'react';
import { useExternalSystems } from '../../hooks/useExternalSystems';
import ExternalSystemsList from './ExternalSystemsList';
import ExternalSystemsDetail from './ExternalSystemsDetail';
import { logger } from '../../utils/logger';

export default function ExternalSystems() {
  const [view, setView] = useState('list'); // 'list' or 'detail'
  const [selectedSystemId, setSelectedSystemId] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { systems, loading, error } = useExternalSystems(refreshTrigger);

  const handleSelectSystem = (systemId) => {
    setSelectedSystemId(systemId);
    setView('detail');
  };

  const handleCreateNew = () => {
    setSelectedSystemId(null);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    setSelectedSystemId(null);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleSave = () => {
    setRefreshTrigger(prev => prev + 1);
    handleBack();
  };

  return (
    <div className="space-y-6">
      {view === 'list' ? (
        <ExternalSystemsList
          systems={systems}
          loading={loading}
          error={error}
          onSelectSystem={handleSelectSystem}
          onCreateNew={handleCreateNew}
          onRefresh={() => setRefreshTrigger(prev => prev + 1)}
        />
      ) : (
        <ExternalSystemsDetail
          systemId={selectedSystemId}
          onSave={handleSave}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
