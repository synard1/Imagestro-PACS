/**
 * DICOM Tag Dictionary
 * Maps DICOM tag hex values to human-readable names
 * Based on DICOM Standard Part 6: Data Dictionary
 */

export const dicomTagDictionary = {
  // Patient Information
  'x00100010': 'Patient Name',
  'x00100020': 'Patient ID',
  'x00100030': 'Patient Birth Date',
  'x00100040': 'Patient Sex',
  'x00101010': 'Patient Age',
  'x00101020': 'Patient Size',
  'x00101030': 'Patient Weight',
  'x00102160': 'Ethnic Group',
  'x00102180': 'Occupation',
  'x001021c0': 'Pregnancy Status',

  // Study Information
  'x0020000d': 'Study Instance UID',
  'x00080020': 'Study Date',
  'x00080030': 'Study Time',
  'x00080050': 'Accession Number',
  'x00080090': 'Referring Physician Name',
  'x00081030': 'Study Description',
  'x00200010': 'Study ID',
  'x00081060': 'Name of Physician(s) Reading Study',
  'x00081080': 'Admitting Diagnoses Description',
  'x00081110': 'Referenced Study Sequence',

  // Series Information
  'x0020000e': 'Series Instance UID',
  'x00080060': 'Modality',
  'x00080021': 'Series Date',
  'x00080031': 'Series Time',
  'x0008103e': 'Series Description',
  'x00200011': 'Series Number',
  'x00180015': 'Body Part Examined',
  'x00185100': 'Patient Position',
  'x00201002': 'Images in Acquisition',

  // Image Information
  'x00080018': 'SOP Instance UID',
  'x00080016': 'SOP Class UID',
  'x00200013': 'Instance Number',
  'x00200012': 'Acquisition Number',
  'x00080008': 'Image Type',
  'x00080022': 'Acquisition Date',
  'x00080032': 'Acquisition Time',
  'x00080023': 'Content Date',
  'x00080033': 'Content Time',
  'x00200032': 'Image Position (Patient)',
  'x00200037': 'Image Orientation (Patient)',
  'x00200052': 'Frame of Reference UID',
  'x00201041': 'Slice Location',

  // Image Pixel Description
  'x00280002': 'Samples per Pixel',
  'x00280004': 'Photometric Interpretation',
  'x00280006': 'Planar Configuration',
  'x00280008': 'Number of Frames',
  'x00280010': 'Rows',
  'x00280011': 'Columns',
  'x00280030': 'Pixel Spacing',
  'x00280034': 'Pixel Aspect Ratio',
  'x00280100': 'Bits Allocated',
  'x00280101': 'Bits Stored',
  'x00280102': 'High Bit',
  'x00280103': 'Pixel Representation',
  'x00281050': 'Window Center',
  'x00281051': 'Window Width',
  'x00281052': 'Rescale Intercept',
  'x00281053': 'Rescale Slope',
  'x00281054': 'Rescale Type',

  // Equipment Information
  'x00080070': 'Manufacturer',
  'x00080080': 'Institution Name',
  'x00081010': 'Station Name',
  'x00081040': 'Institutional Department Name',
  'x00081090': 'Manufacturer Model Name',
  'x00181000': 'Device Serial Number',
  'x00181020': 'Software Versions',
  'x00181030': 'Protocol Name',

  // Acquisition Parameters
  'x00180050': 'Slice Thickness',
  'x00180060': 'KVP',
  'x00180088': 'Spacing Between Slices',
  'x00180090': 'Data Collection Diameter',
  'x00181100': 'Reconstruction Diameter',
  'x00181110': 'Distance Source to Detector',
  'x00181111': 'Distance Source to Patient',
  'x00181120': 'Gantry/Detector Tilt',
  'x00181130': 'Table Height',
  'x00181140': 'Rotation Direction',
  'x00181150': 'Exposure Time',
  'x00181151': 'X-Ray Tube Current',
  'x00181152': 'Exposure',
  'x00181160': 'Filter Type',
  'x00181190': 'Focal Spot(s)',
  'x00181210': 'Convolution Kernel',

  // CT Specific
  'x00180090': 'Data Collection Diameter',
  'x00189305': 'Revolution Time',
  'x00189306': 'Single Collimation Width',
  'x00189307': 'Total Collimation Width',
  'x00189309': 'Table Speed',
  'x00189310': 'Table Feed per Rotation',
  'x00189311': 'Spiral Pitch Factor',
  'x00189323': 'Exposure Modulation Type',
  'x00189324': 'Estimated Dose Saving',
  'x00189345': 'CTDIvol',

  // MR Specific
  'x00180020': 'Scanning Sequence',
  'x00180021': 'Sequence Variant',
  'x00180022': 'Scan Options',
  'x00180023': 'MR Acquisition Type',
  'x00180024': 'Sequence Name',
  'x00180025': 'Angio Flag',
  'x00180080': 'Repetition Time',
  'x00180081': 'Echo Time',
  'x00180082': 'Inversion Time',
  'x00180083': 'Number of Averages',
  'x00180084': 'Imaging Frequency',
  'x00180085': 'Imaged Nucleus',
  'x00180086': 'Echo Number(s)',
  'x00180087': 'Magnetic Field Strength',
  'x00180091': 'Echo Train Length',
  'x00180093': 'Percent Sampling',
  'x00180094': 'Percent Phase Field of View',
  'x00180095': 'Pixel Bandwidth',

  // Contrast/Bolus
  'x00180010': 'Contrast/Bolus Agent',
  'x00180012': 'Contrast/Bolus Agent Sequence',
  'x00180014': 'Contrast/Bolus Administration Route Description',
  'x00180015': 'Body Part Examined',
  'x00181040': 'Contrast/Bolus Route',
  'x00181041': 'Contrast/Bolus Volume',
  'x00181042': 'Contrast/Bolus Start Time',
  'x00181043': 'Contrast/Bolus Stop Time',
  'x00181044': 'Contrast/Bolus Total Dose',
  'x00181048': 'Contrast Flow Rate',
  'x00181049': 'Contrast Flow Duration',

  // Overlay and Curve
  'x60000010': 'Overlay Rows',
  'x60000011': 'Overlay Columns',
  'x60000050': 'Overlay Origin',
  'x60001500': 'Overlay Label',
  'x60003000': 'Overlay Data',

  // File Meta Information
  'x00020000': 'File Meta Information Group Length',
  'x00020001': 'File Meta Information Version',
  'x00020002': 'Media Storage SOP Class UID',
  'x00020003': 'Media Storage SOP Instance UID',
  'x00020010': 'Transfer Syntax UID',
  'x00020012': 'Implementation Class UID',
  'x00020013': 'Implementation Version Name',
  'x00020016': 'Source Application Entity Title',

  // General
  'x00080005': 'Specific Character Set',
  'x00080012': 'Instance Creation Date',
  'x00080013': 'Instance Creation Time',
  'x00080014': 'Instance Creator UID',
  'x00081140': 'Referenced Image Sequence',
  'x00081150': 'Referenced SOP Class UID',
  'x00081155': 'Referenced SOP Instance UID',
  'x00082111': 'Derivation Description',
  'x00082112': 'Source Image Sequence',

  // Relationship
  'x00209161': 'Concatenation UID',
  'x00209162': 'In-concatenation Number',
  'x00209163': 'In-concatenation Total Number',
  'x00209164': 'Dimension Organization UID',

  // Private Tags (Examples - vary by vendor)
  'x00091001': 'Private Creator',
  'x00091002': 'Private Tag',
};

/**
 * Get human-readable name for a DICOM tag
 * @param {string} tag - DICOM tag in format 'x00100010'
 * @returns {string} Human-readable tag name or the tag itself if not found
 */
export function getTagName(tag) {
  return dicomTagDictionary[tag] || tag;
}

/**
 * Check if a tag is known in the dictionary
 * @param {string} tag - DICOM tag in format 'x00100010'
 * @returns {boolean} True if tag is in dictionary
 */
export function isKnownTag(tag) {
  return tag in dicomTagDictionary;
}

/**
 * Get tag group name based on tag prefix
 * @param {string} tag - DICOM tag in format 'x00100010'
 * @returns {string} Group name
 */
export function getTagGroup(tag) {
  if (!tag || tag.length < 6) return 'Unknown';

  const group = tag.substring(1, 5);

  const groupMap = {
    '0002': 'File Meta Information',
    '0008': 'Identifying',
    '0010': 'Patient',
    '0018': 'Acquisition',
    '0020': 'Relationship',
    '0028': 'Image Pixel',
    '0032': 'Study',
    '0040': 'Procedure',
    '0088': 'Storage',
    '2000': 'Film Session',
    '2010': 'Film Box',
    '2020': 'Image Box',
    '2040': 'Overlay Box',
    '2100': 'Print Job',
    '2110': 'Printer',
    '3002': 'RT Image',
    '3004': 'RT Dose',
    '3006': 'RT Structure Set',
    '300A': 'RT Plan',
    '300C': 'RT Treatment',
    '300E': 'RT Treatment Summary',
    '4000': 'Text',
    '4008': 'Results',
    '4010': 'Low Level Patient',
    '5000': 'Curve',
    '5400': 'Waveform',
    '6000': 'Overlay',
    '7FE0': 'Pixel Data',
  };

  return groupMap[group] || 'Private/Unknown';
}

/**
 * Format DICOM tag for display
 * @param {string} tag - DICOM tag in format 'x00100010'
 * @returns {string} Formatted tag like '(0010,0010)'
 */
export function formatTagForDisplay(tag) {
  if (!tag || tag.length < 9) return tag;

  // Convert from 'x00100010' to '(0010,0010)'
  const group = tag.substring(1, 5);
  const element = tag.substring(5, 9);
  return `(${group},${element})`;
}
