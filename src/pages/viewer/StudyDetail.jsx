import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import MOCK_STUDIES from '../../data/studies.json';
import ENHANCED_STUDIES from '../../data/studiesEnhanced.json';
import { fetchStudyDetails } from '../../services/studyService';
import {
  EyeIcon,
  SparklesIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  CalendarIcon,
  UserIcon,
  ClockIcon,
  TagIcon
} from '@heroicons/react/24/outline';
import DicomTagViewer from '../../components/dicom/DicomTagViewer';
import { exportDicomWithEditedTags, updateDicomInStorage } from '../../services/dicomTagService';
import AuthenticatedImage from '../../components/common/AuthenticatedImage';
import wadoService from '../../services/wadoService';

/**
 * Study Detail Page
 * Shows study information and series list
 * Bridge between study list and DICOM viewer
 */
export default function StudyDetail() {
  const { studyId } = useParams();
  const [searchParams] = useSearchParams();
  const studyUID = searchParams.get('studyId') || studyId;
  const navigate = useNavigate();
  const [study, setStudy] = useState(null);
  const [showTagViewer, setShowTagViewer] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [seriesError, setSeriesError] = useState(null);

  useEffect(() => {
    const loadStudy = async () => {
      // Try studyService first (includes localStorage)
      const { study: serviceStudy, source } = await fetchStudyDetails(studyUID);

      let foundStudy = null;

      if (serviceStudy) {
        // Check if we need to fetch series separately (if backend and no series)
        let seriesData = serviceStudy.series || [];

        if ((source === 'backend' || source === 'wado-fallback') && (!seriesData || seriesData.length === 0)) {
          try {
            setLoadingSeries(true);
            setSeriesError(null);
            const studyInstanceUID = serviceStudy.study_instance_uid || serviceStudy.id;

            // Import fetchStudySeries dynamically to avoid circular dependencies if any, 
            // or just use the imported one if available. 
            // We'll use the imported one since it's already there.
            const { fetchStudySeries } = await import('../../services/studyService');
            const { series } = await fetchStudySeries(studyInstanceUID);

            if (series && series.length > 0) {
              seriesData = series;
            }
          } catch (err) {
            console.warn('[StudyDetail] Failed to fetch separate series:', err);
            setSeriesError(err.message || 'Failed to load series data');
          } finally {
            setLoadingSeries(false);
          }
        }

        // Get series from localStorage if available and source is localStorage
        if (source === 'localStorage') {
          try {
            const { getSeriesByStudyUID, getInstancesBySeriesUID } = await import('../../services/dicomStorageService');
            const studyUIDForSeries = serviceStudy.study_instance_uid || serviceStudy.id;

            const localSeries = getSeriesByStudyUID(studyUIDForSeries);

            // Convert to expected format
            seriesData = localSeries.map(s => {
              const instances = getInstancesBySeriesUID(s.seriesUID);

              return {
                seriesInstanceUID: s.seriesUID,
                seriesNumber: s.seriesNumber,
                seriesDescription: s.seriesDescription,
                modality: s.modality,
                numberOfInstances: s.numberOfInstances,
                instances: instances.map(i => ({
                  sopInstanceUID: i.instanceUID,
                  instanceNumber: i.instanceNumber,
                  fileName: i.fileName
                }))
              };
            });
          } catch (error) {
            console.error('[StudyDetail] Failed to load series:', error);
          }
        }

        // Normalize format - ALWAYS use seriesData if available
        foundStudy = {
          id: serviceStudy.study_instance_uid || serviceStudy.id,
          studyInstanceUID: serviceStudy.study_instance_uid || serviceStudy.id,
          patientName: (serviceStudy.patient_name || serviceStudy.patientName || 'Unknown').replace(/\^/g, ' '),
          patientId: serviceStudy.patient_medical_record_number || serviceStudy.patient_id || serviceStudy.patientId || 'Unknown',
          patientDOB: serviceStudy.patient_birth_date || serviceStudy.patient_dob || serviceStudy.patientDOB || '',
          patientGender: serviceStudy.patient_gender || serviceStudy.patientGender || '',
          accessionNumber: serviceStudy.accession_number || serviceStudy.accessionNumber || 'N/A',
          studyDate: serviceStudy.study_date || serviceStudy.studyDate || '',
          studyTime: serviceStudy.study_time || serviceStudy.studyTime || '',
          studyDescription: serviceStudy.study_description || serviceStudy.studyDescription || 'No Description',
          modality: serviceStudy.modality || 'Unknown',
          status: serviceStudy.status || 'completed',
          referringPhysician: (serviceStudy.referring_physician || 'Dr. Unknown').replace(/\^/g, ' '),
          institution: serviceStudy.institution || 'General Hospital',
          numberOfSeries: seriesData.length || serviceStudy.number_of_series || serviceStudy.numberOfSeries || 0,
          // Count instances from series data - handle different field names and instance arrays
          numberOfInstances: seriesData.reduce((sum, s) => {
            // Try different field names
            const count = s.numberOfInstances || s.number_of_instances || s.instances?.length || 0;
            return sum + count;
          }, 0) || serviceStudy.number_of_instances || serviceStudy.numberOfInstances || 0,
          series: seriesData
        };
      } else {

        // Fallback to JSON files
        foundStudy = ENHANCED_STUDIES.find(
          (s) => s.id?.toString() === studyUID || s.studyInstanceUID === studyUID
        );

        if (!foundStudy) {
          foundStudy = MOCK_STUDIES.find(
            (s) => s.studyInstanceUID === studyUID || s.studyId === studyUID
          );

          // Convert mock study to enhanced format
          if (foundStudy) {
            foundStudy = {
              id: foundStudy.studyInstanceUID,
              studyInstanceUID: foundStudy.studyInstanceUID,
              patientName: foundStudy.patient?.name || 'Unknown',
              patientId: foundStudy.patient?.mrn || 'Unknown',
              patientDOB: foundStudy.patient?.birthDate || '',
              patientGender: foundStudy.patient?.gender || '',
              accessionNumber: foundStudy.accessionNumber || 'N/A',
              studyDate: foundStudy.studyDate || '',
              studyTime: foundStudy.studyTime || '',
              studyDescription: foundStudy.description,
              modality: foundStudy.modality,
              status: foundStudy.status || 'completed',
              referringPhysician: 'Dr. Unknown',
              institution: 'General Hospital',
              numberOfSeries: foundStudy.series?.length || 0,
              numberOfInstances: foundStudy.series?.reduce((sum, s) => sum + (s.instances?.length || 0), 0) || 0,
              series: foundStudy.series || []
            };
          }
        }
      }

      if (foundStudy) {
        setStudy(foundStudy);
      } else {
        console.error('[StudyDetail] Study not found after all attempts:', studyUID);
        setStudy(null);
      }
    };

    loadStudy().catch(error => {
      console.error('[StudyDetail] Error loading study:', error);
      setStudy(null);
    });
  }, [studyUID]);

  if (!study) {
    return (
      <div className="p-6">
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <div className="text-4xl mb-4">🔍</div>
          <div className="text-lg font-medium text-slate-700 mb-2">Study not found</div>
          <div className="text-sm text-slate-500 mb-4">
            Study ID: {studyUID}
          </div>
          <button
            onClick={() => navigate('/studies')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Studies
          </button>
        </div>
      </div>
    );
  }

  const getStatusColor = (status) => {
    const statusMap = {
      completed: 'bg-green-100 text-green-800',
      in_progress: 'bg-blue-100 text-blue-800',
      scheduled: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-800';
  };

  const handleOpenSimpleViewer = () => {
    navigate(`/viewer/${study.id || study.studyInstanceUID}`);
  };

  const handleOpenEnhancedViewer = () => {
    navigate(`/viewer/enhanced/${study.id || study.studyInstanceUID}`);
  };

  const handleViewTags = async () => {
    try {
      // Get instances from localStorage
      const { getSeriesByStudyUID, getInstancesBySeriesUID } = await import('../../services/dicomStorageService');

      const studyUID = study.studyInstanceUID || study.id;
      const series = getSeriesByStudyUID(studyUID);

      if (series && series.length > 0) {
        const firstSeries = series[0];
        const instances = getInstancesBySeriesUID(firstSeries.seriesUID);

        if (instances && instances.length > 0) {
          const firstInstance = instances[0];
          setSelectedInstanceId(firstInstance.id);
          setShowTagViewer(true);
        } else {
          alert('No instances available to view tags');
        }
      } else {
        alert('No series available in localStorage');
      }
    } catch (error) {
      console.error('[StudyDetail] Error opening tag viewer:', error);
      alert('Failed to open tag viewer: ' + error.message);
    }
  };

  const handleSaveTags = async (editedTags, dataSet) => {
    try {
      const choice = confirm(
        'Do you want to:\n' +
        'OK - Update file in storage\n' +
        'Cancel - Export as new file'
      );

      if (choice) {
        // Update in storage
        await updateDicomInStorage(selectedInstanceId, editedTags, dataSet);
        alert('DICOM file updated in storage successfully!');
      } else {
        // Export as new file
        const fileName = prompt('Enter filename:', `modified-${selectedInstanceId}.dcm`);
        if (fileName) {
          await exportDicomWithEditedTags(selectedInstanceId, editedTags, dataSet, fileName);
          alert('DICOM file exported successfully!');
        }
      }
    } catch (error) {
      console.error('[StudyDetail] Error saving tags:', error);
      alert('Failed to save tags: ' + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/studies')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to Studies"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Study Details</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {study.studyDescription}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 text-sm font-medium rounded-lg ${getStatusColor(study.status)}`}>
                {study.status || 'completed'}
              </span>
              <button
                onClick={handleOpenSimpleViewer}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                title="Simple JPEG viewer — always reliable"
              >
                <EyeIcon className="h-5 w-5" />
                Simple View
              </button>
              <button
                onClick={handleOpenEnhancedViewer}
                className="flex items-center gap-2 px-4 py-2 border border-indigo-500 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 font-medium transition-colors"
                title="Cornerstone viewer — full tools (MPR, measurements)"
              >
                <SparklesIcon className="h-5 w-5" />
                Enhanced View
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Series</div>
                <div className="text-2xl font-bold text-gray-900">{study.numberOfSeries || 0}</div>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Images</div>
                <div className="text-2xl font-bold text-gray-900">{study.numberOfInstances || 0}</div>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Modality</div>
                <div className="text-2xl font-bold text-gray-900">{study.modality}</div>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Status</div>
                <div className="text-lg font-bold text-gray-900 capitalize">{study.status || 'completed'}</div>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Patient & Study Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Patient Information */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <UserIcon className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Patient Information</h2>
            </div>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Name</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">{study.patientName}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Patient ID (MRN)</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">{study.patientId}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Date of Birth</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">{study.patientDOB || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Gender</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">{study.patientGender || 'N/A'}</dd>
              </div>
            </dl>
          </div>

          {/* Study Information */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <CalendarIcon className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Study Information</h2>
            </div>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Study Description</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">{study.studyDescription}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Accession Number</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">{study.accessionNumber}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Study Date & Time</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">
                  {new Date(study.studyDate).toLocaleDateString()} {study.studyTime}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Referring Physician</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">{study.referringPhysician || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Institution</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">{study.institution || 'N/A'}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Series List */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Series ({study.numberOfSeries || 0})</h2>
            {study.series?.length > 0 && (
              <button
                onClick={handleOpenSimpleViewer}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                <EyeIcon className="h-5 w-5" />
                View All Series
              </button>
            )}
          </div>

          {!study.series || study.series.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-6xl mb-4">📁</div>
              <div className="text-lg font-medium mb-2">No series available</div>
              <div className="text-sm">This study has no DICOM series yet</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {study.series.map((series, idx) => (
                <div
                  key={series.seriesInstanceUID || idx}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleOpenSimpleViewer()}
                >
                  {/* Thumbnail Placeholder or Loading/Error States */}
                  {loadingSeries ? (
                    <div className="aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                      <div className="text-gray-500">Loading...</div>
                    </div>
                  ) : seriesError ? (
                    <div className="aspect-square bg-red-50 rounded-lg mb-3 flex items-center justify-center">
                      <div className="text-red-500 text-center">
                        <div>Error loading series</div>
                        <div className="text-xs mt-1">{seriesError}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-square bg-gray-900 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                      {(() => {
                        // Find a valid instance UID for thumbnail
                        const instanceUID = series.thumbnailInstanceUID || 
                                           series.instances?.[0]?.sopInstanceUID || 
                                           series.instances?.[0]?.instanceUID ||
                                           (Array.isArray(series.instances) && series.instances[0]?.id);
                        
                        const studyUID = study.studyInstanceUID || study.id;
                        const seriesUID = series.seriesInstanceUID || series.seriesUID;
                        
                        // ONLY generate thumbnail if all required UIDs are present
                        if (studyUID && seriesUID && instanceUID) {
                          return (
                            <AuthenticatedImage
                              src={wadoService.getThumbnailUrl(
                                studyUID,
                                seriesUID,
                                instanceUID,
                                300
                              )}
                              alt={`Series ${series.seriesNumber}`}
                              className="w-full h-full object-cover"
                              fallback={
                                <div className="text-white text-4xl opacity-20">
                                  {series.modality || study.modality}
                                </div>
                              }
                            />
                          );
                        }
                        return (
                          <div className="text-white text-4xl opacity-20">
                            {series.modality || study.modality}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Series Info */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                        Series {series.seriesNumber || idx + 1}
                      </span>
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                        {series.modality || study.modality}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {series.seriesDescription || series.description || 'No description'}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>
                        {series.instanceCount || series.instances?.length || 0} images
                      </span>
                      <span>
                        {series.bodyPartExamined || 'N/A'}
                      </span>
                    </div>
                    {series.storageSize && (
                      <div className="text-xs text-gray-500">
                        Size: {(series.storageSize / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={handleOpenSimpleViewer}
              className="flex flex-col items-center gap-2 p-4 border-2 border-blue-600 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
              title="Stable JPEG viewer — works on any DICOM"
            >
              <EyeIcon className="h-6 w-6" />
              <span className="text-sm font-medium">Simple Viewer</span>
            </button>
            <button
              onClick={handleOpenEnhancedViewer}
              className="flex flex-col items-center gap-2 p-4 border-2 border-indigo-500 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors"
              title="Cornerstone viewer with MPR, measurements, and windowing tools"
            >
              <SparklesIcon className="h-6 w-6" />
              <span className="text-sm font-medium">Enhanced View</span>
            </button>
            <button
              onClick={() => navigate(`/report/${study.id}`)}
              className="flex flex-col items-center gap-2 p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {/* <DocumentTextIcon className="h-6 w-6 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Create Report</span>
            </button>
            <button
              onClick={() => alert('Export Study - Feature coming soon!')}
              className="flex flex-col items-center gap-2 p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            > */}
              {/* <ArrowDownTrayIcon className="h-6 w-6 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Export</span>
            </button>
            <button
              onClick={() => alert('Share Study - Feature coming soon!')}
              className="flex flex-col items-center gap-2 p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            > */}
              {/* <ShareIcon className="h-6 w-6 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Share</span>
            </button>
            <button
              onClick={handleViewTags}
              className="flex flex-col items-center gap-2 p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            > */}
              <TagIcon className="h-6 w-6 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">View Tags</span>
            </button>
          </div>
        </div>
      </div>

      {/* DICOM Tag Viewer Modal */}
      {showTagViewer && selectedInstanceId && (
        <DicomTagViewer
          instanceId={selectedInstanceId}
          onClose={() => {
            setShowTagViewer(false);
            setSelectedInstanceId(null);
          }}
          editable={true}
          onSave={handleSaveTags}
        />
      )}
    </div>
  );
}
