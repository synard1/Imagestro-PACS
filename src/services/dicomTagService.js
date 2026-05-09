/**
 * DICOM Tag Service
 * Handles DICOM tag editing and export using dcmjs
 */

import * as dcmjs from 'dcmjs';
import { getFileByInstanceId } from './dicomStorageService';

/**
 * Convert hex tag to keyword
 */
function tagHexToKeyword(tagHex) {
  // Common tag mappings
  const tagMap = {
    'x00100010': 'PatientName',
    'x00100020': 'PatientID',
    'x00100030': 'PatientBirthDate',
    'x00100040': 'PatientSex',
    'x00080050': 'AccessionNumber',
    'x00081030': 'StudyDescription',
    'x0008103e': 'SeriesDescription',
    'x00080090': 'ReferringPhysicianName',
    'x00200010': 'StudyID',
    'x00080020': 'StudyDate',
    'x00080030': 'StudyTime',
    'x00080060': 'Modality',
    'x0020000d': 'StudyInstanceUID',
    'x0020000e': 'SeriesInstanceUID',
    'x00080018': 'SOPInstanceUID'
  };
  
  return tagMap[tagHex] || null;
}

/**
 * Save edited DICOM tags
 * Creates a new DICOM file with modified tags using dcmjs
 */
export async function saveDicomWithEditedTags(instanceId, editedTags, originalDataSet) {
  try {
    console.log('[DicomTagService] Saving edited tags for:', instanceId);
    console.log('[DicomTagService] dcmjs:', dcmjs);
    
    // Get original file
    const fileData = getFileByInstanceId(instanceId);
    if (!fileData || !fileData.base64Data) {
      throw new Error('Original DICOM file not found');
    }

    // Convert base64 to ArrayBuffer
    const base64Data = fileData.base64Data.split(',')[1] || fileData.base64Data;
    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Parse DICOM using dcmjs - correct API
    const dicomData = dcmjs.data.DicomMessage.readFile(bytes.buffer);
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    
    console.log('[DicomTagService] Original dataset:', dataset);
    
    // Apply edits
    for (const tagHex in editedTags) {
      if (tagHex.endsWith('_exportOnly')) continue;
      
      const newValue = editedTags[tagHex];
      const keyword = tagHexToKeyword(tagHex);
      
      if (!keyword) {
        console.warn(`[DicomTagService] Unknown tag ${tagHex}, skipping`);
        continue;
      }
      
      console.log(`[DicomTagService] Setting ${keyword} = "${newValue}"`);
      dataset[keyword] = newValue;
    }
    
    console.log('[DicomTagService] Modified dataset:', dataset);
    
    // Convert back to DICOM format - IMPORTANT: Update dicomData.dict
    const denaturalized = dcmjs.data.DicomMetaDictionary.denaturalizeDataset(dataset);
    dicomData.dict = denaturalized; // Update the dict before writing
    const part10Buffer = dicomData.write();

    // Convert to base64
    let binary = '';
    const uint8Array = new Uint8Array(part10Buffer);
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const modifiedBase64 = 'data:application/dicom;base64,' + window.btoa(binary);

    console.log('[DicomTagService] Tags saved successfully');
    
    return {
      success: true,
      modifiedBase64,
      modifiedBytes: uint8Array
    };
  } catch (error) {
    console.error('[DicomTagService] Error saving tags:', error);
    console.error('[DicomTagService] Error details:', error.stack);
    throw error;
  }
}

/**
 * Export DICOM file with edited tags
 */
export async function exportDicomWithEditedTags(instanceId, editedTags, originalDataSet, fileName) {
  try {
    const result = await saveDicomWithEditedTags(instanceId, editedTags, originalDataSet);
    
    // Create blob
    const blob = new Blob([result.modifiedBytes], { type: 'application/dicom' });
    
    // Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || `modified-${instanceId}.dcm`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('[DicomTagService] DICOM file exported:', fileName);
    
    return {
      success: true,
      fileName: a.download
    };
  } catch (error) {
    console.error('[DicomTagService] Error exporting DICOM:', error);
    throw error;
  }
}

/**
 * Update DICOM file in localStorage with edited tags
 */
export async function updateDicomInStorage(instanceId, editedTags, originalDataSet) {
  try {
    const result = await saveDicomWithEditedTags(instanceId, editedTags, originalDataSet);
    
    // Update in localStorage
    const files = JSON.parse(localStorage.getItem('pacs_files') || '[]');
    const fileIndex = files.findIndex(f => f.id === instanceId);
    
    if (fileIndex >= 0) {
      files[fileIndex].base64Data = result.modifiedBase64;
      files[fileIndex].fileSize = result.modifiedBytes.length;
      localStorage.setItem('pacs_files', JSON.stringify(files));
      
      console.log('[DicomTagService] DICOM file updated in localStorage');
      
      return {
        success: true,
        message: 'DICOM file updated successfully'
      };
    } else {
      throw new Error('File not found in storage');
    }
  } catch (error) {
    console.error('[DicomTagService] Error updating DICOM in storage:', error);
    throw error;
  }
}

/**
 * Get DICOM tags as JSON
 */
export async function getDicomTagsAsJson(instanceId) {
  try {
    const fileData = getFileByInstanceId(instanceId);
    if (!fileData || !fileData.base64Data) {
      throw new Error('DICOM file not found');
    }

    // Convert base64 to ArrayBuffer
    const base64Data = fileData.base64Data.split(',')[1] || fileData.base64Data;
    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Parse DICOM
    const dataSet = dicomParser.parseDicom(bytes);
    
    // Extract tags
    const tags = {};
    for (const propertyName in dataSet.elements) {
      const element = dataSet.elements[propertyName];
      try {
        if (element.length > 0 && element.length < 1024) {
          tags[propertyName] = dataSet.string(propertyName) || '';
        }
      } catch (e) {
        // Skip tags that can't be read as string
      }
    }

    return tags;
  } catch (error) {
    console.error('[DicomTagService] Error getting tags as JSON:', error);
    throw error;
  }
}

export default {
  saveDicomWithEditedTags,
  exportDicomWithEditedTags,
  updateDicomInStorage,
  getDicomTagsAsJson
};
