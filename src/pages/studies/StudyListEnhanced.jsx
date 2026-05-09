import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fetchStudies, deleteStudy, archiveStudy } from '../../services/studyService';
import StudyCard from '../../components/pacs/StudyCard';
import StudyGrid from './StudyGrid';
import StudyTable from './StudyTable';
import StudyFilters from '../../components/studies/StudyFilters';
import StudyDetails from '../../components/studies/StudyDetails';
import { useConfirm } from '../../components/ConfirmDialog';

/**
 * Enhanced Studies List Page
 * Features: Grid/Table view, Advanced filtering, Virtual scrolling
 */
export default function StudyListEnhanced() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { confirmDanger, confirm } = useConfirm();
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'
  const [q, setQ] = useState(searchParams.get('search') || '');
  const [filters, setFilters] = useState({});
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [allStudies, setAllStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState('mock');
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0
  });

  // Ref to prevent duplicate requests
  const isLoadingRef = useRef(false);
  const abortControllerRef = useRef(null);

  // Load studies from service
  const loadStudies = useCallback(async (page = 1, pageSize = 25) => {
    // Prevent duplicate requests
    if (isLoadingRef.current) {
      return;
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    isLoadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Note: We exclude modality from backend query to rely on client-side filtering
      // This is a "different approach" to handle cases where backend filtering is too strict
      const result = await fetchStudies({
        patientName: q,
        // modality: filters.modality, // Disabled backend filtering for modality
        status: filters.status,
        startDate: filters.startDate,
        endDate: filters.endDate,
        page: page,
        pageSize: pageSize
      });

      // Normalize data format
      const normalized = result.studies.map(s => ({
        id: s.study_instance_uid || s.studyInstanceUID || s.id,
        patientName: s.patient_name || s.patientName || s.patient?.name,
        patientId: s.patient_id || s.patientId || s.patient?.mrn,
        accessionNumber: s.accession_number || s.accessionNumber || 'N/A',
        studyDescription: s.study_description || s.studyDescription || s.description || 'No Description',
        studyDate: s.study_date || s.studyDate,
        studyTime: s.study_time || s.studyTime || '',
        modality: s.modality,
        status: s.status || 'completed',
        numberOfSeries: s.number_of_series || s.numberOfSeries || s.series?.length || 0,
        numberOfInstances: s.number_of_instances || s.numberOfInstances || 0,
        thumbnail_series_uid: s.thumbnail_series_uid,
        thumbnail_instance_uid: s.thumbnail_instance_uid,
        study_instance_uid: s.study_instance_uid || s.studyInstanceUID || s.id, // For backup
        series: s.series // Preserve full series if present (enriched/mock)
      }));

      setAllStudies(normalized);
      setDataSource(result.source);
      setPagination({
        page: result.page || page,
        pageSize: result.pageSize || pageSize,
        total: result.total || 0,
        totalPages: result.totalPages || 0
      });

    } catch (err) {
      // Ignore abort errors
      if (err.name === 'AbortError') {
        return;
      }
      console.error('[StudyList] Error loading studies:', err);
      setError(err.message || 'Failed to load studies');
      setAllStudies([]);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [q, filters.status, filters.startDate, filters.endDate]);

  useEffect(() => {
    loadStudies(pagination.page, pagination.pageSize);

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      isLoadingRef.current = false;
    };
  }, [loadStudies, pagination.page, pagination.pageSize]);

  // Filter studies
  const filtered = useMemo(() => {
    return allStudies.filter((s) => {
      // Search filter - safely handle undefined values
      const matchQ = q
        ? [s.patientName, s.patientId, s.accessionNumber, s.studyDescription]
          .filter(Boolean) // Remove undefined/null values
          .join(' ')
          .toLowerCase()
          .includes(q.toLowerCase())
        : true;

      // Advanced filters with safe null/undefined handling
      const matchModality = filters.modality
        ? (s.modality || '').toUpperCase().includes(filters.modality.toUpperCase())
        : true;
      const matchStatus = filters.status
        ? (s.status || '').toLowerCase() === filters.status.toLowerCase()
        : true;
      const matchPatientName = filters.patientName
        ? (s.patientName || '').toLowerCase().includes(filters.patientName.toLowerCase())
        : true;
      const matchAccession = filters.accessionNumber
        ? (s.accessionNumber || '').toLowerCase().includes(filters.accessionNumber.toLowerCase())
        : true;
      const matchDescription = filters.studyDescription
        ? (s.studyDescription || '').toLowerCase().includes(filters.studyDescription.toLowerCase())
        : true;

      // Date range - safely handle invalid dates
      let fromOk = true;
      let toOk = true;
      if (s.studyDate) {
        try {
          const t = new Date(s.studyDate).getTime();
          if (!isNaN(t)) {
            fromOk = filters.dateFrom ? t >= new Date(filters.dateFrom).getTime() : true;
            toOk = filters.dateTo ? t <= new Date(filters.dateTo).getTime() + 24 * 3600 * 1000 : true;
          }
        } catch (e) {
          // Invalid date, skip date filtering
          console.warn('[StudyList] Invalid study date:', s.studyDate);
        }
      }

      return matchQ && matchModality && matchStatus && matchPatientName &&
        matchAccession && matchDescription && fromOk && toOk;
    }).sort((a, b) => {
      // Safe sorting with fallback values
      const dateA = a.studyDate || '';
      const dateB = b.studyDate || '';
      const timeA = a.studyTime || '';
      const timeB = b.studyTime || '';

      return dateA === dateB
        ? timeA.localeCompare(timeB)
        : dateB.localeCompare(dateA);
    });
  }, [allStudies, q, filters]);



  const handleViewStudy = (study) => {
    // Navigate to study detail page
    navigate(`/study/${study.id}`);
  };

  const handleReportStudy = (study) => {
    navigate(`/report/${study.id}`);
  };

  const handleStudySelect = (study) => {
    // When clicking on study card, show details panel
    setSelectedStudy(study);
  };

  const handleDelete = async (study) => {
    const isConfirmed = await confirmDanger(
      `Are you sure you want to delete the study for ${study.patientName}?\n\nThis action will remove the files from Orthanc and archive them in system storage.`,
      { title: 'Delete Study' }
    );

    if (!isConfirmed) return;

    try {
      await deleteStudy(study.id);
      loadStudies();
      if (selectedStudy && selectedStudy.id === study.id) {
        setSelectedStudy(null);
      }
    } catch (error) {
      console.error('Failed to delete study:', error);
    }
  };

  const handleArchive = async (study) => {
    const isConfirmed = await confirm(
      `Mark the study for ${study.patientName} as archived?`,
      { 
        title: 'Archive Study',
        type: 'info',
        confirmText: 'Archive'
      }
    );

    if (!isConfirmed) return;

    try {
      await archiveStudy(study.id);
      loadStudies();
    } catch (error) {
      console.error('Failed to archive study:', error);
    }
  };

  // Pagination handlers
  const handlePageChange = (newPage) => {
    setPagination(prev => ({
      ...prev,
      page: newPage
    }));
    loadStudies(newPage, pagination.pageSize);
  };

  const handlePageSizeChange = (newPageSize) => {
    setPagination(prev => ({
      ...prev,
      pageSize: newPageSize,
      page: 1 // Reset to first page when changing page size
    }));
    loadStudies(1, newPageSize);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Studies</h1>
            <p className="text-sm text-gray-500 mt-1">
              {loading ? 'Loading...' : `${pagination.total} ${pagination.total === 1 ? 'study' : 'studies'} found`}
              {!loading && dataSource && (
                <span className="ml-2 text-xs text-gray-400">
                  (from {dataSource})
                </span>
              )}
            </p>
          </div>

          {/* View Mode Toggle & Refresh */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadStudies(pagination.page, pagination.pageSize)}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              title="Refresh studies list"
            >
              <span className={loading ? 'animate-spin' : ''}>🔄</span>
              Refresh
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${viewMode === 'grid'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Grid View
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${viewMode === 'table'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Table View
            </button>
          </div>
        </div>
      </div>

      {/* Filters - hide when error */}
      {!error && <StudyFilters onFilterChange={setFilters} />}

      {/* Results */}
      <div className="flex-1 overflow-hidden relative">
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-4">⚠️</div>
              <div className="text-lg font-medium text-red-700 mb-2">Failed to load studies</div>
              <div className="text-sm text-red-600 mb-4">{error}</div>
              <button
                onClick={() => loadStudies(pagination.page, pagination.pageSize)}
                className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm hover:bg-red-700"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-6xl mb-4">🔍</div>
              <div className="text-lg font-medium text-gray-700 mb-2">No studies found</div>
              <div className="text-sm text-gray-500">
                Try adjusting your filters or search criteria
              </div>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="h-full overflow-y-auto">
            <StudyGrid
              studies={filtered}
              onStudySelect={handleStudySelect}
              onView={handleViewStudy}
              onReport={handleReportStudy}
              onDelete={handleDelete}
              onArchive={handleArchive}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <StudyTable
              studies={filtered}
              onStudySelect={handleStudySelect}
              onView={handleViewStudy}
              onReport={handleReportStudy}
              onDelete={handleDelete}
              onArchive={handleArchive}
            />
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.total > 0 && (
          <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Rows per page:</span>
              <select
                value={pagination.pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm text-gray-700">
                {Math.min((pagination.page - 1) * pagination.pageSize + 1, pagination.total)}-
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className={`px-3 py-1 text-sm rounded ${pagination.page === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className={`px-3 py-1 text-sm rounded ${pagination.page === pagination.totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Study Details Panel */}
        {selectedStudy && (
          <StudyDetails
            study={selectedStudy}
            onClose={() => setSelectedStudy(null)}
          />
        )}
      </div>
    </div>
  );
}
