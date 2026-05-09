import { 
  PlayIcon, 
  PauseIcon, 
  ForwardIcon, 
  BackwardIcon,
  ArrowPathIcon
} from '@heroicons/react/24/solid';

export default function CineControls({ 
  isPlaying, 
  onPlayPause, 
  onNextFrame, 
  onPrevFrame,
  onLoop,
  currentFrame = 1,
  totalFrames = 1,
  fps = 10,
  onFpsChange
}) {
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl px-6 py-3">
      <div className="flex items-center space-x-4">
        {/* Previous Frame */}
        <button
          onClick={onPrevFrame}
          className="p-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          title="Previous Frame (←)"
        >
          <BackwardIcon className="h-5 w-5" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={onPlayPause}
          className="p-3 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? (
            <PauseIcon className="h-6 w-6" />
          ) : (
            <PlayIcon className="h-6 w-6" />
          )}
        </button>

        {/* Next Frame */}
        <button
          onClick={onNextFrame}
          className="p-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          title="Next Frame (→)"
        >
          <ForwardIcon className="h-5 w-5" />
        </button>

        <div className="w-px h-8 bg-gray-700" />

        {/* Frame Counter */}
        <div className="text-white text-sm font-medium min-w-[80px] text-center">
          {currentFrame} / {totalFrames}
        </div>

        <div className="w-px h-8 bg-gray-700" />

        {/* FPS Control */}
        <div className="flex items-center space-x-2">
          <label className="text-xs text-gray-400">FPS:</label>
          <select
            value={fps}
            onChange={(e) => onFpsChange(parseInt(e.target.value))}
            className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm"
          >
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="20">20</option>
            <option value="30">30</option>
            <option value="60">60</option>
          </select>
        </div>

        <div className="w-px h-8 bg-gray-700" />

        {/* Loop Button */}
        <button
          onClick={onLoop}
          className="p-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          title="Loop"
        >
          <ArrowPathIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 transition-all duration-100"
            style={{ width: `${(currentFrame / totalFrames) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
