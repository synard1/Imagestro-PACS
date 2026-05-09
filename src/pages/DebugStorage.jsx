import { useState, useEffect } from 'react';
import { 
  getAllStudies, 
  getStorageStats,
  getSeriesByStudyUID,
  getInstancesBySeriesUID 
} from '../services/dicomStorageService';

export default function DebugStorage() {
  const [studies, setStudies] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [series, setSeries] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const allStudies = getAllStudies();
    const storageStats = getStorageStats();
    setStudies(allStudies);
    setStats(storageStats);
    console.log('[DebugStorage] Studies:', allStudies);
    console.log('[DebugStorage] Stats:', storageStats);
  };

  const handleStudyClick = (study) => {
    setSelectedStudy(study);
    const studySeries = getSeriesByStudyUID(study.studyUID);
    setSeries(studySeries);
    console.log('[DebugStorage] Selected study:', study);
    console.log('[DebugStorage] Series:', studySeries);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Debug Storage</h1>

      {/* Stats */}
      {stats && (
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
      )}

      {/* Studies List */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Studies in localStorage</h2>
        
        {studies.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No studies in localStorage
          </div>
        ) : (
          <div className="space-y-2">
            {studies.map((study) => (
              <div
                key={study.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => handleStudyClick(study)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {study.patientName}
                    </div>
                    <div className="text-sm text-gray-600">
                      {study.studyDescription} • {study.modality}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      <div>Internal ID: {study.id}</div>
                      <div>Study UID: {study.studyUID}</div>
                      <div>Accession: {study.accessionNumber}</div>
                      <div>Date: {study.studyDate}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">
                      {study.numberOfSeries} series
                    </div>
                    <div className="text-sm text-gray-600">
                      {study.numberOfInstances} instances
                    </div>
                  </div>
                </div>
                
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(study.studyUID);
                    }}
                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    Copy Study UID
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(study.id);
                    }}
                    className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                  >
                    Copy Internal ID
                  </button>
                  <a
                    href={`/study/${study.studyUID}`}
                    onClick={(e) => e.stopPropagation()}
                    className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                  >
                    View Details
                  </a>
                  <a
                    href={`/report/${study.studyUID}`}
                    onClick={(e) => e.stopPropagation()}
                    className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                  >
                    Create Report
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Study Details */}
      {selectedStudy && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Selected Study Details</h2>
          
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Study Object:</h3>
            <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
              {JSON.stringify(selectedStudy, null, 2)}
            </pre>
          </div>

          {series.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Series ({series.length}):</h3>
              <div className="space-y-2">
                {series.map((s) => (
                  <div key={s.id} className="border border-gray-200 rounded p-3">
                    <div className="text-sm">
                      <div>Series UID: {s.seriesUID}</div>
                      <div>Description: {s.seriesDescription}</div>
                      <div>Instances: {s.numberOfInstances}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raw localStorage Data */}
      <details className="mt-6">
        <summary className="cursor-pointer text-lg font-semibold mb-2">
          Raw localStorage Data
        </summary>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">pacs_studies:</h3>
            <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
              {localStorage.getItem('pacs_studies') || 'null'}
            </pre>
          </div>
          <div>
            <h3 className="font-semibold mb-2">pacs_series:</h3>
            <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
              {localStorage.getItem('pacs_series') || 'null'}
            </pre>
          </div>
          <div>
            <h3 className="font-semibold mb-2">pacs_instances:</h3>
            <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
              {localStorage.getItem('pacs_instances') || 'null'}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
}
