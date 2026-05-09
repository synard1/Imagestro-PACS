import { useRef, useEffect, useState } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import { Enums } from '@cornerstonejs/core';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import { inspectDicomFile, logDicomInfo } from '../../utils/dicomInspector';

export default function ViewportGridEnhanced({
  layout = '1x1',
  onViewportClick,
  imageIds = [],
  activeViewport = 0,
  windowLevel = { width: 400, center: 40 },
  isInitialized = false
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

  // Initialize viewports
  useEffect(() => {
    viewportRefs.current = viewportRefs.current.slice(0, config.viewports);
  }, [config.viewports]);

  // Initialize Cornerstone rendering engine
  useEffect(() => {
    // Don't initialize if Cornerstone is not ready
    if (!isInitialized) {
      console.log('[ViewportGrid] Waiting for Cornerstone initialization...');
      return;
    }

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

            // Ensure element has dimensions
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
              console.warn(`[ViewportGrid] Element ${i} has no dimensions`);
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
          } catch (err) {
            console.error(`[ViewportGrid] Error enabling viewport ${i}:`, err);
          }
        }

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
          console.log('[ViewportGrid] Cleanup');
        } catch (err) {
          console.warn('[ViewportGrid] Cleanup error:', err);
        }
      }
    };
  }, [config.viewports, isInitialized]);

  // Load images when imageIds change
  useEffect(() => {
    if (!viewportsReady || !imageIds || imageIds.length === 0) return;

    const loadImages = async () => {
      const renderingEngine = renderingEngineRef.current;
      if (!renderingEngine) {
        console.warn('[ViewportGrid] Rendering engine not available');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Wait a bit for viewport to be fully ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Load first image in first viewport
        const viewport = renderingEngine.getViewport('viewport-0');
        if (!viewport) {
          console.warn('[ViewportGrid] Viewport not found');
          return;
        }

        console.log('[ViewportGrid] Loading images:', imageIds.length, 'images');

        // DIAGNOSTIC: Inspect first DICOM file
        if (imageIds.length > 0) {
          const firstImageId = imageIds[0];
          console.log('[ViewportGrid] Inspecting first DICOM:', firstImageId);

          try {
            // Fetch the DICOM file to inspect it
            const imageIdUrl = firstImageId.replace('wadouri:', '');
            const response = await fetch(imageIdUrl);
            const blob = await response.blob();

            console.log('[ViewportGrid] First DICOM blob size:', (blob.size / 1024).toFixed(2), 'KB');

            // Inspect DICOM file
            const report = await inspectDicomFile(blob);
            logDicomInfo(report);

            // Check for potential issues
            if (!report.valid) {
              throw new Error(`Invalid DICOM file: ${report.error}`);
            }

            if (!report.pixelData.present) {
              throw new Error('DICOM file has no pixel data');
            }

            if (report.transferSyntax.requiresCodec) {
              console.warn(
                '[ViewportGrid] ⚠️ Transfer syntax requires codec:',
                report.transferSyntax.name,
                '\nEnsure codecs are loaded from CDN.'
              );
            }

            // Store DICOM metadata for later use
            window.__dicomMetadata = report;
          } catch (inspectError) {
            console.error('[ViewportGrid] DICOM inspection failed:', inspectError);
            // Continue anyway, let Cornerstone try to load
          }
        }

        // Set the stack with the image IDs
        console.log('[ViewportGrid] 🔵 Step 1: Setting stack with imageIds:', imageIds);

        try {
          await viewport.setStack(imageIds, 0);
          console.log('[ViewportGrid] ✅ Step 1 complete: Stack set successfully');
        } catch (stackErr) {
          console.error('[ViewportGrid] ❌ Step 1 FAILED: Could not set stack:', stackErr);
          throw stackErr;
        }

        console.log('[ViewportGrid] 🔵 Step 2: Waiting for image to load (500ms)...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try to get the loaded image
        console.log('[ViewportGrid] 🔵 Step 3: Retrieving image data...');
        let image = null;
        try {
          image = viewport.getImageData();
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
          const element = viewport.getElement();
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
      } catch (err) {
        console.error('[ViewportGrid] ❌ Failed to load images:', err);
        setError(err.message || 'Failed to load image');
        setIsLoading(false);
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

  return (
    <div style={getGridStyle()}>
      {Array.from({ length: config.viewports }).map((_, index) => (
        <div
          key={index}
          ref={(el) => (viewportRefs.current[index] = el)}
          onClick={() => onViewportClick?.(index)}
          className={`relative bg-black cursor-pointer transition-all ${activeViewport === index
            ? 'border-2 border-blue-500'
            : 'border border-gray-700 hover:border-blue-400'
            }`}
          data-viewport-index={index}
        >
          {/* Viewport Label */}
          <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 text-white text-xs rounded z-10 pointer-events-none">
            Viewport {index + 1}
            {activeViewport === index && <span className="ml-2 text-blue-400">●</span>}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20 pointer-events-none">
              <div className="text-center text-white">
                <div className="text-4xl mb-2 animate-pulse">⏳</div>
                <div className="text-sm font-semibold">Loading Image...</div>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
              <div className="text-center text-red-500 px-4">
                <div className="text-4xl mb-2">⚠️</div>
                <div className="text-sm font-bold mb-1">Load Failed</div>
                <div className="text-xs text-gray-300 mb-3 break-words max-w-[200px]">{error}</div>
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                >
                  Retry
                </button>
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
      ))}
    </div>
  );
}
