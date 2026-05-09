import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchStudyDetails, fetchStudySeries } from '../../services/studyService';
import wadoService from '../../services/wadoService';

/**
 * Simple DICOM Viewer - JPEG Based
 * Uses WADO-RS /rendered endpoint to display pre-rendered JPEG images
 * No Cornerstone.js dependency, no DICOM codecs required
 */
export default function DicomViewerSimple() {
    const { studyId } = useParams();
    const navigate = useNavigate();

    // State
    const [study, setStudy] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [activeSeries, setActiveSeries] = useState(0);
    const [activeInstance, setActiveInstance] = useState(0);
    const [showSeries, setShowSeries] = useState(true);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    // Load study data
    useEffect(() => {
        const loadStudy = async () => {
            try {
                setIsLoading(true);
                setLoadError(null);
                console.log('[DicomViewerSimple] Loading study:', studyId);

                const { study: serviceStudy, source } = await fetchStudyDetails(studyId);

                if (!serviceStudy) {
                    throw new Error('Study not found');
                }

                console.log(`[DicomViewerSimple] Study loaded from ${source}:`, studyId);

                // Fetch series if not included
                let seriesData = serviceStudy.series || [];
                if (seriesData.length === 0) {
                    console.log('[DicomViewerSimple] Fetching series separately');
                    const studyUID = serviceStudy.study_instance_uid || serviceStudy.id;
                    const result = await fetchStudySeries(studyUID);
                    seriesData = result.series || [];
                }

                const foundStudy = {
                    id: serviceStudy.study_instance_uid || serviceStudy.id,
                    patientName: serviceStudy.patient_name || serviceStudy.patientName || 'Unknown',
                    studyDescription: serviceStudy.study_description || serviceStudy.studyDescription || 'No Description',
                    studyDate: serviceStudy.study_date || serviceStudy.studyDate || '',
                    numberOfSeries: seriesData.length,
                    numberOfInstances: seriesData.reduce((sum, s) => sum + (s.instances?.length || s.number_of_instances || 0), 0),
                    series: seriesData.map(s => ({
                        seriesInstanceUID: s.series_instance_uid || s.seriesInstanceUID,
                        seriesDescription: s.series_description || s.seriesDescription || 'No Description',
                        seriesNumber: s.series_number || s.seriesNumber || 0,
                        modality: s.modality || 'Unknown',
                        numberOfInstances: s.number_of_instances || s.instances?.length || 0,
                        instances: s.instances || []
                    }))
                };

                setStudy(foundStudy);
                console.log('[DicomViewerSimple] Study loaded successfully:', foundStudy);
            } catch (error) {
                console.error('[DicomViewerSimple] Error loading study:', error);
                setLoadError({
                    message: error.message || 'Failed to load study',
                    studyId: studyId,
                    suggestion: 'Please check if the study exists or try again later.'
                });
            } finally {
                setIsLoading(false);
            }
            setZoom(1);
            setPan({ x: 0, y: 0 });
        };

        const handleNextImage = () => {
            const currentSeries = study?.series[activeSeries];
            if (currentSeries && activeInstance < currentSeries.instances.length - 1) {
                setActiveInstance(activeInstance + 1);
            }
        };

        const handlePrevImage = () => {
            if (activeInstance > 0) {
                setActiveInstance(activeInstance - 1);
            }
        };

        const handleZoomIn = () => setZoom(zoom * 1.2);
        const handleZoomOut = () => setZoom(zoom / 1.2);
        const handleResetView = () => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
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
                        <div className="text-sm text-gray-300 mb-2">{loadError.message}</div>
                        <div className="text-sm text-gray-400 mb-6">{loadError.suggestion}</div>
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
                        </div>
                    </div>
                </div>
            );
        }

        if (!study) return null;

        const currentSeries = study.series[activeSeries];
        const imageUrl = getCurrentImageUrl();

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
                                <p className="text-xs text-gray-400">{study.studyDescription} • {study.studyDate}</p>
                            </div>
                            <div className="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded border border-green-600/30">
                                Simple Viewer (JPEG)
                            </div>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-gray-400">
                            <span>Series: {study.numberOfSeries}</span>
                            <span>•</span>
                            <span>Images: {study.numberOfInstances}</span>
                            <span>•</span>
                            <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
                        </div>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={handleZoomIn}
                            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg"
                            title="Zoom In"
                        >
                            🔍+
                        </button>
                        <button
                            onClick={handleZoomOut}
                            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg"
                            title="Zoom Out"
                        >
                            🔍-
                        </button>
                        <button
                            onClick={handleResetView}
                            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg"
                            title="Reset View"
                        >
                            ↺ Reset
                        </button>
                        <div className="flex-1" />
                        <button
                            onClick={handlePrevImage}
                            disabled={activeInstance === 0}
                            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Previous Image"
                        >
                            ← Prev
                        </button>
                        <span className="text-gray-400 text-sm">
                            {activeInstance + 1} / {currentSeries?.instances?.length || 0}
                        </span>
                        <button
                            onClick={handleNextImage}
                            disabled={!currentSeries || activeInstance >= (currentSeries.instances?.length || 0) - 1}
                            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Next Image"
                        >
                            Next →
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 relative overflow-hidden flex">
                    {/* Series Panel */}
                    {showSeries && (
                        <div className="w-64 bg-gray-800 border-r border-gray-700 overflow-y-auto">
                            <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                                <h3 className="text-white font-semibold">Series</h3>
                                <button
                                    onClick={() => setShowSeries(false)}
                                    className="text-gray-400 hover:text-white"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="p-2">
                                {study.series.map((series, index) => (
                                    <button
                                        key={series.seriesInstanceUID}
                                        onClick={() => handleSeriesSelect(index)}
                                        className={`w-full text-left p-3 mb-2 rounded-lg transition-colors ${activeSeries === index
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                            }`}
                                    >
                                        <div className="font-semibold text-sm">{series.seriesDescription}</div>
                                        <div className="text-xs mt-1 opacity-75">
                                            {series.modality} • {series.numberOfInstances} images
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Image Viewport */}
                    <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt={`Series ${activeSeries + 1}, Instance ${activeInstance + 1}`}
                                className="max-w-full max-h-full object-contain transition-transform"
                                style={{
                                    transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                                    transformOrigin: 'center'
                                }}
                                onError={(e) => {
                                    console.error('[DicomViewerSimple] Image load error:', e);
                                    e.target.alt = 'Failed to load image';
                                }}
                            />
                        ) : (
                            <div className="text-center text-gray-500">
                                <div className="text-6xl mb-4">📁</div>
                                <div className="text-xl mb-2">No images available</div>
                                <div className="text-sm">Select a series from the left panel</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="bg-gray-800 border-t border-gray-700 px-4 py-1.5">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                        <div className="flex items-center space-x-4">
                            {!showSeries && (
                                <button
                                    onClick={() => setShowSeries(true)}
                                    className="px-2 py-1 rounded hover:bg-gray-700"
                                >
                                    Show Series
                                </button>
                            )}
                            <span>Series: {activeSeries + 1}/{study.series.length}</span>
                        </div>
                        <div>Simple DICOM Viewer • WADO-RS</div>
                    </div>
                </div>
            </div>
        );
    }
