/**
 * PDF Generator Service
 * Generate professional medical reports as PDF
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getReportSettings, getCompanyProfile, REPORT_TYPES } from './reportSettingsService';

// Note: jspdf-autotable v5+ requires explicit import and usage

/**
 * Generate report PDF with custom settings
 * @param {Object} reportData - Report content and metadata
 * @param {Object} signatureData - Digital signature data (optional)
 * @param {String} reportType - Report type (medical, statistical, administrative, custom)
 */
export const generateReportPDF = (reportData, signatureData = null, reportType = REPORT_TYPES.MEDICAL) => {
  // Load settings for specific report type
  const settings = getReportSettings(reportType);
  // Load company profile from main settings
  const companyProfile = getCompanyProfile();
  
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = settings.report.margins.left || 15;
  let yPos = margin;

  // Helper function to check page break
  const checkPageBreak = (requiredSpace = 20) => {
    if (yPos + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // ========== HEADER ==========
  if (settings.header.enabled) {
    // Parse hex color to RGB
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ] : [41, 128, 185];
    };

    const bgColor = hexToRgb(settings.header.backgroundColor);
    const textColor = hexToRgb(settings.header.textColor);

    // Calculate header height based on content
    let calculatedHeaderHeight = 35; // Minimum height
    if (settings.header.showCompanyInfo && companyProfile.name) {
      calculatedHeaderHeight = 45; // More space for company info
    }
    const headerHeight = Math.max(settings.header.height || 30, calculatedHeaderHeight);
    
    // Header background
    doc.setFillColor(...bgColor);
    doc.rect(0, 0, pageWidth, headerHeight, 'F');
    
    doc.setTextColor(...textColor);
    
    // Layout: Logo (left) | Company Info (left) | Report Title (right)
    let logoWidth = 0;
    let contentStartX = margin;
    
    // Logo (if exists and enabled)
    if (companyProfile.logoUrl && settings.header.showLogo) {
      try {
        const logoSize = Math.min(headerHeight - 10, 25); // Max 25mm
        const logoX = margin;
        const logoY = (headerHeight - logoSize) / 2;
        
        doc.addImage(
          companyProfile.logoUrl,
          'PNG',
          logoX,
          logoY,
          logoSize,
          logoSize
        );
        
        logoWidth = logoSize + 5;
        contentStartX = margin + logoWidth;
      } catch (error) {
        console.error('[PDFGenerator] Failed to add logo:', error);
      }
    }

    // Company info (left side, after logo)
    if (settings.header.showCompanyInfo && companyProfile.name) {
      let infoY = 10;

      // Company name (configurable font size)
      doc.setFontSize(settings.header.companyNameFontSize || 10);
      doc.setFont('helvetica', 'bold');
      doc.text(companyProfile.name, contentStartX, infoY);
      infoY += (settings.header.companyNameFontSize || 10) * 0.6; // Dynamic spacing

      // Company details (configurable font size)
      doc.setFontSize(settings.header.companyDetailsFontSize || 7);
      doc.setFont('helvetica', 'normal');

      if (companyProfile.address) {
        const maxWidth = pageWidth - contentStartX - 60; // Leave space for title
        const addressLines = doc.splitTextToSize(companyProfile.address, maxWidth);
        doc.text(addressLines[0], contentStartX, infoY); // Only first line
        infoY += (settings.header.companyDetailsFontSize || 7) * 0.6;
      }

      if (companyProfile.phone || companyProfile.email) {
        const contact = [companyProfile.phone, companyProfile.email].filter(Boolean).join(' | ');
        doc.text(contact, contentStartX, infoY);
      }
    }

    // Report title (right side, configurable font size)
    doc.setFontSize(settings.header.titleFontSize || 18);
    doc.setFont('helvetica', 'bold');
    const titleY = headerHeight / 2 + 2;
    doc.text(settings.report.title || 'REPORT', pageWidth - margin, titleY, { align: 'right' });
    
    yPos = headerHeight + 10;
    doc.setTextColor(0, 0, 0);
  } else {
    yPos = margin;
  }

  // ========== PATIENT INFORMATION TABLE ==========
  autoTable(doc, {
    startY: yPos,
    head: [['Patient Information', '']],
    body: [
      ['Patient Name', reportData.patientName || 'N/A'],
      ['Patient ID', reportData.patientId || 'N/A'],
      ['Date of Birth', reportData.patientDob || 'N/A'],
      ['Gender', reportData.patientSex || 'N/A'],
      ['Study Date', reportData.studyDate || 'N/A'],
      ['Modality', reportData.modality || 'N/A'],
      ['Accession Number', reportData.accessionNumber || 'N/A']
    ],
    theme: 'grid',
    headStyles: { 
      fillColor: [52, 73, 94], 
      textColor: 255,
      fontSize: 11,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 10
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 'auto' }
    },
    margin: { left: margin, right: margin }
  });

  yPos = doc.lastAutoTable.finalY + 15;

  // ========== CLINICAL HISTORY ==========
  if (reportData.clinicalHistory) {
    checkPageBreak(30);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CLINICAL HISTORY:', margin, yPos);
    yPos += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const historyLines = doc.splitTextToSize(
      reportData.clinicalHistory,
      pageWidth - 2 * margin
    );
    doc.text(historyLines, margin, yPos);
    yPos += historyLines.length * 5 + 10;
  }

  // ========== TECHNIQUE ==========
  if (reportData.technique) {
    checkPageBreak(30);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('TECHNIQUE:', margin, yPos);
    yPos += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const techniqueLines = doc.splitTextToSize(
      reportData.technique,
      pageWidth - 2 * margin
    );
    doc.text(techniqueLines, margin, yPos);
    yPos += techniqueLines.length * 5 + 10;
  }

  // ========== COMPARISON ==========
  if (reportData.comparison) {
    checkPageBreak(30);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPARISON:', margin, yPos);
    yPos += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const comparisonLines = doc.splitTextToSize(
      reportData.comparison,
      pageWidth - 2 * margin
    );
    doc.text(comparisonLines, margin, yPos);
    yPos += comparisonLines.length * 5 + 10;
  }

  // ========== FINDINGS ==========
  if (reportData.findings) {
    checkPageBreak(30);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('FINDINGS:', margin, yPos);
    yPos += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const findingsLines = doc.splitTextToSize(
      reportData.findings,
      pageWidth - 2 * margin
    );
    doc.text(findingsLines, margin, yPos);
    yPos += findingsLines.length * 5 + 10;
  }

  // ========== IMPRESSION ==========
  if (reportData.impression) {
    checkPageBreak(30);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('IMPRESSION:', margin, yPos);
    yPos += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const impressionLines = doc.splitTextToSize(
      reportData.impression,
      pageWidth - 2 * margin
    );
    doc.text(impressionLines, margin, yPos);
    yPos += impressionLines.length * 5 + 10;
  }

  // ========== RECOMMENDATION ==========
  if (reportData.recommendation) {
    checkPageBreak(30);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RECOMMENDATION:', margin, yPos);
    yPos += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const recommendationLines = doc.splitTextToSize(
      reportData.recommendation,
      pageWidth - 2 * margin
    );
    doc.text(recommendationLines, margin, yPos);
    yPos += recommendationLines.length * 5 + 10;
  }

  // ========== SIGNATURE SECTION ==========
  checkPageBreak(70);
  yPos += 10;
  
  // Separator line
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // Signature Info (Left side)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Report Date: ${new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}`, margin, yPos);
  yPos += 7;
  doc.text(`Radiologist: ${reportData.radiologist || 'Dr. Radiologist'}`, margin, yPos);
  yPos += 7;
  
  // Status badge
  const status = reportData.status?.toUpperCase() || 'DRAFT';
  const statusColor = status === 'FINAL' ? [34, 197, 94] : 
                      status === 'PRELIMINARY' ? [251, 191, 36] : 
                      [156, 163, 175];
  doc.setFillColor(...statusColor);
  doc.roundedRect(margin, yPos - 4, 30, 7, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(status, margin + 15, yPos + 1, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Add QR Code if signature exists (Right side)
  if (signatureData && signatureData.qrCode) {
    const qrSize = 40;
    const qrX = pageWidth - margin - qrSize;
    const qrY = yPos - 25;
    
    try {
      doc.addImage(signatureData.qrCode, 'PNG', qrX, qrY, qrSize, qrSize);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Scan to verify signature', qrX + qrSize / 2, qrY + qrSize + 5, { align: 'center' });
    } catch (error) {
      console.error('[PDFGenerator] Failed to add QR code:', error);
    }
  }

  // Add signature image if exists
  if (signatureData && signatureData.signatureImage) {
    yPos += 15;
    try {
      doc.addImage(signatureData.signatureImage, 'PNG', margin, yPos, 60, 20);
      yPos += 25;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('Digitally Signed', margin, yPos);
    } catch (error) {
      console.error('[PDFGenerator] Failed to add signature image:', error);
    }
  }

  // ========== FOOTER ==========
  if (settings.footer.enabled) {
    const footerY = pageHeight - settings.report.margins.bottom;
    const pageCount = doc.internal.getNumberOfPages();
    
    // Parse footer text color
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ] : [128, 128, 128];
    };
    const footerColor = hexToRgb(settings.footer.textColor);

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(settings.footer.fontSize || 8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...footerColor);

      // Left text
      if (settings.footer.leftText) {
        doc.text(settings.footer.leftText, margin, footerY, { align: 'left' });
      }

      // Center text (with timestamp if enabled)
      if (settings.footer.centerText || settings.footer.showTimestamp) {
        let centerText = settings.footer.centerText || '';
        if (settings.footer.showTimestamp) {
          const timestamp = new Date().toLocaleString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          centerText = centerText ? `${centerText} | ${timestamp}` : timestamp;
        }
        doc.text(centerText, pageWidth / 2, footerY, { align: 'center' });
      }

      // Right text (with page numbers if enabled)
      if (settings.footer.rightText || settings.footer.showPageNumbers) {
        let rightText = settings.footer.rightText || '';
        // Replace placeholders
        rightText = rightText.replace('{page}', i).replace('{total}', pageCount);
        if (!rightText && settings.footer.showPageNumbers) {
          rightText = `Page ${i} of ${pageCount}`;
        }
        doc.text(rightText, pageWidth - margin, footerY, { align: 'right' });
      }
    }
  }

  return doc;
};

/**
 * Download report as PDF
 */
export const downloadReportPDF = (reportData, signatureData = null, filename = null, reportType = REPORT_TYPES.MEDICAL) => {
  try {
    console.log('[PDFGenerator] Generating PDF for type:', reportType);
    const doc = generateReportPDF(reportData, signatureData, reportType);
    
    const pdfFilename = filename || 
      `report_${reportData.patientId}_${Date.now()}.pdf`;
    
    doc.save(pdfFilename);
    console.log('[PDFGenerator] PDF downloaded:', pdfFilename);
    
    return { success: true, filename: pdfFilename };
  } catch (error) {
    console.error('[PDFGenerator] Failed to download PDF:', error);
    throw error;
  }
};

/**
 * Get PDF as blob (for upload or preview)
 */
export const getReportPDFBlob = (reportData, signatureData = null, reportType = REPORT_TYPES.MEDICAL) => {
  try {
    console.log('[PDFGenerator] Generating PDF blob for type:', reportType);
    const doc = generateReportPDF(reportData, signatureData, reportType);
    const blob = doc.output('blob');
    console.log('[PDFGenerator] PDF blob generated');
    return blob;
  } catch (error) {
    console.error('[PDFGenerator] Failed to generate PDF blob:', error);
    throw error;
  }
};

/**
 * Preview PDF in new window
 */
export const previewReportPDF = (reportData, signatureData = null, reportType = REPORT_TYPES.MEDICAL) => {
  try {
    console.log('[PDFGenerator] Opening PDF preview for type:', reportType);
    const doc = generateReportPDF(reportData, signatureData, reportType);
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    window.open(pdfUrl, '_blank');
    
    // Clean up URL after a delay
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
    
    return { success: true };
  } catch (error) {
    console.error('[PDFGenerator] Failed to preview PDF:', error);
    throw error;
  }
};

export default {
  REPORT_TYPES,
  generateReportPDF,
  downloadReportPDF,
  getReportPDFBlob,
  previewReportPDF
};
