import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Search,
  Filter,
  Calendar,
  User,
  Activity as ActivityIcon
} from 'lucide-react';
import { fetchStudies } from '../../services/studyService';
import { useToast } from '../../components/ToastProvider';

export default function StudyReportLauncher() {
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    modality: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  });
  const navigate = useNavigate();
  const toast = useToast();

  const loadStudies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStudies({
        patientName: searchTerm,
        modality: filters.modality || undefined,
        status: filters.status || undefined,
        startDate: filters.dateFrom || undefined,
        endDate: filters.dateTo || undefined,
        pageSize: 50
      });
      setStudies(result.studies || []);
    } catch (err) {
      setError(err.message);
      toast.error('Failed to load studies', { message: err.message });
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filters, toast]);

  useEffect(() => {
    loadStudies();
  }, [loadStudies]);

  const handleCreateReport = (study) => {
    const studyId = study.study_instance_uid || study.studyInstanceUID || study.id;
    navigate(`/report/${studyId}`);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading studies...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Failed to load studies: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Study Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Select a study to create or edit its radiology report
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Search Patient</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Patient name..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          {/* Modality Filter */}
          <div className="min-w-[120px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Modality</label>
            <select
              name="modality"
              value={filters.modality}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All</option>
              <option value="CT">CT</option>
              <option value="MR">MR</option>
              <option value="CR">CR</option>
              <option value="DX">DX</option>
              <option value="US">US</option>
              <option value="XA">XA</option>
              <option value="RF">RF</option>
              <option value="MG">MG</option>
              <option value="NM">NM</option>
              <option value="PT">PT</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="min-w-[120px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All</option>
              <option value="completed">Completed</option>
              <option value="in-progress">In Progress</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1">
              <Calendar size={14} className="text-gray-400" />
              <input
                type="date"
                name="dateFrom"
                value={filters.dateFrom}
                onChange={handleFilterChange}
                className="px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                title="From date"
              />
            </div>
            <span className="text-gray-400">-</span>
            <div className="flex items-center gap-1">
              <input
                type="date"
                name="dateTo"
                value={filters.dateTo}
                onChange={handleFilterChange}
                className="px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                title="To date"
              />
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={() => {
              setSearchTerm('');
              setFilters({ modality: '', status: '', dateFrom: '', dateTo: '' });
            }}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Studies List */}
      {studies.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText size={48} className="mx-auto mb-4 opacity-50" />
          <p>No studies found matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {studies.map((study) => {
            const studyId = study.study_instance_uid || study.studyInstanceUID || study.id;
            const date = study.study_date ? new Date(study.study_date).toLocaleDateString() : 'N/A';
            const time = study.study_time || '';

            return (
              <div
                key={studyId}
                className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate" title={study.study_description || study.description || 'No description'}>
                      {study.study_description || study.description || 'No description'}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">
                        {study.modality || 'UNKNOWN'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {date} {time && `• ${time.slice(0,5)}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-gray-400" />
                    <span className="truncate">{study.patient_name || study.patientName || 'Unknown Patient'}</span>
                  </div>
                  {study.accession_number && (
                    <div className="text-xs text-gray-500">
                      Accession: {study.accession_number}
                    </div>
                  )}
                  {study.number_of_instances && (
                    <div className="flex items-center gap-2 text-xs">
                      <ActivityIcon size={14} className="text-gray-400" />
                      {study.number_of_instances} images • {study.number_of_series || 0} series
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleCreateReport(study)}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <FileText size={16} />
                  Create Report
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
