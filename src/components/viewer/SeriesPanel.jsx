import { XMarkIcon, PhotoIcon } from '@heroicons/react/24/outline';

export default function SeriesPanel({ series = [], onSeriesSelect, onClose, activeSeries }) {
  if (!series || series.length === 0) {
    return (
      <div className="absolute left-4 top-16 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="font-semibold text-white">Series</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="p-8 text-center text-gray-500">
          <PhotoIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No series available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute left-4 top-16 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-[calc(100vh-100px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="font-semibold text-white">Series ({series.length})</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white rounded"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Series List */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {series.map((s, index) => (
            <button
              key={s.seriesInstanceUID || index}
              onClick={() => onSeriesSelect(s, index)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                activeSeries === index
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {/* Thumbnail Placeholder */}
              <div className="aspect-square bg-gray-800 rounded mb-2 flex items-center justify-center">
                <PhotoIcon className="h-8 w-8 text-gray-600" />
              </div>

              {/* Series Info */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Series {s.seriesNumber || index + 1}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-gray-700 rounded">
                    {s.modality || 'CT'}
                  </span>
                </div>
                <div className="text-xs opacity-75 truncate">
                  {s.description || s.seriesDescription || 'No description'}
                </div>
                <div className="text-xs opacity-50">
                  {s.instanceCount || s.instances?.length || s.number_of_instances || 0} images
                  {(s.storageSize || s.storage_size) > 0 && (
                    <span className="ml-1">
                      • {((s.storageSize || s.storage_size) / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
