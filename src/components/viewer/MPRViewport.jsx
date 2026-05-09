import React, { useEffect, useRef, useState } from 'react';
import { createVolumeFromImages } from '../../utils/volumeLoaderHelper';

export default function MPRViewport({ imageIds, studyInstanceUID, seriesInstanceUID }) {
    const [libraries, setLibraries] = useState(null);
    const elementRef1 = useRef(null);
    const elementRef2 = useRef(null);
    const elementRef3 = useRef(null);
    const elementRef4 = useRef(null);
    const runningRef = useRef(false);
    const renderingEngineRef = useRef(null);
    const toolGroupRef = useRef(null);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Dynamic import of libraries
    useEffect(() => {
        const loadLibraries = async () => {
            try {
                const cornerstone = await import('@cornerstonejs/core');
                const cornerstoneTools = await import('@cornerstonejs/tools');
                setLibraries({ cornerstone, cornerstoneTools });
            } catch (err) {
                console.error('Failed to load Cornerstone libraries in MPRViewport:', err);
                setError('Failed to load required viewer libraries');
            }
        };
        loadLibraries();
    }, []);

    useEffect(() => {
        if (!libraries || runningRef.current || !imageIds || imageIds.length === 0) return;
        runningRef.current = true;

        const { cornerstone, cornerstoneTools } = libraries;
        const {
            Enums: csEnums,
            RenderingEngine,
            setVolumesForViewports,
        } = cornerstone;

        const {
            Enums: csToolsEnums,
            ToolGroupManager,
            CrosshairsTool,
            ZoomTool,
            PanTool,
            StackScrollMouseWheelTool,
        } = cornerstoneTools;

        const setupMPR = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const renderingEngineId = 'mprRenderingEngine';
                const toolGroupId = 'mprToolGroup';
                // Unique volume ID per series to avoid collisions/caching issues
                const volumeName = `mprVolume-${seriesInstanceUID}`; 
                const volumeId = `cornerstoneStreamingImageVolume:${volumeName}`;

                // 1. Initialize Rendering Engine
                const renderingEngine = new RenderingEngine(renderingEngineId);
                renderingEngineRef.current = renderingEngine;

                // 2. Define Viewports (2x2 Grid)
                const viewportInput = [
                    {
                        viewportId: 'viewport-axial',
                        type: csEnums.ViewportType.ORTHOGRAPHIC,
                        element: elementRef1.current,
                        defaultOptions: {
                            orientation: csEnums.OrientationAxis.AXIAL,
                            background: [0, 0, 0],
                        },
                    },
                    {
                        viewportId: 'viewport-sagittal',
                        type: csEnums.ViewportType.ORTHOGRAPHIC,
                        element: elementRef2.current,
                        defaultOptions: {
                            orientation: csEnums.OrientationAxis.SAGITTAL,
                            background: [0, 0, 0],
                        },
                    },
                    {
                        viewportId: 'viewport-coronal',
                        type: csEnums.ViewportType.ORTHOGRAPHIC,
                        element: elementRef3.current,
                        defaultOptions: {
                            orientation: csEnums.OrientationAxis.CORONAL,
                            background: [0, 0, 0],
                        },
                    },
                    {
                        viewportId: 'viewport-3d',
                        type: csEnums.ViewportType.VOLUME_3D,
                        element: elementRef4.current,
                        defaultOptions: {
                            orientation: csEnums.OrientationAxis.CORONAL,
                            background: [0.1, 0.1, 0.1], 
                        },
                    },
                ];

                renderingEngine.setViewports(viewportInput);

                // 3. Define ToolGroup
                let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
                if (toolGroup) {
                    ToolGroupManager.destroyToolGroup(toolGroupId);
                }
                toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
                toolGroupRef.current = toolGroup;

                // Add tools
                [CrosshairsTool, ZoomTool, PanTool, StackScrollMouseWheelTool].forEach(tool => {
                    try {
                        cornerstoneTools.addTool(tool);
                    } catch (e) {
                        // Tool might already be added
                    }
                });

                toolGroup.addTool(CrosshairsTool.toolName);
                toolGroup.addTool(ZoomTool.toolName);
                toolGroup.addTool(PanTool.toolName);
                toolGroup.addTool(StackScrollMouseWheelTool.toolName);

                // Set Tool States
                toolGroup.setToolActive(CrosshairsTool.toolName, {
                    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
                });
                toolGroup.setToolActive(ZoomTool.toolName, {
                    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
                });
                toolGroup.setToolActive(PanTool.toolName, {
                    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }],
                });
                toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

                // Add Viewports to ToolGroup
                toolGroup.addViewport('viewport-axial', renderingEngineId);
                toolGroup.addViewport('viewport-sagittal', renderingEngineId);
                toolGroup.addViewport('viewport-coronal', renderingEngineId);
                // 3D viewport might use different tools (e.g. trackball rotate), skipping for now from this group or adding specific tools later

                // 4. Create and Load Volume using Helper
                const volume = await createVolumeFromImages(volumeId, imageIds);

                // 5. Set Volume for Viewports
                await volume.load();
                
                await setVolumesForViewports(
                    renderingEngine,
                    [{ volumeId }],
                    ['viewport-axial', 'viewport-sagittal', 'viewport-coronal', 'viewport-3d']
                );

                // 6. Render
                renderingEngine.render();
                
                // 7. Initial Crosshair Setup (Optional: center it)
                // const viewport = renderingEngine.getViewport('viewport-axial');
                // ... logic to reset camera if needed

                setIsLoading(false);

            } catch (error) {
                console.error('MPR Setup Error:', error);
                setError(error.message || 'Failed to initialize MPR');
                setIsLoading(false);
            }
        };

        setupMPR();

        return () => {
            runningRef.current = false;
            // Cleanup
            if (renderingEngineRef.current) {
                renderingEngineRef.current.destroy();
            }
            if (toolGroupRef.current) {
                const { ToolGroupManager } = libraries.cornerstoneTools;
                ToolGroupManager.destroyToolGroup('mprToolGroup');
            }
            // Optional: cleanup volume from cache if you want to free memory immediately
            // cornerstone.cache.removeVolumeLoadObject(volumeId); 
        };
    }, [libraries, imageIds, seriesInstanceUID]);


    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center text-red-500 bg-black">
                <div className="text-center">
                    <div className="text-4xl mb-2">⚠️</div>
                    <div>MPR Error: {error}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-black grid grid-cols-2 grid-rows-2 gap-1 p-1">
            {isLoading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 text-white">
                    <div className="text-center">
                        <div className="text-4xl animate-pulse mb-2">🔄</div>
                        <div>Building 3D Volume...</div>
                    </div>
                </div>
            )}
            {/* Viewports */}
            <div className="relative w-full h-full border border-gray-700">
                <div ref={elementRef1} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
                <div className="absolute top-2 left-2 text-yellow-400 font-bold text-sm pointer-events-none">AXIAL</div>
            </div>

            <div className="relative w-full h-full border border-gray-700">
                <div ref={elementRef2} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
                <div className="absolute top-2 left-2 text-blue-400 font-bold text-sm pointer-events-none">SAGITTAL</div>
            </div>

            <div className="relative w-full h-full border border-gray-700">
                <div ref={elementRef3} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
                <div className="absolute top-2 left-2 text-green-400 font-bold text-sm pointer-events-none">CORONAL</div>
            </div>

            <div className="relative w-full h-full border border-gray-700">
                <div ref={elementRef4} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
                <div className="absolute top-2 left-2 text-purple-400 font-bold text-sm pointer-events-none">3D</div>
            </div>
        </div>
    );
}
