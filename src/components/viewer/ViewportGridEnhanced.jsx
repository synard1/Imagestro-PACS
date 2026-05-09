import { useRef, useEffect, useState } from 'react';
import { inspectDicomFile, logDicomInfo } from '../../utils/dicomInspector';
import { getImageLoadTimeout, getTimeoutErrorMessage } from '../../services/dicomImageLoadConfig';

export default function ViewportGridEnhanced({
  layout = '1x1',
  onViewportClick,
  imageIds = [],
  activeViewport = 0,
  windowLevel = { width: 400, center: 40 },
  isInitialized = false,
  cornerstone,
  cornerstoneTools,
  cornerstoneDICOMImageLoader
}) {
  const layouts = {
    '1x1': { rows: 1, cols: 1, viewports: 1 },
    '1x2': { rows: 1, cols: 2, viewports: 2 },
    '2x1': { rows: 2, cols: 1, viewports: 2 },
    '2x2': { rows: 2, cols: 2, viewports: 4 },
    '3x3': { rows: 3, cols: 3, viewports: 9 },
  };

  const config = layouts[layout] || layouts['1x1'];
  const viewportRefs = useRef([]);
  const renderingEngineRef = useRef(null);
  const [viewportsReady, setViewportsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });

  // Initialize viewports
  useEffect(() => {
    viewportRefs.current = viewportRefs.current.slice(0, config.viewports);
  }, [config.viewports]);

  // Initialize Cornerstone rendering engine
  useEffect(() => {
    // Don't initialize if Cornerstone is not ready
    if (!isInitialized || !cornerstone || !cornerstoneTools) {
      console.log('[ViewportGrid] Waiting for Cornerstone initialization...');
      return;
    }

    const { Enums } = cornerstone;
    const { ToolGroupManager } = cornerstoneTools;

    const initializeViewports = async () => {
      try {
        const renderingEngineId = 'pacsRenderingEngine';

        // Get or create rendering engine
        let renderingEngine = cornerstone.getRenderingEngine(renderingEngineId);

        if (!renderingEngine) {
          renderingEngine = new cornerstone.RenderingEngine(renderingEngineId);
          console.log('[ViewportGrid] Created rendering engine');
        }

        renderingEngineRef.current = renderingEngine;

        // Wait a bit for DOM to be ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Enable viewports
        for (let i = 0; i < config.viewports; i++) {
          const element = viewportRefs.current[i];
          if (!element) {
            console.warn(`[ViewportGrid] Element ${i} not found`);
            continue;
          }

          const viewportId = `viewport-${i}`;

          try {
            // Check if viewport already exists
            const existingViewport = renderingEngine.getViewport(viewportId);
            if (existingViewport) {
              console.log(`[ViewportGrid] Viewport ${i} already exists, reusing`);
              continue;
            }

            // Ensure element has dimensions with retry
            let rect = element.getBoundingClientRect();
            let retries = 0;
            while ((rect.width === 0 || rect.height === 0) && retries < 10) {
              console.log(`[ViewportGrid] Element ${i} has 0 dimensions, waiting... (${retries + 1}/10)`);
              await new Promise(r => setTimeout(r, 50));
              rect = element.getBoundingClientRect();
              retries++;
            }

            if (rect.width === 0 || rect.height === 0) {
              console.error(`[ViewportGrid] Element ${i} still has no dimensions after retries. Skipping.`);
              continue;
            }

            const viewportInput = {
              viewportId,
              type: Enums.ViewportType.STACK,
              element,
              defaultOptions: {
                background: [0, 0, 0],
              },
            };

            renderingEngine.enableElement(viewportInput);
            console.log(`[ViewportGrid] Enabled viewport ${i} (${rect.width}x${rect.height})`);

            // Add viewport to ToolGroup
            const toolGroupId = 'pacsToolGroup';
            const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
            if (toolGroup) {
              toolGroup.addViewport(viewportId, renderingEngineId);
              console.log(`[ViewportGrid] Added viewport ${viewportId} to ToolGroup ${toolGroupId}`);
            } else {
              console.warn(`[ViewportGrid] ToolGroup ${toolGroupId} not found`);
            }

          } catch (err) {
            console.error(`[ViewportGrid] Error enabling viewport ${i}:`, err);
          }
        }

        // Force a resize to ensure everything is laid out correctly
        renderingEngine.resize(true, false);

        // Wait a bit more before marking as ready
        await new Promise(resolve => setTimeout(resolve, 200));
        setViewportsReady(true);
        console.log('[ViewportGrid] All viewports ready');
      } catch (err) {
        console.error('[ViewportGrid] Failed to initialize viewports:', err);
      }
    };

    if (viewportRefs.current.length > 0) {
      initializeViewports();
    }

    return () => {
      // Cleanup on unmount
      if (renderingEngineRef.current) {
        try {
          console.log('[ViewportGrid] Cleanup: Destroying rendering engine');
          const renderingEngine = renderingEngineRef.current;

          // Disable all viewports first
          for (let i = 0; i < config.viewports; i++) {
            try {
              renderingEngine.disableElement(`viewport-${i}`);
            } catch (e) { /* ignore */ }
          }

          renderingEngine.destroy();
          renderingEngineRef.current = null;
        } catch (err) {
          console.warn('[ViewportGrid] Cleanup error:', err);
        }
      }
    };
  }, [config.viewports, isInitialized, cornerstone, cornerstoneTools]);


  // Load images when imageIds change
  useEffect(() => {
    console.log('[ViewportGrid] Image IDs changed:', imageIds);
    if (!viewportsReady || !imageIds || imageIds.length === 0) {
      console.log('[ViewportGrid] Skipping load - viewports not ready or no images');
      return;
    }

    const loadImages = async () => {
      const renderingEngine = renderingEngineRef.current;
      if (!renderingEngine) {
        console.warn('[ViewportGrid] Rendering engine not available');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        setProgress({ loaded: 0, total: imageIds.length });

        // Wait a bit for viewport to be fully ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Load first image in first viewport
        const viewport = renderingEngine.getViewport('viewport-0');
        if (!viewport) {
          console.warn('[ViewportGrid] Viewport not found');
          return;
        }

        console.log('[ViewportGrid] Loading images:', imageIds.length, 'images');

        // DIAGNOSTIC: Inspect first DICOM file - SKIPPED for performance
        if (imageIds.length > 0) {
          console.log('[ViewportGrid] Skipping diagnostic inspection for performance');
        }

        // Set the stack with the image IDs
        console.log('[ViewportGrid] 🔵 Step 1: Setting stack with imageIds:', imageIds);

        try {
          // Get configured timeout
          const timeout = getImageLoadTimeout();
          
          // Add timeout to prevent hanging
          const setStackPromise = viewport.setStack(imageIds, 0);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          );

          await Promise.race([setStackPromise, timeoutPromise]);
          console.log('[ViewportGrid] ✅ Step 1 complete: Stack set successfully');
        } catch (stackErr) {
          console.error('[ViewportGrid] ❌ Step 1 FAILED: Could not set stack:', stackErr);
          
          // Provide more helpful error message
          let errorMsg = stackErr.message || 'Unknown error';
          if (errorMsg.includes('timeout')) {
            errorMsg = getTimeoutErrorMessage();
          } else if (errorMsg.includes('CORS')) {
            errorMsg = 'CORS error: Unable to load image due to cross-origin restrictions. Please check backend configuration.';
          } else if (errorMsg.includes('404')) {
            errorMsg = 'Image not found (404). The file may have been deleted or moved.';
          }
          
          throw new Error(errorMsg);
        }

        console.log('[ViewportGrid] 🔵 Step 2: Waiting for image to load (500ms)...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try to get the loaded image
        console.log('[ViewportGrid] 🔵 Step 3: Retrieving image data...');
        let image = null;
        try {
          // Add timeout to prevent hanging
          const getImagePromise = new Promise((resolve) => {
            const img = viewport.getImageData();
            resolve(img);
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Image data retrieval timeout')), 10000)
          );

          image = await Promise.race([getImagePromise, timeoutPromise]);

          if (image) {
            console.log('[ViewportGrid] ✅ Step 3 complete: Image data retrieved:', {
              dimensions: [image.dimensions[0], image.dimensions[1], image.dimensions[2]],
              spacing: image.spacing,
              origin: image.origin,
              scalarData: image.scalarData ? `Array(${image.scalarData.length})` : 'N/A'
            });
          } else {
            console.error('[ViewportGrid] ❌ Step 3 FAILED: Image data is NULL');
          }
        } catch (err) {
          console.error('[ViewportGrid] ❌ Step 3 FAILED: Exception getting image data:', err);
        }

        // Check stack info
        console.log('[ViewportGrid] 🔵 Step 4: Checking stack info...');
        try {
          const numberOfImages = viewport.getNumberOfSlices?.() || imageIds.length;
          const currentImageIdIndex = viewport.getCurrentImageIdIndex?.();
          console.log('[ViewportGrid] ✅ Step 4 complete: Stack info:', {
            numberOfImages,
            currentImageIdIndex,
            totalImageIds: imageIds.length
          });
        } catch (err) {
          console.error('[ViewportGrid] ⚠️ Step 4 warning: Could not get stack info:', err);
        }

        // Reset camera to fit image
        console.log('[ViewportGrid] 🔵 Step 5: Resetting camera...');
        try {
          viewport.resetCamera();
          console.log('[ViewportGrid] ✅ Step 5 complete: Camera reset');
        } catch (err) {
          console.error('[ViewportGrid] ❌ Step 5 FAILED:', err);
        }

        // Set appropriate VOI based on DICOM metadata
        console.log('[ViewportGrid] 🔵 Step 6: Setting VOI...');
        try {
          const viewportProperties = viewport.getProperties();
          console.log('[ViewportGrid] Current viewport properties:', viewportProperties);

          // Get DICOM metadata if available
          const dicomMeta = window.__dicomMetadata;
          let voiSet = false;

          // Try to use DICOM window/level if present
          if (dicomMeta && dicomMeta.windowLevel && dicomMeta.windowLevel.hasPreset) {
            const center = parseFloat(dicomMeta.windowLevel.center);
            const width = parseFloat(dicomMeta.windowLevel.width);

            if (!isNaN(center) && !isNaN(width)) {
              const lower = center - width / 2;
              const upper = center + width / 2;

              viewport.setProperties({
                voiRange: { lower, upper }
              });

              console.log('[ViewportGrid] ✅ Set VOI from DICOM Window/Level:', { center, width, lower, upper });
              voiSet = true;
            }
          }

          // If no DICOM W/L, calculate from bit depth
          if (!voiSet && dicomMeta && dicomMeta.imageInfo) {
            const bitsStored = dicomMeta.imageInfo.bitsStored;
            const pixelRep = dicomMeta.imageInfo.pixelRepresentation;

            let lower, upper;
            if (pixelRep === 1) {
              // Signed
              lower = -Math.pow(2, bitsStored - 1);
              upper = Math.pow(2, bitsStored - 1) - 1;
            } else {
              // Unsigned
              lower = 0;
              upper = Math.pow(2, bitsStored) - 1;
            }

            viewport.setProperties({
              voiRange: { lower, upper }
            });

            console.log('[ViewportGrid] ✅ Set VOI from bit depth:', { bitsStored, pixelRep, lower, upper });
            voiSet = true;
          }

          // Fallback to default if nothing worked
          if (!voiSet) {
            viewport.setProperties({
              voiRange: { lower: 0, upper: 1023 }
            });
            console.log('[ViewportGrid] ⚠️ Set default VOI (0-1023)');
          }
        } catch (err) {
          console.error('[ViewportGrid] ❌ Could not set VOI:', err);
        }

        // Force render multiple times to ensure display
        console.log('[ViewportGrid] 🔵 Step 7: First render...');
        try {
          viewport.render();
          console.log('[ViewportGrid] ✅ Step 7 complete: First render done');
        } catch (err) {
          console.error('[ViewportGrid] ❌ Step 7 FAILED:', err);
        }

        // Wait and render again
        console.log('[ViewportGrid] 🔵 Step 8: Waiting 100ms for second render...');
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('[ViewportGrid] 🔵 Step 9: Second render...');
        try {
          viewport.render();
          console.log('[ViewportGrid] ✅ Step 9 complete: Second render done');
        } catch (err) {
          console.error('[ViewportGrid] ❌ Step 9 FAILED:', err);
        }

        // Final check
        console.log('[ViewportGrid] 🔵 Step 10: Final viewport state check...');
        try {
          const canvas = viewport.getCanvas();
          const element = viewport.element; // Fix: use property instead of getElement()
          console.log('[ViewportGrid] ✅ Final state:', {
            hasCanvas: !!canvas,
            canvasSize: canvas ? `${canvas.width}x${canvas.height}` : 'N/A',
            hasElement: !!element,
            elementSize: element ? `${element.clientWidth}x${element.clientHeight}` : 'N/A'
          });
        } catch (err) {
          console.error('[ViewportGrid] ⚠️ Could not check final state:', err);
        }

        console.log('[ViewportGrid] ✅✅✅ ALL STEPS COMPLETE - Images should be visible ✅✅✅');
        setIsLoading(false);
        setProgress({ loaded: imageIds.length, total: imageIds.length });
      } catch (err) {
        console.error('[ViewportGrid] ❌ Failed to load images:', err);
        setError(err.message || 'Failed to load image');
        setIsLoading(false);

        // Also notify parent component of the error
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('viewerError', {
            detail: {
              message: err.message || 'Failed to load image',
              imageIds: imageIds
            }
          }));
        }
      }
    };

    loadImages();
  }, [viewportsReady, imageIds]);

  // Apply window/level
  useEffect(() => {
    if (!viewportsReady) return;

    const renderingEngine = renderingEngineRef.current;
    if (!renderingEngine) return;

    try {
      const viewport = renderingEngine.getViewport(`viewport-${activeViewport}`);
      if (!viewport) return;

      const lower = windowLevel.center - windowLevel.width / 2;
      const upper = windowLevel.center + windowLevel.width / 2;

      viewport.setProperties({
        voiRange: { lower, upper }
      });

      viewport.render();
    } catch (err) {
      console.warn('[ViewportGrid] Failed to apply window/level:', err);
    }
  }, [windowLevel, activeViewport, viewportsReady]);

  const getGridStyle = () => {
    return {
      display: 'grid',
      gridTemplateRows: `repeat(${config.rows}, 1fr)`,
      gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
      gap: '2px',
      height: '100%',
      width: '100%',
      backgroundColor: '#1f2937',
    };
  };

  const [fullscreenViewport, setFullscreenViewport] = useState(null);

  const toggleFullscreen = (index) => {
    if (fullscreenViewport === index) {
      setFullscreenViewport(null);
    } else {
      setFullscreenViewport(index);
    }

    // Resize rendering engine after transition
    setTimeout(() => {
      const renderingEngine = renderingEngineRef.current;
      if (renderingEngine) {
        renderingEngine.resize(true, false);
      }
    }, 100);
  };

  return (
    <div style={getGridStyle()}>
      {Array.from({ length: config.viewports }).map((_, index) => {
        // Skip rendering if we are in fullscreen mode and this is not the active viewport
        if (fullscreenViewport !== null && fullscreenViewport !== index) return null;

        const isFullscreen = fullscreenViewport === index;

        return (
          <div
            key={index}
            ref={(el) => (viewportRefs.current[index] = el)}
            onClick={() => onViewportClick?.(index)}
            className={`relative bg-black cursor-pointer transition-all ${isFullscreen
              ? 'fixed inset-0 z-40 w-full h-full'
              : activeViewport === index
                ? 'border-2 border-blue-500'
                : 'border border-gray-700 hover:border-blue-400'
              }`}
            data-viewport-index={index}
            style={isFullscreen ? { gridColumn: '1 / -1', gridRow: '1 / -1' } : {}}
          >
            {/* Viewport Label */}
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 text-white text-xs rounded z-10 pointer-events-none">
              Viewport {index + 1}
              {activeViewport === index && <span className="ml-2 text-blue-400">●</span>}
            </div>

            {/* Fullscreen Toggle Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen(index);
              }}
              className="absolute top-2 right-2 p-1 bg-black/70 text-white hover:bg-blue-600 rounded z-50 transition-colors"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>

            {/* Loading State */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
                <div className="text-center text-white bg-gray-800 p-6 rounded-lg">
                  <div className="text-4xl mb-2 animate-pulse">⏳</div>
                  <div className="text-lg font-semibold mb-2">Loading Images</div>
                  <div className="text-sm mb-4">
                    {progress.loaded} of {progress.total} images loaded
                  </div>
                  <div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${(progress.loaded / progress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                <div className="text-center text-red-500 bg-gray-900 p-6 rounded-lg max-w-md">
                  <div className="text-4xl mb-2">⚠️</div>
                  <div className="text-lg font-bold mb-2">Image Load Failed</div>
                  <div className="text-sm text-gray-300 mb-4 break-words">{error}</div>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => setError(null)}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {(!imageIds || imageIds.length === 0) && !isLoading && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-600 pointer-events-none">
                <div className="text-center">
                  <div className="text-4xl mb-2">🖼️</div>
                  <div className="text-sm">No Image</div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
