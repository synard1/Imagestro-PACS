import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
if (!document.head.querySelector('#dropdown-animations')) {
  style.id = 'dropdown-animations';
  document.head.appendChild(style);
}

export default function StudyActionsDropdown({ study, onView, onEdit, onDelete, onArchive, onToggleSeries, isExpanded }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'bottom' });
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  const scrollIntoViewIfNeeded = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 260; // Increased for new item
      const viewportHeight = window.innerHeight;
      const minPadding = 60; // Increased padding for better visibility

      // Check if button is too close to bottom
      const spaceBelow = viewportHeight - rect.bottom;
      
      console.log('[Auto-Scroll] Button bottom:', rect.bottom);
      console.log('[Auto-Scroll] Viewport height:', viewportHeight);
      console.log('[Auto-Scroll] Space below:', spaceBelow);
      console.log('[Auto-Scroll] Required space:', dropdownHeight + minPadding);
      
      // Always ensure enough space for dropdown
      if (spaceBelow < dropdownHeight + minPadding) {
        setIsScrolling(true);
        
        // Calculate how much to scroll
        // We want the button to be positioned so dropdown has full space
        const targetSpaceBelow = dropdownHeight + minPadding;
        const scrollAmount = targetSpaceBelow - spaceBelow + 20; // Extra 20px buffer
        
        console.log('[Auto-Scroll] Need to scroll by:', scrollAmount, 'px');
        
        // Smooth scroll
        window.scrollBy({
          top: scrollAmount,
          behavior: 'smooth'
        });

        // Wait for scroll to complete before updating position
        setTimeout(() => {
          console.log('[Auto-Scroll] Scroll complete, opening dropdown');
          setIsScrolling(false);
          updatePosition();
        }, 450);
      } else {
        console.log('[Auto-Scroll] Enough space, opening dropdown immediately');
        updatePosition();
      }
    }
  };

  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 260; // Adjusted for new item
      const dropdownWidth = 192; // w-48 = 12rem = 192px
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const margin = 8;

      // Determine vertical placement
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      console.log('[Position] Space below:', spaceBelow, 'Space above:', spaceAbove);
      
      // Prefer bottom placement, but use top if not enough space below
      let placement = 'bottom';
      if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
        placement = 'top';
      }

      // Calculate position
      let top, left;
      
      if (placement === 'top') {
        top = rect.top - dropdownHeight - margin;
        console.log('[Position] Placing above button');
      } else {
        top = rect.bottom + margin;
        console.log('[Position] Placing below button');
      }

      // Ensure dropdown doesn't go below viewport
      if (top + dropdownHeight > viewportHeight - margin) {
        top = viewportHeight - dropdownHeight - margin;
        console.log('[Position] Adjusted to fit viewport');
      }

      // Ensure dropdown doesn't go above viewport
      if (top < margin) {
        top = margin;
        console.log('[Position] Adjusted to not go above viewport');
      }

      // Align to right edge of button, but ensure it doesn't go off-screen
      left = rect.right - dropdownWidth;
      if (left < margin) {
        left = margin;
      }
      if (left + dropdownWidth > viewportWidth - margin) {
        left = viewportWidth - dropdownWidth - margin;
      }

      console.log('[Position] Final position:', { top, left, placement });
      setPosition({ top, left, placement });
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      scrollIntoViewIfNeeded();
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 text-sm flex items-center gap-1 transition-colors ${
          isScrolling ? 'opacity-50 cursor-wait' : ''
        }`}
        title="Actions"
        disabled={isScrolling}
      >
        <span className="text-lg leading-none">⋮</span>
        <span className="text-xs font-medium">Actions</span>
      </button>

      {isOpen && !isScrolling &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed w-48 bg-white rounded-lg shadow-xl border border-gray-200 transition-opacity duration-200"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              zIndex: 9999,
              animation: 'fadeIn 0.15s ease-out',
              maxHeight: '260px',
              overflowY: 'auto'
            }}
          >
            <div className="py-1">
              <button
                onClick={() => {
                  onToggleSeries();
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 transition-colors"
              >
                <span className="text-base">{isExpanded ? '▲' : '▼'}</span>
                <span>{isExpanded ? 'Hide Series' : 'Show Series'}</span>
              </button>

              <button
                onClick={() => {
                  onView();
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>Open Viewer</span>
              </button>

              <div className="border-t border-gray-200 my-1"></div>

              <button
                onClick={() => {
                  onEdit();
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 text-amber-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Edit Study</span>
              </button>

              <button
                onClick={() => {
                  if (onArchive) onArchive();
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 text-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                <span>Archive Study</span>
              </button>

              <button
                onClick={() => {
                  onDelete();
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 text-red-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Delete Study</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
