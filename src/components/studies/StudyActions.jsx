import {
  EyeIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  TrashIcon,
  ArchiveBoxIcon,
  EllipsisVerticalIcon
} from '@heroicons/react/24/outline';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function StudyActions({ study, onView, onReport, onExport, onShare, onDelete, onArchive }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);

  // Update position when menu opens or window resizes/scrolls
  const updatePosition = () => {
    if (buttonRef.current && menuOpen) {
      const rect = buttonRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;

      // Default to opening below and to the right-aligned
      let top = rect.bottom + scrollY + 5;
      let left = rect.right + scrollX - 192; // 192px is w-48

      // Check if it fits below, otherwise open above
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      if (spaceBelow < 200) { // Approx menu height
        top = rect.top + scrollY - 200;
      }

      setPosition({ top, left });
    }
  };

  useEffect(() => {
    if (menuOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [menuOpen]);

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (onDelete) {
      onDelete(study);
    }
  };

  const handleArchiveClick = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (onArchive) {
      onArchive(study);
    }
  };

  return (
    <div className="relative inline-block">
      <div className="flex items-center space-x-1">
        {/* Primary Actions */}
        <button
          onClick={(e) => { e.stopPropagation(); onView(study); }}
          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="View Study"
        >
          <EyeIcon className="h-5 w-5" />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onReport(study); }}
          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
          title="Create Report"
        >
          <DocumentTextIcon className="h-5 w-5" />
        </button>

        {/* More Actions Menu */}
        <button
          ref={buttonRef}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="More Actions"
        >
          <EllipsisVerticalIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Portal for Dropdown Menu */}
      {menuOpen && createPortal(
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
          />
          <div
            className="absolute z-50 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1"
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                onExport(study);
                setMenuOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              <span>Export DICOM</span>
            </button>

            <button
              onClick={() => {
                onShare(study);
                setMenuOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
            >
              <ShareIcon className="h-4 w-4" />
              <span>Share Study</span>
            </button>

            <button
              onClick={handleArchiveClick}
              className="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center space-x-2"
            >
              <ArchiveBoxIcon className="h-4 w-4" />
              <span>Archive Study</span>
            </button>

            <hr className="my-1" />

            <button
              onClick={handleDeleteClick}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
            >
              <TrashIcon className="h-4 w-4" />
              <span>Delete Study</span>
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}