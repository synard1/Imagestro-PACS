import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import { fetchStudyDetails, fetchStudySeries } from '../../services/studyService';

/**
 * Clean DICOM Viewer - Simplified version
 * Focus: Get image to display without complexity
 */
export default function DicomViewerClean() {
  const { studyId } = useParams();
  const navigate = useNavigate();
  const viewportRef = useRef(null);
  const setupInProgressRef = useRef(false);
  const renderingEngineRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [studyData, setStudyData] = useState(null);
  const [seriesData, setSeriesData] = useState([]);

  // Initialize Cornerstone
  useEffect(() => {
    const init = async () => {
      try {
        console.log('[CleanViewer] 🔵 Initializing Cornerstone...');

        // Init Cornerstone
        await cornerstone.init();
        console.log('[CleanViewer] ✅ Cornerstone initialized');

        // Configure DICOM Image Loader
        cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
        cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

        // Simple config - NO WEB WORKERS
        cornerstoneDICOMImageLoader.configure({
          strict: false,
          decodeConfig: {
            convertFloatPixelDataToInt: false,
          },
        });

        // Disable web workers completely
        cornerstoneDICOMImageLoader.webWorkerManager.initialize({
          maxWebWorkers: 0,
          startWebWorkersOnDemand: false,
        });

        console.log('[CleanViewer] ✅ DICOM loader configured (no web workers)');

        // Init tools
        cornerstoneTools.init();
        console.log('[CleanViewer] ✅ Tools initialized');

        // Mark as initialized
        setIsInitialized(true);
        console.log('[CleanViewer] ✅ Initialization complete - ready for viewport setup');

      } catch (err) {
        console.error('[CleanViewer] ❌ Init failed:', err);
        setError('Failed to initialize viewer: ' + err.message);
      }
    };

    init();
  }, []);

  // Fetch study and series data
  useEffect(() => {
    let isCancelled = false;

    const fetchData = async () => {
      try {
        console.log('[CleanViewer] 🔵 Fetching study data:', studyId);

        // Fetch study details
        const { study, source } = await fetchStudyDetails(studyId);
        if (isCancelled) return;

        console.log('[CleanViewer] Study source:', source);
        setStudyData(study);

        // Fetch series
        console.log('[CleanViewer] 🔵 Fetching series for study:', studyId);
        const { series } = await fetchStudySeries(studyId);
        if (isCancelled) return;

        console.log('[CleanViewer] ✅ Found', series.length, 'series');
        setSeriesData(series);

      } catch (err) {
        if (isCancelled) return;
        console.error('[CleanViewer] ❌ Failed to fetch study data:', err);
        setError('Failed to load study: ' + err.message);
      }
    };

    fetchData();

    // Cleanup
    return () => {
      isCancelled = true;
    };
  }, [studyId]);

  // Setup viewport and load image
  useEffect(() => {
    // Wait for: viewport element, Cornerstone initialized, AND series data loaded
    if (!viewportRef.current || !isInitialized || !seriesData || seriesData.length === 0) {
      if (!isInitialized) {
        console.log('[CleanViewer] ⏳ Waiting for Cornerstone initialization...');
      } else if (!seriesData || seriesData.length === 0) {
        console.log('[CleanViewer] ⏳ Waiting for series data...');
      }
      return;
    }

    // Prevent duplicate setup
    if (setupInProgressRef.current) {
      console.log('[CleanViewer] ⚠️ Setup already in progress, skipping duplicate');
      return;
    }

    // Create AbortController at the beginning
    const abortController = new AbortController();

    const setupViewport = async () => {
      setupInProgressRef.current = true;
      try {
        setIsLoading(true);
        console.log('[CleanViewer] 🔵 Setting up viewport for study:', studyId);

        // Get or create rendering engine
        const renderingEngineId = 'cleanRenderingEngine';
        let renderingEngine = renderingEngineRef.current || cornerstone.getRenderingEngine(renderingEngineId);

        if (!renderingEngine) {
          renderingEngine = new cornerstone.RenderingEngine(renderingEngineId);
          renderingEngineRef.current = renderingEngine;
          console.log('[CleanViewer] ✅ Rendering engine created');
        } else {
          console.log('[CleanViewer] ♻️ Reusing existing rendering engine');
        }

        // Wait for DOM
        await new Promise(resolve => setTimeout(resolve, 100));

        // Enable viewport
        const viewportId = 'cleanViewport';
        const element = viewportRef.current;

        if (!element) {
          throw new Error('Viewport element not found');
        }

        const rect = element.getBoundingClientRect();
        console.log('[CleanViewer] Element size:', rect.width, 'x', rect.height);

        if (rect.width === 0 || rect.height === 0) {
          throw new Error('Viewport element has no size');
        }

        const viewportInput = {
          viewportId,
          type: cornerstone.Enums.ViewportType.STACK,
          element,
          defaultOptions: {
            background: [0, 0, 0],
          },
        };

        renderingEngine.enableElement(viewportInput);
        console.log('[CleanViewer] ✅ Viewport enabled');

        const viewport = renderingEngine.getViewport(viewportId);

        // Build imageIds from series data
        const firstSeries = seriesData[0];
        const seriesInstanceUID = firstSeries.series_instance_uid || firstSeries.seriesInstanceUID;
        const instances = firstSeries.instances || [];

        console.log('[CleanViewer] First series:', seriesInstanceUID);
        console.log('[CleanViewer] Instances:', instances.length);

        if (instances.length === 0) {
          throw new Error('No instances found in series');
        }

        // Build imageIds using WADO-RS
        const imageIds = instances.map(inst => {
          const sopInstanceUID = inst.sop_instance_uid || inst.sopInstanceUID;
          const imageId = `wadouri:/wado-rs/studies/${studyId}/series/${seriesInstanceUID}/instances/${sopInstanceUID}`;
          return imageId;
        });

        console.log('[CleanViewer] 🔵 Loading', imageIds.length, 'images');
        console.log('[CleanViewer] First imageId:', imageIds[0]);

        // Test: Try to fetch the DICOM file first to check if endpoint works
        const testUrl = imageIds[0].replace('wadouri:', '');
        console.log('[CleanViewer] 🔵 Testing WADO endpoint:', testUrl);

        try {
          const testResponse = await fetch(testUrl, {
            signal: abortController.signal,
            cache: 'no-cache' // Prevent duplicate caching
          });

          console.log('[CleanViewer] WADO response:', {
            status: testResponse.status,
            ok: testResponse.ok,
            contentType: testResponse.headers.get('content-type'),
            contentLength: testResponse.headers.get('content-length')
          });

          if (!testResponse.ok) {
            throw new Error(`WADO endpoint failed: ${testResponse.status} ${testResponse.statusText}`);
          }

          const blob = await testResponse.blob();
          console.log('[CleanViewer] ✅ DICOM file downloaded:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
        } catch (fetchErr) {
          if (fetchErr.name === 'AbortError') {
            console.log('[CleanViewer] ⚠️ Fetch aborted');
            return; // Exit gracefully if aborted
          }
          console.error('[CleanViewer] ❌ WADO endpoint test failed:', fetchErr);
          throw new Error('Cannot fetch DICOM file from WADO endpoint: ' + fetchErr.message);
        }

        // Load and set stack with timeout
        console.log('[CleanViewer] 🔵 Calling viewport.setStack()...');

        try {
          // Create timeout promise
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('setStack timeout after 10 seconds')), 10000);
          });

          // Race between setStack and timeout
          await Promise.race([
            viewport.setStack(imageIds, 0),
            timeoutPromise
          ]);

          console.log('[CleanViewer] ✅ Stack set with', imageIds.length, 'images');
        } catch (stackErr) {
          console.error('[CleanViewer] ❌ setStack failed:', stackErr);
          throw new Error('Failed to set stack: ' + stackErr.message);
        }

        // Wait for image to load
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get image data
        const imageData = viewport.getImageData();
        if (imageData) {
          const dims = imageData.dimensions;
          setImageInfo({
            dimensions: `${dims[0]} x ${dims[1]} x ${dims[2]}`,
            spacing: imageData.spacing,
          });
          console.log('[CleanViewer] ✅ Image data:', {
            dimensions: dims,
            spacing: imageData.spacing,
          });
        }

        // Reset camera
        viewport.resetCamera();
        console.log('[CleanViewer] ✅ Camera reset');

        // Set VOI for 10-bit image
        viewport.setProperties({
          voiRange: { lower: 0, upper: 1023 }
        });
        console.log('[CleanViewer] ✅ VOI set to 0-1023');

        // Render
        viewport.render();
        console.log('[CleanViewer] ✅ First render complete');

        // Second render after delay
        await new Promise(resolve => setTimeout(resolve, 200));
        viewport.render();
        console.log('[CleanViewer] ✅ Second render complete');

        // Check canvas
        const canvas = viewport.getCanvas();
        console.log('[CleanViewer] Canvas:', {
          width: canvas?.width,
          height: canvas?.height,
        });

        console.log('[CleanViewer] ✅✅✅ SETUP COMPLETE ✅✅✅');
        setIsLoading(false);

      } catch (err) {
        console.error('[CleanViewer] ❌ Setup failed:', err);
        setError('Failed to load image: ' + err.message);
        setIsLoading(false);
      } finally {
        // Reset flag so user can retry
        setupInProgressRef.current = false;
      }
    };

    setupViewport();

    // Cleanup function
    return () => {
      console.log('[CleanViewer] 🧹 Cleaning up viewport');
      setupInProgressRef.current = false;
      abortController.abort(); // Cancel any pending fetches
    };
  }, [studyId, isInitialized, seriesData]);

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center text-white max-w-lg px-4">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl mb-3 font-semibold">Error</h2>
          <p className="text-red-400 mb-4">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
            <button
              onClick={() => navigate('/studies')}
              className="px-4 py-2 bg-gray-600 rounded-lg hover:bg-gray-700"
            >
              Back to Studies
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/studies')}
              className="text-gray-300 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-white font-semibold text-lg">DICOM Viewer - Clean</h1>
              <p className="text-xs text-gray-400">
                {studyData?.patient_name || 'Loading...'} • {studyData?.study_description || studyId}
              </p>
            </div>
          </div>
          {imageInfo && (
            <div className="text-xs text-gray-400">
              <span>Dimensions: {imageInfo.dimensions}</span>
            </div>
          )}
        </div>
      </div>

      {/* Viewport */}
      <div className="flex-1 relative bg-black">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center text-white">
              <div className="text-6xl mb-4 animate-pulse">⏳</div>
              <div className="text-xl">Loading DICOM image...</div>
              <div className="text-sm text-gray-400 mt-2">Check console for details</div>
            </div>
          </div>
        )}

        <div
          ref={viewportRef}
          className="w-full h-full"
          style={{ minHeight: '400px' }}
        />

        {!isLoading && !error && (
          <div className="absolute bottom-4 left-4 bg-black/70 text-white text-xs px-3 py-2 rounded">
            ✅ Image loaded - If still blank, check browser console
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-2">
        <div className="flex justify-between items-center text-xs text-gray-400">
          <div>Cornerstone.js v3 - Clean Viewer (No Cache, No Workers)</div>
          <div>Press F12 to open console for diagnostics</div>
        </div>
      </div>
    </div>
  );
}
