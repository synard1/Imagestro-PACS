import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
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
import { loadMeasurements, restoreMeasurementsToViewer } from '../../services/measurementService';

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollMouseWheelTool,
  LengthTool,
  ProbeTool,
  RectangleROITool,
  EllipticalROITool,
  PlanarFreehandROITool,
  ArrowAnnotateTool,
  AngleTool,
  CobbAngleTool,
  utilities: { calibration },
} = cornerstoneTools;

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

        let foundStudy = null;
        let imageIds = [];

        if (serviceStudy) {
          console.log(`[DicomViewerEnhanced] Study loaded from ${source}:`, studyId);

          // Get series from localStorage if available
          if (source === 'localStorage') {
            try {
              const { getSeriesByStudyUID, getInstancesBySeriesUID } = await import('../../services/dicomStorageService');
              const studyUID = serviceStudy.study_instance_uid || serviceStudy.id;
              const localSeries = getSeriesByStudyUID(studyUID);

              if (localSeries.length > 0) {
                const firstSeries = localSeries[0];
                const instances = getInstancesBySeriesUID(firstSeries.seriesUID);

                // Create blob URLs for Cornerstone wadouri loader
                const { getDicomBlobUrl } = await import('../../services/dicomFileService');
                imageIds = instances.map(inst => {
                  const blobUrl = getDicomBlobUrl(inst.id);
                  return `wadouri:${blobUrl}`;
                });

                console.log('[DicomViewerEnhanced] Loaded localStorage images:', imageIds.length);

                // Convert to expected format
                foundStudy = {
                  id: serviceStudy.study_instance_uid,
                  patientName: serviceStudy.patient_name,
                  studyDescription: serviceStudy.study_description,
                  studyDate: serviceStudy.study_date,
                  numberOfSeries: localSeries.length,
                  numberOfInstances: instances.length,
                  series: localSeries.map(s => {
                    const seriesInstances = getInstancesBySeriesUID(s.seriesUID);
                    return {
                      seriesInstanceUID: s.seriesUID,
                      seriesDescription: s.seriesDescription,
                      modality: s.modality,
                      instances: seriesInstances.map(i => ({
                        sopInstanceUID: i.instanceUID,
                        instanceNumber: i.instanceNumber,
                        imageId: createLocalStorageImageId(i.id)
                      }))
                    };
                  })
                };
              }
            } catch (error) {
              console.warn('[DicomViewerEnhanced] Failed to load from localStorage:', error);
            }
          } else if (source === 'backend' || source === 'wado-fallback') {
            // Handle backend/WADO series data
            try {
              // Try to fetch series if not in study details
              let seriesData = serviceStudy.series || [];

              if (!seriesData || seriesData.length === 0) {
                console.log('[DicomViewerEnhanced] Fetching series separately for viewer');
                const { fetchStudySeries } = await import('../../services/studyService');
                const studyUID = serviceStudy.study_instance_uid || serviceStudy.id;
                const result = await fetchStudySeries(studyUID);
                seriesData = result.series || [];
                console.log('[DicomViewerEnhanced] Fetched series:', seriesData.length);
              }

              if (seriesData.length > 0) {
                // Normalize series format
                const normalizedSeries = seriesData.map(s => ({
                  seriesInstanceUID: s.series_instance_uid || s.seriesInstanceUID,
                  seriesDescription: s.series_description || s.seriesDescription || 'No Description',
                  seriesNumber: s.series_number || s.seriesNumber || 0,
                  modality: s.modality || 'Unknown',
                  instances: s.instances || []
                }));

                foundStudy = {
                  id: serviceStudy.study_instance_uid || serviceStudy.id,
                  patientName: serviceStudy.patient_name || serviceStudy.patientName || 'Unknown',
                  studyDescription: serviceStudy.study_description || serviceStudy.studyDescription || 'No Description',
                  studyDate: serviceStudy.study_date || serviceStudy.studyDate || '',
                  numberOfSeries: normalizedSeries.length,
                  numberOfInstances: normalizedSeries.reduce((sum, s) => sum + (s.instances?.length || 0), 0),
                  series: normalizedSeries
                }

                // Fallback to JSON if no localStorage data
                if (!foundStudy) {
                  foundStudy = ENHANCED_STUDIES.find(s => s.id?.toString() === studyId);

                  if (foundStudy && foundStudy.series && foundStudy.series.length > 0) {
                    const firstSeries = foundStudy.series[0];
                    if (firstSeries.instances && firstSeries.instances.length > 0) {
                      imageIds = firstSeries.instances.map(inst => {
                        const path = inst.imageId.replace('wadouri:', '');
                        return `wadouri:${window.location.origin}${path}`;
                      });
                    }
                  }
                }
              } else {
                // Fallback to JSON files
                console.log('[DicomViewerEnhanced] No study from service, trying JSON fallback');
                foundStudy = ENHANCED_STUDIES.find(s => s.id?.toString() === studyId);

                if (foundStudy && foundStudy.series && foundStudy.series.length > 0) {
                  const firstSeries = foundStudy.series[0];
                  if (firstSeries.instances && firstSeries.instances.length > 0) {
                    imageIds = firstSeries.instances.map(inst => {
                      const path = inst.imageId.replace('wadouri:', '');
                      return `wadouri:${window.location.origin}${path}`;
                    });
                  }
                }
              }

              if (foundStudy) {
                setStudy(foundStudy);
                setImageIds(imageIds);
                console.log('[DicomViewerEnhanced] Study loaded successfully:', foundStudy);
                console.log('[DicomViewerEnhanced] Image IDs:', imageIds.length);
              } else {
                console.error('[DicomViewerEnhanced] Study not found:', studyId);
                setLoadError({
                  message: 'Study not found in backend, localStorage, or mock data.',
                  studyId: studyId,
                  suggestion: 'Please check if the study exists or try uploading DICOM files first.'
                });
              }
            } catch (error) {
              console.error('[DicomViewerEnhanced] Error loading study:', error);
              setLoadError({
                message: error.message || 'Failed to load study',
                studyId: studyId,
                suggestion: 'There was an error loading the study. Please try again or contact support.'
              });
            } finally {
              setIsLoading(false);
            }
          }
        } else {
          // Fallback to JSON files if no service study
          console.log('[DicomViewerEnhanced] No study from service, trying JSON fallback');
          foundStudy = ENHANCED_STUDIES.find(s => s.id?.toString() === studyId);

          if (foundStudy && foundStudy.series && foundStudy.series.length > 0) {
            const firstSeries = foundStudy.series[0];
            if (firstSeries.instances && firstSeries.instances.length > 0) {
              imageIds = firstSeries.instances.map(inst => {
                const path = inst.imageId.replace('wadouri:', '');
                return `wadouri:${window.location.origin}${path}`;
              });
            }
          }
        }

        if (foundStudy) {
          setStudy(foundStudy);
          setImageIds(imageIds);
          console.log('[DicomViewerEnhanced] Study loaded successfully:', foundStudy);
          console.log('[DicomViewerEnhanced] Image IDs:', imageIds.length);
        } else {
          console.error('[DicomViewerEnhanced] Study not found:', studyId);
          setLoadError({
            message: 'Study not found in backend, localStorage, or mock data.',
            studyId: studyId,
            suggestion: 'Please check if the study exists or try uploading DICOM files first.'
          });
        }
      } catch (error) {
        console.error('[DicomViewerEnhanced] Error loading study:', error);
        setLoadError({
          message: error.message || 'Failed to load study',
          studyId: studyId,
          suggestion: 'There was an error loading the study. Please try again or contact support.'
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
        });

        const config = {
          maxWebWorkers: navigator.hardwareConcurrency || 4,
          startWebWorkersOnDemand: true,
          taskConfiguration: {
            decodeTask: {
              initializeCodecsOnStartup: true,
              strict: false,
              // Use unpkg for the matching version of dicom-image-loader codecs
              codecsPath: 'https://unpkg.com/@cornerstonejs/dicom-image-loader@1.80.4/dist/codecs/',
            },
          },
        };

        cornerstoneDICOMImageLoader.webWorkerManager.initialize(config);

        console.log('[DicomViewerEnhanced] Cornerstone initialized with codec support');

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

  // Initialize Tools
  useEffect(() => {
    const initTools = () => {
      cornerstoneTools.init();

      // Add tools to Cornerstone3D
      cornerstoneTools.addTool(WindowLevelTool);
      cornerstoneTools.addTool(PanTool);
      cornerstoneTools.addTool(ZoomTool);
      cornerstoneTools.addTool(StackScrollMouseWheelTool);
      cornerstoneTools.addTool(LengthTool);
      cornerstoneTools.addTool(ProbeTool);
      cornerstoneTools.addTool(RectangleROITool);
      cornerstoneTools.addTool(EllipticalROITool);
      cornerstoneTools.addTool(PlanarFreehandROITool);
      cornerstoneTools.addTool(ArrowAnnotateTool);
      cornerstoneTools.addTool(AngleTool);
      cornerstoneTools.addTool(CobbAngleTool);

      // Define a ToolGroup
      const toolGroupId = 'pacsToolGroup';
      const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

      // Add tools to the ToolGroup
      toolGroup.addTool(WindowLevelTool.toolName);
      toolGroup.addTool(PanTool.toolName);
      toolGroup.addTool(ZoomTool.toolName);
      toolGroup.addTool(StackScrollMouseWheelTool.toolName);
      toolGroup.addTool(LengthTool.toolName);
      toolGroup.addTool(ProbeTool.toolName);
      toolGroup.addTool(RectangleROITool.toolName);
      toolGroup.addTool(EllipticalROITool.toolName);
      toolGroup.addTool(PlanarFreehandROITool.toolName);
      toolGroup.addTool(ArrowAnnotateTool.toolName);
      toolGroup.addTool(AngleTool.toolName);
      toolGroup.addTool(CobbAngleTool.toolName);

      // Set initial state
      toolGroup.setToolActive(WindowLevelTool.toolName, {
        bindings: [
          {
            mouseButton: csToolsEnums.MouseBindings.Primary, // Left Click
          },
        ],
      });
      toolGroup.setToolActive(PanTool.toolName, {
        bindings: [
          {
            mouseButton: csToolsEnums.MouseBindings.Auxiliary, // Middle Click
          },
        ],
      });
      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: [
          {
            mouseButton: csToolsEnums.MouseBindings.Secondary, // Right Click
          },
        ],
      });
      toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

      console.log('[DicomViewerEnhanced] Tools initialized');
    };

    if (isInitialized) {
      initTools();
    }
  }, [isInitialized]);

  // Auto-load saved measurements after tools are initialized
  useEffect(() => {
    const autoLoadMeasurements = async () => {
      // Only load if we have a study and tools are initialized
      if (!study?.id || !isInitialized) {
        return;
      }

      try {
        console.log('[DicomViewerEnhanced] Auto-loading saved measurements for study:', study.id);

        // Load measurements from localStorage
        const savedMeasurements = await loadMeasurements(study.id, false); // Use localStorage only

        if (savedMeasurements && savedMeasurements.length > 0) {
          console.log(`[DicomViewerEnhanced] Found ${savedMeasurements.length} saved measurements`);

          // Restore measurements to viewer
          const restoredCount = restoreMeasurementsToViewer(savedMeasurements, cornerstoneTools);

          if (restoredCount > 0) {
            console.log(`[DicomViewerEnhanced] Auto-loaded ${restoredCount} measurements`);

            // Trigger viewport re-render to show restored measurements
            try {
              const renderingEngine = cornerstone.getRenderingEngine('pacsRenderingEngine');
              if (renderingEngine) {
                const viewports = renderingEngine.getViewports();
                viewports.forEach(vp => vp.render());
              }
            } catch (renderError) {
              console.warn('[DicomViewerEnhanced] Could not render after restore:', renderError);
            }
          }
        } else {
          console.log('[DicomViewerEnhanced] No saved measurements found for this study');
        }
      } catch (error) {
        console.error('[DicomViewerEnhanced] Error auto-loading measurements:', error);
      }
    };

    // Wait a bit for viewports to be ready, then load measurements
    const timer = setTimeout(autoLoadMeasurements, 500);
    return () => clearTimeout(timer);
  }, [study?.id, isInitialized]);

  // Handle Tool Selection
  const handleToolSelect = (toolId) => {
    const toolGroupId = 'pacsToolGroup';
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    if (!toolGroup) return;

    // Disable all active tools first (except Pan/Zoom on other buttons)
    // Actually, we just need to switch the primary binding

    const toolNameMap = {
      'Length': LengthTool.toolName,
      'Probe': ProbeTool.toolName,
      'RectangleROI': RectangleROITool.toolName,
      'EllipticalROI': EllipticalROITool.toolName,
      'PlanarFreehandROI': PlanarFreehandROITool.toolName,
      'ArrowAnnotate': ArrowAnnotateTool.toolName,
      'Angle': AngleTool.toolName,
      'CobbAngle': CobbAngleTool.toolName,
      'pan': PanTool.toolName,
      'zoom': ZoomTool.toolName,
      'window': WindowLevelTool.toolName,
    };

    const selectedToolName = toolNameMap[toolId];

    if (selectedToolName) {
      // Deactivate other tools on primary button
      // We can't easily know which one is active, so we set the common ones to passive
      toolGroup.setToolPassive(WindowLevelTool.toolName);
      toolGroup.setToolPassive(PanTool.toolName);
      toolGroup.setToolPassive(ZoomTool.toolName);
      toolGroup.setToolPassive(LengthTool.toolName);
      toolGroup.setToolPassive(ProbeTool.toolName);
      toolGroup.setToolPassive(RectangleROITool.toolName);
      toolGroup.setToolPassive(EllipticalROITool.toolName);
      toolGroup.setToolPassive(PlanarFreehandROITool.toolName);
      toolGroup.setToolPassive(ArrowAnnotateTool.toolName);
      toolGroup.setToolPassive(AngleTool.toolName);
      toolGroup.setToolPassive(CobbAngleTool.toolName);

      // Activate selected tool
      toolGroup.setToolActive(selectedToolName, {
        bindings: [
          {
            mouseButton: csToolsEnums.MouseBindings.Primary,
          },
        ],
      });

      // Restore Pan/Zoom on other buttons if needed (optional, kept simple for now)
      toolGroup.setToolActive(PanTool.toolName, {
        bindings: [
          {
            mouseButton: csToolsEnums.MouseBindings.Auxiliary,
          },
        ],
      });
      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: [
          {
            mouseButton: csToolsEnums.MouseBindings.Secondary,
          },
        ],
      });
    }
  };
  useEffect(() => {
    const currentImageIds = [...imageIds];
    return () => {
      // Revoke blob URLs to free memory when component unmounts
      currentImageIds.forEach(imageId => {
        if (imageId.startsWith('wadouri:blob:')) {
          const blobUrl = imageId.replace('wadouri:', '');
          import('../../services/dicomFileService').then(({ revokeDicomBlobUrl }) => {
            revokeDicomBlobUrl(blobUrl);
          });
        }
      });
    };
  }, []); // Only on unmount, not on imageIds change

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
      const ids = series.instances.map(inst => {
        // If already has imageId (localStorage), use it
        if (inst.imageId && inst.imageId.startsWith('wadouri:')) {
          return inst.imageId;
        }
        // For backend/WADO, construct WADO-RS URL for Cornerstone
        const sopUID = inst.sop_instance_uid || inst.sopInstanceUID || inst['00080018']?.Value?.[0];
        if (sopUID) {
          const studyUID = study.id;
          const seriesUID = series.seriesInstanceUID;
          // Use relative URL via origin to leverage Vite proxy
          // Note: We use the raw DICOM endpoint (without /rendered) for the Enhanced Viewer
          // to enable full DICOM functionality (Window/Level, etc.)
          const wadoUrl = `${window.location.origin}/wado-rs/studies/${studyUID}/series/${seriesUID}/instances/${sopUID}`;
          console.log('[DicomViewerEnhanced] Generated WADO URL:', wadoUrl);
          return `wadouri:${wadoUrl}`;
        }
        return null;
      }).filter(id => id);
      setImageIds(ids);
      console.log('[DicomViewerEnhanced] Loaded series images:', ids.length);
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
              handleToolSelect(tool);
              viewportTools.setActiveTool(tool);
              console.log('Selected measurement tool:', tool);
            }}
            activeTool={viewportTools.activeTool}
            studyUID={study?.id || studyId}
            patientName={study?.patientName || 'Unknown'}
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
