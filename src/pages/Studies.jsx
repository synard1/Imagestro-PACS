import React, { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getConfig } from '../services/config';
import { getDataStorageConfig } from '../services/dataSync';
import { fetchStudies, createStudy, updateStudy, deleteStudy } from '../services/studyService';
import { loadRegistry } from '../services/api-registry';
import StudyActionsDropdown from '../components/studies/StudyActionsDropdown';

// Storage indicator component
import StorageIndicator from '../components/StorageIndicator'
import FacetedSearch from '../components/common/FacetedSearch'
import { useSavedPresets } from '../components/common/FacetedSearch'

// --------------------------------------------
// Studies Page (List with inline Series details)
// - Pure React + TailwindCSS (no external UI libs)
// - Uses local mock data; swap with API calls later
// --------------------------------------------

// ---- Utilities ----
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString();
const shortUID = (uid) => (uid?.length > 16 ? `…${uid.slice(-16)}` : uid);

/**
 * Image component that loads with authentication headers
 */
function AuthenticatedImage({ src, alt, className, fallbackText }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadSecureImage = async () => {
      if (!src) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(false);
        
        const { getAuthHeader } = await import('../services/auth-storage');
        const authHeader = getAuthHeader();
        
        const response = await fetch(src, {
          headers: {
            ...authHeader
          }
        });

        if (!response.ok) throw new Error('Failed to load image');

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        
        if (isMounted) {
          setImgSrc(objectUrl);
          setLoading(false);
        }
      } catch (err) {
        console.error('[AuthenticatedImage] Error:', err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadSecureImage();

    return () => {
      isMounted = false;
      if (imgSrc) URL.revokeObjectURL(imgSrc);
    };
  }, [src]);

  if (loading) {
    return <div className="flex items-center justify-center w-full h-full bg-gray-50"><span className="animate-pulse">⌛</span></div>;
  }

  if (error || !imgSrc) {
    return <div className="flex items-center justify-center w-full h-full bg-gray-50 text-[10px] text-gray-400 font-medium text-center p-1">{fallbackText || 'No Preview'}</div>;
  }

  return (
    <img 
      src={imgSrc} 
      alt={alt} 
      className={className} 
    />
  );
}

export default function StudiesPage() {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState({});
  const [allStudies, setAllStudies] = useState([]); // All studies from API
  const [filteredStudies, setFilteredStudies] = useState([]); // Studies after filtering
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingStudy, setEditingStudy] = useState(null);
  const [formData, setFormData] = useState({
    studyDate: '',
    studyTime: '',
    accessionNumber: '',
    description: '',
    modality: 'CT',
    status: 'scheduled',
    patient: { name: '', mrn: '', birthDate: '' }
  });

  // Modalities list for filter dropdown
  const [modalities, setModalities] = useState(['ALL']);

  // Get current storage configuration
  const [appConfig, setAppConfig] = useState(null);
  const storageConfig = getDataStorageConfig();

  // Saved presets
  const { presets: savedPresets, savePreset, deletePreset } = useSavedPresets('studies-presets');

  // Load config and studies
  useEffect(() => {
    const loadData = async () => {
      const config = await getConfig();
      setAppConfig(config);
      await loadStudies();
    };
    loadData();
  }, []);

  const loadStudies = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStudies();
      setAllStudies(data.studies);

      // Extract unique modalities
      const mods = new Set();
      data.studies.forEach(s => {
        if (s.modality) mods.add(s.modality);
      });
      setModalities(['ALL', ...Array.from(mods).sort()]);

      // Initially show all (no filter)
      setFilteredStudies(data.studies);
    } catch (err) {
      console.error('Failed to load studies:', err);
      setError(err.message || 'Failed to load studies');
      setAllStudies([]);
      setFilteredStudies([]);
    } finally {
      setLoading(false);
    }
  };

  // Enhanced search handler
  const handleSearch = useMemo(() => (criteria) => {
    const { q: searchTerm, filters, dateRanges } = criteria;

    const filtered = allStudies.filter((s) => {
      // Text search across multiple fields
      if (searchTerm) {
        const searchFields = [
          s.patient.name,
          s.patient.mrn,
          s.accessionNumber,
          s.description
        ].map(field => (field || '').toLowerCase()).join(' ');

        if (!searchFields.includes(searchTerm.toLowerCase())) {
          return false;
        }
      }

      // Modality filter
      if (filters.modality && filters.modality !== 'ALL') {
        if (s.modality !== filters.modality) return false;
      }

      // Status filter (if implemented in data)
      if (filters.status && s.status && s.status !== filters.status) {
        return false;
      }

      // Study date range filter
      if (dateRanges.studyDate_from || dateRanges.studyDate_to) {
        const studyDate = new Date(s.studyDate).getTime();
        const from = dateRanges.studyDate_from ? new Date(dateRanges.studyDate_from).getTime() : null;
        const to = dateRanges.studyDate_to ? new Date(dateRanges.studyDate_to).getTime() + 24*3600*1000 : null;

        if (from && studyDate < from) return false;
        if (to && studyDate >= to) return false;
      }

      return true;
    });

    setFilteredStudies(filtered);
  }, [allStudies]);

  // Export to CSV
  const handleExport = (dataToExport) => {
    if (!dataToExport || dataToExport.length === 0) {
      alert('No data to export');
      return;
    }

    // Build CSV headers
    const headers = ['Accession', 'Patient Name', 'MRN', 'Modality', 'Study Date', 'Description', 'Status'];
    const csvRows = [headers.join(',')];

    // Add data rows
    dataToExport.forEach(study => {
      const row = [
        study.accessionNumber || '',
        `"${(study.patient?.name || '').replace(/"/g, '""')}"`,
        study.patient?.mrn || '',
        study.modality || '',
        study.studyDate || '',
        `"${(study.description || '').replace(/"/g, '""')}"`,
        study.status || ''
      ];
      csvRows.push(row.join(','));
    });

    // Download file
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `studies_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleCreate = () => {
    setEditingStudy(null);
    setFormData({
      studyDate: new Date().toISOString().split('T')[0],
      studyTime: new Date().toTimeString().split(' ')[0],
      accessionNumber: `ACC-${Date.now()}`,
      description: '',
      modality: 'CT',
      status: 'scheduled',
      patient: { name: '', mrn: '', birthDate: '' }
    });
    setShowForm(true);
  };

  const handleEdit = async (study) => {
    setEditingStudy(study);
    setFormData({
      studyDate: study.studyDate,
      studyTime: study.studyTime,
      accessionNumber: study.accessionNumber,
      description: study.description,
      modality: study.modality,
      status: study.status,
      patient: { ...study.patient }
    });
    setShowForm(true);
  };

  const handleDelete = async (study) => {
    const idToDelete = study.studyInstanceUID || study.studyId;
    if (!confirm(`Delete study ${study.accessionNumber}?`)) return;

    try {
      await deleteStudy(idToDelete);
      await loadStudies();
    } catch (error) {
      console.error('Failed to delete study:', error);
      // Error notification is handled by service
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingStudy) {
        await updateStudy(editingStudy.studyId, formData);
      } else {
        await createStudy(formData);
      }
      setShowForm(false);
      await loadStudies();
    } catch (error) {
      console.error('Failed to save study:', error);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingStudy(null);
  };

  if (!appConfig) return <div className="p-6">{t('Loading configuration...')}</div>;
  if (loading) return <div className="p-6">{t('Loading studies…')}</div>;

  // Show error state with retry option
  if (error) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">{t('Studies')}</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-red-500 text-xl">⚠️</span>
            <div className="flex-1">
              <h3 className="font-medium text-red-800">{t('Failed to load studies')}</h3>
              <p className="text-sm text-red-600 mt-1">{t(error)}</p>
              <button
                onClick={loadStudies}
                className="mt-3 rounded-lg bg-red-600 text-white px-4 py-2 text-sm hover:bg-red-700"
              >
                {t('Try Again')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const registry = loadRegistry();
  const studiesConfig = registry.studies || { enabled: false };
  const backendEnabled = studiesConfig.enabled === true;
  const storageType = backendEnabled ? 'external' : (storageConfig.mode === 'server' ? 'server' : 'browser');

  return (
    <div className="p-6 space-y-6 flex flex-col h-screen bg-gray-50">
      <header className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t('Studies')}</h1>
            <p className="text-sm text-gray-500">{t('List pemeriksaan dengan rincian Series per Study.')}</p>
          </div>
          <StorageIndicator storageType={storageType} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadStudies}
            disabled={loading}
            className="rounded-xl border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            title={t('Refresh studies list')}
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            {t('Refresh')}
          </button>
          <button
            onClick={handleCreate}
            className="rounded-xl bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 flex items-center gap-2"
          >
            <span>➕</span>
            {t('Add Study')}
          </button>
        </div>
      </header>

      {/* Enhanced Search with Faceted Filters */}
      <FacetedSearch
        config={{
          searchFields: ['name', 'mrn', 'accession', 'description'],
          filterFields: [
            {
              key: 'modality',
              label: 'Modality',
              type: 'select',
              options: modalities.map(m => ({ value: m, label: m === 'ALL' ? 'All Modalities' : m }))
            }
            // Could add more filters: status, priority, etc.
          ],
          dateFields: [
            { key: 'studyDate', label: 'Study Date' }
          ]
        }}
        data={filteredStudies}
        loading={loading}
        onSearch={handleSearch}
        onExport={handleExport}
        savedPresets={savedPresets}
        onSavePreset={savePreset}
        onDeletePreset={deletePreset}
        placeholder="Search studies by patient name, MRN, accession number..."
        showExport={true}
        showPresets={true}
      />

      {/* Results Summary */}
      <div className="text-sm text-slate-600">
        Showing {filteredStudies.length} of {allStudies.length} studies
        {loading && ' (loading...)'}
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">
              {editingStudy ? t('Edit Study') : t('Create New Study')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Study Date')}</label>
                  <input
                    type="date"
                    value={formData.studyDate}
                    onChange={(e) => setFormData({ ...formData, studyDate: e.target.value })}
                    required
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Study Time')}</label>
                  <input
                    type="time"
                    value={formData.studyTime}
                    onChange={(e) => setFormData({ ...formData, studyTime: e.target.value })}
                    required
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('Accession Number')}</label>
                <input
                  type="text"
                  value={formData.accessionNumber}
                  onChange={(e) => setFormData({ ...formData, accessionNumber: e.target.value })}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('Description')}</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Modality')}</label>
                  <select
                    value={formData.modality}
                    onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CT">CT</option>
                    <option value="MR">MR</option>
                    <option value="US">US</option>
                    <option value="XA">XA</option>
                    <option value="CR">CR</option>
                    <option value="DR">DR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Status')}</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="scheduled">{t('Scheduled')}</option>
                    <option value="in_progress">{t('In Progress')}</option>
                    <option value="completed">{t('Completed')}</option>
                    <option value="cancelled">{t('Cancelled')}</option>
                  </select>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">{t('Patient Information')}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('Patient Name')}</label>
                    <input
                      type="text"
                      value={formData.patient.name}
                      onChange={(e) => setFormData({
                        ...formData,
                        patient: { ...formData.patient, name: e.target.value }
                      })}
                      required
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">{t('MRN')}</label>
                      <input
                        type="text"
                        value={formData.patient.mrn}
                        onChange={(e) => setFormData({
                          ...formData,
                          patient: { ...formData.patient, mrn: e.target.value }
                        })}
                        required
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">{t('Birth Date')}</label>
                      <input
                        type="date"
                        value={formData.patient.birthDate}
                        onChange={(e) => setFormData({
                          ...formData,
                          patient: { ...formData.patient, birthDate: e.target.value }
                        })}
                        required
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-blue-600 text-white px-4 py-2 hover:bg-blue-700"
                >
                  {editingStudy ? t('Update Study') : t('Create Study')}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-2 hover:bg-gray-50"
                >
                  {t('Cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <section className="bg-white rounded-2xl shadow flex-grow overflow-y-auto">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '900px' }}>
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-3 text-left whitespace-nowrap" style={{ width: '80px' }}>{t('Thumbnail')}</th>
                <th className="px-3 py-3 text-left whitespace-nowrap">{t('Study Date/Time')}</th>
                <th className="px-3 py-3 text-left whitespace-nowrap">{t('Patient')}</th>
                <th className="px-3 py-3 text-left whitespace-nowrap">{t('Accession')}</th>
                <th className="px-3 py-3 text-left whitespace-nowrap">{t('Modality')}</th>
                <th className="px-3 py-3 text-left whitespace-nowrap">{t('Series')}</th>
                <th className="px-3 py-3 text-left whitespace-nowrap" style={{ minWidth: '120px' }}>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredStudies.map((s) => {
                const studyId = s.studyId || s.study_instance_uid || s.studyInstanceUID;
                const isOpen = !!expanded[studyId];
                
                // Unified access for study properties
                const studyInstanceUID = s.study_instance_uid || s.studyInstanceUID;
                const patientName = s.patient_name || s.patient?.name;
                const mrn = s.patient_medical_record_number || s.patient?.mrn;
                const accession = s.accession_number || s.accessionNumber;
                const studyDate = s.study_date || s.studyDate;
                const studyTime = s.study_time || s.studyTime;
                const numSeries = s.number_of_series ?? s.series?.length ?? 0;
                
                // Get thumbnail URL if available
                // 1. Try dedicated thumbnail fields from backend
                // 2. Try nested series/instances (for mock or enriched data)
                let seriesUID = s.thumbnail_series_uid;
                let instanceUID = s.thumbnail_instance_uid;
                
                if (!seriesUID || !instanceUID) {
                  const firstSeries = s.series?.[0];
                  if (firstSeries) {
                    seriesUID = firstSeries.series_instance_uid || firstSeries.seriesInstanceUID;
                    const firstInstance = firstSeries.instances?.[0];
                    if (firstInstance) {
                      instanceUID = firstInstance.sop_instance_uid || firstInstance.sopInstanceUID;
                    }
                  }
                }

                const thumbUrl = (studyInstanceUID && seriesUID && instanceUID) 
                  ? wadoService.getThumbnailUrl(studyInstanceUID, seriesUID, instanceUID, 80)
                  : null;

                return (
                  <React.Fragment key={studyId}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-3 align-top">
                        <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center">
                          {thumbUrl ? (
                            <AuthenticatedImage 
                              src={thumbUrl} 
                              alt="Thumbnail"
                              className="w-full h-full object-cover"
                              fallbackText={t('No Preview')}
                            />
                          ) : (
                            <span className="text-[10px] text-gray-400 font-medium">{t('No Preview')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <div className="font-medium text-xs">{fmtDate(studyDate)}</div>
                        <div className="text-gray-500 text-xs">{studyTime}</div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium text-xs">{patientName}</div>
                        <div className="text-gray-500 text-xs">{t('MRN')}: {mrn}</div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="text-xs">{accession}</div>
                        <div className="text-gray-500 text-xs font-mono">{shortUID(studyInstanceUID)}</div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {s.modality}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-xs font-medium">
                          {numSeries}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <StudyActionsDropdown
                          study={s}
                          onView={() => alert(`Open Viewer for ${studyId}`)}
                          onEdit={() => handleEdit(s)}
                          onDelete={() => handleDelete(s)}
                          onToggleSeries={() => toggle(studyId)}
                          isExpanded={isOpen}
                        />
                      </td>
                    </tr>

                    {/* Series Row */}
                    {isOpen && (
                      <tr className="bg-gray-50/50">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">{t('Study Description:')}</span> {s.description}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm bg-white rounded-xl overflow-hidden">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="px-3 py-2 text-left">{t('Series #')}</th>
                                  <th className="px-3 py-2 text-left">{t('Series UID')}</th>
                                  <th className="px-3 py-2 text-left">{t('Modality')}</th>
                                  <th className="px-3 py-2 text-left">{t('Description')}</th>
                                  <th className="px-3 py-2 text-left">{t('Instances')}</th>
                                  <th className="px-3 py-2 text-left">{t('Actions')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {s.series
                                  .slice()
                                  .sort((a, b) => a.seriesNumber - b.seriesNumber)
                                  .map((se) => (
                                    <tr key={se.seriesId} className="hover:bg-gray-50">
                                      <td className="px-3 py-2">{se.seriesNumber}</td>
                                      <td className="px-3 py-2 font-mono">{shortUID(se.seriesInstanceUID)}</td>
                                      <td className="px-3 py-2">{se.modality}</td>
                                      <td className="px-3 py-2">{se.description}</td>
                                      <td className="px-3 py-2">{se.instances.length}</td>
                                      <td className="px-3 py-2">
                                        <button
                                          onClick={() => alert(`Open Series ${se.seriesId}`)}
                                          className="rounded-lg border px-3 py-1 hover:bg-gray-50"
                                        >
                                          {t('Open Series')}
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}