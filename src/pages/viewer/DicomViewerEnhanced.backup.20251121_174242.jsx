import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as cornerstone from '@cornerstonejs/core';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import ViewerToolbar from '../../components/viewer/ViewerToolbar';
import WindowingPanel from '../../components/viewer/WindowingPanel';
import MeasurementTools from '../../components/viewer/MeasurementTools';
import CineControls from '../../components/viewer/CineControls';
import LayoutSelector from '../../components/viewer/LayoutSelector';
import SeriesPanel from '../../components/viewer/SeriesPanel';
import ViewportGridEnhanced from '../../components/viewer/ViewportGridEnhanced';
import ENHANCED_STUDIES from '../../data/studiesEnhanced.json';
import { useViewportTools } from '../../hooks/viewer/useViewportTools';
import { useCinePlayer } from '../../hooks/viewer/useCinePlayer';
import { fetchStudyDetails } from '../../services/studyService';
import { createLocalStorageImageId } from '../../services/dicomFileService';
import wadoService from '../../services/wadoService';

export default function DicomViewerEnhanced() {
  const { studyId } = useParams();
  const navigate = useNavigate();

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [study, setStudy] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [layout, setLayout] = useState('1x1');
  const [activeViewport, setActiveViewport] = useState(0);
  const [activeSeries, setActiveSeries] = useState(0);
  const [imageIds, setImageIds] = useState([]);

  // Panel visibility
  const [showWindowing, setShowWindowing] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [showLayout, setShowLayout] = useState(false);
  const [showSeries, setShowSeries] = useState(true);
  const [showCine, setShowCine] = useState(false);

  // Window/Level
  const [windowLevel, setWindowLevel] = useState({ width: 400, center: 40 });

  // Custom hooks
  const viewportTools = useViewportTools('pacsRenderingEngine');
  const cinePlayer = useCinePlayer(imageIds.length, 10);

  // Load study data
  useEffect(() => {
    const loadStudy = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        console.log('[DicomViewerEnhanced] Loading study:', studyId);

        // Try studyService first (includes localStorage)
        const { study: serviceStudy, source } = await fetchStudyDetails(studyId);
        console.log(`[DicomViewerEnhanced] Study source: ${source}`);

        let foundStudy = null;
        let loadedImageIds = [];

        // ⚠️ TEMPORARILY DISABLED: localStorage source handling
        // Re-enable by uncommenting this block
        /*
        if (source === 'localStorage' && serviceStudy) {
          try {
            const { getSeriesByStudyUID, getInstancesBySeriesUID, getDicomBlobUrl } = await import('../../services/dicomStorageService');
            const { getDicomBlobUrl: getBlobUrl } = await import('../../services/dicomFileService');

            const studyUID = serviceStudy.study_instance_uid || serviceStudy.id;
            const localSeries = getSeriesByStudyUID(studyUID);

            console.log('[DicomViewerEnhanced] localStorage series found:', localSeries.length);

            if (localSeries.length > 0) {
              // Load first series by default
              const firstSeries = localSeries[0];
              const instances = getInstancesBySeriesUID(firstSeries.seriesUID);

              console.log('[DicomViewerEnhanced] Loading instances:', instances.length);

              // Create blob URLs for Cornerstone wadouri loader
              loadedImageIds = instances.map(inst => {
                try {
                  const blobUrl = getBlobUrl(inst.id);
                  return `wadouri:${blobUrl}`;
                } catch (err) {
                  console.error('[DicomViewerEnhanced] Failed to create blob URL for:', inst.id, err);
                  return null;
                }
              }).filter(id => id !== null);

              console.log('[DicomViewerEnhanced] Created blob URLs:', loadedImageIds.length);

              // Build study object with all series
              foundStudy = {
                id: studyUID,
                patientName: serviceStudy.patient_name || 'Unknown',
                studyDescription: serviceStudy.study_description || 'No Description',
                studyDate: serviceStudy.study_date || '',
                numberOfSeries: localSeries.length,
                numberOfInstances: instances.length,
                series: localSeries.map(s => {
                  const seriesInstances = getInstancesBySeriesUID(s.seriesUID);
                  return {
                    seriesInstanceUID: s.seriesUID,
                    seriesDescription: s.seriesDescription || 'Series',
                    seriesNumber: s.seriesNumber || 1,
                    modality: s.modality || 'Unknown',
                    instances: seriesInstances.map(i => {
                      try {
                        const blobUrl = getBlobUrl(i.id);
                        return {
                          sopInstanceUID: i.instanceUID,
                          instanceNumber: i.instanceNumber,
                          imageId: `wadouri:${blobUrl}`
                        };
                      } catch (err) {
                        console.error('[DicomViewerEnhanced] Failed to create blob for instance:', i.id, err);
                        return null;
                      }
                    }).filter(inst => inst !== null)
                  };
                })
              };

              console.log('[DicomViewerEnhanced] localStorage study prepared:', foundStudy);
            }
          } catch (error) {
            console.error('[DicomViewerEnhanced] localStorage error:', error);
            setLoadError({
              message: 'Failed to load from localStorage: ' + error.message,
              studyId: studyId,
              suggestion: 'The DICOM data may be corrupted. Try re-uploading.'
            });
            setIsLoading(false);
            return;
          }
        }
        */

        // Force use backend/WADO or mock data
        console.log('[DicomViewerEnhanced] localStorage DISABLED - using backend/mock data');
        if (source === 'localStorage') {
          console.log('[DicomViewerEnhanced] Overriding localStorage source to backend');
          // Don't set foundStudy here, fall through to backend/mock logic
        }
        // Handle backend/WADO source
        else if ((source === 'backend' || source === 'wado-fallback') && serviceStudy) {
          try {
            let seriesData = serviceStudy.series || [];

            // Fetch series separately if not included
            if (seriesData.length === 0) {
              console.log('[DicomViewerEnhanced] Fetching series from backend');
              const { fetchStudySeries } = await import('../../services/studyService');
              const studyUID = serviceStudy.study_instance_uid || serviceStudy.id;
              const result = await fetchStudySeries(studyUID);
              seriesData = result.series || [];
            }

            if (seriesData.length > 0) {
              // Normalize series format
              const normalizedSeries = seriesData.map(s => ({
                seriesInstanceUID: s.series_instance_uid || s.seriesInstanceUID,
                seriesDescription: s.series_description || s.seriesDescription || 'No Description',
                seriesNumber: s.series_number || s.seriesNumber || 0,
                modality: s.modality || 'Unknown',
                instances: (s.instances || []).map(inst => ({
                  sopInstanceUID: inst.sop_instance_uid || inst.sopInstanceUID,
                  instanceNumber: inst.instance_number || inst.instanceNumber || 0,
                  imageId: inst.imageId || null
                }))
              }));

              foundStudy = {
                id: serviceStudy.study_instance_uid || serviceStudy.id,
                patientName: serviceStudy.patient_name || serviceStudy.patientName || 'Unknown',
                studyDescription: serviceStudy.study_description || serviceStudy.studyDescription || 'No Description',
                studyDate: serviceStudy.study_date || serviceStudy.studyDate || '',
                numberOfSeries: normalizedSeries.length,
                numberOfInstances: normalizedSeries.reduce((sum, s) => sum + s.instances.length, 0),
                series: normalizedSeries
              };

              console.log('[DicomViewerEnhanced] Backend study prepared:', foundStudy);
            }
          } catch (error) {
            console.error('[DicomViewerEnhanced] Backend error:', error);
            setLoadError({
              message: 'Failed to load from backend: ' + error.message,
              studyId: studyId,
              suggestion: 'Please check backend connectivity.'
            });
            setIsLoading(false);
            return;
          }
        }
        // Fallback to JSON mock data
        else {
          console.log('[DicomViewerEnhanced] Fallback to JSON mock data');
          foundStudy = ENHANCED_STUDIES.find(s => s.id?.toString() === studyId);

          if (foundStudy && foundStudy.series && foundStudy.series.length > 0) {
            const firstSeries = foundStudy.series[0];
            if (firstSeries.instances && firstSeries.instances.length > 0) {
              loadedImageIds = firstSeries.instances.map(inst => {
                const path = inst.imageId.replace('wadouri:', '');
                return `wadouri:${window.location.origin}${path}`;
              });
            }
          }
        }

        // Set study and images if found
        if (foundStudy) {
          setStudy(foundStudy);
          setImageIds(loadedImageIds);
          console.log('[DicomViewerEnhanced] ✅ Study loaded successfully');
          console.log('[DicomViewerEnhanced] Image IDs:', loadedImageIds.length);
        } else {
          console.error('[DicomViewerEnhanced] ❌ Study not found:', studyId);
          setLoadError({
            message: 'Study not found in any source.',
            studyId: studyId,
            suggestion: 'Please verify the study ID or try uploading DICOM files.'
          });
        }
      } catch (error) {
        console.error('[DicomViewerEnhanced] Unexpected error:', error);
        setLoadError({
          message: error.message || 'Unexpected error occurred',
          studyId: studyId,
          suggestion: 'Please try again or contact support.'
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadStudy();
  }, [studyId]);

  // Initialize Cornerstone
  useEffect(() => {
    const initCornerstone = async () => {
      try {
        await cornerstone.init();

        cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
        cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

        cornerstoneDICOMImageLoader.configure({
          strict: false,
          decodeConfig: {
            convertFloatPixelDataToInt: false,
            usePDFJS: false,
          },
          beforeSend: (xhr) => {
            // Add diagnostic logging for WADO-RS requests
            console.log('[DicomViewerEnhanced] DICOM request:', xhr.url);
          },
          errorInterceptor: (error) => {
            console.error('[DicomViewerEnhanced] DICOM load error:', error);
            return error;
          },
        });

        // ⚠️ DISABLE WEB WORKERS FOR TESTING
        // For uncompressed DICOM (Explicit VR Little Endian), web workers not needed
        const config = {
          maxWebWorkers: 0,  // DISABLED for testing
          startWebWorkersOnDemand: false,
          taskConfiguration: {
            decodeTask: {
              initializeCodecsOnStartup: false,  // Don't load codecs
              strict: false,
            },
          },
        };

        cornerstoneDICOMImageLoader.webWorkerManager.initialize(config);

        console.log('[DicomViewerEnhanced] ⚠️ Web workers DISABLED for testing');

        console.log('[DicomViewerEnhanced] Cornerstone initialized with codec support');

        // Diagnostic: Check if codecs loaded
        setTimeout(() => {
          try {
            const webWorkerManager = cornerstoneDICOMImageLoader.webWorkerManager;
            console.log('[DicomViewerEnhanced] Web workers status:', {
              maxWebWorkers: webWorkerManager.maxWebWorkers,
              numWebWorkers: webWorkerManager.numWebWorkers,
              workers: webWorkerManager.webWorkers ? webWorkerManager.webWorkers.length : 0
            });
          } catch (err) {
            console.warn('[DicomViewerEnhanced] Could not check web workers:', err);
          }
        }, 1000);

        // Note: Using Cornerstone's built-in wadouri loader with blob URLs
        // No need to register custom loader
        console.log('[DicomViewerEnhanced] Using Cornerstone wadouri loader with blob URLs');

        setIsInitialized(true);
      } catch (err) {
        console.error('Failed to initialize Cornerstone:', err);
      }
    };

    initCornerstone();
  }, []);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    // Store current imageIds for cleanup
    const currentImageIds = [...imageIds];

    return () => {
      // Revoke blob URLs to free memory
      console.log('[DicomViewerEnhanced] Cleaning up blob URLs:', currentImageIds.length);
      currentImageIds.forEach(imageId => {
        if (imageId && imageId.startsWith('wadouri:blob:')) {
          try {
            const blobUrl = imageId.replace('wadouri:', '');
            URL.revokeObjectURL(blobUrl);
          } catch (err) {
            console.warn('[DicomViewerEnhanced] Failed to revoke blob URL:', err);
          }
        }
      });
    };
  }, [imageIds]); // Cleanup when imageIds change

  // Tool handlers using custom hooks
  const handleZoomIn = () => {
    viewportTools.zoomIn(`viewport-${activeViewport}`);
  };

  const handleZoomOut = () => {
    viewportTools.zoomOut(`viewport-${activeViewport}`);
  };

  const handleReset = () => {
    viewportTools.resetView(`viewport-${activeViewport}`);
    setWindowLevel({ width: 400, center: 40 });
  };

  const handleApplyWindowing = (width, center) => {
    setWindowLevel({ width, center });
    viewportTools.applyWindowing(`viewport-${activeViewport}`, width, center);
  };

  const handleSeriesSelect = async (series, index) => {
    console.log('[DicomViewerEnhanced] Selected series:', series);
    setActiveSeries(index);

    // Load images for selected series
    if (series && series.instances && series.instances.length > 0) {
      setIsLoading(true);
      try {
        const imagePromises = series.instances.map(async (inst) => {
          // If already has imageId (from localStorage or backend), use it
          if (inst.imageId && inst.imageId.startsWith('wadouri:')) {
            console.log('[DicomViewerEnhanced] Using existing imageId:', inst.imageId.substring(0, 50));
            return inst.imageId;
          }

          // For backend/WADO instances - DIRECT FETCH (NO CACHE)
          const sopUID = inst.sop_instance_uid || inst.sopInstanceUID || inst['00080018']?.Value?.[0];
          if (sopUID) {
            try {
              // ⚠️ CACHE DISABLED - Direct fetch
              const studyUID = study.id;
              const seriesUID = series.seriesInstanceUID;
              const wadoUrl = `/wado-rs/studies/${studyUID}/series/${seriesUID}/instances/${sopUID}`;

              console.log('[DicomViewerEnhanced] Direct fetch (no cache):', wadoUrl);
              const response = await fetch(wadoUrl);
              if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

              const blob = await response.blob();

              // Return blob URL (no caching)
              const blobUrl = URL.createObjectURL(blob);
              console.log('[DicomViewerEnhanced] Created blob from backend:', blobUrl);
              return `wadouri:${blobUrl}`;
            } catch (err) {
              console.error('[DicomViewerEnhanced] Error loading instance:', sopUID, err);
              return null;
            }
          }

          console.warn('[DicomViewerEnhanced] No imageId or SOP UID for instance:', inst);
          return null;
        });

        const ids = (await Promise.all(imagePromises)).filter(id => id);
        setImageIds(ids);
        console.log('[DicomViewerEnhanced] ✅ Loaded series images:', ids.length);
      } catch (error) {
        console.error('[DicomViewerEnhanced] ❌ Error processing series:', error);
        setLoadError({
          message: 'Failed to load series images: ' + error.message,
          studyId: studyId,
          suggestion: 'Please try selecting another series or refresh the page.'
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      console.warn('[DicomViewerEnhanced] Series has no instances');
      setImageIds([]);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <div className="text-6xl mb-4 animate-pulse">⏳</div>
          <div className="text-xl mb-2">Loading study...</div>
          <div className="text-sm text-gray-400">Study UID: {studyId}</div>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center text-white max-w-2xl px-4">
          <div className="text-6xl mb-4">⚠️</div>
          <div className="text-2xl mb-3 font-semibold">Study Not Found</div>
          <div className="mb-4 p-3 bg-gray-800 rounded-lg">
            <div className="text-xs text-gray-400 mb-1">Study UID:</div>
            <code className="text-xs text-blue-400 break-all">{loadError.studyId}</code>
          </div>
          <div className="text-sm text-gray-300 mb-2">
            {loadError.message}
          </div>
          <div className="text-sm text-gray-400 mb-6">
            {loadError.suggestion}
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/studies')}
              className="px-4 py-2 bg-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Back to Studies
            </button>
            <button
              onClick={() => navigate('/dicom-upload')}
              className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              Upload DICOM
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Study not loaded (shouldn't happen with new logic, but keep as fallback)
  if (!study) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <div className="text-6xl mb-4">🔍</div>
          <div className="text-xl mb-2">Study not found</div>
          <button
            onClick={() => navigate('/studies')}
            className="mt-4 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Back to Studies
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Top Bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(`/study/${studyId}`)}
              className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg"
              title="Back to Study Details"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-white font-semibold">{study.patientName}</h1>
              <p className="text-xs text-gray-400">
                {study.studyDescription} • {study.studyDate}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs text-gray-400">
            <span>Series: {study.numberOfSeries}</span>
            <span>•</span>
            <span>Images: {study.numberOfInstances}</span>
            <span>•</span>
            <span>W/L: {Math.round(windowLevel.width)}/{Math.round(windowLevel.center)}</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <ViewerToolbar
        activeTool={viewportTools.activeTool}
        onToolChange={viewportTools.setActiveTool}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        onToggleWindowing={() => setShowWindowing(!showWindowing)}
        onToggleMeasurements={() => setShowMeasurements(!showMeasurements)}
        onToggleCine={() => {
          console.log('[DicomViewerEnhanced] Toggle cine, current:', showCine);
          setShowCine(!showCine);
        }}
        isPlaying={cinePlayer.isPlaying}
        onToggleLayout={() => setShowLayout(!showLayout)}
      />

      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden">
        {/* Series Panel */}
        {showSeries && (
          <SeriesPanel
            series={study.series}
            onSeriesSelect={handleSeriesSelect}
            onClose={() => setShowSeries(false)}
            activeSeries={activeSeries}
          />
        )}

        {/* Windowing Panel */}
        {showWindowing && (
          <WindowingPanel
            onClose={() => setShowWindowing(false)}
            onApply={handleApplyWindowing}
            currentWindow={windowLevel}
          />
        )}

        {/* Measurement Tools */}
        {showMeasurements && (
          <MeasurementTools
            onClose={() => setShowMeasurements(false)}
            onSelectTool={(tool) => {
              viewportTools.setActiveTool(tool);
              console.log('Selected measurement tool:', tool);
            }}
            activeTool={viewportTools.activeTool}
          />
        )}

        {/* Layout Selector */}
        {showLayout && (
          <LayoutSelector
            onSelect={setLayout}
            onClose={() => setShowLayout(false)}
            currentLayout={layout}
          />
        )}

        {/* Viewport Grid */}
        <ViewportGridEnhanced
          layout={layout}
          onViewportClick={setActiveViewport}
          imageIds={imageIds}
          activeViewport={activeViewport}
          windowLevel={windowLevel}
          isInitialized={isInitialized}
        />

        {/* Cine Controls */}
        {showCine && (
          <CineControls
            isPlaying={cinePlayer.isPlaying}
            onPlayPause={cinePlayer.togglePlayPause}
            onNextFrame={cinePlayer.nextFrame}
            onPrevFrame={cinePlayer.prevFrame}
            onLoop={cinePlayer.toggleLoop}
            currentFrame={cinePlayer.currentFrame}
            totalFrames={imageIds.length || 1}
            fps={cinePlayer.fps}
            onFpsChange={cinePlayer.setFps}
          />
        )}

        {/* Loading State */}
        {!isInitialized && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center text-white">
              <div className="text-4xl mb-4">⏳</div>
              <div>Initializing viewer...</div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {isInitialized && imageIds.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-gray-500">
              <div className="text-6xl mb-4">📁</div>
              <div className="text-xl mb-2">No images loaded</div>
              <div className="text-sm">
                {study?.series && study.series.length > 0
                  ? 'Select a series from the left panel'
                  : 'This study has no DICOM series'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-1.5">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowSeries(!showSeries)}
              className={`px-2 py-1 rounded ${showSeries ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'}`}
            >
              Series
            </button>
            <span>Layout: {layout}</span>
            <span>Active Viewport: {activeViewport + 1}</span>
          </div>
          <div>
            Cornerstone.js v3 • Enhanced Viewer
          </div>
        </div>
      </div>
    </div>
  );
}
