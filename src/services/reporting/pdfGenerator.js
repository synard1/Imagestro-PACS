import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * PDF Generator Service for Radiology Reports
 * Generates professional medical reports with letterhead
 */
class PDFGenerator {
  constructor() {
    this.pageWidth = 210; // A4 width in mm
    this.pageHeight = 297; // A4 height in mm
    this.margin = 20;
    this.contentWidth = this.pageWidth - (this.margin * 2);
  }

  /**
   * Generate PDF from report data
   */
  generateReportPDF(reportData, study, template, status = 'draft', signature = null) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    let yPosition = this.margin;

    // Add letterhead
    yPosition = this.addLetterhead(doc, yPosition);

    // Add report title
    yPosition = this.addReportTitle(doc, template.name, yPosition);

    // Add patient information table
    yPosition = this.addPatientInfo(doc, study, status, yPosition);

    // Add report sections
    yPosition = this.addReportSections(doc, template, reportData, yPosition);

    // Add footer with signature
    this.addFooter(doc, signature);

    return doc;
  }

  /**
   * Add hospital letterhead
   */
  addLetterhead(doc, yPosition) {
    // Hospital name
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('GENERAL HOSPITAL', this.pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 7;
    
    // Department
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Department of Radiology', this.pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 5;
    
    // Address
    doc.setFontSize(9);
    doc.text('123 Medical Center Drive, Healthcare City, HC 12345', this.pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 4;
    doc.text('Tel: (555) 123-4567 | Fax: (555) 123-4568 | Email: radiology@hospital.com', this.pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 8;
    
    // Horizontal line
    doc.setLineWidth(0.5);
    doc.line(this.margin, yPosition, this.pageWidth - this.margin, yPosition);
    
    return yPosition + 10;
  }

  /**
   * Add report title
   */
  addReportTitle(doc, title, yPosition) {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), this.pageWidth / 2, yPosition, { align: 'center' });
    
    return yPosition + 10;
  }

  /**
   * Add patient information table
   */
  addPatientInfo(doc, study, status, yPosition) {
    const patientData = [
      ['Patient Name', study.patientName || 'N/A'],
      ['Patient ID', study.patientId || 'N/A'],
      ['Date of Birth', study.patientBirthDate || 'N/A'],
      ['Gender', study.patientSex || 'N/A'],
      ['Study Date', study.studyDate || 'N/A'],
      ['Study Time', study.studyTime || 'N/A'],
      ['Modality', study.modality || 'N/A'],
      ['Accession Number', study.accessionNumber || 'N/A'],
      ['Study Description', study.studyDescription || 'N/A'],
      ['Report Status', status.toUpperCase()]
    ];

    doc.autoTable({
      startY: yPosition,
      head: [['Field', 'Value']],
      body: patientData,
      theme: 'grid',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 9
      },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold' },
        1: { cellWidth: 120 }
      },
      margin: { left: this.margin, right: this.margin }
    });

    return doc.lastAutoTable.finalY + 10;
  }

  /**
   * Add report sections
   */
  addReportSections(doc, template, reportData, yPosition) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    template.sections.forEach((section, index) => {
      // Check if we need a new page
      if (yPosition > this.pageHeight - 40) {
        doc.addPage();
        yPosition = this.margin;
      }

      // Section title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(section.title.toUpperCase(), this.margin, yPosition);
      
      // Underline
      const titleWidth = doc.getTextWidth(section.title.toUpperCase());
      doc.setLineWidth(0.3);
      doc.line(this.margin, yPosition + 1, this.margin + titleWidth, yPosition + 1);
      
      yPosition += 7;

      // Section content
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      if (section.subsections) {
        // Handle subsections
        section.subsections.forEach((subsection, idx) => {
          const content = reportData[`${section.id}_${idx}`] || '[No data entered]';
          
          // Subsection title
          doc.setFont('helvetica', 'bold');
          doc.text(`${subsection}:`, this.margin + 5, yPosition);
          yPosition += 5;

          // Subsection content
          doc.setFont('helvetica', 'normal');
          const lines = doc.splitTextToSize(content, this.contentWidth - 10);
          
          lines.forEach(line => {
            if (yPosition > this.pageHeight - 30) {
              doc.addPage();
              yPosition = this.margin;
            }
            doc.text(line, this.margin + 10, yPosition);
            yPosition += 5;
          });

          yPosition += 3;
        });
      } else {
        // Handle single section
        const content = reportData[section.id] || '[No data entered]';
        const lines = doc.splitTextToSize(content, this.contentWidth - 5);
        
        lines.forEach(line => {
          if (yPosition > this.pageHeight - 30) {
            doc.addPage();
            yPosition = this.margin;
          }
          doc.text(line, this.margin + 5, yPosition);
          yPosition += 5;
        });
      }

      yPosition += 8;
    });

    return yPosition;
  }

  /**
   * Add footer with signature
   */
  addFooter(doc, signature) {
    const pageCount = doc.internal.getNumberOfPages();
    
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      // Footer line
      const footerY = this.pageHeight - 30;
      doc.setLineWidth(0.3);
      doc.line(this.margin, footerY, this.pageWidth - this.margin, footerY);
      
      // Report date
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const reportDate = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      doc.text(`Report Date: ${reportDate}`, this.margin, footerY + 5);
      
      // Radiologist info
      doc.text('Reporting Radiologist: Dr. Admin', this.margin, footerY + 10);
      doc.text('License Number: #12345', this.margin, footerY + 15);
      
      // Digital signature if provided
      if (signature && i === pageCount) {
        const signatureX = this.pageWidth - this.margin - 60;
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('DIGITALLY SIGNED', signatureX, footerY + 5);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`By: ${signature.name}`, signatureX, footerY + 10);
        doc.text(`Date: ${new Date(signature.date).toLocaleString()}`, signatureX, footerY + 14);
        doc.text(`Method: ${signature.method.toUpperCase()}`, signatureX, footerY + 18);
        
        if (signature.verificationHash) {
          doc.text(`Hash: ${signature.verificationHash}`, signatureX, footerY + 22);
        }

        // Add signature image if available (from signature pad)
        if (signature.signatureImage) {
          try {
            doc.addImage(
              signature.signatureImage,
              'PNG',
              signatureX - 5,
              footerY - 15,
              40,
              15
            );
          } catch (error) {
            console.error('Error adding signature image:', error);
          }
        }
      }
      
      // Page number
      doc.setFontSize(8);
      doc.text(
        `Page ${i} of ${pageCount}`,
        this.pageWidth / 2,
        this.pageHeight - 10,
        { align: 'center' }
      );
    }
  }

  /**
   * Download PDF
   */
  downloadPDF(doc, filename) {
    doc.save(filename);
  }

  /**
   * Get PDF as blob
   */
  getPDFBlob(doc) {
    return doc.output('blob');
  }

  /**
   * Get PDF as data URL
   */
  getPDFDataURL(doc) {
    return doc.output('dataurlstring');
  }

  /**
   * Generate filename
   */
  generateFilename(study, template) {
    const patientName = (study.patientName || 'Unknown').replace(/\s+/g, '_');
    const studyDate = (study.studyDate || 'NoDate').replace(/[^0-9]/g, '');
    const templateName = template.name.replace(/\s+/g, '_');
    const timestamp = new Date().getTime();
    
    return `${patientName}_${studyDate}_${templateName}_${timestamp}.pdf`;
  }
}

// Export singleton instance
export default new PDFGenerator();
