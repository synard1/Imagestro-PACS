import { XMarkIcon } from '@heroicons/react/24/outline';

export default function LayoutSelector({ onSelect, onClose, currentLayout }) {
  const layouts = [
    { id: '1x1', name: '1×1', icon: '▢', description: 'Single viewport' },
    { id: '1x2', name: '1×2', icon: '▢▢', description: 'Side by side' },
    { id: '2x1', name: '2×1', icon: '▢\n▢', description: 'Top and bottom' },
    { id: '2x2', name: '2×2', icon: '▢▢\n▢▢', description: 'Four viewports' },
    { id: '3x3', name: '3×3', icon: '▢▢▢\n▢▢▢\n▢▢▢', description: 'Nine viewports' },
  ];

  return (
    <div className="absolute right-4 top-16 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="font-semibold text-white">Viewport Layout</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white rounded"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          {layouts.map((layout) => (
            <button
              key={layout.id}
              onClick={() => {
                onSelect(layout.id);
                onClose();
              }}
              className={`p-4 rounded-lg border-2 transition-all ${
                currentLayout === layout.id
                  ? 'border-blue-600 bg-blue-600/20'
                  : 'border-gray-700 bg-gray-900 hover:border-gray-600'
              }`}
            >
              <div className="text-center">
                <div className="text-3xl mb-2 whitespace-pre-line leading-tight">
                  {layout.icon}
                </div>
                <div className="font-medium text-white mb-1">{layout.name}</div>
                <div className="text-xs text-gray-400">{layout.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Info */}
        <div className="mt-4 p-3 bg-gray-900 rounded-lg">
          <div className="text-xs text-gray-400">
            💡 <span className="text-gray-300">Tip:</span> Click on a viewport to make it active
          </div>
        </div>
      </div>
    </div>
  );
}
