import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as csCore from '@cornerstonejs/core';
import * as csTools from '@cornerstonejs/tools';
import csLoader from '@cornerstonejs/dicom-image-loader';
import parser from 'dicom-parser';
import ViewerToolbar from '../../components/viewer/ViewerToolbar';
import WindowingPanel from '../../components/viewer/WindowingPanel';
import MeasurementTools from '../../components/viewer/MeasurementTools';
import CineControls from '../../components/viewer/CineControls';
import LayoutSelector from '../../components/viewer/LayoutSelector';
import SeriesPanel from '../../components/viewer/SeriesPanel';
import ViewportGridEnhanced from '../../components/viewer/ViewportGridEnhanced';
import SRViewport from '../../components/viewer/SRViewport';
import MPRViewport from '../../components/viewer/MPRViewport';
import ENHANCED_STUDIES from '../../data/studiesEnhanced.json';
import { useViewportTools } from '../../hooks/viewer/useViewportTools';
import { useCinePlayer } from '../../hooks/viewer/useCinePlayer';
import { fetchStudyDetails } from '../../services/studyService';
import { createLocalStorageImageId } from '../../services/dicomFileService';
import wadoService from '../../services/wadoService';
import { loadMeasurements, restoreMeasurementsToViewer } from '../../services/measurementService';
import { getImageUrl, getImageLoadStrategy } from '../../services/dicomImageLoadConfig';
import { getCachedSeriesSize, cacheSeriesSize } from '../../services/seriesSizeCache';

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
  const [isSRActive, setIsSRActive] = useState(false);
  const [isMPRActive, setIsMPRActive] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0 });
  const [byteProgress, setByteProgress] = useState({ loaded: 0, total: 0, percent: 0 });
  const [viewerError, setViewerError] = useState(null);

  // Panel visibility
  const [showWindowing, setShowWindowing] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [showLayout, setShowLayout] = useState(false);
  const [showSeries, setShowSeries] = useState(true);
  const [showCine, setShowCine] = useState(false);

  // Window/Level
  const [windowLevel, setWindowLevel] = useState({ width: 400, center: 40 });

  // Handle Series Selection
  const handleSeriesSelect = useCallback(async (series, index) => {
    console.log('[DicomViewerEnhanced] Selected series:', series);
    console.log('[DicomViewerEnhanced] Study context:', study);
    console.log('[DicomViewerEnhanced] Study ID from URL:', studyId);

    // Guard: if study is not loaded, cannot proceed
    if (!study) {
      console.warn('[DicomViewerEnhanced] handleSeriesSelect called but study is not loaded yet');
      return;
    }

    setActiveSeries(index);
    setViewerError(null);
    setLoadingProgress({ loaded: 0, total: 0 });

    // Get cached series size for accurate progress display
    const seriesUID = series.seriesInstanceUID || series.series_instance_uid || series.seriesUID;
    const cachedSize = getCachedSeriesSize(seriesUID);
    const storageSize = series.storage_size || series.storageSize || cachedSize || 0;

    // Cache the size if we have it from series data but not in cache
    if ((series.storage_size || series.storageSize) && !cachedSize) {
      cacheSeriesSize(seriesUID, series.storage_size || series.storageSize);
    }

    console.log('[DicomViewerEnhanced] Series storage size:', storageSize, 'bytes (', (storageSize / (1024 * 1024)).toFixed(2), 'MB)');
    setByteProgress({ loaded: 0, total: storageSize, percent: 0 });

    // Check for SR Modality
    if (series.modality === 'SR') {
      console.log('[DicomViewerEnhanced] SR Series selected. Switching to SR Viewport.');
      setIsSRActive(true);
      setImageIds([]); // Clear image IDs to prevent Cornerstone from trying to render
      return;
    }

    setIsSRActive(false);

    // Load images for selected series
    if (series) {
      // Check if series has instances or needs to fetch them
      let seriesInstances = series.instances || [];

      // If no instances in series data, try to fetch them
      if ((!seriesInstances || seriesInstances.length === 0) && series.seriesInstanceUID) {
        console.log('[DicomViewerEnhanced] No instances in series data, attempting to fetch from WADO-RS');
        try {
          const { wadoService } = await import('../../services/wadoService');
          const studyUID = study.study_instance_uid || study.id || studyId;
          const seriesUID = series.seriesInstanceUID || series.series_instance_uid || series.seriesUID;

          if (studyUID && seriesUID) {
            const seriesData = await wadoService.getSeries(studyUID, seriesUID);
            console.log('[DicomViewerEnhanced] Fetched series data from WADO-RS:', seriesData);

            if (seriesData && seriesData.instances) {
              seriesInstances = seriesData.instances;
            }
          }
        } catch (error) {
          console.warn('[DicomViewerEnhanced] Failed to fetch series instances from WADO-RS:', error);
        }
      }

      if (seriesInstances && seriesInstances.length > 0) {
        const totalInstances = seriesInstances.length;
        setLoadingProgress({ loaded: 0, total: totalInstances });

        const strategy = getImageLoadStrategy();
        console.log('[DicomViewerEnhanced] Using image load strategy:', strategy);

        const ids = seriesInstances.map(inst => {
          const sopUID = inst.sop_instance_uid || inst.sopInstanceUID || inst['00080018']?.Value?.[0] || inst.sopInstanceUID;
          if (!sopUID) {
            return null;
          }

          // Ensure we have proper study and series UIDs
          const studyUID = study.study_instance_uid || study.id || studyId;
          const seriesUID = series.seriesInstanceUID || series.series_instance_uid || series.seriesUID;

          // Validate UIDs before constructing URL
          if (!studyUID || !seriesUID) {
            console.error('[DicomViewerEnhanced] Missing study or series UID:', { studyUID, seriesUID });
            return null;
          }

          // Use config service to determine which URL to use
          const imageUrl = getImageUrl(inst, studyUID, seriesUID, sopUID);
          return imageUrl;
        }).filter(id => id);

        setImageIds(ids);
        console.log('[DicomViewerEnhanced] Loaded series images:', ids.length);

        // Log detailed information for debugging
        console.log('[DicomViewerEnhanced] Series instances:', seriesInstances);
        // Additional debugging for empty series
        console.log('[DicomViewerEnhanced] Series details:', {
          seriesUID: series.seriesInstanceUID || series.series_instance_uid || series.seriesUID,
          instanceCount: seriesInstances ? seriesInstances.length : 'undefined',
          hasInstancesProperty: !!seriesInstances,
          seriesKeys: Object.keys(series)
        });
      }
    } else {
      console.warn('[DicomViewerEnhanced] No series data provided');
      setImageIds([]);
    }
  }, [study, studyId]);

  // Custom hooks
  const viewportTools = useViewportTools('pacsRenderingEngine', csCore);
  const cinePlayer = useCinePlayer(imageIds.length, 10);

  // Handle viewer errors from ViewportGrid
  useEffect(() => {
    const handleViewerError = (event) => {
      const { message } = event.detail;
      console.error('[DicomViewerEnhanced] Received viewer error:', message);
      setViewerError(message);
    };

    window.addEventListener('viewerError', handleViewerError);
    return () => {
      window.removeEventListener('viewerError', handleViewerError);
    };
  }, []);

  // Load study data
  useEffect(() => {
    const loadStudy = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        setViewerError(null);
        console.log('[DicomViewerEnhanced] Loading study:', studyId);

        // Try studyService first (includes localStorage)
        console.log('[DicomViewerEnhanced] Attempting to load study:', studyId);
        const { study: serviceStudy, source } = await fetchStudyDetails(studyId);
        console.log('[DicomViewerEnhanced] Study service response:', { serviceStudy, source });

        let foundStudy = null;
        let imageIds = [];
        let seriesData = [];

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
                  return blobUrl.startsWith('wadouri:') ? blobUrl : `wadouri:${blobUrl}`;
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
              console.log('[DicomViewerEnhanced] Initial series data from serviceStudy:', seriesData.length, seriesData);

              if (!seriesData || seriesData.length === 0) {
                console.log('[DicomViewerEnhanced] Fetching series separately for viewer');
                const { fetchStudySeries } = await import('../../services/studyService');
                const studyUID = serviceStudy.study_instance_uid || serviceStudy.id;
                console.log('[DicomViewerEnhanced] Fetching series for study UID:', studyUID);
                const result = await fetchStudySeries(studyUID);
                console.log('[DicomViewerEnhanced] Series fetch result:', result);
                seriesData = result.series || [];
                console.log('[DicomViewerEnhanced] Fetched series:', seriesData.length);
              }

              if (seriesData.length > 0) {
                // Cache series sizes for progress tracking
                const { cacheSeriesSizes } = await import('../../services/seriesSizeCache');
                cacheSeriesSizes(seriesData);
                
                // Normalize series format - include storage_size for progress tracking
                const normalizedSeries = seriesData.map(s => ({
                  seriesInstanceUID: s.series_instance_uid || s.seriesInstanceUID,
                  seriesDescription: s.series_description || s.seriesDescription || s.description || 'No Description',
                  seriesNumber: s.series_number || s.seriesNumber || 0,
                  modality: s.modality || 'Unknown',
                  instances: s.instances || [],
                  instanceCount: s.number_of_instances || s.instanceCount || (s.instances ? s.instances.length : 0),
                  storageSize: s.storage_size || s.storageSize || 0 // Include storage size for progress
                }));

                foundStudy = {
                  id: serviceStudy.study_instance_uid || serviceStudy.id,
                  patientName: serviceStudy.patient_name || serviceStudy.patientName || 'Unknown',
                  studyDescription: serviceStudy.study_description || serviceStudy.studyDescription || 'No Description',
                  studyDate: serviceStudy.study_date || serviceStudy.studyDate || '',
                  numberOfSeries: normalizedSeries.length,
                  numberOfInstances: normalizedSeries.reduce((sum, s) => sum + (s.instanceCount || s.instances?.length || 0), 0),
                  series: normalizedSeries
                }

                // Fallback to JSON if no localStorage data
                if (!foundStudy) {
                  foundStudy = ENHANCED_STUDIES.find(s => s.id?.toString() === studyId);

                  if (foundStudy && foundStudy.series && foundStudy.series.length > 0) {
                    const firstSeries = foundStudy.series[0];
                    if (firstSeries.instances && firstSeries.instances.length > 0) {
                      imageIds = firstSeries.instances.map(inst => {
                        const path = (inst.imageId || '').replace('wadouri:', '');
                        const fullUrl = path.startsWith('http') ? path : `${window.location.origin}${path}`;
                        return `wadouri:${fullUrl}`;
                      });
                    }
                  }
                } else {
                  // If we have a foundStudy but no series data, try to fetch series
                  if (foundStudy && (!foundStudy.series || foundStudy.series.length === 0)) {
                    console.log('[DicomViewerEnhanced] Found study but no series, attempting to fetch series');
                    try {
                      const { fetchStudySeries } = await import('../../services/studyService');
                      const studyUID = foundStudy.study_instance_uid || foundStudy.id;
                      if (studyUID) {
                        const result = await fetchStudySeries(studyUID);
                        if (result.series && result.series.length > 0) {
                          foundStudy.series = result.series;
                          console.log('[DicomViewerEnhanced] Successfully fetched series data:', result.series.length, 'series');
                        }
                      }
                    } catch (seriesError) {
                      console.warn('[DicomViewerEnhanced] Failed to fetch series data:', seriesError);
                    }
                  }
                }
              } else {
                // Use serviceStudy even if no series
                console.log('[DicomViewerEnhanced] Study found but has no series/images');
                foundStudy = {
                  id: serviceStudy.study_instance_uid || serviceStudy.id,
                  patientName: serviceStudy.patient_name || serviceStudy.patientName || 'Unknown',
                  studyDescription: serviceStudy.study_description || serviceStudy.studyDescription || 'No Description',
                  studyDate: serviceStudy.study_date || serviceStudy.studyDate || '',
                  numberOfSeries: 0,
                  numberOfInstances: 0,
                  series: []
                };
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

  // Auto-select first series when study loads
  useEffect(() => {
    if (study && study.series && study.series.length > 0 && imageIds.length === 0) {
      // Only auto-select if we haven't already loaded images
      handleSeriesSelect(study.series[0], 0);
    }
  }, [study, imageIds.length, handleSeriesSelect]);

  // Initialize Cornerstone
  useEffect(() => {
    const initCornerstone = async () => {
      try {
        console.log('[DicomViewerEnhanced] Starting Cornerstone initialization...');

        await csCore.init();

        csLoader.external.cornerstone = csCore;
        csLoader.external.dicomParser = parser;

        csLoader.configure({
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
              codecsPath: 'https://unpkg.com/@cornerstonejs/dicom-image-loader@1.80.4/dist/codecs/',
            },
          },
        };

        csLoader.webWorkerManager.initialize(config);

        console.log('[DicomViewerEnhanced] Cornerstone initialized with codec support');

        // Initialize Cached Image Loader
        const { initCachedImageLoader } = await import('../../services/cachedImageLoader');
        initCachedImageLoader(csCore);

        setIsInitialized(true);
      } catch (err) {
        console.error('[DicomViewerEnhanced] Initialization failed:', err);
        setViewerError(`Initialization failed: ${err.message}`);
      }
    };

    initCornerstone();

    return () => {
      // No cleanup for image loader since it's a singleton
    };
  }, []);

  // Initialize Tools
  useEffect(() => {
    const initTools = () => {
      csTools.init();

      // Helper to safely add tools
      const addToolSafe = (toolClass) => {
        try {
          csTools.addTool(toolClass);
        } catch (error) {
          // Ignore if already added
          if (!error.message.includes('already been added')) {
            console.warn('Error adding tool:', error);
          }
        }
      };

      const {
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
        ToolGroupManager,
        Enums: csToolsEnums,
      } = csTools;

      // Add tools to Cornerstone3D
      addToolSafe(WindowLevelTool);
      addToolSafe(PanTool);
      addToolSafe(ZoomTool);
      addToolSafe(StackScrollMouseWheelTool);
      addToolSafe(LengthTool);
      addToolSafe(ProbeTool);
      addToolSafe(RectangleROITool);
      addToolSafe(EllipticalROITool);
      addToolSafe(PlanarFreehandROITool);
      addToolSafe(ArrowAnnotateTool);
      addToolSafe(AngleTool);
      addToolSafe(CobbAngleTool);

      // Define a ToolGroup
      const toolGroupId = 'pacsToolGroup';
      let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

      if (toolGroup) {
        // If tool group exists, destroy it to reset state
        ToolGroupManager.destroyToolGroup(toolGroupId);
      }

      toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

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
    // Only load if we have a study and tools are initialized
    if (!study?.id || !isInitialized) {
      return;
    }

    const autoLoadMeasurements = async () => {
      try {
        console.log('[DicomViewerEnhanced] Auto-loading saved measurements for study:', study.id);

        // Load measurements from localStorage
        const savedMeasurements = await loadMeasurements(study.id, true); // Enable API

        if (savedMeasurements && savedMeasurements.length > 0) {
          console.log(`[DicomViewerEnhanced] Found ${savedMeasurements.length} saved measurements`);

          // Restore measurements to viewer
          const restoredCount = restoreMeasurementsToViewer(savedMeasurements, csTools);

          if (restoredCount > 0) {
            console.log(`[DicomViewerEnhanced] Auto-loaded ${restoredCount} measurements`);

            // Trigger viewport re-render to show restored measurements
            try {
              const renderingEngine = csCore.getRenderingEngine('pacsRenderingEngine');
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
    const {
      ToolGroupManager,
      Enums: csToolsEnums,
      WindowLevelTool,
      PanTool,
      ZoomTool,
      LengthTool,
      ProbeTool,
      RectangleROITool,
      EllipticalROITool,
      PlanarFreehandROITool,
      ArrowAnnotateTool,
      AngleTool,
      CobbAngleTool,
    } = csTools;

    const toolGroupId = 'pacsToolGroup';
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    if (!toolGroup) return;

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
      [
        WindowLevelTool, PanTool, ZoomTool, LengthTool, ProbeTool,
        RectangleROITool, EllipticalROITool, PlanarFreehandROITool,
        ArrowAnnotateTool, AngleTool, CobbAngleTool
      ].forEach(tool => {
        toolGroup.setToolPassive(tool.toolName);
      });

      // Activate selected tool
      toolGroup.setToolActive(selectedToolName, {
        bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
      });

      // Restore Pan/Zoom on other buttons
      toolGroup.setToolActive(PanTool.toolName, {
        bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }],
      });
      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
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

  // Handle Image Loaded Event (Cornerstone)
  useEffect(() => {
    const onImageLoaded = (evt) => {
      setLoadingProgress(prev => {
        if (prev.total > 0 && prev.loaded < prev.total) {
          const newLoaded = prev.loaded + 1;
          
          // If all images loaded, also update byteProgress to hide popup
          if (newLoaded >= prev.total) {
            setByteProgress(prevByte => ({
              ...prevByte,
              loaded: prevByte.total,
              percent: 100
            }));
          }
          
          return { ...prev, loaded: newLoaded };
        }
        return prev;
      });
    };

    csCore.eventTarget.addEventListener(csCore.Enums.Events.IMAGE_LOADED, onImageLoaded);

    return () => {
      csCore.eventTarget.removeEventListener(csCore.Enums.Events.IMAGE_LOADED, onImageLoaded);
    };
  }, []);

  // Handle Byte Progress Event (Custom)
  useEffect(() => {
    const activeDownloads = new Map(); // imageId -> { loaded, total }
    let lastProgressTime = Date.now();
    
    // Auto-hide progress popup if no activity for 2 seconds (likely cached)
    const progressCheckInterval = setInterval(() => {
      if (Date.now() - lastProgressTime > 2000) {
        // No progress for 2 seconds, assume all loaded from cache
        setLoadingProgress(prev => {
          if (prev.total > 0 && prev.loaded < prev.total) {
            return { ...prev, loaded: prev.total };
          }
          return prev;
        });
      }
    }, 500);

    const onByteProgress = (event) => {
      const { imageId, loaded, total } = event.detail;
      lastProgressTime = Date.now();

      activeDownloads.set(imageId, { loaded, total });

      // Calculate total progress across all active downloads
      let totalLoaded = 0;
      let serverTotalSize = 0;

      activeDownloads.forEach(data => {
        totalLoaded += data.loaded;
        serverTotalSize += data.total;
      });

      // Use cached series size if server doesn't provide content-length
      setByteProgress(prev => {
        // Keep the cached total from handleSeriesSelect if server total is 0
        const effectiveTotal = serverTotalSize > 0 ? serverTotalSize : prev.total;
        
        // Calculate percentage
        let percent = 0;
        if (effectiveTotal > 0) {
          percent = Math.min(100, Math.round((totalLoaded / effectiveTotal) * 100));
        } else if (loadingProgress.total > 0) {
          // Fallback to image count progress
          percent = Math.round((loadingProgress.loaded / loadingProgress.total) * 100);
        }

        return {
          loaded: totalLoaded,
          total: effectiveTotal,
          percent
        };
      });
    };

    window.addEventListener('dicom-image-progress', onByteProgress);

    return () => {
      window.removeEventListener('dicom-image-progress', onByteProgress);
      clearInterval(progressCheckInterval);
    };
  }, [activeSeries, loadingProgress]);


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

      {/* MPR Toggle (Temporary Location) */}
      <div className="absolute top-16 right-4 z-50">
        <button
          onClick={() => setIsMPRActive(!isMPRActive)}
          disabled={isSRActive || imageIds.length < 2}
          className={`px-3 py-1 text-xs font-bold rounded border ${isMPRActive
            ? 'bg-purple-600 text-white border-purple-500'
            : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
            } ${isSRActive || imageIds.length < 2 ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isMPRActive ? 'Exit MPR' : '3D MPR'}
        </button>
      </div>

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
            cornerstone={csCore}
            cornerstoneTools={csTools}
          />
        )}

        {/* Layout Selector */}
        {showLayout && (
          <LayoutSelector
            onSelect={setLayout}
            windowLevel={windowLevel}
            isInitialized={isInitialized}
          />
        )}

        {/* Viewport Grid, SR Viewport, or MPR Viewport */}
        {isSRActive ? (
          <div className="h-full w-full bg-gray-900 p-4">
            <SRViewport
              displaySet={{ StudyInstanceUID: studyId }}
              viewportIndex={0}
              isActive={true}
            />
          </div>
        ) : isMPRActive ? (
          <MPRViewport
            imageIds={imageIds}
            studyInstanceUID={study?.id}
            seriesInstanceUID={study?.series?.[activeSeries]?.seriesInstanceUID}
          />
        ) : (
          <ViewportGridEnhanced
            layout={layout}
            onViewportClick={setActiveViewport}
            imageIds={imageIds}
            activeViewport={activeViewport}
            windowLevel={windowLevel}
            isInitialized={isInitialized}
            cornerstone={csCore}
            cornerstoneTools={csTools}
            cornerstoneDICOMImageLoader={csLoader}
          />
        )}

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

        {/* Loading Progress */}
        {loadingProgress.total > 0 && loadingProgress.loaded < loadingProgress.total && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-30 backdrop-blur-sm">
            <div className="bg-gray-800/90 border border-gray-700 p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 transform transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <svg className="w-6 h-6 text-blue-400 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Downloading Images</h3>
                    <p className="text-xs text-gray-400">Please wait while we fetch the series</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-blue-400">
                    {byteProgress.percent > 0
                      ? byteProgress.percent
                      : Math.round((loadingProgress.loaded / loadingProgress.total) * 100)}%
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-700 rounded-full h-2.5 mb-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-cyan-400 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${byteProgress.percent > 0
                      ? byteProgress.percent
                      : (loadingProgress.loaded / loadingProgress.total) * 100}%`
                  }}
                >
                  <div className="w-full h-full opacity-30 bg-[length:1rem_1rem] bg-[linear-gradient(45deg,rgba(255,255,255,.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.15)_50%,rgba(255,255,255,.15)_75%,transparent_75%,transparent)] animate-[progress-bar-stripes_1s_linear_infinite]"></div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-400 border-t border-gray-700 pt-4">
                <div>
                  <div className="uppercase tracking-wider font-semibold mb-1 text-gray-500">Images</div>
                  <div className="text-gray-300 font-mono">
                    {loadingProgress.loaded} <span className="text-gray-600">/</span> {loadingProgress.total}
                  </div>
                </div>
                <div className="text-right">
                  <div className="uppercase tracking-wider font-semibold mb-1 text-gray-500">Data Size</div>
                  <div className="text-gray-300 font-mono">
                    {(byteProgress.loaded / (1024 * 1024)).toFixed(1)} MB
                    {byteProgress.total > 0 && (
                      <> <span className="text-gray-600">/</span> {(byteProgress.total / (1024 * 1024)).toFixed(1)} MB</>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Viewer Error */}
        {viewerError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-30">
            <div className="text-center text-red-500 bg-gray-900 p-6 rounded-lg max-w-md">
              <div className="text-4xl mb-2">⚠️</div>
              <div className="text-lg font-bold mb-2">Viewer Error</div>
              <div className="text-sm text-gray-300 mb-4">{viewerError}</div>
              <button
                onClick={() => setViewerError(null)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {isInitialized && imageIds.length === 0 && !isSRActive && (
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
            <span className={`px-1.5 py-0.5 rounded ${getImageLoadStrategy() === 'wado-rs' ? 'bg-green-600/30 text-green-400' : 'bg-yellow-600/30 text-yellow-400'}`}>
              {getImageLoadStrategy() === 'wado-rs' ? '📡 Proxy' : '☁️ Direct S3'}
            </span>
          </div>
          <div>
            Cornerstone.js v3 • Enhanced Viewer
          </div>
        </div>
      </div>
    </div>
  );
}
