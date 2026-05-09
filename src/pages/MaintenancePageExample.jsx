import React from 'react';
import MaintenancePage from '../components/MaintenancePage';

/**
 * MaintenancePageExample - Example usage of the MaintenancePage component
 * 
 * This component demonstrates how to use the MaintenancePage component
 * in different scenarios within the React application.
 */
const MaintenancePageExample = () => {
  const handleRetry = () => {
    console.log('Retry callback triggered');
    // Custom retry logic here
    window.location.reload();
  };

  const handleCustomRetry = () => {
    console.log('Custom retry with navigation');
    // Navigate to a specific page after server recovery
    window.location.href = '/dashboard';
  };

  return (
    <div className="maintenance-examples">
      <h1 className="text-2xl font-bold mb-6">Maintenance Page Examples</h1>
      
      {/* Basic Usage */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Basic Usage</h2>
        <div className="border rounded-lg p-4 bg-gray-50">
          <MaintenancePage />
        </div>
      </div>

      {/* With Custom Retry */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">With Custom Retry Handler</h2>
        <div className="border rounded-lg p-4 bg-gray-50">
          <MaintenancePage 
            onRetry={handleRetry}
            originalUrl="/dashboard"
            serverStatus="maintenance"
          />
        </div>
      </div>

      {/* With Estimated Recovery */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">With Estimated Recovery Time</h2>
        <div className="border rounded-lg p-4 bg-gray-50">
          <MaintenancePage 
            onRetry={handleCustomRetry}
            estimatedRecovery="15 minutes"
            originalUrl="/reports"
            serverStatus="scheduled maintenance"
            maxRetries={5}
          />
        </div>
      </div>

      {/* Offline Scenario */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Offline Scenario</h2>
        <div className="border rounded-lg p-4 bg-gray-50">
          <MaintenancePage 
            serverStatus="offline"
            originalUrl="/viewer/study/123"
            maxRetries={3}
            autoRetryInterval={60000} // 1 minute
          />
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="mt-8 p-6 bg-blue-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Usage Instructions</h3>
        <div className="space-y-2 text-sm">
          <p><strong>Basic:</strong> <code>&lt;MaintenancePage /&gt;</code></p>
          <p><strong>With retry:</strong> <code>&lt;MaintenancePage onRetry={handleRetry} /&gt;</code></p>
          <p><strong>With recovery time:</strong> <code>&lt;MaintenancePage estimatedRecovery="10 minutes" /&gt;</code></p>
          <p><strong>Custom URL:</strong> <code>&lt;MaintenancePage originalUrl="/custom-page" /&gt;</code></p>
          <p><strong>Server status:</strong> <code>&lt;MaintenancePage serverStatus="maintenance" /&gt;</code></p>
          <p><strong>Max retries:</strong> <code>&lt;MaintenancePage maxRetries={5} /&gt;</code></p>
          <p><strong>Auto retry interval:</strong> <code>&lt;MaintenancePage autoRetryInterval={30000} /&gt;</code></p>
        </div>
      </div>

      {/* Props Documentation */}
      <div className="mt-6 p-6 bg-green-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Props</h3>
        <div className="space-y-2 text-sm">
          <p><strong>onRetry:</strong> Function - Callback when server recovery is detected</p>
          <p><strong>estimatedRecovery:</strong> String - Estimated recovery time message</p>
          <p><strong>originalUrl:</strong> String - URL to redirect to when server recovers (default: current URL)</p>
          <p><strong>serverStatus:</strong> String - Status message ('unavailable', 'offline', 'maintenance', etc.)</p>
          <p><strong>maxRetries:</strong> Number - Maximum retry attempts (default: 3)</p>
          <p><strong>autoRetryInterval:</strong> Number - Auto retry interval in milliseconds (default: 120000)</p>
          <p><strong>className:</strong> String - Additional CSS classes</p>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePageExample;