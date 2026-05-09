import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Calendar, Tag, User } from 'lucide-react';

// Sample changelog data - in production this would be fetched from an API or static files
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

export default function ChangelogViewer() {
  const { t } = useTranslation();
  const [version, setVersion] = useState('latest');
  const [changelog, setChangelog] = useState(SAMPLE_CHANGELOG);
  const [loading, setLoading] = useState(false);

  // In a real implementation, this would fetch changelog data from an API
  useEffect(() => {
    // Simulate loading
    if (version !== 'latest') {
      setLoading(true);
      const timer = setTimeout(() => {
        setChangelog(SAMPLE_CHANGELOG); // Would fetch different version
        setLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [version]);

  return (
    <div className="changelog-viewer">
      {/* Version Selector */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Tag size={18} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Version:</span>
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="ml-2 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="latest">Latest (Unreleased)</option>
            <option value="0.1.0">v0.1.0 (2025-04-09)</option>
          </select>
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Calendar size={16} />
            <span>{version === 'latest' ? 'In development' : '2025-04-09'}</span>
          </div>
          <div className="flex items-center gap-1">
            <User size={16} />
            <span>Development Team</span>
          </div>
          <div className="flex items-center gap-1">
            <FileText size={16} />
            <span>Markdown</span>
          </div>
        </div>
      </div>

      {/* Changelog Content */}
      <div className="prose prose-gray max-w-none">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {changelog}
          </ReactMarkdown>
        )}
      </div>

      {/* Footer Note */}
      <div className="mt-12 pt-6 border-t border-gray-200 text-sm text-gray-500">
        <p>
          This changelog viewer displays release notes and feature updates.
          For detailed technical documentation, please refer to the individual
          documents in the <code className="px-1 py-0.5 bg-gray-100 rounded text-xs">@docs</code> directory.
        </p>
      </div>
    </div>
  );
}
