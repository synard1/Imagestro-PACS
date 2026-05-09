import React from 'react';

// Define storage indicators constants for reuse
export const STORAGE_INDICATORS = {
    browser: {
        text: 'Browser Storage',
        icon: '💾',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        description: 'Data stored locally in browser localStorage'
    },
    server: {
        text: 'Server Storage',
        icon: '📡',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        description: 'Data stored on remote server with synchronization'
    },
    external: {
        text: 'External API',
        icon: '☁️',
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
        description: 'Data retrieved from external backend application'
    }
};

const StorageIndicator = ({ storageType, className = "", showText = true }) => {
    // Check if indicator should be shown based on env var
    // Default to true if not specified
    const shouldShow = import.meta.env.VITE_SHOW_STORAGE_INDICATOR !== 'false';

    if (!shouldShow) return null;

    const info = STORAGE_INDICATORS[storageType] || STORAGE_INDICATORS.browser;

    return (
        <div
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${info.bgColor} ${info.color} ${className}`}
            title={info.description}
        >
            <span className={showText ? "mr-1" : ""}>{info.icon}</span>
            {showText && info.text}
        </div>
    );
};

export default StorageIndicator;
