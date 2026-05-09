import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X, History } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';

const APP_SHORT_NAME = import.meta.env.VITE_APP_SHORT_NAME || 'MWL / mini-PACS';

const SAMPLE_CHANGELOG = `
# Changelog

All notable changes to the MWL / mini-PACS project will be documented in this file.

## [Unreleased]

### Added
- **Changelog Viewer** - New dedicated page to view project changelogs and release notes
- **Layout Refactoring** - Reorganized layout system into \`src/apps/\` directory for better modularity

### Changed
- **Layout naming** - Renamed \`layouts\` directory to \`apps\` for clearer intent
- **UI polish** - Improved spacing, typography, and visual hierarchy in documentation views

### Fixed
- Various minor UI bugfixes and accessibility improvements

## [0.1.0] - 2025-04-09

### Added
- Initial release of MWL / mini-PACS UI
- Core PACS workflow management (worklist, orders, studies)
- DICOM viewer integration
- User authentication and RBAC
- Audit logging and compliance features
- Multi-language support (English/Indonesian)
- Theme customization system
- Reporting and analytics dashboards

### Security
- JWT-based authentication with automatic token refresh
- Role-based access control with granular permissions
- Comprehensive audit trail for all data operations
- HIPAA-compliant data handling patterns

---

*For detailed technical changes, see the individual feature documentation in the \`@docs\` directory.*
`;

export default function ChangelogModal({ open, onClose }) {
  const { t } = useTranslation();

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <History size={22} className="text-blue-600" />
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                      {t('Changelog') || 'Changelog'}
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={onClose}
                    className="rounded-full p-1.5 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={t('Close') || 'Close'}
                  >
                    <X size={20} className="text-gray-500" />
                  </button>
                </div>

                {/* Content */}
                <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
                  <div className="prose prose-gray max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {SAMPLE_CHANGELOG}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 px-6 py-3 text-xs text-gray-500 flex justify-between items-center">
                  <span>v0.1 · {APP_SHORT_NAME}</span>
                  <button
                    onClick={() => {
                      onClose();
                      window.location.href = '/changelog';
                    }}
                    className="text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                  >
                    View Full Page →
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
