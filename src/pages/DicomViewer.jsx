import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import { logger } from '../utils/logger';
import { getTagName, formatTagForDisplay, getTagGroup } from '../utils/dicomDictionary';

// Initialize cornerstone and tools
let initialized = false;

const initializeCornerstone = async () => {
  if (initialized) return;

  try {
    // Initialize cornerstone
    await cornerstone.init();
    logger.info('✓ Cornerstone3D initialized');

    // Initialize cornerstone tools
    cornerstoneTools.init();
    logger.info('✓ Cornerstone Tools initialized');

    // Configure DICOM Image Loader
    cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
    cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

    const { preferSizeOverAccuracy, useNorm16Texture } =
      cornerstone.getConfiguration().rendering;

    cornerstoneDICOMImageLoader.configure({
      useWebWorkers: true,
      decodeConfig: {
        convertFloatPixelDataToInt: false,
        use16BitDataType: preferSizeOverAccuracy || useNorm16Texture,
      },
    });

    const maxWebWorkers = Math.min(Math.max(navigator.hardwareConcurrency - 1, 1), 7);

    const config = {
      maxWebWorkers,
      startWebWorkersOnDemand: true,
      taskConfiguration: {
        decodeTask: {
          initializeCodecsOnStartup: false,
          strict: false,
        },
      },
    };

    cornerstoneDICOMImageLoader.webWorkerManager.initialize(config);
    logger.info('✓ DICOM Image Loader configured with', maxWebWorkers, 'workers');

    initialized = true;
  } catch (error) {
    logger.error('Failed to initialize cornerstone:', error);
    throw error;
  }
};

const DicomViewer = () => {
  const [fileList, setFileList] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [isViewportReady, setIsViewportReady] = useState(false);

  const viewportRef = useRef(null);
  const renderingEngineRef = useRef(null);
  const viewportIdRef = useRef('CT_STACK');
  const renderingEngineIdRef = useRef('myRenderingEngine');

  // Initialize Cornerstone on mount
  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        await initializeCornerstone();

        if (!mounted) return;

        // Create rendering engine
        const renderingEngineId = renderingEngineIdRef.current;
        const renderingEngine = new cornerstone.RenderingEngine(renderingEngineId);
        renderingEngineRef.current = renderingEngine;

        logger.info('✓ Rendering engine created');
      } catch (err) {
        logger.error('Setup error:', err);
        if (mounted) {
          setError('Failed to initialize DICOM viewer');
        }
      }
    };

    setup();

    return () => {
      mounted = false;
      // Cleanup rendering engine
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
        logger.info('✓ Rendering engine destroyed');
      }
    };
  }, []);

  // Enable viewport when element is ready
  useEffect(() => {
    const element = viewportRef.current;
    const renderingEngine = renderingEngineRef.current;

    if (!element || !renderingEngine) return;

    let mounted = true;

    try {
      const viewportId = viewportIdRef.current;

      // Create viewport input
      const viewportInput = {
        viewportId,
        type: cornerstone.Enums.ViewportType.STACK,
        element,
        defaultOptions: {
          background: [0, 0, 0],
        },
      };

      // Enable the element
      renderingEngine.enableElement(viewportInput);
      logger.info('✓ Viewport enabled');

      // Small delay to ensure viewport is fully ready
      setTimeout(() => {
        if (mounted) {
          setIsViewportReady(true);
          logger.info('✓ Viewport ready');
        }
      }, 100);

    } catch (err) {
      logger.error('Failed to enable viewport:', err);
      setError('Failed to enable viewport');
    }

    return () => {
      mounted = false;
      setIsViewportReady(false);
    };
  }, [viewportRef.current, renderingEngineRef.current]);

  // Display image when selected file changes
  useEffect(() => {
    const renderingEngine = renderingEngineRef.current;
    if (!selectedFile || !renderingEngine || !isViewportReady) {
      logger.info('Waiting for viewport to be ready...');
      return;
    }

    const displayImage = async () => {
      try {
        const { imageId } = selectedFile;
        logger.info('Loading image:', imageId);
        setIsLoading(true);
        setError(null);

        // Get the viewport
        const viewport = renderingEngine.getViewport(viewportIdRef.current);

        if (!viewport) {
          throw new Error('Viewport not found - viewport may not be properly enabled');
        }

        logger.info('✓ Viewport found, setting stack...');

        // Set the stack on the viewport
        await viewport.setStack([imageId], 0);

        // Render the image
        viewport.render();

        setIsLoading(false);
        logger.info('✓ Image displayed successfully');

      } catch (err) {
        logger.error('✗ Failed to display image:', err);
        setError(`Failed to display image: ${err.message}`);
        setIsLoading(false);
      }
    };

    displayImage();
  }, [selectedFile, isViewportReady]);

  // Handle file drop
  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) {
      logger.warn('No file selected');
      return;
    }

    logger.info('Processing file:', file.name, 'Size:', file.size);
    setError(null);
    setIsLoading(true);

    try {
      // Create a wadouri imageId from the file
      const imageId = cornerstoneDICOMImageLoader.wadouri.fileManager.add(file);
      logger.info('✓ File registered with imageId:', imageId);

      // Load the image to extract metadata
      cornerstone.imageLoader.loadImage(imageId).then((image) => {
        logger.info('✓ Image loaded for metadata');

        // Parse DICOM tags
        const arrayBuffer = image.data.byteArray.buffer;
        const byteArray = new Uint8Array(arrayBuffer);
        const dataSet = dicomParser.parseDicom(byteArray);

        const patientName = dataSet.string('x00100010') || 'Unknown';

        // Extract all DICOM tags
        const tags = [];
        for (const tag in dataSet.elements) {
          if (dataSet.elements.hasOwnProperty(tag)) {
            const el = dataSet.elements[tag];
            const value = dataSet.string(tag) || '...';
            tags.push({
              tag: tag,
              tagFormatted: formatTagForDisplay(tag),
              tagName: getTagName(tag),
              tagGroup: getTagGroup(tag),
              vr: el.vr,
              value: value,
              length: el.length,
            });
          }
        }

        // Get window/level info
        const windowCenter = dataSet.floatString('x00281050');
        const windowWidth = dataSet.floatString('x00281051');
        const rescaleSlope = dataSet.floatString('x00281053') || 1;
        const rescaleIntercept = dataSet.floatString('x00281052') || 0;

        // Create debug info
        const debugInfo = {
          dimensions: `${image.width} x ${image.height}`,
          windowCenter: windowCenter || 'Auto',
          windowWidth: windowWidth || 'Auto',
          slope: rescaleSlope,
          intercept: rescaleIntercept,
          imageId: imageId,
        };

        const newFile = {
          name: file.name,
          patientName,
          uploadDate: new Date().toLocaleString(),
          imageId,
          tags,
          debugInfo,
        };

        setFileList((prevList) => [newFile, ...prevList]);
        setSelectedFile(newFile);
        setIsLoading(false);
        logger.info('✓ File added to list');



      }).catch((err) => {
        logger.error('✗ Failed to load DICOM file:', err);
        setError(`Failed to load DICOM file: ${err.message}`);
        setIsLoading(false);
      });

    } catch (err) {
      logger.error('✗ Error processing file:', err);
      setError(`Error processing file: ${err.message}`);
      setIsLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/dicom': ['.dcm', '.dic', '.dicom'],
      'application/octet-stream': ['.dcm', '.dic', '.dicom'],
    },
    multiple: false,
  });

  // Open image in new tab
  const openImageInNewTab = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;

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
      }
    } catch (err) {
      console.error('Error opening in new tab:', err);
      setError('Failed to open image in new tab');
    }
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);

    // Resize viewport after state change
    setTimeout(() => {
      const renderingEngine = renderingEngineRef.current;
      if (renderingEngine) {
        try {
          renderingEngine.resize(true);
          logger.info('✓ Viewport resized');
        } catch (err) {
          logger.warn('Error resizing:', err);
        }
      }
    }, 100);
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">DICOM Viewer (Cornerstone3D)</h1>

      {/* File Upload Area */}
      <div
        {...getRootProps()}
        className={`p-10 border-2 border-dashed rounded-md text-center cursor-pointer transition ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-gray-600">
          {isDragActive
            ? 'Drop the DICOM file here...'
            : "Drag 'n' drop a DICOM file here, or click to select one"}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded border border-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
        {/* File List */}
        <div className="md:col-span-1">
          <h2 className="text-xl font-semibold mb-3">Uploaded Files</h2>
          {fileList.length === 0 ? (
            <p className="text-gray-500">No files uploaded yet.</p>
          ) : (
            <ul className="border rounded-md overflow-y-auto" style={{ maxHeight: '600px' }}>
              {fileList.map((file, index) => (
                <li
                  key={index}
                  className={`p-3 cursor-pointer hover:bg-gray-100 border-b last:border-b-0 transition ${
                    selectedFile?.imageId === file.imageId ? 'bg-blue-100' : ''
                  }`}
                  onClick={() => setSelectedFile(file)}
                >
                  <p className="font-semibold truncate">{file.name}</p>
                  <p className="text-sm text-gray-600">Patient: {file.patientName}</p>
                  <p className="text-xs text-gray-400">{file.uploadDate}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Image Preview and Info */}
        <div className="md:col-span-2">
          {selectedFile ? (
            <div className="space-y-6">
              {/* Image Viewport */}
              <div className={isFullscreen ? 'fixed inset-0 z-50 bg-black p-4 flex flex-col' : ''}>
                <div className="flex justify-between items-center mb-3">
                  <h2 className={`text-xl font-semibold ${isFullscreen ? 'text-white' : ''}`}>
                    Image Preview
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={openImageInNewTab}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                      title="Open in New Tab"
                    >
                      <span>Open in New Tab</span>
                    </button>
                    <button
                      onClick={toggleFullscreen}
                      className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition"
                      title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                      <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
                    </button>
                  </div>
                </div>

                <div
                  className={`border rounded-md bg-black relative ${isFullscreen ? 'flex-1' : ''}`}
                  style={isFullscreen ? {} : { width: '100%', height: '500px' }}
                >
                  <div
                    ref={viewportRef}
                    className="w-full h-full"
                  />
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                      <div className="text-white text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2" />
                        <p>Loading DICOM image...</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Debug Info */}
              {!isFullscreen && selectedFile.debugInfo && (
                <div>
                  <h2 className="text-xl font-semibold mb-3">Image Information</h2>
                  <div className="border rounded-md p-4 bg-gray-50 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="font-semibold">Dimensions:</div>
                      <div>{selectedFile.debugInfo.dimensions}</div>

                      <div className="font-semibold">Window Center:</div>
                      <div>{selectedFile.debugInfo.windowCenter}</div>

                      <div className="font-semibold">Window Width:</div>
                      <div>{selectedFile.debugInfo.windowWidth}</div>

                      <div className="font-semibold">Rescale Slope:</div>
                      <div>{selectedFile.debugInfo.slope}</div>

                      <div className="font-semibold">Rescale Intercept:</div>
                      <div>{selectedFile.debugInfo.intercept}</div>

                      <div className="font-semibold">Image ID:</div>
                      <div className="text-xs break-all">{selectedFile.debugInfo.imageId}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* DICOM Tags */}
              {!isFullscreen && (
                <div>
                  <h2 className="text-xl font-semibold mb-3">DICOM Tags</h2>
                  <div className="overflow-auto border rounded-md" style={{ maxHeight: '400px' }}>
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">
                            Tag
                          </th>
                          <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">
                            Name
                          </th>
                          <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedFile.tags.map((tagInfo) => (
                          <tr key={tagInfo.tag} className="hover:bg-gray-50">
                            <td className="px-2 py-1 whitespace-nowrap font-mono text-gray-600">
                              {tagInfo.tagFormatted}
                            </td>
                            <td className="px-2 py-1 whitespace-nowrap font-medium">
                              {tagInfo.tagName}
                            </td>
                            <td className="px-2 py-1 whitespace-normal break-words">
                              {tagInfo.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500">Upload a DICOM file to see the preview and information.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DicomViewer;
