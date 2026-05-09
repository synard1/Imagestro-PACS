import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const DiamondNode = ({ data, selected }) => {
  if (!data.isRevealed) {
    return (
      <div className="relative flex items-center justify-center w-24 h-24 opacity-30">
        <div className="absolute inset-0 rotate-45 border-2 border-dashed border-gray-300 bg-gray-50" />
        <div className="relative z-10 text-[10px] font-bold text-center px-2 text-gray-300">Waiting...</div>
        <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-gray-300" />
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-gray-300" />
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center w-24 h-24 select-none ${selected ? 'scale-110' : ''} transition-transform duration-500`}>
      <div 
        className={`absolute inset-0 rotate-45 border-2 transition-all duration-500 ${
          data.isJustRevealed ? 'border-purple-500 bg-purple-50 shadow-xl' :
          data.isActive ? 'border-blue-500 bg-blue-50 shadow-lg' : 
          data.isDone ? 'border-emerald-500 bg-emerald-50' :
          data.isManual ? 'border-amber-500 bg-amber-50' :
          data.isError ? 'border-red-500 bg-red-50' :
          'border-gray-300 bg-white'
        }`}
      />
      <div className="relative z-10 text-[10px] font-bold text-center px-2 select-none">{data.label}</div>
      
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-gray-400" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-gray-400" />
      <Handle type="source" position={Position.Right} id="yes" className="w-2 h-2 !bg-green-500" />
      <Handle type="source" position={Position.Left} id="no" className="w-2 h-2 !bg-red-500" />
    </div>
  );
};

export default memo(DiamondNode);
