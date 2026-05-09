import React, { useEffect, useRef, useState } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import { Enums } from '@cornerstonejs/core';

/**
 * DICOM Viewer Demo with Cornerstone.js
 * Loads sample DICOM files from uploads folder
 */
export default function DicomViewerDemo() {
  const viewportRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentImage, setCurrentImage] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [windowLevel, setWindowLevel] = useState({ width: 400, center: 40 });
  const [zoom, setZoom] = useState(1.0);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sample DICOM files from uploads folder
  const sampleImages = [
    {
      name: 'SD 720×480',
      path: '/uploads/SD-720x480.dcm',
      description: 'Standard Definition'
    },
    {
      name: 'SD 720×480 (Modified)',
      path: '/uploads/modified_SD-720x480.dcm',
      description: 'Standard Definition Modified'
    },
    {
      name: 'SD 720×480 (Modified 2)',
      path: '/uploads/modified_SD-720x480 (1).dcm',
      description: 'Standard Definition Modified Copy'
    },
    {
      name: 'Square 1080×1080',
      path: '/uploads/Square-1080x1080.dcm',
      description: 'Square Format'
    },
    {
      name: 'HD 1080×1920',
      path: '/uploads/HD-1080x1920.dcm',
      description: 'High Definition Portrait'
    },
    {
      name: '4K 2160×3840',
      path: '/uploads/4K-2160x3840.dcm',
      description: 'Ultra High Definition'
    }
  ];

  // Initialize Cornerstone
  useEffect(() => {
    const initCornerstone = async () => {
      try {
        console.log('[DicomViewerDemo] Initializing Cornerstone.js v3...');
        
        // Initialize Cornerstone
        await cornerstone.init();
        console.log('[DicomViewerDemo] Cornerstone initialized');

        // Configure DICOM Image Loader
        cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
        cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

        // Configure DICOM loader to be more lenient
        cornerstoneDICOMImageLoader.configure({
          beforeSend: function(xhr) {
            // Add any custom headers if needed
          },
          strict: false, // Allow non-standard DICOM files
          decodeConfig: {
            convertFloatPixelDataToInt: false,
          }
        });

        // Configure web worker for DICOM parsing
        const config = {
          maxWebWorkers: 1,
          startWebWorkersOnDemand: true,
          taskConfiguration: {
            decodeTask: {
              initializeCodecsOnStartup: false,
              strict: false, // Allow files without DICM prefix
            },
          },
        };

        cornerstoneDICOMImageLoader.webWorkerManager.initialize(config);
        console.log('[DicomViewerDemo] DICOM Image Loader configured');

        setIsInitialized(true);
        console.log('[DicomViewerDemo] Initialization complete');
      } catch (err) {
        console.error('[DicomViewerDemo] Failed to initialize:', err);
        setError('Failed to initialize DICOM viewer: ' + err.message);
      }
    };

    initCornerstone();

    return () => {
      // Cleanup - Cornerstone v3 doesn't need explicit cleanup
      console.log('[DicomViewerDemo] Cleanup');
    };
  }, []);

  // Load DICOM image - Cornerstone v3 API
  const loadImage = async (imagePath) => {
    console.log('[DicomViewerDemo] Loading image:', imagePath);
    
    if (!viewportRef.current) {
      console.error('[DicomViewerDemo] Viewport ref not available');
      return;
    }
    
    if (!isInitialized) {
      console.error('[DicomViewerDemo] Cornerstone not initialized');
      return;
    }

    try {
      setError(null);
      
      const element = viewportRef.current;
      
      // Create rendering engine if not exists
      const renderingEngineId = 'myRenderingEngine';
      let renderingEngine = cornerstone.getRenderingEngine(renderingEngineId);
      
      if (!renderingEngine) {
        renderingEngine = new cornerstone.RenderingEngine(renderingEngineId);
        console.log('[DicomViewerDemo] Created rendering engine');
      }

      // Make sure element has size
      const rect = element.getBoundingClientRect();
      console.log('[DicomViewerDemo] Element size:', rect.width, 'x', rect.height);

      if (rect.width === 0 || rect.height === 0) {
        throw new Error('Viewport element has no size. Please ensure element is visible and has dimensions.');
      }

      // Create viewport
      const viewportId = 'CT_STACK';
      const viewportInput = {
        viewportId,
        type: Enums.ViewportType.STACK,
        element,
        defaultOptions: {
          background: [0, 0, 0],
        },
      };

      renderingEngine.enableElement(viewportInput);
      console.log('[DicomViewerDemo] Viewport enabled');

      // Get the stack viewport
      const viewport = renderingEngine.getViewport(viewportId);

      // Load the image with full URL
      const fullPath = window.location.origin + imagePath;
      const imageId = `wadouri:${fullPath}`;
      
      console.log('[DicomViewerDemo] Loading imageId:', imageId);
      
      // Set the stack on the viewport
      await viewport.setStack([imageId], 0); // 0 = first image index
      console.log('[DicomViewerDemo] Stack set');

      // Render the image
      await viewport.render();
      console.log('[DicomViewerDemo] Image rendered');

      // Reset camera to fit image
      viewport.resetCamera();
      console.log('[DicomViewerDemo] Camera reset');

      // Get image info
      const image = viewport.getImageData();
      const properties = viewport.getProperties();
      
      setImageInfo({
        width: image?.dimensions?.[0] || 512,
        height: image?.dimensions?.[1] || 512,
        rows: image?.dimensions?.[1] || 512,
        columns: image?.dimensions?.[0] || 512,
      });

      setWindowLevel({
        width: properties?.voiRange?.upper - properties?.voiRange?.lower || 400,
        center: (properties?.voiRange?.upper + properties?.voiRange?.lower) / 2 || 40,
      });

      setCurrentImage(imagePath);
      console.log('[DicomViewerDemo] Image displayed successfully');
    } catch (err) {
      console.error('[DicomViewerDemo] Failed to load image:', err);
      setError('Failed to load DICOM image: ' + err.message + '\n\nPlease check:\n1. DICOM file exists in uploads folder\n2. File is a valid DICOM format\n3. Browser console for detailed errors');
    }
  };

  // Apply window/level - Cornerstone v3
  const applyWindowLevel = (width, center) => {
    if (!currentImage) return;

    try {
      const renderingEngine = cornerstone.getRenderingEngine('myRenderingEngine');
      if (!renderingEngine) return;

      const viewport = renderingEngine.getViewport('CT_STACK');
      if (!viewport) return;

      const lower = center - width / 2;
      const upper = center + width / 2;

      viewport.setProperties({
        voiRange: { lower, upper }
      });
      
      viewport.render();
      setWindowLevel({ width, center });
    } catch (err) {
      console.error('Failed to apply window/level:', err);
    }
  };

  // Apply zoom - Cornerstone v3
  const applyZoom = (delta) => {
    if (!currentImage) return;

    try {
      const renderingEngine = cornerstone.getRenderingEngine('myRenderingEngine');
      if (!renderingEngine) return;

      const viewport = renderingEngine.getViewport('CT_STACK');
      if (!viewport) return;

      const newZoom = Math.max(0.1, Math.min(5.0, zoom + delta));
      const camera = viewport.getCamera();
      
      // Adjust parallel scale (smaller = more zoomed in)
      camera.parallelScale = camera.parallelScale * (zoom / newZoom);
      
      viewport.setCamera(camera);
      viewport.render();
      setZoom(newZoom);
      
      console.log('[DicomViewerDemo] Zoom:', (newZoom * 100).toFixed(0) + '%');
    } catch (err) {
      console.error('Failed to apply zoom:', err);
    }
  };

  // Reset viewport - Cornerstone v3
  const resetViewport = () => {
    if (!currentImage) return;

    try {
      const renderingEngine = cornerstone.getRenderingEngine('myRenderingEngine');
      if (!renderingEngine) return;

      const viewport = renderingEngine.getViewport('CT_STACK');
      if (!viewport) return;

      viewport.resetCamera();
      viewport.resetProperties();
      viewport.render();

      // Reset state
      setWindowLevel({ width: 400, center: 40 });
      setZoom(1.0);
    } catch (err) {
      console.error('Failed to reset viewport:', err);
    }
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
    
    // Resize viewport after state change
    setTimeout(() => {
      const renderingEngine = cornerstone.getRenderingEngine('myRenderingEngine');
      if (renderingEngine) {
        try {
          renderingEngine.resize(true);
          console.log('[DicomViewerDemo] ✓ Viewport resized');
        } catch (err) {
          console.warn('[DicomViewerDemo] Resize warning:', err);
        }
      }
    }, 100);
  };

  // Open image in new tab
  const openImageInNewTab = () => {
    const element = viewportRef.current;
    if (!element || !currentImage) return;

    try {
      const canvas = element.querySelector('canvas');
      if (canvas) {
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const newWindow = window.open(url, '_blank');
          if (newWindow) {
            newWindow.onload = () => URL.revokeObjectURL(url);
          }
        });
        console.log('[DicomViewerDemo] ✓ Opening in new tab');
      }
    } catch (err) {
      console.error('[DicomViewerDemo] Failed to open in new tab:', err);
      setError('Failed to open image in new tab');
    }
  };

  // Window/Level presets
  const presets = [
    { name: 'Default', width: 400, center: 40 },
    { name: 'Lung', width: 1500, center: -600 },
    { name: 'Bone', width: 2000, center: 300 },
    { name: 'Brain', width: 80, center: 40 },
    { name: 'Soft Tissue', width: 350, center: 50 },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">DICOM Viewer Demo</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Powered by Cornerstone.js - Sample images from uploads folder
            </p>
          </div>
          {currentImage && (
            <div className="text-xs text-slate-400">
              {imageInfo && (
                <span>
                  {imageInfo.width} × {imageInfo.height} | 
                  W/L: {Math.round(windowLevel.width)}/{Math.round(windowLevel.center)} | 
                  Zoom: {(zoom * 100).toFixed(0)}%
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Image List */}
        <div className="w-64 bg-slate-800 border-r border-slate-700 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-white mb-3">Sample Images</h2>
            <div className="space-y-2">
              {sampleImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    console.log('[DicomViewerDemo] Button clicked for:', img.name);
                    loadImage(img.path);
                  }}
                  disabled={!isInitialized}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    currentImage === img.path
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                  } ${!isInitialized ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="font-medium text-sm">{img.name}</div>
                  <div className="text-xs opacity-75 mt-1">{img.description}</div>
                </button>
              ))}
            </div>

            {/* Zoom Controls */}
            {currentImage && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-white mb-3">Zoom Controls</h3>
                <div className="bg-slate-700 rounded p-3">
                  <div className="text-xs text-slate-400 mb-2">Zoom Level</div>
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => applyZoom(-0.2)}
                      className="flex-1 px-3 py-2 text-sm bg-slate-600 text-white rounded hover:bg-slate-500 font-bold"
                    >
                      −
                    </button>
                    <span className="text-center text-sm text-white min-w-[70px] font-semibold">
                      {(zoom * 100).toFixed(0)}%
                    </span>
                    <button
                      onClick={() => applyZoom(0.2)}
                      className="flex-1 px-3 py-2 text-sm bg-slate-600 text-white rounded hover:bg-slate-500 font-bold"
                    >
                      +
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={resetViewport}
                      className="px-3 py-1.5 text-xs rounded bg-slate-600 text-slate-300 hover:bg-slate-500"
                    >
                      Reset
                    </button>
                    <button
                      onClick={toggleFullscreen}
                      className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500"
                    >
                      {isFullscreen ? 'Exit FS' : 'Fullscreen'}
                    </button>
                    <button
                      onClick={openImageInNewTab}
                      className="col-span-2 px-3 py-1.5 text-xs rounded bg-green-600 text-white hover:bg-green-500"
                    >
                      Open in New Tab
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Window/Level Presets */}
            {currentImage && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-white mb-3">W/L Presets</h3>
                <div className="space-y-1">
                  {presets.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => applyWindowLevel(preset.width, preset.center)}
                      className="w-full text-left px-3 py-2 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                    >
                      {preset.name}
                      <span className="text-slate-500 ml-2">
                        ({preset.width}/{preset.center})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tools */}
            {currentImage && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-white mb-3">Tools</h3>
                <div className="space-y-2">
                  <button
                    onClick={resetViewport}
                    className="w-full px-3 py-2 text-sm rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                  >
                    Reset View
                  </button>
                  
                  {/* Zoom Controls */}
                  <div className="bg-slate-700 rounded p-3">
                    <div className="text-xs text-slate-400 mb-2">Zoom</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => applyZoom(Math.max(0.1, zoom - 0.1))}
                        className="px-2 py-1 text-xs bg-slate-600 text-white rounded hover:bg-slate-500"
                      >
                        −
                      </button>
                      <span className="flex-1 text-center text-xs text-white">
                        {(zoom * 100).toFixed(0)}%
                      </span>
                      <button
                        onClick={() => applyZoom(Math.min(5, zoom + 0.1))}
                        className="px-2 py-1 text-xs bg-slate-600 text-white rounded hover:bg-slate-500"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Window/Level Controls */}
                  <div className="bg-slate-700 rounded p-3">
                    <div className="text-xs text-slate-400 mb-2">Window Width</div>
                    <input
                      type="range"
                      min="1"
                      max="4000"
                      value={windowLevel.width}
                      onChange={(e) => applyWindowLevel(parseInt(e.target.value), windowLevel.center)}
                      className="w-full"
                    />
                    <div className="text-xs text-white text-center mt-1">
                      {Math.round(windowLevel.width)}
                    </div>
                  </div>

                  <div className="bg-slate-700 rounded p-3">
                    <div className="text-xs text-slate-400 mb-2">Window Center</div>
                    <input
                      type="range"
                      min="-1000"
                      max="1000"
                      value={windowLevel.center}
                      onChange={(e) => applyWindowLevel(windowLevel.width, parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-xs text-white text-center mt-1">
                      {Math.round(windowLevel.center)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Viewport */}
        <div className={`flex-1 flex items-center justify-center bg-black p-4 relative ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
          {/* Viewport Element - Responsive size */}
          <div
            ref={viewportRef}
            className="border border-slate-700"
            style={{
              width: isFullscreen ? '100%' : 'min(90vw, 1200px)',
              height: isFullscreen ? '100%' : 'min(85vh, 900px)',
              backgroundColor: '#000',
              position: currentImage ? 'relative' : 'absolute',
              visibility: currentImage ? 'visible' : 'hidden',
            }}
          />

          {/* Status Messages - Overlay on top */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center bg-slate-900/90 p-8 rounded-lg max-w-md">
                <div className="text-red-400 text-4xl mb-4">⚠️</div>
                <div className="text-red-400 text-lg mb-2">Error Loading Image</div>
                <div className="text-red-300 text-sm whitespace-pre-line">{error}</div>
                <button
                  onClick={() => setError(null)}
                  className="mt-4 px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {!error && !isInitialized && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-slate-500 text-6xl mb-4">⏳</div>
                <div className="text-slate-400 text-lg mb-2">Initializing Viewer...</div>
                <div className="text-slate-500 text-sm">
                  Please wait while Cornerstone.js loads
                </div>
              </div>
            </div>
          )}

          {!error && isInitialized && !currentImage && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-slate-500 text-6xl mb-4">🖼️</div>
                <div className="text-slate-400 text-lg mb-2">No Image Loaded</div>
                <div className="text-slate-500 text-sm mb-4">
                  Select a sample image from the sidebar to view
                </div>
                <button
                  onClick={() => loadImage(sampleImages[0].path)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Load First Sample
                </button>
              </div>
            </div>
          )}

          {/* Image Info Overlay */}
          {currentImage && imageInfo && !error && (
            <div className="absolute top-4 left-4 bg-black/70 text-white text-xs p-3 rounded">
              <div className="font-semibold mb-2">Image Information</div>
              <div className="space-y-1">
                <div>Size: {imageInfo.width} × {imageInfo.height}</div>
                <div>Rows: {imageInfo.rows}</div>
                <div>Columns: {imageInfo.columns}</div>
                <div>Zoom: {(zoom * 100).toFixed(0)}%</div>
              </div>
            </div>
          )}

          {/* Fullscreen Exit Button */}
          {isFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="absolute top-4 right-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 z-10"
            >
              Exit Fullscreen (ESC)
            </button>
          )}

          {/* Controls Overlay */}
          {currentImage && imageInfo && !error && (
            <div className="absolute bottom-4 left-4 right-4 bg-black/70 text-white text-xs p-3 rounded">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">W/L:</span> {Math.round(windowLevel.width)}/{Math.round(windowLevel.center)}
                </div>
                <div>
                  <span className="font-semibold">Zoom:</span> {(zoom * 100).toFixed(0)}%
                </div>
                <div>
                  <span className="font-semibold">Size:</span> {imageInfo?.width} × {imageInfo?.height}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer - Compact */}
      <div className="bg-slate-800 border-t border-slate-700 px-4 py-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${isInitialized ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
              <span>{isInitialized ? 'Ready' : 'Init...'}</span>
            </div>
            <div>💡 Use zoom +/− and W/L presets</div>
          </div>
          <div>Cornerstone.js v3</div>
        </div>
      </div>
    </div>
  );
}
