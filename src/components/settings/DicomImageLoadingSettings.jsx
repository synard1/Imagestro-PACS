import { useState, useEffect } from 'react';

export default function DicomImageLoadingSettings() {
  const [settings, setSettings] = useState({
    usePresignedUrls: true,
    timeout: 90,
    enableCaching: true,
    cacheSize: 500, // MB
    redirectToS3: true
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Load settings from localStorage
    const stored = localStorage.getItem('dicomImageLoadingSettings');
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
      } catch (e) {
        console.warn('Failed to load image loading settings:', e);
      }
    }
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem('dicomImageLoadingSettings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4">DICOM Image Loading</h3>

      <div className="space-y-4">
        {/* Use Presigned URLs */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-white font-medium">Use Presigned URLs for S3</label>
            <p className="text-xs text-gray-400 mt-1">
              Faster loading for S3-stored files by using direct presigned URLs
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.usePresignedUrls}
            onChange={(e) => handleChange('usePresignedUrls', e.target.checked)}
            className="w-5 h-5 rounded"
          />
        </div>

        {/* Redirect to S3 */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-white font-medium">Redirect to S3 (307)</label>
            <p className="text-xs text-gray-400 mt-1">
              Backend redirects to presigned URL instead of proxying (faster)
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.redirectToS3}
            onChange={(e) => handleChange('redirectToS3', e.target.checked)}
            className="w-5 h-5 rounded"
          />
        </div>

        {/* Timeout */}
        <div>
          <label className="text-white font-medium block mb-2">
            Image Loading Timeout (seconds)
          </label>
          <input
            type="number"
            min="30"
            max="300"
            value={settings.timeout}
            onChange={(e) => handleChange('timeout', parseInt(e.target.value))}
            className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600"
          />
          <p className="text-xs text-gray-400 mt-1">
            Increase for slow S3 connections (default: 90s)
          </p>
        </div>

        {/* Enable Caching */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-white font-medium">Enable Image Caching</label>
            <p className="text-xs text-gray-400 mt-1">
              Cache downloaded images in IndexedDB for faster re-access
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.enableCaching}
            onChange={(e) => handleChange('enableCaching', e.target.checked)}
            className="w-5 h-5 rounded"
          />
        </div>

        {/* Cache Size */}
        {settings.enableCaching && (
          <div>
            <label className="text-white font-medium block mb-2">
              Cache Size (MB)
            </label>
            <input
              type="number"
              min="100"
              max="2000"
              value={settings.cacheSize}
              onChange={(e) => handleChange('cacheSize', parseInt(e.target.value))}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600"
            />
            <p className="text-xs text-gray-400 mt-1">
              Maximum cache size in MB (default: 500MB)
            </p>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Save Settings
        </button>
        {saved && (
          <div className="flex items-center text-green-400 text-sm">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Settings saved
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-900/30 border border-blue-700 rounded">
        <p className="text-xs text-blue-300">
          <strong>Note:</strong> These settings affect how DICOM images are loaded from S3 storage. 
          Presigned URLs and redirects provide faster loading for remote files. Caching improves performance 
          for frequently accessed studies.
        </p>
      </div>
    </div>
  );
}
