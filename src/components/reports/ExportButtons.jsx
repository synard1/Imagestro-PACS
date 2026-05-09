import { useState } from 'react';
import { 
  DocumentArrowDownIcon, 
  TableCellsIcon, 
  DocumentTextIcon,
  PrinterIcon 
} from '@heroicons/react/24/outline';

/**
 * ExportButtons - Tombol untuk export laporan
 * 
 * @param {function} onExportPDF - Handler export PDF
 * @param {function} onExportExcel - Handler export Excel
 * @param {function} onExportCSV - Handler export CSV
 * @param {function} onPrint - Handler print
 * @param {boolean} loading - Loading state
 */
export default function ExportButtons({
  onExportPDF,
  onExportExcel,
  onExportCSV,
  onPrint,
  loading = false,
  className = ''
}) {
  const [exportingType, setExportingType] = useState(null);

  const handleExport = async (type, handler) => {
    if (!handler) return;
    
    setExportingType(type);
    try {
      await handler();
    } finally {
      setExportingType(null);
    }
  };

  const buttons = [
    {
      type: 'pdf',
      label: 'PDF',
      icon: DocumentArrowDownIcon,
      handler: onExportPDF,
      color: 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200'
    },
    {
      type: 'excel',
      label: 'Excel',
      icon: TableCellsIcon,
      handler: onExportExcel,
      color: 'text-green-600 bg-green-50 hover:bg-green-100 border-green-200'
    },
    {
      type: 'csv',
      label: 'CSV',
      icon: DocumentTextIcon,
      handler: onExportCSV,
      color: 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200'
    },
    {
      type: 'print',
      label: 'Print',
      icon: PrinterIcon,
      handler: onPrint,
      color: 'text-slate-600 bg-slate-50 hover:bg-slate-100 border-slate-200'
    }
  ];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-slate-500 mr-1">Export:</span>
      {buttons.map((btn) => {
        const Icon = btn.icon;
        const isExporting = exportingType === btn.type;
        
        return (
          <button
            key={btn.type}
            onClick={() => handleExport(btn.type, btn.handler)}
            disabled={loading || isExporting || !btn.handler}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${btn.color}`}
          >
            {isExporting ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <Icon className="w-4 h-4" />
            )}
            {btn.label}
          </button>
        );
      })}
    </div>
  );
}
