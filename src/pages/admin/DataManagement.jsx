import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Users, 
  Stethoscope, 
  Monitor, 
  ShieldCheck, 
  Download,
  AlertCircle,
  Search,
  Database,
  FileText,
  Clock,
  Filter
} from 'lucide-react';
import { exportService } from '../../services/exportService';
import { useToast } from '../../components/ToastProvider';
import AuditLogTable from '../../components/admin/AuditLogTable'; // Import the table component

// Reusable Card Component
const ExportCard = ({ data, onExport, isLoading, disabled }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full group">
      <div className="p-6 flex-1">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-lg ${data.bgColor || 'bg-gray-100'} ${data.color || 'text-gray-600'} group-hover:scale-110 transition-transform duration-300`}>
            {data.icon ? <data.icon size={24} /> : <Database size={24} />}
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {data.format || 'XLSX'}
          </span>
        </div>
        
        <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-primary-600 transition-colors">
          {data.title}
        </h3>
        <p className="text-sm text-gray-500 leading-relaxed">
          {data.description}
        </p>
      </div>

      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-xl flex items-center justify-between">
        <div className="text-xs text-gray-400 flex items-center">
          <Clock size={12} className="mr-1" />
          <span>Real-time</span>
        </div>
        <button
          onClick={() => onExport(data.id, data.title)}
          disabled={disabled}
          className={`
            inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200
            ${disabled 
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-primary-600 hover:border-primary-200 shadow-sm active:scale-95'}
          `}
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 mr-2 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Processing
            </>
          ) : (
            <>
              <Download size={16} className="mr-2" />
              Export
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default function DataManagement() {
  const [loading, setLoading] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const toast = useToast();

  // Export Configuration - Scalable structure
  const exportOptions = [
    {
      id: 'doctors',
      title: 'Doctors Mapping',
      description: 'Complete registry of doctors including credential mapping between External SIMRS and PACS.',
      category: 'master',
      icon: Stethoscope,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      id: 'modalities',
      title: 'Modalities Registry',
      description: 'Configuration details for all connected DICOM modalities, AE Titles, and network parameters.',
      category: 'master',
      icon: Monitor,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      id: 'insurance',
      title: 'Insurance Providers',
      description: 'List of registered insurance guarantors and payor mapping configurations.',
      category: 'master',
      icon: ShieldCheck,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      id: 'procedure-mappings',
      title: 'Procedure Mappings',
      description: 'Export all procedure code mappings between External SIMRS and PACS.',
      category: 'master',
      icon: FileSpreadsheet,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    }
  ];

  const categories = [
    { id: 'all', label: 'All Data' },
    { id: 'master', label: 'Master Data' },
    { id: 'operational', label: 'Operational' },
    { id: 'logs', label: 'Logs' }
  ];

  const isAnyLoading = Object.values(loading).some(status => status);

  const handleExport = async (type, label) => {
    if (isAnyLoading) return;
    
    setLoading(prev => ({ ...prev, [type]: true }));
    const startTime = Date.now();
    
    try {
      await exportService.exportToExcel(type);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      toast.notify({
        type: 'success',
        message: `Export Complete`,
        detail: `${label} has been downloaded successfully (${duration}s).`
      });
    } catch (error) {
      console.error(`Export error for ${type}:`, error);
      
      // Use specific documentation error message for 500
      const detail = error.status === 500 
        ? "Gagal mengunduh karena sistem audit gagal mencatat aktivitas."
        : error.message;

      toast.notify({
        type: 'error',
        message: `Export Failed`,
        detail: detail
      });
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  const filteredOptions = useMemo(() => {
    return exportOptions.filter(opt => {
      const matchesSearch = opt.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          opt.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === 'all' || opt.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory]);

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 animate-in fade-in duration-500">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Data Management</h1>
            <p className="text-gray-500 mt-1">
              Securely export system data for reporting and analysis.
            </p>
          </div>
          
          {/* Global Actions / Stats could go here */}
        </div>

        {/* Filters & Search Toolbar */}
        <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text"
              placeholder="Search data exports..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-lg focus:ring-2 focus:ring-primary-500/20 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`
                  px-4 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all
                  ${activeCategory === cat.id 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}
                `}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid Content */}
        {filteredOptions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredOptions.map((option) => (
              <ExportCard 
                key={option.id}
                data={option}
                onExport={handleExport}
                isLoading={loading[option.id]}
                disabled={isAnyLoading}
              />
            ))}
          </div>
        ) : activeCategory !== 'logs' && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
            <div className="inline-flex p-4 bg-gray-50 rounded-full mb-4">
              <Filter size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No exports found</h3>
            <p className="text-gray-500 mt-1">Try adjusting your search or category filter.</p>
            <button 
              onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}
              className="mt-4 text-primary-600 hover:text-primary-700 text-sm font-medium"
            >
              Clear all filters
            </button>
          </div>
        )}

        {/* Audit Logs Section */}
        {activeCategory === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                <FileText size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Logs</h2>
                <p className="text-sm text-gray-500">View and export activity logs for data management.</p>
              </div>
            </div>
            <div className="h-[600px]">
              <AuditLogTable />
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-4 items-start mt-auto">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600 shrink-0">
            <AlertCircle size={20} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-blue-900">Data Privacy & Security</h4>
            <p className="text-sm text-blue-700 mt-1 leading-relaxed">
              Downloaded files may contain confidential patient information (PHI). 
              Ensure you comply with HIPAA and local data protection regulations when handling these files.
              All export actions are logged for security auditing.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}