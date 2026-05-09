import { useState } from 'react';
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function StudyFilters({ onFilterChange, onClose }) {
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    modality: '',
    status: '',
    patientName: '',
    accessionNumber: '',
    studyDescription: ''
  });

  const modalities = [
    'CT', 'MR', 'MRI', 'CR', 'DX', 'US', 'MG', 'XA', 'RF', 'NM', 'PT', 'PET', 'OT', 'SR', 'PR', 'SC'
  ].sort();
  const statuses = ['pending', 'in-progress', 'completed', 'reported'];

  const handleChange = (field, value) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleReset = () => {
    const emptyFilters = {
      dateFrom: '',
      dateTo: '',
      modality: '',
      status: '',
      patientName: '',
      accessionNumber: '',
      studyDescription: ''
    };
    setFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <FunnelIcon className="h-5 w-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900">Filters</h3>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleReset}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Reset
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <XMarkIcon className="h-5 w-5 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date From
          </label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date To
          </label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleChange('dateTo', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Modality */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Modality
          </label>
          <select
            value={filters.modality}
            onChange={(e) => handleChange('modality', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Modalities</option>
            {modalities.map((mod) => (
              <option key={mod} value={mod}>{mod}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.replace('-', ' ').toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Patient Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Patient Name
          </label>
          <input
            type="text"
            value={filters.patientName}
            onChange={(e) => handleChange('patientName', e.target.value)}
            placeholder="Search by name..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Accession Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Accession Number
          </label>
          <input
            type="text"
            value={filters.accessionNumber}
            onChange={(e) => handleChange('accessionNumber', e.target.value)}
            placeholder="Search by accession..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Study Description */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Study Description
          </label>
          <input
            type="text"
            value={filters.studyDescription}
            onChange={(e) => handleChange('studyDescription', e.target.value)}
            placeholder="Search by description..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}
