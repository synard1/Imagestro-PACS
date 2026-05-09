/**
 * Storage Monitor Page
 * Wrapper page for the Storage Dashboard component
 * Requirements: 1.1, 1.2, 1.4
 */

import { StorageDashboard } from '../components/storage'

export default function StorageMonitorPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Storage Monitor</h1>
          <p className="text-sm text-slate-500">
            Real-time storage monitoring with alerts and historical trends
          </p>
        </div>
      </div>
      
      <StorageDashboard refreshInterval={60000} />
    </div>
  )
}
