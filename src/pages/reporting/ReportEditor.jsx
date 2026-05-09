import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DocumentTextIcon,
  ArrowLeftIcon,
  CheckIcon,
  XMarkIcon,
  PrinterIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import QRCode from 'qrcode';
import ENHANCED_STUDIES from '../../data/studiesEnhanced.json';
import MOCK_STUDIES from '../../data/studies.json';
import REPORT_TEMPLATES from '../../data/reportTemplates.json';
import pdfGenerator from '../../services/reporting/pdfGenerator';
import { downloadReportPDF, previewReportPDF } from '../../services/pdfGenerator';
import DigitalSignature from '../../components/reporting/DigitalSignature';
import RichTextEditor from '../../components/reporting/RichTextEditor';
import { verifyPassword } from '../../services/authService';
import { fetchStudyDetails } from '../../services/studyService';
import { reportService } from '../../services/reportService';
import { useAuth } from '../../hooks/useAuth';

export default function ReportEditor() {
  const { studyId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [study, setStudy] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [reportData, setReportData] = useState({});
  const [status, setStatus] = useState('draft'); // draft, preliminary, final
  const [showTemplateSelector, setShowTemplateSelector] = useState(true);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signature, setSignature] = useState(null);
  const [addendums, setAddendums] = useState([]);
  const [showAddendumModal, setShowAddendumModal] = useState(false);
  const [addendumText, setAddendumText] = useState('');
  const [reportId, setReportId] = useState(null);
  const { currentUser } = useAuth() || {};

  // Load study data
  useEffect(() => {
    const loadStudyAndReport = async () => {
      // 1. Load Study Details
      const { study: serviceStudy, source } = await fetchStudyDetails(studyId);

      let foundStudy = null;

      if (serviceStudy) {
        console.log(`[ReportEditor] Study loaded from ${source}:`, studyId);
        // Normalize format
        foundStudy = {
          id: serviceStudy.study_instance_uid || serviceStudy.id,
          studyInstanceUID: serviceStudy.study_instance_uid || serviceStudy.id,
          patientName: serviceStudy.patient_name || serviceStudy.patientName,
          patientId: serviceStudy.patient_id || serviceStudy.patientId,
          accessionNumber: serviceStudy.accession_number || serviceStudy.accessionNumber || 'N/A',
          studyDescription: serviceStudy.study_description || serviceStudy.studyDescription || 'No Description',
          studyDate: serviceStudy.study_date || serviceStudy.studyDate,
          studyTime: serviceStudy.study_time || serviceStudy.studyTime || '',
          modality: serviceStudy.modality,
          status: serviceStudy.status || 'completed',
          numberOfSeries: serviceStudy.number_of_series || serviceStudy.numberOfSeries || 0,
          numberOfInstances: serviceStudy.number_of_instances || serviceStudy.numberOfInstances || 0
        };
      } else {
        // Fallback to JSON files
        foundStudy = ENHANCED_STUDIES.find(s =>
          s.id?.toString() === studyId ||
          s.studyInstanceUID === studyId
        );

        if (!foundStudy) {
          const mockStudy = MOCK_STUDIES.find(s =>
            s.studyInstanceUID === studyId ||
            s.id?.toString() === studyId
          );

          if (mockStudy) {
            foundStudy = {
              id: mockStudy.studyInstanceUID || mockStudy.id,
              studyInstanceUID: mockStudy.studyInstanceUID || mockStudy.id,
              patientName: mockStudy.patient?.name,
              patientId: mockStudy.patient?.mrn,
              accessionNumber: mockStudy.accessionNumber,
              studyDescription: mockStudy.description,
              studyDate: mockStudy.studyDate,
              studyTime: mockStudy.studyTime || '',
              modality: mockStudy.modality,
              status: mockStudy.status || 'completed',
              numberOfSeries: mockStudy.series?.length || 0,
              numberOfInstances: mockStudy.series?.reduce((sum, s) => sum + (s.instanceCount || 0), 0) || 0
            };
          }
        }
      }

      if (foundStudy) {
        setStudy(foundStudy);

        // 2. Check for existing report
        try {
          const reportResult = await reportService.getReportsByStudy(studyId);
          if (reportResult.success && reportResult.data && reportResult.data.length > 0) {
            // Use the most recent report
            const existingReport = reportResult.data[0];
            console.log('[ReportEditor] Found existing report:', existingReport);

            setReportId(existingReport.report_id);
            setReportData(existingReport.content || {});
            setStatus(existingReport.status || 'draft');
            setShowTemplateSelector(false);

            // If report has signature, load it
            if (existingReport.signature_data) {
              setSignature({
                ...existingReport.signature_data,
                verificationHash: existingReport.signature_id,
                method: existingReport.signature_method
              });
            }
          } else {
            // No existing report, initialize with template
            const matchingTemplate = REPORT_TEMPLATES.find(
              t => t.modality === foundStudy.modality || t.modality === 'ALL'
            );
            if (matchingTemplate) {
              setSelectedTemplate(matchingTemplate);
              initializeReportData(matchingTemplate);
              setShowTemplateSelector(false);
            }
          }
        } catch (error) {
          console.error('[ReportEditor] Error checking for reports:', error);
          // Fallback to template initialization on error
          const matchingTemplate = REPORT_TEMPLATES.find(
            t => t.modality === foundStudy.modality || t.modality === 'ALL'
          );
          if (matchingTemplate) {
            setSelectedTemplate(matchingTemplate);
            initializeReportData(matchingTemplate);
            setShowTemplateSelector(false);
          }
        }
      } else {
        console.error('[ReportEditor] Study not found:', studyId);
      }
    };

    loadStudyAndReport();
  }, [studyId]);

  const initializeReportData = (template) => {
    const data = {};
    template.sections.forEach(section => {
      data[section.id] = section.defaultContent || '';
    });
    setReportData(data);
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    initializeReportData(template);
    setShowTemplateSelector(false);
  };

  const handleSectionChange = (sectionId, value) => {
    // Prevent editing if report is signed (final status)
    if (status === 'final' && signature) {
      alert('⚠️ Cannot edit signed report!\n\nThis report has been digitally signed and is legally binding. Any modification would invalidate the signature.');
      return;
    }

    setReportData(prev => ({
      ...prev,
      [sectionId]: value
    }));
  };

  const handleSave = async (newStatus = 'draft') => {
    // Prevent saving if report is signed
    if (status === 'final' && signature) {
      alert('⚠️ Cannot modify signed report!\n\nThis report has been digitally signed. To make changes, you must:\n1. Revoke the current signature (requires authorization)\n2. Make your changes\n3. Sign again');
      return;
    }

    // Prevent downgrading status
    if (status === 'final' && newStatus !== 'final') {
      alert('⚠️ Cannot change status of signed report!');
      return;
    }

    if (status === 'preliminary' && newStatus === 'draft') {
      const confirm = window.confirm('Are you sure you want to change status from Preliminary back to Draft?');
      if (!confirm) return;
    }

    try {
      const reportPayload = {
        study_id: studyId,
        patient_id: study.patientId,
        patient_name: study.patientName,
        modality: study.modality,
        accession_number: study.accessionNumber,
        content: reportData,
        status: newStatus,
        created_by: currentUser?.username || 'unknown',
        template_id: selectedTemplate?.id
      };

      let result;
      if (reportId) {
        result = await reportService.updateReport(reportId, reportPayload);
      } else {
        result = await reportService.createReport(reportPayload);
      }

      if (result.success) {
        setStatus(newStatus);
        if (result.data && result.data.report_id) {
          setReportId(result.data.report_id);
        }
        console.log('Report saved:', result.data);
        alert(`Report saved as ${newStatus}`);
      } else {
        console.error('Failed to save report:', result.error);
        alert(`Failed to save report: ${result.error}`);
      }
    } catch (error) {
      console.error('Error saving report:', error);
      alert('An error occurred while saving the report.');
    }
  };

  const handlePrint = async () => {
    try {
      // Generate QR code image if signature uses QR code method
      let qrCodeDataURL = null;
      if (signature && signature.method === 'qrcode' && signature.qrData) {
        qrCodeDataURL = await QRCode.toDataURL(signature.qrData, {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
      }

      // Generate HTML content for print
      const printContent = generatePrintHTML(qrCodeDataURL);

      // Open new window
      const printWindow = window.open('', '_blank', 'width=800,height=600');

      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();

        // Wait for content to load, then print
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
            // Close window after printing (optional)
            // printWindow.close();
          }, 250);
        };
      } else {
        alert('Please allow pop-ups to print the report');
      }
    } catch (error) {
      console.error('Print error:', error);
      alert('Failed to generate print preview. Please try again.');
    }
  };

  const handleExportPDF = async () => {
    try {
      console.log('[ReportEditor] Exporting PDF...');

      // Prepare report data
      const pdfReportData = {
        patientName: study?.patientName || 'Unknown',
        patientId: study?.patientId || 'N/A',
        patientDob: study?.patientDob || study?.patientBirthDate || 'N/A',
        patientSex: study?.patientSex || 'N/A',
        studyDate: study?.studyDate || new Date().toISOString().split('T')[0],
        modality: study?.modality || 'N/A',
        accessionNumber: study?.accessionNumber || 'N/A',
        clinicalHistory: reportData.clinicalHistory || reportData.clinical_history || '',
        technique: reportData.technique || '',
        comparison: reportData.comparison || '',
        findings: reportData.findings || '',
        impression: reportData.impression || '',
        recommendation: reportData.recommendation || '',
        radiologist: 'Dr. Radiologist', // TODO: Get from auth context
        status: status
      };

      // Prepare signature data if exists
      let signatureData = null;
      if (signature) {
        // Generate QR code if needed
        let qrCodeDataURL = null;
        if (signature.method === 'qrcode' && signature.qrData) {
          qrCodeDataURL = await QRCode.toDataURL(signature.qrData, {
            width: 200,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });
        }

        signatureData = {
          qrCode: qrCodeDataURL || signature.qrCode,
          signatureImage: signature.signatureImage
        };
      }

      // Generate filename
      const filename = `report_${study?.patientId || 'unknown'}_${Date.now()}.pdf`;

      // Download PDF
      downloadReportPDF(pdfReportData, signatureData, filename);

      alert('PDF exported successfully!');
    } catch (error) {
      console.error('[ReportEditor] PDF export failed:', error);
      alert('Failed to export PDF. Please try again.');
    }
  };

  const handlePreviewPDF = async () => {
    try {
      console.log('[ReportEditor] Previewing PDF...');

      // Prepare report data (same as export)
      const pdfReportData = {
        patientName: study?.patientName || 'Unknown',
        patientId: study?.patientId || 'N/A',
        patientDob: study?.patientDob || study?.patientBirthDate || 'N/A',
        patientSex: study?.patientSex || 'N/A',
        studyDate: study?.studyDate || new Date().toISOString().split('T')[0],
        modality: study?.modality || 'N/A',
        accessionNumber: study?.accessionNumber || 'N/A',
        clinicalHistory: reportData.clinicalHistory || reportData.clinical_history || '',
        technique: reportData.technique || '',
        comparison: reportData.comparison || '',
        findings: reportData.findings || '',
        impression: reportData.impression || '',
        recommendation: reportData.recommendation || '',
        radiologist: 'Dr. Radiologist',
        status: status
      };

      // Prepare signature data if exists
      let signatureData = null;
      if (signature) {
        let qrCodeDataURL = null;
        if (signature.method === 'qrcode' && signature.qrData) {
          qrCodeDataURL = await QRCode.toDataURL(signature.qrData, {
            width: 200,
            margin: 2
          });
        }

        signatureData = {
          qrCode: qrCodeDataURL || signature.qrCode,
          signatureImage: signature.signatureImage
        };
      }

      // Preview PDF in new window
      previewReportPDF(pdfReportData, signatureData);
    } catch (error) {
      console.error('[ReportEditor] PDF preview failed:', error);
      alert('Failed to preview PDF. Please try again.');
    }
  };

  const generatePrintHTML = (qrCodeDataURL = null) => {
    // Build sections HTML
    let sectionsHTML = '';
    if (selectedTemplate) {
      selectedTemplate.sections.forEach(section => {
        sectionsHTML += `
          <div class="report-section">
            <div class="section-title">${section.title}</div>
            <div class="section-content">`;

        if (section.subsections) {
          section.subsections.forEach((subsection, idx) => {
            const content = reportData[`${section.id}_${idx}`] || '[No data entered]';
            sectionsHTML += `
              <div class="subsection">
                <div class="subsection-title">${subsection}:</div>
                <div class="subsection-content">${content}</div>
              </div>`;
          });
        } else {
          const content = reportData[section.id] || '[No data entered]';
          sectionsHTML += `<div>${content}</div>`;
        }

        sectionsHTML += `
            </div>
          </div>`;
      });
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${selectedTemplate?.name || 'Radiology Report'} - ${study?.patientName}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #000;
      background: #fff;
      padding: 20px;
    }
    
    .report-header {
      border-bottom: 3px solid #000;
      padding-bottom: 15px;
      margin-bottom: 25px;
    }
    
    .report-title {
      font-size: 22pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 20px;
      text-transform: uppercase;
    }
    
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    
    .info-table td {
      padding: 6px 10px;
      border: 1px solid #333;
    }
    
    .info-label {
      font-weight: bold;
      width: 35%;
      background: #f0f0f0;
    }
    
    .report-section {
      margin-bottom: 25px;
      page-break-inside: avoid;
    }
    
    .section-title {
      font-size: 14pt;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 10px;
      border-bottom: 2px solid #000;
      padding-bottom: 5px;
    }
    
    .section-content {
      margin-left: 15px;
      margin-top: 10px;
      white-space: pre-wrap;
    }
    
    .subsection {
      margin-bottom: 15px;
    }
    
    .subsection-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .subsection-content {
      margin-left: 10px;
      white-space: pre-wrap;
    }
    
    .report-footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #000;
    }
    
    .signature-section {
      margin-top: 40px;
    }
    
    .signature-line {
      border-top: 1px solid #000;
      width: 300px;
      margin-top: 50px;
    }
    
    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="report-title">${selectedTemplate?.name || 'RADIOLOGY REPORT'}</div>
    <table class="info-table">
      <tr>
        <td class="info-label">Patient Name</td>
        <td>${study?.patientName || 'N/A'}</td>
      </tr>
      <tr>
        <td class="info-label">Patient ID</td>
        <td>${study?.patientId || 'N/A'}</td>
      </tr>
      <tr>
        <td class="info-label">Date of Birth</td>
        <td>${study?.patientBirthDate || 'N/A'}</td>
      </tr>
      <tr>
        <td class="info-label">Study Date</td>
        <td>${study?.studyDate || 'N/A'}</td>
      </tr>
      <tr>
        <td class="info-label">Modality</td>
        <td>${study?.modality || 'N/A'}</td>
      </tr>
      <tr>
        <td class="info-label">Accession Number</td>
        <td>${study?.accessionNumber || 'N/A'}</td>
      </tr>
      <tr>
        <td class="info-label">Study Description</td>
        <td>${study?.studyDescription || 'N/A'}</td>
      </tr>
      <tr>
        <td class="info-label">Report Status</td>
        <td><strong>${status.toUpperCase()}</strong></td>
      </tr>
    </table>
  </div>

  <div class="report-body">
    ${sectionsHTML}
  </div>

  <div class="report-footer">
    <table class="info-table">
      <tr>
        <td class="info-label">Report Date & Time</td>
        <td>${new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}</td>
      </tr>
      <tr>
        <td class="info-label">Reporting Radiologist</td>
        <td>Dr. Admin</td>
      </tr>
      <tr>
        <td class="info-label">License Number</td>
        <td>#12345</td>
      </tr>
      <tr>
        <td class="info-label">Institution</td>
        <td>${study?.institution || 'General Hospital Radiology Department'}</td>
      </tr>
    </table>
    
    ${signature ? `
    <div class="signature-section" style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #000;">
      <table class="info-table">
        <tr>
          <td class="info-label" style="background: #e8f5e9;">DIGITALLY SIGNED</td>
          <td style="background: #e8f5e9;"><strong>✓ VERIFIED</strong></td>
        </tr>
        <tr>
          <td class="info-label">Signed By</td>
          <td><strong>${signature.name}</strong> (${signature.credentials || 'MD, FRCR'})</td>
        </tr>
        <tr>
          <td class="info-label">License Number</td>
          <td>${signature.licenseNumber || '#12345'}</td>
        </tr>
        <tr>
          <td class="info-label">Signature Date & Time</td>
          <td>${new Date(signature.date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })}</td>
        </tr>
        <tr>
          <td class="info-label">Signature Method</td>
          <td>${signature.method ? signature.method.toUpperCase() : 'PASSWORD'}</td>
        </tr>
        ${signature.verificationHash ? `
        <tr>
          <td class="info-label">Verification Hash</td>
          <td><code style="font-family: monospace; background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">${signature.verificationHash}</code></td>
        </tr>
        ` : ''}
      </table>
      ${signature.signatureImage ? `
      <div style="margin-top: 20px;">
        <div style="font-weight: bold; margin-bottom: 10px;">Handwritten Signature:</div>
        <div style="border: 1px solid #ccc; padding: 10px; background: white; display: inline-block;">
          <img src="${signature.signatureImage}" style="height: 60px; max-width: 300px;" alt="Signature" />
        </div>
      </div>
      ` : ''}
      ${signature.method === 'qrcode' && qrCodeDataURL ? `
      <div style="margin-top: 20px;">
        <div style="font-weight: bold; margin-bottom: 10px;">QR Code Verification:</div>
        <div style="border: 2px solid #333; padding: 15px; background: white; display: inline-block; text-align: center;">
          <div style="margin-bottom: 10px;">
            <img src="${qrCodeDataURL}" style="width: 150px; height: 150px; display: block; margin: 0 auto;" alt="QR Code" />
          </div>
          <div style="font-size: 11px; color: #666; margin-top: 10px;">
            <strong>Scan to verify signature authenticity</strong>
          </div>
          <div style="font-size: 10px; color: #999; margin-top: 5px;">
            Verification Hash: <code style="font-family: monospace; background: #f5f5f5; padding: 2px 4px;">${signature.verificationHash}</code>
          </div>
        </div>
        <div style="margin-top: 10px; font-size: 10px; color: #666; max-width: 400px;">
          <strong>QR Code Contains:</strong>
          <ul style="margin: 5px 0; padding-left: 20px; line-height: 1.6;">
            <li>Radiologist: ${signature.name} (${signature.licenseNumber})</li>
            <li>Patient: ${study?.patientName} (${study?.patientId})</li>
            <li>Study Date: ${study?.studyDate}</li>
            <li>Signature Date: ${new Date(signature.date).toLocaleString()}</li>
            <li>Verification Hash: ${signature.verificationHash}</li>
          </ul>
        </div>
      </div>
      ` : ''}
      <div style="margin-top: 20px; padding: 10px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px;">
        <strong>⚠️ Legal Notice:</strong> This report has been digitally signed and is legally binding. 
        Any modification after signing will invalidate the signature.
      </div>
    </div>
    ` : `
    <div class="signature-section" style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc;">
      <div style="color: #666; font-style: italic;">
        <strong>Digital Signature:</strong> Not yet signed
      </div>
      <div style="margin-top: 10px; color: #999; font-size: 12px;">
        This report is in ${status.toUpperCase()} status and has not been digitally signed.
      </div>
    </div>
    `}
  </div>
</body>
</html>
    `;
  };

  // handleExportPDF moved to line 209 (new implementation with jsPDF)

  const handleSignReport = () => {
    if (status === 'final') {
      alert('This report is already finalized and signed');
      return;
    }

    if (status === 'draft') {
      alert('Please save as Preliminary before signing');
      return;
    }

    setShowSignatureModal(true);
  };

  const handleSignatureComplete = async (signatureData) => {
    try {
      // Ensure we have a report ID
      if (!reportId) {
        alert('Error: Report ID not found. Please save the report first.');
        return;
      }

      // Use reportService to finalize the report
      const result = await reportService.finalizeReport(
        reportId,
        signatureData,
        currentUser?.username || 'unknown'
      );

      if (result.success) {
        console.log('[ReportEditor] Report finalized:', result.data);
        setSignature(signatureData);
        setStatus('final');
        setShowSignatureModal(false);
        alert('Report has been digitally signed and finalized!');
      } else {
        console.error('[ReportEditor] Failed to finalize report:', result.error);
        alert(`Failed to finalize report: ${result.error}`);
      }
    } catch (error) {
      console.error('[ReportEditor] Error finalizing report:', error);
      alert('An error occurred while finalizing the report.');
    }
  };

  const handleSignatureCancel = () => {
    setShowSignatureModal(false);
  };

  const handleAddAddendum = () => {
    if (!addendumText.trim()) {
      alert('Please enter addendum text');
      return;
    }

    const newAddendum = {
      id: Date.now(),
      text: addendumText,
      author: 'Dr. Admin',
      date: new Date().toISOString(),
      reason: 'Correction/Addition to signed report'
    };

    setAddendums([...addendums, newAddendum]);
    setAddendumText('');
    setShowAddendumModal(false);

    alert('✅ Addendum added successfully!\n\nThe original signed report remains unchanged. This addendum will be appended to the report.');
  };

  const handleRevokeSignature = async () => {
    const password = prompt('⚠️ REVOKE SIGNATURE\n\nThis action requires authorization.\nEnter your password to revoke the signature:');

    if (!password) {
      return; // User cancelled
    }

    try {
      // Verify password with backend auth
      const isValid = await verifyPassword(password);

      if (!isValid) {
        alert('❌ Invalid password. Signature revocation cancelled.');
        return;
      }

      const reason = prompt('Please provide a reason for revoking the signature:');
      if (!reason || !reason.trim()) {
        alert('❌ Reason is required. Signature revocation cancelled.');
        return;
      }

      const confirm = window.confirm(
        '⚠️ FINAL CONFIRMATION\n\n' +
        'Are you sure you want to revoke this signature?\n\n' +
        'This action will:\n' +
        '• Invalidate the current signature\n' +
        '• Change status back to Preliminary\n' +
        '• Allow editing the report\n' +
        '• Be logged in audit trail\n\n' +
        'The report will need to be signed again after editing.'
      );

      if (!confirm) {
        return;
      }

      // Revoke signature in storage system
      const { revokeSignatureRecord } = await import('../../services/signatureStorageService');

      if (signature?.verificationHash) {
        try {
          const result = await revokeSignatureRecord(
            signature.verificationHash,
            'Dr. Admin', // TODO: Get from auth context
            reason
          );

          if (result.success) {
            console.log(`[ReportEditor] Signature revoked in ${result.source}:`, signature.verificationHash);
          } else {
            console.warn('[ReportEditor] Failed to revoke signature in storage:', result.message);
          }
        } catch (error) {
          console.error('[ReportEditor] Error revoking signature:', error);
        }
      }

      // Log revocation
      const revocationLog = {
        revokedBy: 'Dr. Admin',
        revokedAt: new Date().toISOString(),
        reason: reason,
        originalSignature: signature
      };

      console.log('Signature revoked:', revocationLog);

      // Add revocation as addendum
      const revocationAddendum = {
        id: Date.now(),
        text: `SIGNATURE REVOKED\n\nReason: ${reason}\nRevoked by: Dr. Admin\nRevoked at: ${new Date().toLocaleString()}`,
        author: 'System',
        date: new Date().toISOString(),
        reason: 'Signature Revocation'
      };

      setAddendums([...addendums, revocationAddendum]);
      setSignature(null);
      setStatus('preliminary');

      alert('✅ Signature revoked successfully!\n\nStatus changed to Preliminary. You can now edit the report.\n\nPlease make your corrections and sign again.');

    } catch (error) {
      console.error('Password verification error:', error);
      alert('❌ Password verification failed.\n\n' + error.message + '\n\nPlease try again or contact system administrator.');
    }
  };

  if (!study) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <div className="text-xl mb-2">Study not found</div>
          <button
            onClick={() => navigate('/studies')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Studies
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 no-print">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(`/study/${studyId}`)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Report Editor</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {study.patientName} • {study.studyDescription}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1.5 text-sm font-medium rounded-lg flex items-center gap-2 ${status === 'final' ? 'bg-green-100 text-green-800' :
                  status === 'preliminary' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                  {status === 'final' && <ShieldCheckIcon className="h-4 w-4" />}
                  {status.toUpperCase()}
                  {signature && status === 'final' && (
                    <span className="text-xs">• Signed</span>
                  )}
                </span>
              </div>

              {/* Action Buttons */}
              <button
                onClick={handlePrint}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                title="Print"
              >
                <PrinterIcon className="h-5 w-5" />
              </button>

              <button
                onClick={handlePreviewPDF}
                className="p-2 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50"
                title="Preview PDF"
              >
                <DocumentTextIcon className="h-5 w-5" />
              </button>

              <button
                onClick={handleExportPDF}
                className="p-2 border border-green-300 text-green-600 rounded-lg hover:bg-green-50"
                title="Export PDF"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
              </button>

              {status !== 'final' && (
                <>
                  <button
                    onClick={() => handleSave('draft')}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Save Draft
                  </button>

                  <button
                    onClick={() => handleSave('preliminary')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Save as Preliminary
                  </button>

                  {status === 'preliminary' && (
                    <button
                      onClick={handleSignReport}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                      <ShieldCheckIcon className="h-5 w-5" />
                      Sign & Finalize
                    </button>
                  )}
                </>
              )}

              {status === 'final' && signature && (
                <div className="px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-xs text-green-800">
                    <div className="font-semibold">Signed by {signature.name}</div>
                    <div>{new Date(signature.date).toLocaleString()}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Template Selector Modal */}
      {showTemplateSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">Select Report Template</h2>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {REPORT_TEMPLATES.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className="text-left p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <div className="font-semibold text-gray-900 mb-2">{template.name}</div>
                  <div className="text-sm text-gray-600 mb-2">
                    {template.modality} • {template.category}
                  </div>
                  <div className="text-xs text-gray-500">
                    {template.sections.length} sections
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 no-print">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left - Study Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-24">
              <h3 className="font-semibold text-gray-900 mb-4">Study Information</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-gray-500">Patient</dt>
                  <dd className="text-sm font-medium text-gray-900">{study.patientName}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Patient ID</dt>
                  <dd className="text-sm font-medium text-gray-900">{study.patientId}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Study Date</dt>
                  <dd className="text-sm font-medium text-gray-900">{study.studyDate}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Modality</dt>
                  <dd className="text-sm font-medium text-gray-900">{study.modality}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Accession Number</dt>
                  <dd className="text-sm font-medium text-gray-900">{study.accessionNumber}</dd>
                </div>
              </dl>

              <button
                onClick={() => setShowTemplateSelector(true)}
                className="mt-6 w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Change Template
              </button>
            </div>
          </div>

          {/* Right - Report Editor */}
          <div className="lg:col-span-2">
            {selectedTemplate ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {selectedTemplate.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedTemplate.category} • {selectedTemplate.modality}
                  </p>
                </div>

                {/* Signed Report Warning */}
                {status === 'final' && signature && (
                  <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-red-900 mb-1">
                          🔒 Report Locked - Digitally Signed
                        </h3>
                        <p className="text-sm text-red-800">
                          This report has been digitally signed by <strong>{signature.name}</strong> on{' '}
                          <strong>{new Date(signature.date).toLocaleString()}</strong> and is legally binding.
                          All fields are read-only to maintain signature integrity.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => setShowAddendumModal(true)}
                            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center gap-1"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Addendum
                          </button>
                          <button
                            onClick={handleRevokeSignature}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 flex items-center gap-1"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Revoke Signature
                          </button>
                        </div>
                        <p className="text-xs text-red-700 mt-2">
                          <strong>Addendum:</strong> Add corrections without changing original report (recommended) •
                          <strong> Revoke:</strong> Unlock for editing (requires authorization, logged in audit trail)
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  {selectedTemplate.sections.map(section => (
                    <div key={section.id} className="border-b border-gray-200 pb-6 last:border-0">
                      <label className="block text-lg font-semibold text-gray-900 mb-3">
                        {section.title}
                      </label>

                      {section.subsections ? (
                        <div className="space-y-4">
                          {section.subsections.map((subsection, idx) => (
                            <div key={idx}>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                {subsection}
                              </label>
                              <textarea
                                value={reportData[`${section.id}_${idx}`] || ''}
                                onChange={(e) => handleSectionChange(`${section.id}_${idx}`, e.target.value)}
                                placeholder={section.placeholder}
                                rows={3}
                                disabled={status === 'final' && signature}
                                className={`w-full px-4 py-3 border rounded-lg resize-none ${status === 'final' && signature
                                  ? 'bg-gray-100 border-gray-300 cursor-not-allowed text-gray-600'
                                  : 'border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                                  }`}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <RichTextEditor
                          content={reportData[section.id] || ''}
                          onChange={(html) => handleSectionChange(section.id, html)}
                          placeholder={section.placeholder}
                          readOnly={status === 'final' && signature}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <DocumentTextIcon className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Template Selected</h3>
                <p className="text-gray-500 mb-4">Select a template to start creating your report</p>
                <button
                  onClick={() => setShowTemplateSelector(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Select Template
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Addendums Section */}
      {addendums.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 pb-6">
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6">
            <h3 className="text-lg font-bold text-yellow-900 mb-4 flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Addendums ({addendums.length})
            </h3>
            <div className="space-y-4">
              {addendums.map((addendum, index) => (
                <div key={addendum.id} className="bg-white border border-yellow-300 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-semibold text-gray-900">
                      Addendum #{index + 1}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(addendum.date).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap mb-2">
                    {addendum.text}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span>Author: <strong>{addendum.author}</strong></span>
                    <span>Reason: {addendum.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Digital Signature Modal */}
      {showSignatureModal && (
        <DigitalSignature
          onSign={handleSignatureComplete}
          onCancel={handleSignatureCancel}
          reportStatus={status}
          study={study}
        />
      )}

      {/* Addendum Modal */}
      {showAddendumModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Add Addendum</h2>
              <p className="text-sm text-gray-600 mt-1">
                Add a correction or additional information to this signed report
              </p>
            </div>
            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900">
                  <strong>ℹ️ About Addendums:</strong> An addendum is appended to the original report without
                  modifying the signed content. This maintains the integrity of the original signature while
                  allowing corrections or additional findings to be documented.
                </p>
              </div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Addendum Text <span className="text-red-500">*</span>
              </label>
              <textarea
                value={addendumText}
                onChange={(e) => setAddendumText(e.target.value)}
                placeholder="Enter correction, additional findings, or clarification..."
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-gray-500 mt-2">
                This addendum will be added to the report with your name and timestamp.
              </p>
            </div>
            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddendumModal(false);
                  setAddendumText('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAddendum}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Addendum
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
