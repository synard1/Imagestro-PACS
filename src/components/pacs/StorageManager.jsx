import { useState, useEffect } from 'react';
import { 
  getStorageStats, 
  clearAllStorage, 
  getAllStudies,
  deleteStudy 
} from '../../services/dicomStorageService';
import { TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function StorageManager() {
  const [stats, setStats] = useState(null);
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = () => {
    const storageStats = getStorageStats();
    const allStudies = getAllStudies();
    setStats(storageStats);
    setStudies(allStudies);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear ALL DICOM storage? This cannot be undone.')) {
      setLoading(true);
      clearAllStorage();
      setTimeout(() => {
        loadData();
        setLoading(false);
      }, 500);
    }
  };

  const handleDeleteStudy = (studyId) => {
    if (window.confirm('Delete this study?')) {
      setLoading(true);
      deleteStudy(studyId);
      setTimeout(() => {
        loadData();
        setLoading(false);
      }, 500);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      loadData();
      setLoading(false);
    }, 500);
  };

  if (!stats) return <div>Loading...</div>;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">DICOM Storage Manager</h2>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleClearAll}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            <TrashIcon className="h-5 w-5" />
            Clear All
          </button>
        </div>
      </div>

      {/* Storage Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-3xl font-bold text-blue-900">{stats.studyCount}</div>
          <div className="text-sm text-blue-600">Studies</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-3xl font-bold text-green-900">{stats.seriesCount}</div>
          <div className="text-sm text-green-600">Series</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-3xl font-bold text-purple-900">{stats.instanceCount}</div>
          <div className="text-sm text-purple-600">Instances</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4">
          <div className="text-3xl font-bold text-orange-900">{stats.totalSizeMB}</div>
          <div className="text-sm text-orange-600">MB Used</div>
        </div>
      </div>

      {/* Storage Warning */}
      {stats.totalSize > 8 * 1024 * 1024 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="font-semibold text-yellow-900">⚠️ Storage Warning</div>
          <div className="text-sm text-yellow-800">
            Storage is nearly full ({stats.totalSizeMB} MB / ~10 MB limit). Consider clearing old studies.
          </div>
        </div>
      )}

      {/* Studies List */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Stored Studies ({studies.length})
        </h3>
        
        {studies.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No studies in storage
          </div>
        ) : (
          <div className="space-y-2">
            {studies.map((study) => (
              <div
                key={study.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {study.patientName}
                  </div>
                  <div className="text-sm text-gray-600">
                    {study.studyDescription} • {study.modality} • {study.studyDate}
                  </div>
                  <div className="text-xs text-gray-500">
                    {study.numberOfSeries} series • {study.numberOfInstances} instances
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteStudy(study.id)}
                  className="px-3 py-1 text-sm text-red-600 hover:bg-red-100 rounded"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raw Data (for debugging) */}
      <details className="mt-6">
        <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
          Show Raw Data (Debug)
        </summary>
        <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-96">
          {JSON.stringify({ stats, studies }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
