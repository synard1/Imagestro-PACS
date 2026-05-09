import React, { useState, useRef, useEffect } from 'react';

export default function StudyActionsMenu({ study, onView, onEdit, onDelete, onToggleSeries, isExpanded }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const menuRect = dropdownRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      if (menuRect.bottom > viewportHeight) {
        const scrollAmount = menuRect.bottom - viewportHeight + 20; // 20px buffer
        window.scrollBy({
          top: scrollAmount,
          behavior: 'smooth',
        });
      }
    }
  }, [isOpen]);

  const dropdownClasses = 'absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50';

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 text-sm flex items-center gap-1"
        title="Actions"
      >
        <span>⋮</span>
        Actions
      </button>

      {isOpen && (
        <div ref={dropdownRef} className={dropdownClasses}>
          <div className="py-1">
            <button
              onClick={() => {
                onToggleSeries();
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <span>{isExpanded ? '▲' : '▼'}</span>
              {isExpanded ? 'Hide Series' : 'Show Series'}
            </button>
            
            <button
              onClick={() => {
                onView();
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <span>👁️</span>
              Open Viewer
            </button>

            <div className="border-t border-gray-200 my-1"></div>

            <button
              onClick={() => {
                onEdit();
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-green-700"
            >
              <span>✏️</span>
              Edit Study
            </button>

            <button
              onClick={() => {
                onDelete();
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-red-700"
            >
              <span>🗑️</span>
              Delete Study
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
