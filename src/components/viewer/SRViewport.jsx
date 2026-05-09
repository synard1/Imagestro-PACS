import React, { useState, useEffect } from 'react';
import {
    DocumentTextIcon,
    PrinterIcon,
    ArrowDownTrayIcon,
    ShieldCheckIcon
} from '@heroicons/react/24/outline';
import QRCode from 'qrcode';
import { reportService } from '../../services/reportService';
import { downloadReportPDF } from '../../services/pdfGenerator';
import DOMPurify from 'isomorphic-dompurify';

export default function SRViewport({
    displaySet,
    viewportIndex,
    isActive
}) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [qrCodeUrl, setQrCodeUrl] = useState(null);

    useEffect(() => {
        const loadReport = async () => {
            if (!displaySet || !displaySet.StudyInstanceUID) return;

            try {
                setLoading(true);
                // Try to fetch report from backend
                const result = await reportService.getReportsByStudy(displaySet.StudyInstanceUID);

                if (result.success && result.data && result.data.length > 0) {
                    // Use the most recent report
                    const reportData = result.data[0];
                    setReport(reportData);

                    // Generate QR code if signed
                    if (reportData.signature_data && reportData.signature_data.method === 'qrcode') {
                        const url = await QRCode.toDataURL(reportData.signature_data.qrData, {
                            width: 150,
                            margin: 1
                        });
                        setQrCodeUrl(url);
                    }
                } else {
                    setError('No report found for this study');
                }
            } catch (err) {
                console.error('Error loading report:', err);
                setError('Failed to load report');
            } finally {
                setLoading(false);
            }
        };

        loadReport();
    }, [displaySet]);

    const handlePrint = () => {
        window.print();
    };

    const handleDownload = () => {
        if (!report) return;

        const pdfData = {
            patientName: report.patient_name,
            patientId: report.patient_id,
            studyDate: report.created_at, // Approximation
            modality: report.modality,
            accessionNumber: report.accession_number,
            ...report.content,
            status: report.status
        };

        downloadReportPDF(pdfData, report.signature_data, `report_${report.patient_id}.pdf`);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full bg-black text-white">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                    <p>Loading Report...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full bg-black text-white">
                <div className="text-center text-red-400">
                    <DocumentTextIcon className="h-12 w-12 mx-auto mb-2" />
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="flex items-center justify-center h-full bg-black text-white">
                <p>No report available</p>
            </div>
        );
    }

    const { content, signature_data } = report;

    return (
        <div className={`h-full overflow-y-auto bg-white text-black p-8 ${isActive ? 'ring-2 ring-blue-500' : ''}`}>
            {/* Toolbar */}
            <div className="flex justify-end gap-2 mb-6 no-print">
                <button
                    onClick={handlePrint}
                    className="p-2 hover:bg-gray-100 rounded-full"
                    title="Print"
                >
                    <PrinterIcon className="h-5 w-5" />
                </button>
                <button
                    onClick={handleDownload}
                    className="p-2 hover:bg-gray-100 rounded-full"
                    title="Download PDF"
                >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                </button>
            </div>

            {/* Report Header */}
            <div className="border-b-2 border-black pb-4 mb-6">
                <h1 className="text-2xl font-bold mb-4 text-center">RADIOLOGY REPORT</h1>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p><strong>Patient Name:</strong> {report.patient_name}</p>
                        <p><strong>Patient ID:</strong> {report.patient_id}</p>
                        <p><strong>DOB:</strong> {report.patient_dob || 'N/A'}</p>
                    </div>
                    <div>
                        <p><strong>Accession:</strong> {report.accession_number}</p>
                        <p><strong>Modality:</strong> {report.modality}</p>
                        <p><strong>Date:</strong> {new Date(report.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
            </div>

            {/* Report Content */}
            <div className="space-y-6">
                {Object.entries(content).map(([key, value]) => {
                    // Skip internal keys or empty values
                    if (!value || key.startsWith('_')) return null;

                    // Format key as title (e.g., clinical_history -> Clinical History)
                    const title = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                    return (
                        <div key={key}>
                            <h3 className="font-bold uppercase mb-1">{title}</h3>
                            <div className="whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }} />
                        </div>
                    );
                })}
            </div>

            {/* Signature Section */}
            <div className="mt-12 pt-6 border-t border-black">
                {signature_data ? (
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-green-700 font-bold mb-2">
                                <ShieldCheckIcon className="h-5 w-5" />
                                DIGITALLY SIGNED
                            </div>
                            <p className="font-bold">{signature_data.name}</p>
                            <p className="text-sm text-gray-600">{signature_data.credentials}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Signed: {new Date(signature_data.date).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 font-mono">
                                ID: {signature_data.verificationHash}
                            </p>
                        </div>
                        {qrCodeUrl && (
                            <img src={qrCodeUrl} alt="Signature QR" className="w-24 h-24" />
                        )}
                    </div>
                ) : (
                    <div className="text-gray-500 italic">
                        Report Status: {report.status.toUpperCase()} (Unsigned)
                    </div>
                )}
            </div>
        </div>
    );
}
