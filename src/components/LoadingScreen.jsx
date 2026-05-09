import React from 'react';

export default function LoadingScreen({ message = "Loading..." }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        {/* Clean spinner */}
        <div className="relative inline-flex items-center justify-center w-16 h-16">
          <div className="absolute w-16 h-16 rounded-full border-2 border-slate-200" />
          <div className="absolute w-16 h-16 rounded-full border-2 border-t-blue-600 animate-spin" style={{ animationDuration: '0.8s' }} />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900">Imagestro PACS</h2>
          <p className="text-sm text-slate-500">{message}</p>
        </div>
      </div>
    </div>
  )
}