import { useState, useEffect, useRef, useCallback } from 'react';
import { XMarkIcon, TrashIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';
import {
  formatMeasurementData,
  saveMeasurements,
  loadMeasurements,
  exportMeasurementsToJSON,
  restoreMeasurementsToViewer,
} from '../../services/measurementService';

export default function MeasurementTools({ 
  onClose, 
  onSelectTool, 
  activeTool, 
  studyUID, 
  patientName,
  cornerstone,
  cornerstoneTools
}) {
  const [measurements, setMeasurements] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success', 'error', null
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true); // LIVE by default
  const [position, setPosition] = useState({ x: 16, y: 64 }); // Initial position (left-4 top-16)
  const [isDragging, setIsDragging] = useState(false);
  const [pendingSave, setPendingSave] = useState(false); // has unsaved changes
  const dragStartRef = useRef({ x: 0, y: 0 });
  const windowStartRef = useRef({ x: 0, y: 0 });
  const autoSaveTimerRef = useRef(null);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    windowStartRef.current = { ...position };
  };

  // Update measurements list periodically
  useEffect(() => {
    if (!cornerstoneTools || !cornerstoneTools.annotation) return;
    
    const { annotation } = cornerstoneTools;

    const updateMeasurements = () => {
      try {
        const allAnnotations = annotation.state.getAllAnnotations();
        const formattedMeasurements = allAnnotations.map((ann, index) => ({
          id: ann.annotationUID,
          type: ann.metadata?.toolName || 'Unknown',
          data: ann.data,
          annotation: ann, // Keep full annotation for saving
          index: index + 1
        }));
        setMeasurements(formattedMeasurements);
      } catch (error) {
        console.error('[MeasurementTools] Error getting annotations:', error);
      }
    };

    // Update initially
    updateMeasurements();

    // Update every 500ms to catch new measurements
    const interval = setInterval(updateMeasurements, 500);

    return () => clearInterval(interval);
  }, [cornerstoneTools]);


  // Auto-save: LIVE sync to server on every annotation change (no toggle)
  useEffect(() => {
    if (!studyUID || measurements.length === 0) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      // Snapshot current measurements at this moment
      const toSave = measurements.map(m => formatMeasurementData(m.annotation, studyUID));
      try {
        const result = await saveMeasurements(studyUID, toSave, true, 'auto_save');
        if (result.success && result.method === 'api') {
          setSaveStatus('success');
          setPendingSave(false);
        }
      } catch (err) {
        console.warn('[MeasurementTools] Auto-save failed:', err.message);
      }
    }, 1500); // 1.5s debounce after last change

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [measurements, studyUID]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      setPosition({
        x: windowStartRef.current.x + deltaX,
        y: windowStartRef.current.y + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Function to clear all measurements
  const handleClearAll = () => {
    if (!cornerstoneTools || !cornerstoneTools.annotation) return;
    const { annotation } = cornerstoneTools;

    if (confirm('Clear all measurements and annotations?')) {
      try {
        // Get all annotations
        const allAnnotations = annotation.state.getAllAnnotations();

        console.log('[MeasurementTools] Clearing', allAnnotations.length, 'measurements');

        // Remove each annotation
        allAnnotations.forEach(ann => {
          annotation.state.removeAnnotation(ann.annotationUID);
        });

        // Trigger re-render for all viewports
        if (cornerstone) {
          const renderingEngine = cornerstone.getRenderingEngine('pacsRenderingEngine');
          if (renderingEngine) {
            const viewports = renderingEngine.getViewports();
            viewports.forEach(vp => {
              vp.render();
            });
          }
        }

        setMeasurements([]);
        console.log('[MeasurementTools] All measurements cleared successfully');
      } catch (error) {
        console.error('[MeasurementTools] Error clearing measurements:', error);
        alert('Failed to clear measurements. Please try again.');
      }
    }
  };

  // Function to delete individual measurement
  const handleDeleteMeasurement = (measurementId) => {
    if (!cornerstoneTools || !cornerstoneTools.annotation) return;
    const { annotation, utilities } = cornerstoneTools;

    console.log('[MeasurementTools] Attempting to delete measurement:', measurementId);

    if (!measurementId) {
      console.error('[MeasurementTools] Invalid measurement ID');
      alert('Invalid measurement ID');
      return;
    }

    try {
      // Remove the annotation using the state API
      annotation.state.removeAnnotation(measurementId);
      console.log('[MeasurementTools] Annotation removed from state');

      // Force re-render using multiple approaches for reliability
      try {
        // Approach 1: Use rendering engine directly
        if (cornerstone) {
          const renderingEngine = cornerstone.getRenderingEngine('pacsRenderingEngine');
          if (renderingEngine) {
            const viewports = renderingEngine.getViewports();
            console.log('[MeasurementTools] Found', viewports.length, 'viewports');
            viewports.forEach(vp => {
              vp.render();
            });
          }
        }
      } catch (renderError) {
        console.warn('[MeasurementTools] Could not render via engine:', renderError.message);
      }

      // Approach 2: Use triggerAnnotationRenderForViewportIds if available
      try {
        if (utilities?.triggerAnnotationRenderForViewportIds && cornerstone) {
          const renderingEngine = cornerstone.getRenderingEngine('pacsRenderingEngine');
          if (renderingEngine) {
            const viewportIds = renderingEngine.getViewports().map(vp => vp.id);
            utilities.triggerAnnotationRenderForViewportIds(renderingEngine, viewportIds);
          }
        }
      } catch (triggerError) {
        console.warn('[MeasurementTools] Could not trigger via utilities:', triggerError.message);
      }

      // Update measurements list
      setMeasurements(prevMeasurements => prevMeasurements.filter(m => m.id !== measurementId));
      console.log('[MeasurementTools] Measurement deleted successfully');

    } catch (error) {
      console.error('[MeasurementTools] Error deleting measurement:', error);
      console.error('[MeasurementTools] Error stack:', error.stack);
      alert(`Failed to delete measurement: ${error.message}`);
    }
  };

  // Get readable tool name
  const getToolDisplayName = (toolName) => {
    const nameMap = {
      'Length': 'Length',
      'Angle': 'Angle',
      'CobbAngle': 'Cobb Angle',
      'RectangleROI': 'Rectangle ROI',
      'EllipticalROI': 'Ellipse ROI',
      'PlanarFreehandROI': 'Freehand ROI',
      'ArrowAnnotate': 'Arrow',
      'Probe': 'Probe'
    };
    return nameMap[toolName] || toolName;
  };

  // Handle Save Measurements
  const handleSaveMeasurements = async (showAlert = true) => {
    if (!studyUID) {
      if (showAlert) alert('Study UID is required to save measurements');
      return;
    }

    if (measurements.length === 0) {
      if (showAlert) alert('No measurements to save');
      return;
    }

    setIsSaving(true);
    setSaveStatus(null);

    try {
      // Format and save via upsert (API-first, server-side versioning)
      const formattedMeasurements = measurements.map(m =>
        formatMeasurementData(m.annotation, studyUID)
      );
      const result = await saveMeasurements(studyUID, formattedMeasurements, true, 'manual_save');

      if (result.success) {
        setSaveStatus('success');
        if (showAlert) {
          alert(`✓ Successfully saved ${measurements.length} measurements to ${result.method}`);
        }
        console.log(`[MeasurementTools] Saved ${measurements.length} measurements via ${result.method}`);
      } else {
        setSaveStatus('error');
        if (showAlert) alert('Failed to save measurements');
      }
    } catch (error) {
      console.error('[MeasurementTools] Error saving measurements:', error);
      setSaveStatus('error');
      if (showAlert) alert(`Error saving measurements: ${error.message}`);
    } finally {
      setIsSaving(false);
      // Clear status after 3 seconds
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // Handle Export to JSON
  const handleExportJSON = () => {
    if (measurements.length === 0) {
      alert('No measurements to export');
      return;
    }

    try {
      const formattedMeasurements = measurements.map(m =>
        formatMeasurementData(m.annotation, studyUID)
      );

      const success = exportMeasurementsToJSON(
        studyUID,
        formattedMeasurements,
        patientName || 'Unknown'
      );

      if (success) {
        alert(`✓ Exported ${measurements.length} measurements to JSON file`);
      }
    } catch (error) {
      console.error('[MeasurementTools] Error exporting:', error);
      alert(`Error exporting measurements: ${error.message}`);
    }
  };

  // Handle Load Measurements from server
  const handleLoadMeasurements = useCallback(async () => {
    if (!studyUID) {
      alert('Study UID is required to load measurements');
      return;
    }

    setIsSaving(true);
    setSaveStatus(null);

    try {
      const savedMeasurements = await loadMeasurements(studyUID, true); // API-first

      if (savedMeasurements.length === 0) {
        setIsSaving(false);
        alert('No saved measurements found for this study');
        return;
      }

      // Restore annotations back to Cornerstone state
      if (cornerstoneTools) {
        const restored = restoreMeasurementsToViewer(savedMeasurements, cornerstoneTools);
        console.log(`[MeasurementTools] Restored ${restored} measurements from server`);
        setSaveStatus('success');
        if (restored === 0) {
          alert(`Found ${savedMeasurements.length} saved measurements, but could not restore them to the viewer.`);
        } else {
          alert(`Restored ${restored} measurement(s) from server.`);
        }
      } else {
        alert(`Found ${savedMeasurements.length} saved measurements. Cornerstone not ready.`);
      }
    } catch (error) {
      console.error('[MeasurementTools] Error loading measurements:', error);
      setSaveStatus('error');
      alert(`Error loading measurements: ${error.message}`);
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [studyUID, cornerstoneTools]);

  const tools = [
    {
      id: 'CobbAngle',
      name: 'Cobb Angle',
      icon: '📐',
      description: 'Measure Cobb Angle',
      shortcut: 'C'
    },
    {
      id: 'Length',
      name: 'CTR (Length)',
      icon: '📏',
      description: 'Measure Cardiothoracic Ratio (use Length)',
      shortcut: 'L'
    },
    {
      id: 'Angle',
      name: 'Angle',
      icon: '∠',
      description: 'Measure angle between three points',
      shortcut: 'A'
    },
    {
      id: 'RectangleROI',
      name: 'Rectangle ROI',
      icon: '▭',
      description: 'Draw rectangular region of interest',
      shortcut: 'R'
    },
    {
      id: 'EllipticalROI',
      name: 'Ellipse ROI',
      icon: '⬭',
      description: 'Draw elliptical region of interest',
      shortcut: 'E'
    },
    {
      id: 'PlanarFreehandROI',
      name: 'Freehand ROI',
      icon: '✏️',
      description: 'Draw freehand region of interest',
      shortcut: 'F'
    },
    {
      id: 'ArrowAnnotate',
      name: 'Arrow',
      icon: '➡️',
      description: 'Add arrow annotation',
      shortcut: 'Shift+A'
    },
    {
      id: 'Probe',
      name: 'Probe',
      icon: '🎯',
      description: 'Show pixel value at point',
      shortcut: 'Shift+P'
    },
  ];

  return (
    <div
      className="absolute w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 flex flex-col max-h-[80vh]"
      style={{ left: position.x, top: position.y }}
    >
      {/* Header - Draggable Area */}
      <div
        className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0 cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <h3 className="font-semibold text-white">Measurement Tools</h3>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white rounded"
          onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking close
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 overflow-y-auto">
        <div className="space-y-2">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => onSelectTool(tool.id)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${activeTool === tool.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-900 text-gray-300 hover:bg-gray-700'
                }`}
            >
              <div className="flex items-start space-x-3">
                <span className="text-2xl">{tool.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{tool.name}</span>
                    <kbd className="px-1.5 py-0.5 text-xs bg-gray-800 rounded">
                      {tool.shortcut}
                    </kbd>
                  </div>
                  <p className="text-xs opacity-75">{tool.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Active Measurements List */}
        {measurements.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <h4 className="text-sm font-semibold text-white mb-2">
              Active Measurements ({measurements.length})
            </h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {measurements.map((measurement) => (
                <div
                  key={measurement.id}
                  className="flex items-center justify-between p-2 bg-gray-900 rounded hover:bg-gray-800 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white font-medium">
                      #{measurement.index} - {getToolDisplayName(measurement.type)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteMeasurement(measurement.id)}
                    className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                    title="Delete this measurement"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save & Export Section */}
        <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
          <h4 className="text-sm font-semibold text-white mb-2">
            Save & Export
          </h4>

          {/* Live auto-save status */}
          {saveStatus && (
            <div className={`text-xs text-center py-1 rounded ${saveStatus === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
              {saveStatus === 'success' ? '✓ Synced to server' : '✗ Sync failed — retrying'}
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleSaveMeasurements(true)}
              disabled={isSaving || measurements.length === 0}
              className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${isSaving || measurements.length === 0
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              title="Save measurements to storage"
            >
              <CloudArrowUpIcon className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>

            <button
              onClick={handleExportJSON}
              disabled={measurements.length === 0}
              className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${measurements.length === 0
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              title="Export to JSON file"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export
            </button>
          </div>

          <button
            onClick={handleLoadMeasurements}
            className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs font-medium transition-colors"
            title="Load saved measurements"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            Load Saved
          </button>
        </div>

        {/* Clear All Button */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <button
            onClick={handleClearAll}
            disabled={measurements.length === 0}
            className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${measurements.length === 0
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700'
              }`}
          >
            Clear All Measurements {measurements.length > 0 && `(${measurements.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
