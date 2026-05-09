import { 
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  ArrowsPointingOutIcon,
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PauseIcon,
  Square2StackIcon,
  ArrowUturnLeftIcon
} from '@heroicons/react/24/outline';

export default function ViewerToolbar({ 
  activeTool, 
  onToolChange,
  onZoomIn,
  onZoomOut,
  onReset,
  onToggleWindowing,
  onToggleMeasurements,
  onToggleCine,
  isPlaying,
  onToggleLayout
}) {
  const tools = [
    { id: 'pan', icon: ArrowsPointingOutIcon, label: 'Pan', shortcut: 'P' },
    { id: 'zoom', icon: MagnifyingGlassMinusIcon, label: 'Zoom', shortcut: 'Z' },
    { id: 'windowing', icon: AdjustmentsHorizontalIcon, label: 'Window/Level', shortcut: 'W' },
    { id: 'measure', icon: PencilIcon, label: 'Measurements', shortcut: 'M' },
    { id: 'cine', icon: isPlaying ? PauseIcon : PlayIcon, label: 'Cine', shortcut: 'C' },
  ];

  return (
    <div className="bg-gray-900 border-b border-gray-700 px-4 py-2">
      <div className="flex items-center justify-between">
        {/* Left - Main Tools */}
        <div className="flex items-center space-x-1">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => {
                  if (tool.id === 'windowing') onToggleWindowing();
                  else if (tool.id === 'measure') onToggleMeasurements();
                  else if (tool.id === 'cine') onToggleCine();
                  else onToolChange(tool.id);
                }}
                className={`p-2 rounded-lg transition-colors ${
                  activeTool === tool.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
                title={`${tool.label} (${tool.shortcut})`}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}

          <div className="w-px h-6 bg-gray-700 mx-2" />

          {/* Zoom Controls */}
          <button
            onClick={onZoomOut}
            className="p-2 text-gray-300 hover:bg-gray-800 rounded-lg"
            title="Zoom Out (-)"
          >
            <MagnifyingGlassMinusIcon className="h-5 w-5" />
          </button>
          <button
            onClick={onZoomIn}
            className="p-2 text-gray-300 hover:bg-gray-800 rounded-lg"
            title="Zoom In (+)"
          >
            <MagnifyingGlassPlusIcon className="h-5 w-5" />
          </button>

          <div className="w-px h-6 bg-gray-700 mx-2" />

          {/* Reset */}
          <button
            onClick={onReset}
            className="p-2 text-gray-300 hover:bg-gray-800 rounded-lg"
            title="Reset View (R)"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </button>

          {/* Undo */}
          <button
            className="p-2 text-gray-300 hover:bg-gray-800 rounded-lg"
            title="Undo (Ctrl+Z)"
          >
            <ArrowUturnLeftIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Right - Layout & View Options */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleLayout}
            className="p-2 text-gray-300 hover:bg-gray-800 rounded-lg"
            title="Change Layout"
          >
            <Square2StackIcon className="h-5 w-5" />
          </button>

          <div className="text-xs text-gray-400 px-3">
            Press <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">?</kbd> for shortcuts
          </div>
        </div>
      </div>
    </div>
  );
}
