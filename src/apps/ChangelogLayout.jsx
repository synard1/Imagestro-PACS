import { Outlet, useNavigate } from 'react-router-dom';
import { ArrowLeft, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const APP_SHORT_NAME = import.meta.env.VITE_APP_SHORT_NAME || 'MWL / mini-PACS';

export default function ChangelogLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={t('Back') || 'Go back'}
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            <History size={24} className="text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Changelog</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 md:p-8">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 text-center text-sm text-gray-500">
          v0.1 · {APP_SHORT_NAME}
        </div>
      </footer>
    </div>
  );
}
