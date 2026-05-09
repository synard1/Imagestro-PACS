import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const StandardNode = ({ data, selected }) => {
  if (!data.isRevealed) {
    return (
      <div className="px-4 py-2 rounded-md border-2 border-dashed border-gray-200 bg-gray-50 opacity-30">
        <div className="text-xs font-bold text-gray-400 mb-1">???</div>
        <div className="text-sm text-gray-300">Waiting...</div>
        <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-gray-300" />
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-gray-300" />
      </div>
    );
  }

  return (
    <div 
      className={`px-4 py-2 shadow-md rounded-md border-2 select-none transition-all duration-500 ${
        data.isJustRevealed ? 'border-purple-500 bg-purple-50 scale-110 shadow-xl animate-pulse' :
        data.isActive ? 'border-blue-500 bg-blue-50 scale-105 shadow-lg' : 
        data.isDone ? 'border-emerald-500 bg-emerald-50' :
        data.isManual ? 'border-amber-500 bg-amber-50' :
        data.isError ? 'border-red-500 bg-red-50' :
        'border-gray-200 bg-white'
      }`}
    >
      <div className="flex flex-col">
        <div className="text-xs font-bold text-gray-500 mb-1">{data.category}</div>
        <div className="text-sm font-semibold">{data.label}</div>
      </div>
      
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-gray-400" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-gray-400" />
    </div>
  );
};

export default memo(StandardNode);
