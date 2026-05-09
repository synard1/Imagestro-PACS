import { useState } from 'react';
import { CalendarIcon } from '@heroicons/react/24/outline';

const PRESETS = [
  { label: 'Hari Ini', value: 'today' },
  { label: '7 Hari Terakhir', value: '7days' },
  { label: '30 Hari Terakhir', value: '30days' },
  { label: 'Bulan Ini', value: 'thisMonth' },
  { label: 'Bulan Lalu', value: 'lastMonth' },
  { label: 'Custom', value: 'custom' },
];

/**
 * DateRangeFilter - Filter untuk rentang tanggal
 * 
 * @param {string} startDate - Tanggal mulai (YYYY-MM-DD)
 * @param {string} endDate - Tanggal akhir (YYYY-MM-DD)
 * @param {function} onChange - Handler perubahan ({startDate, endDate})
 */
export default function DateRangeFilter({
  startDate,
  endDate,
  onChange,
  className = ''
}) {
  const [activePreset, setActivePreset] = useState('7days');

  const formatDate = (date) => {
    return date.toISOString().split('T')[0];
  };

  const handlePresetClick = (preset) => {
    setActivePreset(preset);
    
    const today = new Date();
    let start, end;

    switch (preset) {
      case 'today':
        start = end = formatDate(today);
        break;
      case '7days':
        end = formatDate(today);
        start = formatDate(new Date(today.setDate(today.getDate() - 6)));
        break;
      case '30days':
        end = formatDate(new Date());
        start = formatDate(new Date(new Date().setDate(new Date().getDate() - 29)));
        break;
      case 'thisMonth':
        start = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
        end = formatDate(new Date());
        break;
      case 'lastMonth':
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        start = formatDate(lastMonth);
        end = formatDate(new Date(today.getFullYear(), today.getMonth(), 0));
        break;
      case 'custom':
        // Don't change dates, just allow manual input
        return;
      default:
        return;
    }

    onChange?.({ startDate: start, endDate: end });
  };

  const handleDateChange = (field, value) => {
    setActivePreset('custom');
    onChange?.({
      startDate: field === 'startDate' ? value : startDate,
      endDate: field === 'endDate' ? value : endDate,
    });
  };

  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <CalendarIcon className="w-5 h-5 text-slate-400" />
        <span className="text-sm font-medium text-slate-700">Periode Laporan</span>
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handlePresetClick(preset.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activePreset === preset.value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Date inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Dari Tanggal</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleDateChange('startDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Sampai Tanggal</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => handleDateChange('endDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}
