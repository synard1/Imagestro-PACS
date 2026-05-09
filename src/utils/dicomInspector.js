/**
 * DICOM Inspector Utility
 * For diagnosing DICOM file issues
 */

import dicomParser from 'dicom-parser';

/**
 * Transfer Syntax UIDs and their descriptions
 */
const TRANSFER_SYNTAXES = {
  '1.2.840.10008.1.2': 'Implicit VR Little Endian (Default)',
  '1.2.840.10008.1.2.1': 'Explicit VR Little Endian',
  '1.2.840.10008.1.2.2': 'Explicit VR Big Endian',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline (Process 1)',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended (Process 2 & 4)',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless (Process 14)',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless (Process 14 [Selection Value 1])',
  '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless',
  '1.2.840.10008.1.2.4.81': 'JPEG-LS Lossy',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000 Lossy',
  '1.2.840.10008.1.2.5': 'RLE Lossless',
};

/**
 * Check which transfer syntaxes require special codecs
 */
const REQUIRES_CODEC = new Set([
  '1.2.840.10008.1.2.4.50', // JPEG Baseline
  '1.2.840.10008.1.2.4.51', // JPEG Extended
  '1.2.840.10008.1.2.4.57', // JPEG Lossless
  '1.2.840.10008.1.2.4.70', // JPEG Lossless
  '1.2.840.10008.1.2.4.80', // JPEG-LS Lossless
  '1.2.840.10008.1.2.4.81', // JPEG-LS Lossy
  '1.2.840.10008.1.2.4.90', // JPEG 2000 Lossless
  '1.2.840.10008.1.2.4.91', // JPEG 2000 Lossy
  '1.2.840.10008.1.2.5',    // RLE Lossless
]);

/**
 * Inspect DICOM file from ArrayBuffer or Blob
 * @param {ArrayBuffer|Blob} data - DICOM data
 * @returns {Promise<Object>} Inspection report
 */
export async function inspectDicomFile(data) {
  try {
    // Convert Blob to ArrayBuffer if needed
    let arrayBuffer = data;
    if (data instanceof Blob) {
      arrayBuffer = await data.arrayBuffer();
    }

    // Parse DICOM
    const byteArray = new Uint8Array(arrayBuffer);
    const dataSet = dicomParser.parseDicom(byteArray);

    // Extract key metadata
    const transferSyntaxUID = dataSet.string('x00020010');
    const sopClassUID = dataSet.string('x00020002');
    const rows = dataSet.uint16('x00280010');
    const columns = dataSet.uint16('x00280011');
    const bitsAllocated = dataSet.uint16('x00280100');
    const bitsStored = dataSet.uint16('x00280101');
    const samplesPerPixel = dataSet.uint16('x00280002');
    const photometricInterpretation = dataSet.string('x00280004');
    const pixelRepresentation = dataSet.uint16('x00280103');

    // Check if pixel data exists
    const pixelDataElement = dataSet.elements.x7fe00010;
    const hasPixelData = !!pixelDataElement;
    const pixelDataSize = pixelDataElement ? pixelDataElement.length : 0;

    // Get Window/Level values if present
    const windowCenter = dataSet.floatString('x00281050');
    const windowWidth = dataSet.floatString('x00281051');

    // Get pixel value range
    const smallestPixelValue = dataSet.int16('x00280106');
    const largestPixelValue = dataSet.int16('x00280107');

    // Determine transfer syntax name
    const transferSyntaxName = TRANSFER_SYNTAXES[transferSyntaxUID] || 'Unknown';
    const requiresCodec = REQUIRES_CODEC.has(transferSyntaxUID);

    // Calculate recommended VOI
    const maxPixelValue = Math.pow(2, bitsStored) - 1;
    const minPixelValue = pixelRepresentation === 1 ? -Math.pow(2, bitsStored - 1) : 0;

    const report = {
      valid: true,
      transferSyntax: {
        uid: transferSyntaxUID,
        name: transferSyntaxName,
        requiresCodec: requiresCodec
      },
      sopClass: sopClassUID,
      imageInfo: {
        rows,
        columns,
        bitsAllocated,
        bitsStored,
        samplesPerPixel,
        photometricInterpretation,
        pixelRepresentation
      },
      pixelData: {
        present: hasPixelData,
        size: pixelDataSize,
        sizeKB: (pixelDataSize / 1024).toFixed(2)
      },
      windowLevel: {
        center: windowCenter || 'Not specified',
        width: windowWidth || 'Not specified',
        hasPreset: !!(windowCenter && windowWidth)
      },
      pixelValueRange: {
        smallest: smallestPixelValue || 'Not specified',
        largest: largestPixelValue || 'Not specified',
        theoretical: { min: minPixelValue, max: maxPixelValue }
      },
      fileSize: byteArray.length,
      fileSizeKB: (byteArray.length / 1024).toFixed(2)
    };

    console.log('[DicomInspector] Inspection report:', report);
    return report;

  } catch (error) {
    console.error('[DicomInspector] Failed to inspect DICOM:', error);
    return {
      valid: false,
      error: error.message,
      suggestion: 'File may not be a valid DICOM file'
    };
  }
}

/**
 * Check if transfer syntax is supported by Cornerstone without codecs
 * @param {string} transferSyntaxUID - Transfer Syntax UID
 * @returns {boolean}
 */
export function isTransferSyntaxSupported(transferSyntaxUID) {
  // Uncompressed transfer syntaxes are always supported
  const uncompressed = new Set([
    '1.2.840.10008.1.2',     // Implicit VR Little Endian
    '1.2.840.10008.1.2.1',   // Explicit VR Little Endian
    '1.2.840.10008.1.2.2',   // Explicit VR Big Endian
  ]);

  return uncompressed.has(transferSyntaxUID);
}

/**
 * Get diagnostic message for blank image issue
 * @param {Object} report - Inspection report from inspectDicomFile
 * @returns {Object} Diagnostic message
 */
export function diagnoseBlankImage(report) {
  if (!report.valid) {
    return {
      issue: 'Invalid DICOM File',
      cause: report.error,
      solution: 'Ensure you are using a valid DICOM file (.dcm)'
    };
  }

  if (!report.pixelData.present) {
    return {
      issue: 'No Pixel Data',
      cause: 'DICOM file does not contain pixel data (tag 7FE0,0010)',
      solution: 'Use a DICOM file that contains image data'
    };
  }

  if (report.pixelData.size === 0) {
    return {
      issue: 'Empty Pixel Data',
      cause: 'Pixel data tag exists but has zero length',
      solution: 'File may be corrupted. Try re-exporting from source.'
    };
  }

  if (report.transferSyntax.requiresCodec) {
    return {
      issue: 'Compressed Transfer Syntax Requires Codec',
      cause: `Transfer Syntax: ${report.transferSyntax.name} (${report.transferSyntax.uid})`,
      solution: 'Ensure web workers and codecs are properly loaded from CDN. Check browser console for codec loading errors.',
      details: {
        codecRequired: true,
        codecPath: 'https://unpkg.com/@cornerstonejs/dicom-image-loader@1.80.4/dist/codecs/',
        checkNetworkTab: 'Verify codec files (.wasm, .js) are downloaded successfully'
      }
    };
  }

  // Expected size based on metadata
  const expectedSize = report.imageInfo.rows * report.imageInfo.columns *
                       (report.imageInfo.bitsAllocated / 8) *
                       report.imageInfo.samplesPerPixel;

  if (Math.abs(report.pixelData.size - expectedSize) > expectedSize * 0.1) {
    return {
      issue: 'Pixel Data Size Mismatch',
      cause: `Expected ~${(expectedSize / 1024).toFixed(2)}KB, got ${report.pixelData.sizeKB}KB`,
      solution: 'File may be corrupted or uses unexpected encoding'
    };
  }

  return {
    issue: 'Unknown',
    cause: 'DICOM file appears valid but image is still blank',
    solution: 'Check Cornerstone initialization and viewport rendering. See browser console for errors.',
    report: report
  };
}

/**
 * Log DICOM file info to console (pretty print)
 * @param {Object} report - Inspection report
 */
export function logDicomInfo(report) {
  console.group('📋 DICOM File Inspection');
  console.log('✅ Valid:', report.valid);

  if (report.valid) {
    console.group('🔄 Transfer Syntax');
    console.log('UID:', report.transferSyntax.uid);
    console.log('Name:', report.transferSyntax.name);
    console.log('Requires Codec:', report.transferSyntax.requiresCodec ? '⚠️ YES' : '✅ NO');
    console.groupEnd();

    console.group('🖼️ Image Info');
    console.log('Dimensions:', `${report.imageInfo.rows} x ${report.imageInfo.columns}`);
    console.log('Bits Allocated:', report.imageInfo.bitsAllocated);
    console.log('Bits Stored:', report.imageInfo.bitsStored);
    console.log('Samples Per Pixel:', report.imageInfo.samplesPerPixel);
    console.log('Photometric:', report.imageInfo.photometricInterpretation);
    console.groupEnd();

    console.group('💾 Pixel Data');
    console.log('Present:', report.pixelData.present ? '✅ YES' : '❌ NO');
    console.log('Size:', `${report.pixelData.sizeKB} KB`);
    console.groupEnd();

    console.group('🎚️ Window/Level');
    console.log('Center:', report.windowLevel.center);
    console.log('Width:', report.windowLevel.width);
    console.log('Has Preset:', report.windowLevel.hasPreset ? '✅ YES' : '⚠️ NO');
    console.groupEnd();

    console.group('📊 Pixel Value Range');
    console.log('Smallest:', report.pixelValueRange.smallest);
    console.log('Largest:', report.pixelValueRange.largest);
    console.log('Theoretical:', `${report.pixelValueRange.theoretical.min} to ${report.pixelValueRange.theoretical.max}`);
    console.groupEnd();

    console.log('📦 File Size:', `${report.fileSizeKB} KB`);

    // Add diagnostic
    const diagnosis = diagnoseBlankImage(report);
    if (diagnosis.issue !== 'Unknown') {
      console.group('⚠️ Potential Issue');
      console.log('Issue:', diagnosis.issue);
      console.log('Cause:', diagnosis.cause);
      console.log('Solution:', diagnosis.solution);
      if (diagnosis.details) {
        console.log('Details:', diagnosis.details);
      }
      console.groupEnd();
    }
  } else {
    console.error('❌ Error:', report.error);
    console.log('💡 Suggestion:', report.suggestion);
  }

  console.groupEnd();
}

export default {
  inspectDicomFile,
  isTransferSyntaxSupported,
  diagnoseBlankImage,
  logDicomInfo
};
