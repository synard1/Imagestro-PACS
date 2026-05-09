import { useState, useCallback } from 'react';

/**
 * Custom hook for viewport tool management
 * Handles zoom, pan, windowing, and reset
 */
export function useViewportTools(renderingEngineId = 'pacsRenderingEngine', cornerstoneInstance = null) {
  const [activeTool, setActiveTool] = useState('pan');
  const [isPanning, setIsPanning] = useState(false);

  const getViewport = useCallback(async (viewportId) => {
    try {
      // Use provided instance or dynamic import
      const cs = cornerstoneInstance || await import('@cornerstonejs/core');
      const renderingEngine = cs.getRenderingEngine(renderingEngineId);
      if (!renderingEngine) return null;
      return renderingEngine.getViewport(viewportId);
    } catch (err) {
      console.error('[useViewportTools] Failed to get viewport:', err);
      return null;
    }
  }, [renderingEngineId, cornerstoneInstance]);

  const zoomIn = useCallback(async (viewportId, factor = 0.8) => {
    const viewport = await getViewport(viewportId);
    if (!viewport) return;

    try {
      const camera = viewport.getCamera();
      camera.parallelScale = camera.parallelScale * factor;
      viewport.setCamera(camera);
      viewport.render();
      console.log('[useViewportTools] Zoomed in');
    } catch (err) {
      console.error('[useViewportTools] Zoom in failed:', err);
    }
  }, [getViewport]);

  const zoomOut = useCallback(async (viewportId, factor = 1.2) => {
    const viewport = await getViewport(viewportId);
    if (!viewport) return;

    try {
      const camera = viewport.getCamera();
      camera.parallelScale = camera.parallelScale * factor;
      viewport.setCamera(camera);
      viewport.render();
      console.log('[useViewportTools] Zoomed out');
    } catch (err) {
      console.error('[useViewportTools] Zoom out failed:', err);
    }
  }, [getViewport]);

  const pan = useCallback(async (viewportId, deltaX, deltaY) => {
    const viewport = await getViewport(viewportId);
    if (!viewport) return;

    try {
      const camera = viewport.getCamera();
      const { focalPoint } = camera;
      
      // Calculate pan delta based on viewport scale
      const scale = camera.parallelScale || 1;
      const panDeltaX = deltaX * scale * 0.01;
      const panDeltaY = deltaY * scale * 0.01;

      camera.focalPoint = [
        focalPoint[0] - panDeltaX,
        focalPoint[1] + panDeltaY,
        focalPoint[2]
      ];

      viewport.setCamera(camera);
      viewport.render();
    } catch (err) {
      console.error('[useViewportTools] Pan failed:', err);
    }
  }, [getViewport]);

  const applyWindowing = useCallback(async (viewportId, width, center) => {
    const viewport = await getViewport(viewportId);
    if (!viewport) return;

    try {
      const lower = center - width / 2;
      const upper = center + width / 2;

      viewport.setProperties({
        voiRange: { lower, upper }
      });
      
      viewport.render();
      console.log('[useViewportTools] Applied windowing:', width, center);
    } catch (err) {
      console.error('[useViewportTools] Windowing failed:', err);
    }
  }, [getViewport]);

  const resetView = useCallback(async (viewportId) => {
    const viewport = await getViewport(viewportId);
    if (!viewport) return;

    try {
      viewport.resetCamera();
      viewport.resetProperties();
      viewport.render();
      console.log('[useViewportTools] Reset view');
    } catch (err) {
      console.error('[useViewportTools] Reset failed:', err);
    }
  }, [getViewport]);

  return {
    activeTool,
    setActiveTool,
    isPanning,
    setIsPanning,
    zoomIn,
    zoomOut,
    pan,
    applyWindowing,
    resetView,
  };
}
