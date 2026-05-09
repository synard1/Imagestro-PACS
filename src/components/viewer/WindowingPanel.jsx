import { XMarkIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

export default function WindowingPanel({ onClose, onApply, currentWindow }) {
  const [width, setWidth] = useState(currentWindow?.width || 400);
  const [center, setCenter] = useState(currentWindow?.center || 40);

  const presets = [
    { name: 'Default', width: 400, center: 40, color: 'bg-gray-600' },
    { name: 'Lung', width: 1500, center: -600, color: 'bg-blue-600' },
    { name: 'Bone', width: 2000, center: 300, color: 'bg-yellow-600' },
    { name: 'Brain', width: 80, center: 40, color: 'bg-purple-600' },
    { name: 'Soft Tissue', width: 350, center: 50, color: 'bg-green-600' },
    { name: 'Liver', width: 150, center: 30, color: 'bg-orange-600' },
    { name: 'Mediastinum', width: 350, center: 50, color: 'bg-indigo-600' },
    { name: 'Abdomen', width: 400, center: 50, color: 'bg-pink-600' },
  ];

  const handlePreset = (preset) => {
    setWidth(preset.width);
    setCenter(preset.center);
    onApply(preset.width, preset.center);
  };

  const handleApply = () => {
    onApply(width, center);
  };

  return (
    <div className="absolute right-4 top-16 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="font-semibold text-white">Window/Level</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white rounded"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Current Values */}
        <div className="bg-gray-900 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-xs text-gray-400 mb-1">Width</div>
              <div className="text-2xl font-bold text-white">{Math.round(width)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Center</div>
              <div className="text-2xl font-bold text-white">{Math.round(center)}</div>
            </div>
          </div>
        </div>

        {/* Sliders */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">
            Window Width
          </label>
          <input
            type="range"
            min="1"
            max="4000"
            value={width}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setWidth(val);
              onApply(val, center);
            }}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1</span>
            <span>4000</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-2">
            Window Center
          </label>
          <input
            type="range"
            min="-1000"
            max="1000"
            value={center}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setCenter(val);
              onApply(width, val);
            }}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>-1000</span>
            <span>1000</span>
          </div>
        </div>

        {/* Presets */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">
            Presets
          </label>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handlePreset(preset)}
                className={`${preset.color} text-white px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Manual Input */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Width</label>
            <input
              type="number"
              value={Math.round(width)}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                setWidth(val);
              }}
              onBlur={handleApply}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Center</label>
            <input
              type="number"
              value={Math.round(center)}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                setCenter(val);
              }}
              onBlur={handleApply}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
            />
          </div>
        </div>

        {/* Apply Button */}
        <button
          onClick={handleApply}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
